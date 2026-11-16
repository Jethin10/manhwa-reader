package com.jethin.manhwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real downloads of public test streams, then offline playback of the saved files. */
@RunWith(AndroidJUnit4.class)
public class MovieDownloadsTest {
    private static final String HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
    private static final String MP4 = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private JSONObject request(String movieId, String kind, String url, int height) throws Exception {
        JSONObject r = new JSONObject();
        r.put("movieId", movieId);
        r.put("title", "Test " + movieId);
        r.put("quality", height > 0 ? height + "p" : "file");
        r.put("kind", kind);
        r.put("url", url);
        JSONObject headers = new JSONObject();
        headers.put("User-Agent", "Mozilla/5.0 KairoTest");
        r.put("headers", headers);
        r.put("height", height);
        return r;
    }

    /** Loads a saved file in ExoPlayer with no network involved; returns its duration in ms. */
    private long playOffline(File file, boolean hls) throws Exception {
        return playOffline(context, file, hls);
    }

    static long playOffline(Context context, File file, boolean hls) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        AtomicLong duration = new AtomicLong(-1);
        AtomicReference<String> error = new AtomicReference<>();
        AtomicReference<ExoPlayer> holder = new AtomicReference<>();
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
            ExoPlayer p = new ExoPlayer.Builder(context).build();
            holder.set(p);
            p.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_READY) {
                        duration.set(p.getDuration());
                        ready.countDown();
                    }
                }

                @Override
                public void onPlayerError(androidx.media3.common.PlaybackException e) {
                    error.set(e.getErrorCodeName() + ": " + e.getMessage());
                    ready.countDown();
                }
            });
            MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.fromFile(file));
            if (hls) item.setMimeType(MimeTypes.APPLICATION_M3U8);
            p.setMediaItem(item.build());
            p.prepare();
        });
        boolean done = ready.await(60, TimeUnit.SECONDS);
        main.post(() -> holder.get().release());
        assertTrue("player never became ready", done);
        assertNull("offline playback failed: " + error.get(), error.get());
        return duration.get();
    }

    @Test
    public void downloadsHlsAtChosenQualityAndPlaysOffline() throws Exception {
        MovieDownloads d = MovieDownloads.get(context);
        String id = d.enqueue(request("tt9000001", "hls", HLS, 184));
        d.runQueue();
        JSONObject item = d.find(id);
        assertNotNull(item);
        assertEquals("error: " + item.optString("error"), "done", item.optString("state"));
        assertEquals(184, item.optInt("height"));
        assertEquals(item.optInt("parts"), item.optInt("done"));
        assertTrue(item.optLong("bytes") > 5_000_000);

        File dir = d.dir(id);
        String master = new String(Files.readAllBytes(new File(dir, "index.m3u8").toPath()), StandardCharsets.UTF_8);
        assertTrue(master.contains("v/index.m3u8"));
        String media = new String(Files.readAllBytes(new File(dir, "v/index.m3u8").toPath()), StandardCharsets.UTF_8);
        assertTrue("playlist must point at local files only", !media.contains("http"));
        assertTrue(new File(dir, "v/s0.ts").length() > 0);

        long ms = playOffline(new File(dir, "index.m3u8"), true);
        assertTrue("about 10.5 minutes long, got " + ms, ms > 630_000 && ms < 640_000);

        d.delete(id);
        assertNull(d.find(id));
        assertTrue(!dir.exists());
    }

    @Test
    public void downloadsMp4AndPlaysOffline() throws Exception {
        MovieDownloads d = MovieDownloads.get(context);
        String id = d.enqueue(request("tt9000002", "file", MP4, 0));
        d.runQueue();
        JSONObject item = d.find(id);
        assertEquals("error: " + item.optString("error"), "done", item.optString("state"));
        File file = new File(d.dir(id), item.optString("main"));
        assertEquals(991017, file.length());
        assertEquals(991017, item.optLong("total"));

        long ms = playOffline(file, false);
        assertTrue("about 10 seconds long, got " + ms, ms > 9_000 && ms < 11_000);
        d.delete(id);
    }

    /** 32 MB with ranges allowed: fetched as 8 MB pieces over several connections. */
    private static final String MP4_LARGE =
        "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_30MB.mp4";

    @Test
    public void downloadsLargeMp4InPiecesResumesAfterPauseAndPlaysOffline() throws Exception {
        MovieDownloads d = MovieDownloads.get(context);
        String id = d.enqueue(request("tt9000004", "file", MP4_LARGE, 0));
        // Pause partway through, once some of it is saved.
        Thread pauser = new Thread(() -> {
            try {
                while (true) {
                    JSONObject o = d.find(id);
                    if (o != null && o.optLong("bytes") > 4_000_000) {
                        d.pause(id);
                        return;
                    }
                    Thread.sleep(20);
                }
            } catch (InterruptedException ignored) {
            }
        });
        pauser.start();
        d.runQueue();
        pauser.join(60_000);
        JSONObject item = d.find(id);
        assertEquals("paused", item.optString("state"));
        File dir = d.dir(id);
        assertTrue("pieces are kept for resume", new File(dir, "video.mp4.pieces").exists());

        d.resume(id);
        d.runQueue();
        item = d.find(id);
        assertEquals("error: " + item.optString("error"), "done", item.optString("state"));
        File file = new File(dir, item.optString("main"));
        assertEquals(32071424, file.length());
        assertEquals(32071424, item.optLong("total"));
        assertEquals(32071424, item.optLong("bytes"));
        assertTrue(!new File(dir, "video.mp4.pieces.map").exists());
        // Byte for byte the same as one plain download of the file.
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(MP4_LARGE).openConnection();
        byte[] expected;
        try (java.io.InputStream in = c.getInputStream()) {
            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[65536];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            expected = buf.toByteArray();
        }
        assertTrue("saved file matches the source", java.util.Arrays.equals(expected, Files.readAllBytes(file.toPath())));

        long ms = playOffline(file, false);
        assertTrue("about 10 seconds long, got " + ms, ms > 9_000 && ms < 11_000);
        d.delete(id);
    }

    @Test
    public void pausedDownloadIsSkippedAndResumes() throws Exception {
        MovieDownloads d = MovieDownloads.get(context);
        String id = d.enqueue(request("tt9000003", "file", MP4, 0));
        d.pause(id);
        d.runQueue();
        assertEquals("paused", d.find(id).optString("state"));
        d.resume(id);
        d.runQueue();
        assertEquals("done", d.find(id).optString("state"));
        // The same movie isn't queued twice.
        assertEquals(id, d.enqueue(request("tt9000003", "file", MP4, 0)));
        d.delete(id);
    }
}
