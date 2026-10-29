package com.jethin.manhwa;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The WebView cannot save files, so downloads (app updates) go to the system browser.
        getBridge().getWebView().setDownloadListener((url, userAgent, disposition, mimeType, length) ->
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
    }
}
