package com.jethin.manhwa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

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
