package com.jethin.manhwa;

import android.content.Context;
import android.os.StatFs;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Movie downloads saved on the device: a whole file (MP4) or an HLS stream saved segment by
 * segment with a local playlist. The list lives in movies/index.json next to the files.
 * One movie downloads at a time; HLS segments download four at once.
 */
final class MovieDownloads {
    interface Listener {
        void onChange();
    }

    private static MovieDownloads instance;

    static synchronized MovieDownloads get(Context context) {
        if (instance == null) instance = new MovieDownloads(context.getApplicationContext());
        return instance;
    }

    private final Context context;
    private final File root;
    private final List<JSONObject> items = new ArrayList<>();
    private final List<Listener> listeners = new ArrayList<>();
    private volatile String cancelId = "";
    private long lastNotify = 0;
    private long lastSave = 0;

    private MovieDownloads(Context context) {
        this.context = context;
        File external = context.getExternalFilesDir("movies");
        root = external != null ? external : new File(context.getFilesDir(), "movies");
        //noinspection ResultOfMethodCallIgnored
        root.mkdirs();
        load();
    }

    // ---------- list and state ----------

    private void load() {
        try {
            File f = new File(root, "index.json");
            if (!f.exists()) return;
            JSONArray arr = new JSONArray(new String(java.nio.file.Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                // A download cut off by the app closing carries on next time.
                if ("downloading".equals(o.optString("state"))) o.put("state", "queued");
                items.add(o);
            }
        } catch (Exception ignored) {
        }
    }

    private synchronized void save() {
        try {
            JSONArray arr = new JSONArray();
            for (JSONObject o : items) arr.put(o);
            File tmp = new File(root, "index.json.tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(arr.toString().getBytes(StandardCharsets.UTF_8));
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(new File(root, "index.json"));
            lastSave = System.currentTimeMillis();
        } catch (Exception ignored) {
        }
    }

    synchronized void addListener(Listener l) {
        listeners.add(l);
    }

    synchronized void removeListener(Listener l) {
        listeners.remove(l);
    }

    private void changed(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastNotify < 700) return;
        lastNotify = now;
        if (force || now - lastSave > 5000) save();
        List<Listener> copy;
        synchronized (this) {
            copy = new ArrayList<>(listeners);
        }
        for (Listener l : copy) l.onChange();
    }

    synchronized String list() {
        JSONArray arr = new JSONArray();
        for (JSONObject o : items) {
            try {
                JSONObject pub = new JSONObject(o.toString());
                pub.remove("headers");
                pub.remove("url");
                arr.put(pub);
            } catch (Exception ignored) {
            }
        }
        return arr.toString();
    }

    synchronized JSONObject find(String id) {
        for (JSONObject o : items) if (id.equals(o.optString("id"))) return o;
        return null;
    }

    synchronized boolean hasWork() {
        for (JSONObject o : items) if ("queued".equals(o.optString("state"))) return true;
        return false;
    }

    File dir(String id) {
        return new File(root, id);
    }

    /** Adds a download. {movieId, title, poster, year, quality, kind, url, headers, size?, height?} */
    String enqueue(JSONObject req) throws Exception {
        String movieId = req.optString("movieId");
        synchronized (this) {
            for (JSONObject o : items) {
                if (movieId.equals(o.optString("movieId")) && !"failed".equals(o.optString("state")))
                    return o.optString("id");
            }
        }
        long size = req.optLong("size", 0);
        if (size > 0 && free() < size + 200L * 1024 * 1024)
            throw new Exception("Not enough free space for this movie (" + (size / (1024 * 1024)) + " MB).");
        JSONObject o = new JSONObject();
        String id = "m" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        o.put("id", id);
        o.put("movieId", movieId);
        o.put("title", req.optString("title", "Movie"));
        o.put("poster", req.optString("poster"));
        o.put("year", req.optString("year"));
        o.put("quality", req.optString("quality"));
        o.put("kind", req.optString("kind"));
        o.put("url", req.getString("url"));
        o.put("headers", req.optJSONObject("headers") != null ? req.optJSONObject("headers") : new JSONObject());
        o.put("height", req.optInt("height", 0));
        o.put("state", "queued");
        o.put("bytes", 0);
        o.put("total", size);
        o.put("done", 0);
        o.put("parts", 0);
        o.put("at", System.currentTimeMillis());
        synchronized (this) {
            items.add(0, o);
        }
        changed(true);
        return id;
    }

    long free() {
        try {
            return new StatFs(root.getAbsolutePath()).getAvailableBytes();
        } catch (Exception e) {
            return Long.MAX_VALUE;
        }
    }

    void pause(String id) {
        JSONObject o = find(id);
        if (o == null) return;
        set(o, "state", "paused");
        cancelId = id;
        changed(true);
    }

    void resume(String id) {
        JSONObject o = find(id);
        if (o == null || "done".equals(o.optString("state"))) return;
        set(o, "state", "queued");
        set(o, "error", "");
        changed(true);
    }

    void delete(String id) {
        JSONObject o = find(id);
        if (o == null) return;
        cancelId = id;
        synchronized (this) {
            items.remove(o);
        }
        deleteTree(dir(id));
        changed(true);
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static void set(JSONObject o, String k, Object v) {
        try {
            synchronized (o) {
                o.put(k, v);
            }
        } catch (Exception ignored) {
        }
    }

    // ---------- worker ----------

    /** Runs queued downloads one after another; returns when none are left. */
    void runQueue() {
        while (true) {
            JSONObject next = null;
            synchronized (this) {
                for (int i = items.size() - 1; i >= 0; i--) {
                    if ("queued".equals(items.get(i).optString("state"))) {
                        next = items.get(i);
                        break;
                    }
                }
            }
            if (next == null) return;
            String id = next.optString("id");
            cancelId = "";
            set(next, "state", "downloading");
            changed(true);
            try {
                waitForNetwork(id);
                File dir = dir(id);
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                if ("hls".equals(next.optString("kind"))) downloadHls(next, dir);
                else downloadFile(next, dir);
                if (id.equals(cancelId)) continue;
                set(next, "state", "done");
                set(next, "finishedAt", System.currentTimeMillis());
            } catch (Cancelled c) {
                // Paused or deleted: state was already set.
            } catch (Exception e) {
                if (find(id) == null) continue;
                set(next, "state", "failed");
                String msg = e.getMessage() == null ? "Download failed." : e.getMessage();
                if (msg.contains("HTTP 403") || msg.contains("HTTP 410") || msg.contains("HTTP 429") || msg.contains("HTTP 428"))
                    msg = "The link expired. Play the movie again, then download it.";
                set(next, "error", msg);
            }
            changed(true);
        }
    }

    private static final class Cancelled extends Exception {}

    private boolean online() {
        try {
            android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    /** No connection: wait for one (checking for pause/delete) instead of using up retries. */
    private void waitForNetwork(String id) throws Exception {
        while (!online()) {
            check(id);
            Thread.sleep(5000);
        }
    }

    private void check(String id) throws Cancelled {
        if (id.equals(cancelId)) throw new Cancelled();
    }

    private static Map<String, String> headers(JSONObject o) {
        Map<String, String> h = new HashMap<>();
        JSONObject j = o.optJSONObject("headers");
        if (j == null) return h;
        Iterator<String> keys = j.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            h.put(k, j.optString(k));
        }
        return h;
    }

    private void downloadFile(JSONObject o, File dir) throws Exception {
        String id = o.optString("id");
        String url = o.getString("url");
        String path = new URL(url).getPath().toLowerCase(Locale.ROOT);
        String ext = path.endsWith(".mkv") ? ".mkv" : path.endsWith(".webm") ? ".webm" : ".mp4";
        File part = new File(dir, "video" + ext + ".part");
        File out = new File(dir, "video" + ext);
        set(o, "main", out.getName());
        int attempts = 0;
        while (true) {
            check(id);
            long have = part.exists() ? part.length() : 0;
            HttpURLConnection c = StreamSniffer.Http.open(url, headers(o), "bytes=" + have + "-");
            try {
                int code = c.getResponseCode();
                if (code == 416 && have > 0) break; // already complete
                if (code >= 400) throw new Exception("HTTP " + code);
                boolean append = code == 206 && have > 0;
                long total = StreamSniffer.Http.totalSize(c);
                if (code == 200) {
                    have = 0;
                    total = c.getContentLengthLong();
                }
                if (total > 0) set(o, "total", total);
                if (total > 0 && free() < total - have + 100L * 1024 * 1024)
                    throw new Exception("Not enough free space to finish this movie.");
                try (InputStream in = c.getInputStream(); OutputStream w = new FileOutputStream(part, append)) {
                    byte[] buf = new byte[256 * 1024];
                    int n;
                    long done = have;
                    while ((n = in.read(buf)) > 0) {
                        w.write(buf, 0, n);
                        done += n;
                        set(o, "bytes", done);
                        check(id);
                        changed(false);
                    }
                }
                long expected = o.optLong("total", 0);
                if (expected > 0 && part.length() < expected) throw new java.io.IOException("Connection closed early");
                break;
            } catch (java.io.IOException e) {
                if (!online()) {
                    waitForNetwork(id);
                    continue;
                }
                if (++attempts > 8) throw new Exception("The connection kept dropping. Try again on a better network.");
                Thread.sleep(Math.min(30000, 1500L * attempts));
            } finally {
                c.disconnect();
            }
        }
        //noinspection ResultOfMethodCallIgnored
        part.renameTo(out);
        set(o, "bytes", out.length());
        set(o, "total", out.length());
    }

    // ---------- HLS ----------

    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern RESOLUTION = Pattern.compile("RESOLUTION=\\d+x(\\d+)");
    private static final Pattern BANDWIDTH = Pattern.compile("BANDWIDTH=(\\d+)");
    private static final Pattern AUDIO_GROUP = Pattern.compile("AUDIO=\"([^\"]+)\"");
    private static final Pattern GROUP_ID = Pattern.compile("GROUP-ID=\"([^\"]+)\"");

    private static final class Resource {
        final String url;
        final File file;
        final long offset;
        final long length;

        Resource(String url, File file, long offset, long length) {
            this.url = url;
            this.file = file;
            this.offset = offset;
            this.length = length;
        }
    }

    private void downloadHls(JSONObject o, File dir) throws Exception {
        String id = o.optString("id");
        Map<String, String> h = headers(o);
        String url = o.getString("url");
        String text = StreamSniffer.Http.text(url, h);
        List<Resource> resources = new ArrayList<>();
        StringBuilder master = new StringBuilder("#EXTM3U\n#EXT-X-VERSION:3\n");
        if (text.contains("#EXT-X-STREAM-INF")) {
            String[] lines = text.split("\\r?\\n");
            int want = o.optInt("height", 0);
            String chosen = null, chosenInf = null;
            long chosenScore = -1;
            for (int i = 0; i < lines.length; i++) {
                if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
                String uri = i + 1 < lines.length ? lines[i + 1].trim() : "";
                if (uri.isEmpty() || uri.startsWith("#")) continue;
                Matcher r = RESOLUTION.matcher(lines[i]);
                Matcher b = BANDWIDTH.matcher(lines[i]);
                int height = r.find() ? Integer.parseInt(r.group(1)) : 0;
                long bandwidth = b.find() ? Long.parseLong(b.group(1)) : 0;
                // The requested height if offered, otherwise the best picture.
                long score = want > 0 && height == want ? Long.MAX_VALUE : height * 100000000L + bandwidth;
                if (score > chosenScore) {
                    chosenScore = score;
                    chosen = new URL(new URL(url), uri).toString();
                    chosenInf = lines[i];
                }
            }
            if (chosen == null) throw new Exception("This stream has no playable quality.");
            Matcher res = RESOLUTION.matcher(chosenInf);
            if (res.find()) set(o, "height", Integer.parseInt(res.group(1)));
            // Separate audio track for the chosen quality, if the stream has one.
            String audioUrl = null;
            Matcher ag = AUDIO_GROUP.matcher(chosenInf);
            if (ag.find()) {
                String group = ag.group(1);
                for (String line : lines) {
                    if (!line.startsWith("#EXT-X-MEDIA") || !line.contains("TYPE=AUDIO")) continue;
                    Matcher g = GROUP_ID.matcher(line);
                    Matcher u = URI_ATTR.matcher(line);
                    if (!g.find() || !group.equals(g.group(1)) || !u.find()) continue;
                    if (audioUrl == null || line.contains("DEFAULT=YES"))
                        audioUrl = new URL(new URL(url), u.group(1)).toString();
                }
            }
            File v = new File(dir, "v");
            //noinspection ResultOfMethodCallIgnored
            v.mkdirs();
            writeMedia(StreamSniffer.Http.text(chosen, h), chosen, v, resources);
            Matcher bw = BANDWIDTH.matcher(chosenInf);
            String inf = "#EXT-X-STREAM-INF:BANDWIDTH=" + (bw.find() ? bw.group(1) : "2000000");
            Matcher rs = RESOLUTION.matcher(chosenInf);
            if (rs.find()) inf += ",RESOLUTION=" + rs.group().substring("RESOLUTION=".length());
            if (audioUrl != null) {
                File a = new File(dir, "a");
                //noinspection ResultOfMethodCallIgnored
                a.mkdirs();
                writeMedia(StreamSniffer.Http.text(audioUrl, h), audioUrl, a, resources);
                master.append("#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Audio\",DEFAULT=YES,AUTOSELECT=YES,URI=\"a/index.m3u8\"\n");
                inf += ",AUDIO=\"aud\"";
            }
            master.append(inf).append("\nv/index.m3u8\n");
        } else {
            File v = new File(dir, "v");
            //noinspection ResultOfMethodCallIgnored
            v.mkdirs();
            writeMedia(text, url, v, resources);
            master.append("#EXT-X-STREAM-INF:BANDWIDTH=2000000\nv/index.m3u8\n");
        }
        try (OutputStream w = new FileOutputStream(new File(dir, "index.m3u8"))) {
            w.write(master.toString().getBytes(StandardCharsets.UTF_8));
        }
        set(o, "main", "index.m3u8");
        set(o, "parts", resources.size());

        AtomicInteger done = new AtomicInteger();
        AtomicLong bytes = new AtomicLong();
        for (Resource r : resources) {
            if (r.file.exists()) {
                done.incrementAndGet();
                bytes.addAndGet(r.file.length());
            }
        }
        set(o, "done", done.get());
        set(o, "bytes", bytes.get());
        changed(true);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Future<?>> jobs = new ArrayList<>();
            for (Resource r : resources) {
                if (r.file.exists()) continue;
                jobs.add(pool.submit(() -> {
                    fetchResource(id, r, h);
                    set(o, "done", done.incrementAndGet());
                    set(o, "bytes", bytes.addAndGet(r.file.length()));
                    // Estimate the full size from what is saved so far.
                    int d = done.get();
                    if (d > 0) set(o, "total", bytes.get() * resources.size() / d);
                    changed(false);
                    return null;
                }));
            }
            for (Future<?> f : jobs) {
                try {
                    f.get();
                } catch (java.util.concurrent.ExecutionException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof Cancelled) throw (Cancelled) cause;
                    throw cause instanceof Exception ? (Exception) cause : new Exception(String.valueOf(cause));
                }
            }
        } finally {
            pool.shutdownNow();
        }
        set(o, "total", bytes.get());
    }

    private void fetchResource(String id, Resource r, Map<String, String> h) throws Exception {
        int attempts = 0;
        while (true) {
            check(id);
            String range = r.length > 0 ? "bytes=" + r.offset + "-" + (r.offset + r.length - 1) : null;
            HttpURLConnection c = StreamSniffer.Http.open(r.url, h, range);
            File part = new File(r.file.getPath() + ".part");
            try {
                int code = c.getResponseCode();
                if (code >= 400) throw new Exception("HTTP " + code);
                try (InputStream in = c.getInputStream(); OutputStream w = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        w.write(buf, 0, n);
                        check(id);
                    }
                }
                if (part.length() == 0) throw new java.io.IOException("Empty segment");
                //noinspection ResultOfMethodCallIgnored
                part.renameTo(r.file);
                return;
            } catch (java.io.IOException e) {
                if (!online()) {
                    waitForNetwork(id);
                    continue;
                }
                if (++attempts > 6) throw new Exception("The connection kept dropping. Try again on a better network.");
                Thread.sleep(Math.min(20000, 1000L * attempts));
            } finally {
                c.disconnect();
            }
        }
    }

    /** Rewrites a media playlist to local files and lists what to fetch. */
    private static void writeMedia(String text, String base, File dir, List<Resource> out) throws Exception {
        StringBuilder local = new StringBuilder();
        int seg = 0, key = 0, map = 0;
        long nextOffset = 0;
        long rangeLength = -1, rangeOffset = -1;
        String lastRangeUrl = null;
        for (String raw : text.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#EXT-X-BYTERANGE:")) {
                String[] p = line.substring(17).split("@");
                rangeLength = Long.parseLong(p[0].trim());
                rangeOffset = p.length > 1 ? Long.parseLong(p[1].trim()) : -1;
                continue; // each range is saved as its own file
            }
            if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) {
                Matcher m = URI_ATTR.matcher(line);
                if (m.find() && !line.contains("METHOD=NONE")) {
                    String remote = new URL(new URL(base), m.group(1)).toString();
                    boolean isKey = line.startsWith("#EXT-X-KEY");
                    String name = isKey ? "k" + (key++) + ".key" : "init" + (map++) + ".mp4";
                    out.add(new Resource(remote, new File(dir, name), 0, 0));
                    line = line.substring(0, m.start(1)) + name + line.substring(m.end(1));
                }
                local.append(line).append('\n');
                continue;
            }
            if (line.startsWith("#")) {
                local.append(line).append('\n');
                continue;
            }
            String remote = new URL(new URL(base), line).toString();
            String path = new URL(remote).getPath().toLowerCase(Locale.ROOT);
            String ext = path.endsWith(".m4s") ? ".m4s" : path.endsWith(".mp4") ? ".mp4" : path.endsWith(".aac") ? ".aac" : ".ts";
            String name = "s" + (seg++) + ext;
            long offset = 0, length = 0;
            if (rangeLength > 0) {
                offset = rangeOffset >= 0 ? rangeOffset : (remote.equals(lastRangeUrl) ? nextOffset : 0);
                length = rangeLength;
                nextOffset = offset + length;
                lastRangeUrl = remote;
                rangeLength = -1;
                rangeOffset = -1;
            }
            out.add(new Resource(remote, new File(dir, name), offset, length));
            local.append(name).append('\n');
        }
        try (OutputStream w = new FileOutputStream(new File(dir, "index.m3u8"))) {
            w.write(local.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
