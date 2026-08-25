package life.hundredsteps.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

/**
 * The course, in a WebView, with one thing the browser cannot do bolted on.
 *
 * The web build is shipped inside the APK rather than loaded from a server, so
 * the app works with no connection and the pages cannot change underneath the
 * bridge. It is served through WebViewAssetLoader on an https:// origin rather
 * than the old file:// scheme, because file:// pages are treated as opaque
 * origins and localStorage — which is where the entire course lives — behaves
 * inconsistently there.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // localStorage: the whole course record
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: android.webkit.WebResourceRequest) =
                    assetLoader.shouldInterceptRequest(request.url)
            }

            addJavascriptInterface(ScreenTimeBridge(this@MainActivity), ScreenTimeBridge.NAME)
            loadUrl("https://$APP_DOMAIN/assets/index.html")
        }

        setContentView(webView)

        // Back should walk the course's own history before leaving the app.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        /**
         * A domain that resolves to nothing. WebViewAssetLoader's own default,
         * chosen so a request that somehow escapes the interceptor fails rather
         * than reaching a real site.
         */
        const val APP_DOMAIN = "appassets.androidplatform.net"
    }
}
