package life.hundredsteps.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
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

    /**
     * The page waiting for a file. A WebView does nothing at all when an
     * `<input type="file">` is tapped unless the host app answers
     * onShowFileChooser — the tap is simply swallowed, with no error anywhere.
     */
    private var pendingFile: ValueCallback<Array<Uri>>? = null
    private lateinit var chooseFile: ActivityResultLauncher<String>

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Registered before the WebView exists: this has to happen while the
        // activity is still being created, or the launcher throws.
        chooseFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            // A cancelled picker must still answer, with null. Dropping the
            // callback leaves the input permanently unresponsive — the page
            // believes a chooser is still open and will not raise another.
            pendingFile?.onReceiveValue(if (uri == null) null else arrayOf(uri))
            pendingFile = null
        }

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

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams,
                ): Boolean {
                    // Abandon any earlier request rather than leaking it.
                    pendingFile?.onReceiveValue(null)
                    pendingFile = callback
                    return try {
                        chooseFile.launch(mimeTypeFor(params))
                        true
                    } catch (error: ActivityNotFoundException) {
                        // No picker on the device: tell the page so, rather
                        // than leaving the input dead.
                        pendingFile = null
                        false
                    }
                }
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
        // Release a page still waiting on a chooser, so nothing is left hanging.
        pendingFile?.onReceiveValue(null)
        pendingFile = null
        webView.destroy()
        super.onDestroy()
    }

    /** Honour the input's own `accept`, rather than always offering everything. */
    private fun mimeTypeFor(params: WebChromeClient.FileChooserParams): String {
        val accepted = params.acceptTypes.orEmpty().filter { it.isNotBlank() }
        return when {
            accepted.isEmpty() -> "*/*"
            accepted.all { it.startsWith("image/") } -> "image/*"
            accepted.size == 1 -> accepted.first()
            else -> "*/*"
        }
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
