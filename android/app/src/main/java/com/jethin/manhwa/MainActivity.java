package com.jethin.manhwa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

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

    /** window.ManhwaNative in the web app (see src/components/Reader.tsx). */
    private class NativeBridge {
        @JavascriptInterface
        public void setVolumeKeys(boolean on) {
            volumeKeys = on;
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
