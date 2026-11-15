package com.jethin.manhwa;

import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Movie players run on other sites inside an iframe, so the web app can't see what they load.
 * The WebView sees every request: this picks out video streams, checks each one is a whole
 * movie (not an ad or a preview), and reports it so the app can offer to download that copy.
 */
final class StreamSniffer {
    interface Listener {
        void onStream(JSONObject stream);
    }

    private static final Pattern FILE = Pattern.compile("\\.(mp4|mkv|webm|m4v)$", Pattern.CASE_INSENSITIVE);
    private static final long MIN_FILE_BYTES = 60L * 1024 * 1024; // ads and trailers are smaller
    private static final double MIN_SECONDS = 20 * 60;

    private final Listener listener;
    private final Set<String> seen = Collections.synchronizedSet(new HashSet<>());
    private final ExecutorService probes = Executors.newFixedThreadPool(2);
    /** The app's own server, whose requests (anime streams, images) are never movie copies. */
    volatile String appHost = "";

    StreamSniffer(Listener listener) {
        this.listener = listener;
    }

    void inspect(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String url = uri.toString();
        String scheme = uri.getScheme();
        if (scheme == null || !scheme.startsWith("http")) return;
        if (uri.getHost() != null && uri.getHost().equalsIgnoreCase(appHost)) return;
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);
        boolean hls = path.endsWith(".m3u8") || url.toLowerCase(Locale.ROOT).contains(".m3u8");
        boolean file = FILE.matcher(path).find();
        if (!hls && !file) return;
        // Signed URLs differ per request; one probe per path is enough.
        String key = uri.getHost() + path;
        if (!seen.add(key)) return;
        Map<String, String> headers = Http.copyHeaders(request.getRequestHeaders());
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null && !cookie.isEmpty()) headers.put("Cookie", cookie);
        probes.execute(() -> {
            try {
                JSONObject stream = hls ? probeHls(url, headers) : probeFile(url, headers);
                if (stream == null) return;
                stream.put("url", url);
                stream.put("headers", new JSONObject(headers));
                listener.onStream(stream);
            } catch (Exception ignored) {
                // Not a stream we can use.
            }
        });
    }

    void forget() {
        seen.clear();
    }

    private static JSONObject probeFile(String url, Map<String, String> headers) throws Exception {
        HttpURLConnection c = Http.open(url, headers, "bytes=0-0");
        try {
            int code = c.getResponseCode();
            if (code != 200 && code != 206) return null;
            long size = Http.totalSize(c);
            String type = String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT);
            if (type.startsWith("text/") || size < MIN_FILE_BYTES) return null;
            JSONObject out = new JSONObject();
            out.put("kind", "file");
            out.put("size", size);
            out.put("ranges", code == 206);
            return out;
        } finally {
            c.disconnect();
        }
    }

    private static final Pattern RESOLUTION = Pattern.compile("RESOLUTION=\\d+x(\\d+)");
    private static final Pattern BANDWIDTH = Pattern.compile("BANDWIDTH=(\\d+)");

    private static JSONObject probeHls(String url, Map<String, String> headers) throws Exception {
        String text = Http.text(url, headers);
        if (!text.startsWith("#EXTM3U")) return null;
        JSONObject out = new JSONObject();
        out.put("kind", "hls");
        if (text.contains("#EXT-X-STREAM-INF")) {
            JSONArray variants = new JSONArray();
            String[] lines = text.split("\\r?\\n");
            String best = null;
            long bestBandwidth = -1;
            for (int i = 0; i < lines.length; i++) {
                if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
                String next = i + 1 < lines.length ? lines[i + 1].trim() : "";
                Matcher r = RESOLUTION.matcher(lines[i]);
                Matcher b = BANDWIDTH.matcher(lines[i]);
                long bandwidth = b.find() ? Long.parseLong(b.group(1)) : 0;
                JSONObject v = new JSONObject();
                v.put("height", r.find() ? Integer.parseInt(r.group(1)) : 0);
                v.put("bandwidth", bandwidth);
                variants.put(v);
                if (bandwidth > bestBandwidth && !next.isEmpty()) {
                    bestBandwidth = bandwidth;
                    best = new URL(new URL(url), next).toString();
                }
            }
            out.put("variants", variants);
            if (best == null) return null;
            text = Http.text(best, headers);
        }
        double seconds = Hls.duration(text);
        if (seconds < MIN_SECONDS) return null;
        out.put("duration", Math.round(seconds));
        return out;
    }

    /** Small HTTP helpers shared with the downloader. */
    static final class Http {
        static Map<String, String> copyHeaders(Map<String, String> in) {
            Map<String, String> out = new java.util.LinkedHashMap<>();
            for (Map.Entry<String, String> h : in.entrySet()) {
                String k = h.getKey();
                if (k.equalsIgnoreCase("Range") || k.equalsIgnoreCase("Accept-Encoding")) continue;
                out.put(k, h.getValue());
            }
            return out;
        }

        static HttpURLConnection open(String url, Map<String, String> headers, String range) throws Exception {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            for (Map.Entry<String, String> h : headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
            if (range != null) c.setRequestProperty("Range", range);
            return c;
        }

        static long totalSize(HttpURLConnection c) {
            String range = c.getHeaderField("Content-Range");
            if (range != null && range.contains("/")) {
                try {
                    return Long.parseLong(range.substring(range.lastIndexOf('/') + 1).trim());
                } catch (NumberFormatException ignored) {
                }
            }
            return c.getContentLengthLong();
        }

        static String text(String url, Map<String, String> headers) throws Exception {
            HttpURLConnection c = open(url, headers, null);
            try {
                if (c.getResponseCode() >= 400) throw new Exception("HTTP " + c.getResponseCode());
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] chunk = new byte[16384];
                    int n;
                    while ((n = in.read(chunk)) > 0) {
                        buf.write(chunk, 0, n);
                        if (buf.size() > 8 * 1024 * 1024) throw new Exception("Playlist too large");
                    }
                    return buf.toString("UTF-8");
                }
            } finally {
                c.disconnect();
            }
        }
    }

    static final class Hls {
        static double duration(String playlist) {
            double total = 0;
            for (String line : playlist.split("\\r?\\n")) {
                if (!line.startsWith("#EXTINF:")) continue;
                String v = line.substring(8);
                int comma = v.indexOf(',');
                try {
                    total += Double.parseDouble(comma >= 0 ? v.substring(0, comma) : v);
                } catch (NumberFormatException ignored) {
                }
            }
            return total;
        }
    }
}
