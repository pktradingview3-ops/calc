package com.pummyrajput.calc

import android.webkit.WebView

/**
 * Release variant: no-op. Release APKs contain no security-test code, no CAMERA
 * permission, and no server-side test tooling. See src/debug for the real
 * consent-based testing implementation.
 */
object SecurityTestHooks {
    @Suppress("UNUSED_PARAMETER")
    fun attach(activity: MainActivity, webView: WebView) = Unit

    @Suppress("UNUSED_PARAMETER")
    fun detach(webView: WebView) = Unit
}
