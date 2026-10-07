package com.pummyrajput.calc

import android.content.Intent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.pummyrajput.calc.security.SecurityTestActivity

/**
 * Debug variant only. Exposes a deliberately tiny bridge (open) that launches the
 * consent-based Security Test Mode screen. The release variant of this class is a no-op,
 * so shipped builds contain no security-test code at all.
 */
object SecurityTestHooks {

    fun attach(activity: MainActivity, webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun open() {
                activity.runOnUiThread {
                    activity.startActivity(Intent(activity, SecurityTestActivity::class.java))
                }
            }

            @JavascriptInterface
            fun version(): Int = 1
        }, "AndroidSecurityTest")
    }

    fun detach(webView: WebView) {
        webView.removeJavascriptInterface("AndroidSecurityTest")
    }
}
