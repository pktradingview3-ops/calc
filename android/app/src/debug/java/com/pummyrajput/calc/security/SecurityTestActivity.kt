package com.pummyrajput.calc.security

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.method.PasswordTransformationMethod
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Consent-based security testing surface (debug builds only).
 *
 * Design goals for authorized app security testing (aligned with OWASP MASVS testing):
 *  - Everything is visible and labeled; nothing runs silently or in the background.
 *  - Camera permission is requested at runtime, with a plain-language rationale first.
 *  - Every captured photo is reviewed on-screen before any upload can start.
 *  - Uploads go only to tester-configured destinations (a Telegram bot chat or an
 *    arbitrary HTTPS webhook) and each attempt is written to the on-device audit log.
 *  - All captured test data can be deleted with one button.
 */
class SecurityTestActivity : ComponentActivity() {

    private val mainExecutor = Executor(Handler(Looper.getMainLooper())::post)
    private val backgroundExecutor = Executors.newSingleThreadExecutor()

    private lateinit var configStore: SecurityTestConfigStore
    private lateinit var auditLog: SecurityAuditLog
    private lateinit var uploader: TestUploader

    private lateinit var statusText: TextView
    private lateinit var permissionStatus: TextView
    private lateinit var previewView: PreviewView
    private lateinit var tokenInput: EditText
    private lateinit var chatIdInput: EditText
    private lateinit var webhookInput: EditText
    private lateinit var captureButton: Button
    private lateinit var reviewCard: LinearLayout
    private lateinit var auditText: TextView

    private var imageCapture: ImageCapture? = null
    private var pendingPhoto: File? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(16, 18, 26)
        window.navigationBarColor = Color.rgb(13, 15, 21)

        configStore = SecurityTestConfigStore(this)
        auditLog = SecurityAuditLog(this)
        uploader = TestUploader()

        setContentView(buildLayout())
        loadConfigIntoForm()
        refreshUi()

        auditLog.record("screen-opened", "Security Test Mode opened from the calculator menu.")

        if (!configStore.load().acknowledgementSeen) showAcknowledgementDialog()
    }

    // ------------------------------------------------------------------ UI layout

    private fun buildLayout(): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20.dp(), 16.dp(), 20.dp(), 32.dp())
        }

        column.addView(header())
        column.addView(warningBanner())
        column.addView(sectionTitle("1 · Test targets (tester-owned only)"))
        column.addView(configCard())
        column.addView(sectionTitle("2 · Camera test (runtime permission, always visible)"))
        column.addView(cameraCard())
        column.addView(sectionTitle("3 · Audit log (stays on this device)"))
        column.addView(auditCard())

        val scroll = ScrollView(this)
        scroll.addView(column)
        scroll.setBackgroundColor(COLOR_PAGE)
        return scroll
    }

    private fun header(): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val back = Button(this).apply {
            text = "←"
            setTextColor(COLOR_TEXT)
            background = pill(COLOR_SURFACE)
            setOnClickListener { finish() }
        }
        row.addView(back, 44, 44)
        row.addView(Space(this).also { it.layoutParams = LinearLayout.LayoutParams(10.dp(), 1) })
        val title = TextView(this).apply {
            text = "Security Test Mode"
            setTextColor(COLOR_TEXT)
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(title)
        return row
    }

    private fun warningBanner(): TextView = TextView(this).apply {
        text = "DEBUG BUILD · AUTHORIZED TESTING ONLY\n" +
            "Nothing happens silently: camera permission is requested explicitly, every photo is " +
            "reviewed on-screen, and uploads only start when you press Send. This screen is " +
            "compiled out of release builds."
        setTextColor(Color.WHITE)
        textSize = 13.5f
        setLineSpacing(0f, 1.15f)
        background = pill(COLOR_BANNER, 14.dp().toFloat())
        setPadding(16.dp(), 12.dp(), 16.dp(), 12.dp())
    }.also { it.layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 14.dp() } }

    private fun configCard(): LinearLayout {
        val card = card()

        tokenInput = inputField("Telegram bot token (stored on this device only)", password = true)
        chatIdInput = inputField("Telegram chat / user ID")
        webhookInput = inputField("HTTPS webhook URL (optional, e.g. webhook.site)")
        card.addView(tokenInput)
        card.addView(chatIdInput)
        card.addView(webhookInput)

        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val save = actionButton("Save config", COLOR_ACCENT, COLOR_ACCENT_INK) {
            configStore.save(tokenInput.text.toString(), chatIdInput.text.toString(), webhookInput.text.toString())
            auditLog.record("config-saved", "Tester updated upload targets (token stored locally, never logged).")
            setStatus("Config saved on this device.")
            refreshUi()
        }
        val clear = actionButton("Clear stored credentials", COLOR_SURFACE, COLOR_TEXT, outline = true) {
            configStore.clearCredentials()
            tokenInput.setText("")
            chatIdInput.setText("")
            webhookInput.setText("")
            loadConfigIntoForm()
            auditLog.record("config-cleared", "Stored test target credentials were cleared by the tester.")
            setStatus("Stored credentials cleared.")
            refreshUi()
        }
        buttons.addView(save, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginEnd = 8.dp(); topMargin = 12.dp() })
        buttons.addView(clear, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = 8.dp(); topMargin = 12.dp() })
        card.addView(buttons)
        return card
    }

    private fun cameraCard(): LinearLayout {
        val card = card()

        permissionStatus = TextView(this).apply {
            setTextColor(COLOR_MUTED)
            textSize = 13f
        }
        card.addView(permissionStatus)

        val permissionButton = actionButton("Request camera permission", COLOR_OPERATOR, COLOR_OPERATOR_INK) {
            requestCameraPermissionWithRationale()
        }
        card.addView(permissionButton, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 10.dp() })

        previewView = PreviewView(this).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            layoutParams = LinearLayout.LayoutParams(MATCH, 260.dp()).apply { topMargin = 12.dp() }
        }
        card.addView(previewView)

        val previewButton = actionButton("Open camera preview", COLOR_SURFACE, COLOR_TEXT, outline = true) {
            openCameraPreview()
        }
        captureButton = actionButton("Capture test photo", COLOR_ACCENT, COLOR_ACCENT_INK) {
            capturePhoto()
        }
        captureButton.isEnabled = false
        card.addView(previewButton, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 10.dp() })
        card.addView(captureButton, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 8.dp() })

        reviewCard = card().apply {
            layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 12.dp() }
            visibility = LinearLayout.GONE
        }
        card.addView(reviewCard)
        return card
    }

    private fun auditCard(): LinearLayout {
        val card = card()

        statusText = TextView(this).apply {
            setTextColor(COLOR_MUTED)
            textSize = 13f
        }
        auditText = TextView(this).apply {
            setTextColor(COLOR_FAINT)
            textSize = 11.5f
            typeface = Typeface.MONOSPACE
            setPadding(12.dp(), 10.dp(), 12.dp(), 10.dp())
            background = pill(COLOR_INSET, 10.dp().toFloat())
        }
        card.addView(statusText)
        card.addView(auditText, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 8.dp() })

        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        buttons.addView(
            actionButton("Share log", COLOR_SURFACE, COLOR_TEXT, outline = true, compact = true) { shareAuditLog() },
            LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginEnd = 6.dp(); topMargin = 10.dp() }
        )
        buttons.addView(
            actionButton("Refresh", COLOR_SURFACE, COLOR_TEXT, outline = true, compact = true) { refreshUi() },
            LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = 3.dp(); marginEnd = 3.dp(); topMargin = 10.dp() }
        )
        buttons.addView(
            actionButton("Clear test data", COLOR_DANGER_BG, COLOR_DANGER_TEXT, compact = true) { confirmClearTestData() },
            LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = 6.dp(); topMargin = 10.dp() }
        )
        card.addView(buttons)
        return card
    }

    // --------------------------------------------------------- permission & camera

    private fun requestCameraPermissionWithRationale() {
        if (hasCameraPermission()) {
            setStatus("Camera permission is already granted.")
            refreshUi()
            return
        }
        if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
            AlertDialog.Builder(this)
                .setTitle("Camera permission")
                .setMessage(
                    "Security Test Mode uses the camera so you can capture a test photo and, only after " +
                        "reviewing it, send it to a destination you configured. The photo is never taken or " +
                        "sent automatically.\n\nYou can deny this and keep using the rest of the app."
                )
                .setPositiveButton("Continue") { _, _ ->
                    auditLog.record("camera-permission-requested", "Runtime permission dialog shown after tester consent.")
                    requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
                }
                .setNegativeButton("Not now") { _, _ ->
                    auditLog.record("camera-permission-deferred", "Tester dismissed the permission rationale.")
                    setStatus("Camera permission not requested.")
                }
                .show()
        } else {
            auditLog.record("camera-permission-requested", "Runtime permission dialog shown.")
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_REQUEST) {
            val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            auditLog.record(
                if (granted) "camera-permission-granted" else "camera-permission-denied",
                "Android runtime permission result."
            )
            setStatus(if (granted) "Camera permission granted — you can open the preview." else "Camera permission denied. The camera test is unavailable.")
            refreshUi()
        }
    }

    private fun openCameraPreview() {
        if (!hasCameraPermission()) {
            setStatus("Grant camera permission first.")
            return
        }
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            try {
                val provider = providerFuture.get()
                val selector = when {
                    provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                    provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                    else -> null
                }
                if (selector == null) {
                    setStatus("No camera is available on this device.")
                    auditLog.record("camera-unavailable", "No usable camera found.")
                    return@addListener
                }
                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                provider.unbindAll()
                provider.bindToLifecycle(this, selector, preview, imageCapture)
                captureButton.isEnabled = true
                setStatus("Camera preview is live. Tap “Capture test photo” when ready.")
                auditLog.record("camera-preview-opened", "Live preview started after explicit tester action.")
            } catch (error: Exception) {
                setStatus("Camera failed to start: ${error.message ?: "unknown error"}")
                auditLog.record("camera-error", error.message ?: "unknown error")
            }
        }, mainExecutor)
    }

    private fun capturePhoto() {
        val capture = imageCapture ?: run {
            setStatus("Open the camera preview first.")
            return
        }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val photo = File(auditLog.capturesDirectory, "test-$stamp.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(photo).build()
        setStatus("Capturing…")

        capture.takePicture(outputOptions, mainExecutor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                pendingPhoto = photo
                auditLog.record("photo-captured", "Test photo saved locally as ${photo.name} (${photo.length()} bytes). Nothing was uploaded.")
                setStatus("Photo captured locally. Review it below — nothing has been uploaded.")
                showReviewCard(photo)
            }

            override fun onError(exception: ImageCaptureException) {
                auditLog.record("capture-failed", exception.message ?: "unknown error")
                setStatus("Capture failed: ${exception.message ?: "unknown error"}")
            }
        })
    }

    // -------------------------------------------------------------- review & send

    private fun showReviewCard(photo: File) {
        reviewCard.removeAllViews()
        reviewCard.visibility = LinearLayout.VISIBLE

        val label = TextView(this).apply {
            text = "Review before sending — ${photo.name} (${photo.length() / 1024} KB)"
            setTextColor(COLOR_TEXT)
            textSize = 13.5f
            typeface = Typeface.DEFAULT_BOLD
        }
        val thumbnail = ImageView(this).apply {
            adjustViewBounds = true
            val options = BitmapFactory.Options().apply { inSampleSize = 4 }
            setImageBitmap(BitmapFactory.decodeFile(photo.absolutePath, options))
            layoutParams = LinearLayout.LayoutParams(MATCH, 220.dp()).apply { topMargin = 8.dp() }
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = pill(COLOR_INSET, 10.dp().toFloat())
            clipToOutline = true
        }
        reviewCard.addView(label)
        reviewCard.addView(thumbnail)

        val sendTelegram = actionButton("Send to Telegram bot", COLOR_ACCENT, COLOR_ACCENT_INK, compact = true) {
            val config = configStore.load()
            if (!config.telegramConfigured) {
                setStatus("Save a Telegram bot token and chat ID first.")
                return@actionButton
            }
            confirmSend("Telegram bot chat ${config.chatId}") {
                upload(auditLog, photo) { uploader.sendPhotoToTelegram(photo, config.botToken, config.chatId) }
            }
        }
        val sendWebhook = actionButton("Send to webhook", COLOR_OPERATOR, COLOR_OPERATOR_INK, compact = true) {
            val config = configStore.load()
            if (!config.webhookConfigured) {
                setStatus("Save an HTTPS webhook URL first.")
                return@actionButton
            }
            confirmSend("webhook ${config.webhookUrl}") {
                upload(auditLog, photo) { uploader.sendPhotoToWebhook(photo, config.webhookUrl) }
            }
        }
        val discard = actionButton("Discard photo", COLOR_DANGER_BG, COLOR_DANGER_TEXT, compact = true) {
            discardPendingPhoto()
        }
        reviewCard.addView(sendTelegram, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 12.dp() })
        reviewCard.addView(sendWebhook, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 8.dp() })
        reviewCard.addView(discard, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 8.dp() })
    }

    private fun confirmSend(destination: String, onConfirm: () -> Unit) {
        AlertDialog.Builder(this)
            .setTitle("Send this test photo?")
            .setMessage("Destination: $destination\n\nThis is a one-time, manual transfer. No other data is attached.")
            .setPositiveButton("Send") { _, _ -> onConfirm() }
            .setNegativeButton("Cancel") { _, _ ->
                auditLog.record("send-cancelled", "Tester cancelled an upload to $destination.")
                setStatus("Upload cancelled.")
            }
            .show()
    }

    private fun upload(log: SecurityAuditLog, photo: File, work: () -> TestUploader.UploadResult) {
        setStatus("Uploading ${photo.name}…")
        log.record("upload-started", "Manual upload started for ${photo.name}.")
        backgroundExecutor.execute {
            val result = work()
            runOnUiThread {
                when (result) {
                    is TestUploader.UploadResult.Success -> {
                        log.record("upload-success", result.summary)
                        setStatus(result.summary)
                    }
                    is TestUploader.UploadResult.Failure -> {
                        log.record("upload-failed", result.reason)
                        setStatus(result.reason)
                    }
                }
                refreshAuditView()
            }
        }
    }

    private fun discardPendingPhoto() {
        val photo = pendingPhoto ?: return
        photo.delete()
        pendingPhoto = null
        reviewCard.removeAllViews()
        reviewCard.visibility = LinearLayout.GONE
        auditLog.record("photo-discarded", "Tester discarded ${photo.name} without uploading.")
        setStatus("Test photo deleted without being sent.")
    }

    // ------------------------------------------------------------------ audit log

    private fun shareAuditLog() {
        val entries = auditLog.readAll()
        if (entries.isEmpty()) {
            setStatus("The audit log is empty.")
            return
        }
        val text = "Calc Security Test audit log\n\n" + entries.joinToString("\n")
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Calc Security Test audit log")
            putExtra(Intent.EXTRA_TEXT, text)
        }, "Share audit log"))
        auditLog.record("audit-log-shared", "Tester explicitly shared the audit log via the system share sheet.")
    }

    private fun confirmClearTestData() {
        AlertDialog.Builder(this)
            .setTitle("Clear all test data?")
            .setMessage("This deletes every captured test photo and the audit log stored by Security Test Mode.")
            .setPositiveButton("Delete everything") { _, _ ->
                pendingPhoto = null
                reviewCard.visibility = LinearLayout.GONE
                auditLog.clearAllTestData()
                setStatus("All test data deleted.")
                refreshUi()
            }
            .setNegativeButton("Keep", null)
            .show()
    }

    // ------------------------------------------------------------------- helpers

    private fun showAcknowledgementDialog() {
        AlertDialog.Builder(this)
            .setCancelable(false)
            .setTitle("Authorized testing only")
            .setMessage(
                "You are about to use the debug camera/network testing tools.\n\n" +
                    "• Camera photos are taken only when you tap Capture.\n" +
                    "• Uploads happen only when you tap Send, after an on-screen review.\n" +
                    "• Destinations are ones you configure yourself, and this device keeps an audit log.\n\n" +
                    "This screen exists only in debug builds and is removed from release builds."
            )
            .setPositiveButton("I understand") { _, _ ->
                configStore.markAcknowledged()
                auditLog.record("consent-acknowledged", "Tester acknowledged the consent notice.")
            }
            .setNegativeButton("Close") { _, _ -> finish() }
            .show()
    }

    private fun refreshUi() {
        val config = configStore.load()
        val targets = listOfNotNull(
            if (config.telegramConfigured) "Telegram bot chat ${config.chatId}" else null,
            if (config.webhookConfigured) "webhook configured" else null
        )
        permissionStatus.text = "Targets: " + (targets.ifEmpty { listOf("none saved yet") }).joinToString(" · ") +
            "\nCamera permission: " + if (hasCameraPermission()) "granted" else "not granted"
        permissionStatus.setTextColor(if (hasCameraPermission()) COLOR_ACCENT else COLOR_MUTED)
        refreshAuditView()
    }

    private fun refreshAuditView() {
        auditText.text = auditLog.readLast(15).asReversed().joinToString("\n\n")
            .ifBlank { "No events recorded yet." }
    }

    private fun setStatus(message: String) {
        statusText.text = message
    }

    private fun hasCameraPermission(): Boolean =
        checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun loadConfigIntoForm() {
        val config = configStore.load()
        tokenInput.setText(config.botToken)
        chatIdInput.setText(config.chatId)
        webhookInput.setText(config.webhookUrl)
    }

    override fun onResume() {
        super.onResume()
        if (::permissionStatus.isInitialized) refreshUi()
    }

    override fun onDestroy() {
        ProcessCameraProvider.getInstance(this).addListener({
            try {
                ProcessCameraProvider.getInstance(this).get().unbindAll()
            } catch (_: Exception) {
                // Camera was never bound.
            }
        }, mainExecutor)
        backgroundExecutor.shutdown()
        super.onDestroy()
    }

    // ------------------------------------------------------------ view factories

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(16.dp(), 14.dp(), 16.dp(), 16.dp())
        background = pill(COLOR_SURFACE, 16.dp().toFloat())
        layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 10.dp() }
    }

    private fun sectionTitle(text: String): TextView = TextView(this).apply {
        this.text = text
        setTextColor(COLOR_FAINT)
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        setPadding(2.dp(), 0, 0, 0)
        layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 18.dp() }
    }

    private fun inputField(hint: String, password: Boolean = false): EditText = EditText(this).apply {
        this.hint = hint
        setHintTextColor(COLOR_FAINT)
        setTextColor(COLOR_TEXT)
        textSize = 13.5f
        setSingleLine(true)
        if (password) transformationMethod = PasswordTransformationMethod.getInstance()
        background = pill(COLOR_INSET, 10.dp().toFloat())
        setPadding(12.dp(), 10.dp(), 12.dp(), 10.dp())
        layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = 8.dp() }
    }

    private fun actionButton(
        text: String,
        background: Int,
        textColor: Int,
        compact: Boolean = false,
        outline: Boolean = false,
        onClick: () -> Unit
    ): Button = Button(this).apply {
        this.text = text
        setTextColor(textColor)
        textSize = if (compact) 12.5f else 14f
        isAllCaps = false
        background = pill(background, 22.dp().toFloat(), outline)
        setOnClickListener { onClick() }
    }

    private fun pill(color: Int, radius: Float = 18.dp().toFloat(), outline: Boolean = false): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius
            if (outline) setStroke(1.dp(), COLOR_OUTLINE)
        }

    private fun Int.dp(): Int = (this * resources.displayMetrics.density).toInt()

    companion object {
        private const val CAMERA_REQUEST = 611
        private val MATCH = LinearLayout.LayoutParams.MATCH_PARENT
        private val WRAP = LinearLayout.LayoutParams.WRAP_CONTENT

        private val COLOR_PAGE = Color.rgb(13, 15, 21)
        private val COLOR_SURFACE = Color.rgb(23, 26, 35)
        private val COLOR_INSET = Color.rgb(17, 19, 26)
        private val COLOR_TEXT = Color.rgb(247, 248, 252)
        private val COLOR_MUTED = Color.rgb(154, 162, 181)
        private val COLOR_FAINT = Color.rgb(105, 114, 134)
        private val COLOR_ACCENT = Color.rgb(185, 255, 93)
        private val COLOR_ACCENT_INK = Color.rgb(24, 32, 8)
        private val COLOR_OPERATOR = Color.rgb(147, 199, 255)
        private val COLOR_OPERATOR_INK = Color.rgb(16, 37, 58)
        private val COLOR_BANNER = Color.rgb(92, 44, 18)
        private val COLOR_DANGER_BG = Color.rgb(58, 26, 26)
        private val COLOR_DANGER_TEXT = Color.rgb(255, 139, 134)
        private val COLOR_OUTLINE = Color.rgb(58, 64, 78)
    }
}
