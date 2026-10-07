# Keep the JavaScript interface used by the locally bundled calculator.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
