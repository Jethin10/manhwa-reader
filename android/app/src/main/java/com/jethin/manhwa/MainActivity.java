package com.jethin.manhwa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    // Set by the reader ("Volume keys turn pages"); read on the UI thread.
    private volatile boolean volumeKeys = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        // The WebView cannot save files, so downloads (app updates, saved pages) go to the system browser.
        webView.setDownloadListener((url, userAgent, disposition, mimeType, length) ->
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        webView.addJavascriptInterface(new NativeBridge(), "ManhwaNative");

        // Movie players run on other sites inside an iframe, so the page can't see what they
        // load. Here every request is visible: report video streams so the app can offer to
        // download the copy that is playing.
        sniffer = new StreamSniffer(stream -> dispatch(webView, "mr:stream", stream.toString()));
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                sniffer.inspect(request);
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The app page only ever moves within its own server (or back to the connect
                // screen). Anything else is a player or ad taking over the app: refuse it.
                // Real outside links open new windows, which go to the system browser.
                if (request.isForMainFrame()) {
                    String host = request.getUrl().getHost();
                    String app = sniffer.appHost;
                    if (host != null && !app.isEmpty() && !app.equals("localhost")
                        && !host.equalsIgnoreCase(app) && !host.equals("localhost")) {
                        // A tapped app update still has to reach the system browser.
                        String path = request.getUrl().getPath();
                        if (request.hasGesture() && path != null && path.endsWith(".apk"))
                            startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                        return true;
                    }
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Uri page = Uri.parse(url);
                if (page.getHost() != null) sniffer.appHost = page.getHost();
            }
        });
        // Download progress reaches the web app as "mr:movie-downloads" events.
        MovieDownloads downloads = MovieDownloads.get(this);
        downloads.addListener(() -> dispatch(webView, "mr:movie-downloads", downloads.list()));
        if (downloads.hasWork()) MovieDownloadService.start(this);

        // Embedded video players show ads by opening new windows from a script. Without this,
        // the WebView loads them in place of the app. Tapped links (an official-site link)
        // still open in the system browser; script-opened windows are dropped.
        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView.HitTestResult hit = view.getHitTestResult();
                int type = hit.getType();
                String url = hit.getExtra();
                if ((type == WebView.HitTestResult.SRC_ANCHOR_TYPE || type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
                    && url != null && url.startsWith("http")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                }
                return false;
            }
        });
    }

    private StreamSniffer sniffer;

    private static void dispatch(WebView view, String name, String json) {
        String js = "window.dispatchEvent(new CustomEvent('" + name + "',{detail:" + json + "}))";
        view.post(() -> view.evaluateJavascript(js, null));
    }

    private void askForNotifications() {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            runOnUiThread(() -> ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7));
    }

    /** window.ManhwaNative in the web app (see src/components/Reader.tsx). */
    private class NativeBridge {
        @JavascriptInterface
        public void setVolumeKeys(boolean on) {
            volumeKeys = on;
        }

        // Movie downloads (src/lib/native-movies.ts). Errors come back as {"error": "..."}.
        @JavascriptInterface
        public boolean movieDownloads() {
            return true;
        }

        @JavascriptInterface
        public String movieDownloadStart(String json) {
            try {
                String id = MovieDownloads.get(MainActivity.this).enqueue(new JSONObject(json));
                askForNotifications();
                MovieDownloadService.start(MainActivity.this);
                return new JSONObject().put("id", id).toString();
            } catch (Exception e) {
                return "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
            }
        }

        @JavascriptInterface
        public String movieDownloadList() {
            return MovieDownloads.get(MainActivity.this).list();
        }

        @JavascriptInterface
        public void movieDownloadPause(String id) {
            MovieDownloads.get(MainActivity.this).pause(id);
        }

        @JavascriptInterface
        public void movieDownloadResume(String id) {
            MovieDownloads.get(MainActivity.this).resume(id);
            MovieDownloadService.start(MainActivity.this);
        }

        @JavascriptInterface
        public void movieDownloadDelete(String id) {
            MovieDownloads.get(MainActivity.this).delete(id);
        }

        @JavascriptInterface
        public void movieDownloadPlay(String id) {
            MoviePlayerActivity.open(MainActivity.this, id);
        }

        @JavascriptInterface
        public String movieDownloadSpace() {
            return String.valueOf(MovieDownloads.get(MainActivity.this).free());
        }

        /**
         * The web app reports chapter or episode downloads running (label) or done (empty).
         * While any run, the download service keeps the app alive and unfrozen in the
         * background, and the page's renderer keeps its priority when the app isn't visible.
         */
        @JavascriptInterface
        public void setBackgroundWork(String key, String label) {
            boolean wasActive = MovieDownloadService.webWorkActive();
            MovieDownloadService.setWebWork(MainActivity.this, key, label);
            boolean active = MovieDownloadService.webWorkActive();
            if (active && !wasActive) askForNotifications();
            if (active != wasActive && Build.VERSION.SDK_INT >= 26) {
                WebView w = getBridge().getWebView();
                w.post(() -> w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, !active));
            }
        }

        /** Forget streams already reported, so reopening a movie reports them again. */
        @JavascriptInterface
        public void movieStreamsReset() {
            if (sniffer != null) sniffer.forget();
        }
    }

    /**
     * Volume keys turn pages while the reader asks for them, as in Mihon: volume down goes
     * forward. Only on a chapter page, so a reader that closed without saying so can't keep
     * the keys from changing the volume elsewhere.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (volumeKeys && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            WebView webView = getBridge().getWebView();
            String url = webView.getUrl();
            if (url != null && url.contains("/chapter/")) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    int delta = code == KeyEvent.KEYCODE_VOLUME_DOWN ? 1 : -1;
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('mr:volume',{detail:" + delta + "}))", null);
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
