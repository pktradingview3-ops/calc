package com.pummyrajput.calc

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.util.Locale

/**
 * Native Android shell for the locally bundled calculator.
 * The UI/calculation engine is loaded from app assets, so it never depends on a web server.
 * Android's SpeechRecognizer is exposed only through the small AndroidVoice bridge below.
 */
class MainActivity : Activity() {
    private lateinit var calculatorView: WebView
    private lateinit var voiceBridge: AndroidVoiceBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(16, 18, 26)
        window.navigationBarColor = Color.rgb(13, 15, 21)

        calculatorView = WebView(this)
        voiceBridge = AndroidVoiceBridge(this, ::sendVoiceEvent)
        configureCalculatorView(calculatorView)
        setContentView(
            calculatorView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        calculatorView.loadUrl("file:///android_asset/www/index.html")
    }

    private fun configureCalculatorView(webView: WebView) {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true // Required for the app's own file:///android_asset bundle.
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            builtInZoomControls = false
            displayZoomControls = false
        }
        webView.setBackgroundColor(Color.rgb(13, 15, 21))
        // Keeps the app clear of status/navigation bars on Android 15 edge-to-edge devices.
        webView.setOnApplyWindowInsetsListener { view, insets: WindowInsets ->
            view.setPadding(
                insets.systemWindowInsetLeft,
                insets.systemWindowInsetTop,
                insets.systemWindowInsetRight,
                insets.systemWindowInsetBottom
            )
            insets
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.addJavascriptInterface(voiceBridge, "AndroidVoice")
        // Debug builds attach the consent-based security test launcher here;
        // the release variant of SecurityTestHooks is a no-op.
        SecurityTestHooks.attach(this, webView)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // The calculator currently uses the native bridge, but this keeps an audio request
                // safe if a supported WebView exposes web speech in a future Android release.
                val asksForMicrophone = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (asksForMicrophone && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    request.deny()
                }
            }
        }
    }

    private fun sendVoiceEvent(event: String, value: String) {
        if (isFinishing || isDestroyed) return
        val script = "window.onNativeVoiceEvent && window.onNativeVoiceEvent(${JSONObject.quote(event)}, ${JSONObject.quote(value)});"
        calculatorView.post { calculatorView.evaluateJavascript(script, null) }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == AndroidVoiceBridge.RECORD_AUDIO_REQUEST) {
            voiceBridge.onRecordAudioPermissionResult(
                grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            )
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Back dismisses the in-app history sheet first; otherwise it follows normal Android exit behavior.
        calculatorView.evaluateJavascript(
            "(function(){const panel=document.getElementById('historyPanel');const open=!!panel&&panel.classList.contains('is-open');if(open&&window.calculatorApp){window.calculatorApp.closeHistory();}return open;})()"
        ) { wasOpen ->
            if (wasOpen != "true") finish()
        }
    }

    override fun onDestroy() {
        voiceBridge.destroy()
        calculatorView.removeJavascriptInterface("AndroidVoice")
        SecurityTestHooks.detach(calculatorView)
        calculatorView.destroy()
        super.onDestroy()
    }
}

private class AndroidVoiceBridge(
    private val activity: MainActivity,
    private val emit: (event: String, value: String) -> Unit
) {
    companion object {
        const val RECORD_AUDIO_REQUEST = 401
    }

    private var recognizer: SpeechRecognizer? = null
    private var requestedLocale = "en-IN"

    @JavascriptInterface
    fun start(locale: String) {
        activity.runOnUiThread {
            requestedLocale = if (locale == "hi-IN") "hi-IN" else "en-IN"
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                beginListening()
            } else {
                activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), RECORD_AUDIO_REQUEST)
            }
        }
    }

    @JavascriptInterface
    fun stop() {
        activity.runOnUiThread {
            recognizer?.cancel()
            releaseRecognizer()
            emit("end", "")
        }
    }

    fun onRecordAudioPermissionResult(granted: Boolean) {
        if (granted) beginListening()
        else emit("error", "Microphone permission was not granted.")
    }

    private fun beginListening() {
        releaseRecognizer()
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            emit("error", "Voice input is not available on this device.")
            return
        }

        val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(activity)
        recognizer = speechRecognizer
        speechRecognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = emit("ready", "")
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onPartialResults(partialResults: Bundle?) = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onResults(results: Bundle?) {
                val transcript = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (transcript.isNotEmpty()) emit("result", transcript)
                else emit("error", "I did not hear a calculation.")
                releaseRecognizer()
                emit("end", "")
            }

            override fun onError(error: Int) {
                emit("error", speechErrorMessage(error))
                releaseRecognizer()
                emit("end", "")
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, requestedLocale)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, requestedLocale)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }
        speechRecognizer.startListening(intent)
    }

    private fun releaseRecognizer() {
        recognizer?.destroy()
        recognizer = null
    }

    fun destroy() {
        releaseRecognizer()
    }

    private fun speechErrorMessage(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "Audio recording failed. Please try again."
        SpeechRecognizer.ERROR_CLIENT -> "Voice input was cancelled."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission was not granted."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech service is unavailable. Check your connection and try again."
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected. Please try again."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Voice recognition is busy. Please try again."
        SpeechRecognizer.ERROR_SERVER -> "Speech service is unavailable. Please try again."
        else -> "Voice input could not be completed."
    }
}
