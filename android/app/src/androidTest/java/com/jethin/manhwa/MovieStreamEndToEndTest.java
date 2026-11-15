package com.jethin.manhwa;

import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The whole chain in the real app: open a movie, press play inside each provider's player,
 * then read the app's own Download sheet to see what was found, and download from one.
 * Needs the app pointed at a live Kairo server (mobile/www/config.js).
 */
@RunWith(AndroidJUnit4.class)
public class MovieStreamEndToEndTest {
    private static final String TAG = "KairoE2E";
    private static final String MOVIE = "tt0111161"; // The Shawshank Redemption
    private final Instrumentation inst = InstrumentationRegistry.getInstrumentation();

    private String js(ActivityScenario<MainActivity> s, String script) throws Exception {
        AtomicReference<String> out = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        s.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, v -> {
            out.set(v);
            done.countDown();
        }));
        done.await(20, TimeUnit.SECONDS);
        return out.get();
    }

    private static String unquote(String v) throws Exception {
        if (v == null || v.equals("null")) return "";
        return new JSONArray("[" + v + "]").getString(0);
    }

    /** A real finger tap at a point in the page (CSS pixels). */
    private void tap(ActivityScenario<MainActivity> s, double cssX, double cssY) {
        AtomicReference<float[]> at = new AtomicReference<>();
        s.onActivity(a -> {
            WebView w = a.getBridge().getWebView();
            int[] loc = new int[2];
            w.getLocationOnScreen(loc);
            float density = a.getResources().getDisplayMetrics().density;
            at.set(new float[] { loc[0] + (float) cssX * density, loc[1] + (float) cssY * density });
        });
        float[] p = at.get();
        long t = SystemClock.uptimeMillis();
        try {
            inst.sendPointerSync(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, p[0], p[1], 0));
            inst.sendPointerSync(MotionEvent.obtain(t, t + 60, MotionEvent.ACTION_UP, p[0], p[1], 0));
        } catch (Exception e) {
            Log.w(TAG, "tap failed: " + e);
        }
    }

    private void waitForPage(ActivityScenario<MainActivity> s, String needle, long ms) throws Exception {
        long end = SystemClock.uptimeMillis() + ms;
        while (SystemClock.uptimeMillis() < end) {
            String href = unquote(js(s, "location.href + ' ' + document.readyState"));
            if (href.contains(needle) && href.endsWith("complete")) return;
            Thread.sleep(1000);
        }
        throw new AssertionError("page never loaded: " + needle);
    }

    /** Opens the movie with one provider, plays it, and returns what the Download sheet offers. */
    private String tryProvider(ActivityScenario<MainActivity> s, String provider) throws Exception {
        js(s, "localStorage.setItem('mr:movie-preferences', JSON.stringify(Object.assign("
            + "JSON.parse(localStorage.getItem('mr:movie-preferences')||'{}'),{preferredProvider:'" + provider + "'})));"
            + "location.href = location.origin + '/movies/" + MOVIE + "?watch=1&p=" + provider + "'");
        waitForPage(s, "p=" + provider, 45000);
        long end = SystemClock.uptimeMillis() + 75000;
        int taps = 0;
        while (SystemClock.uptimeMillis() < end) {
            Thread.sleep(4000);
            // Press play in the middle of the player, as a person would.
            String rect = unquote(js(s, "(()=>{const f=document.querySelector('iframe');if(!f)return '';"
                + "const r=f.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()"));
            if (!rect.isEmpty() && taps < 6) {
                JSONObject r = new JSONObject(rect);
                tap(s, r.getDouble("x"), r.getDouble("y"));
                taps++;
            }
            // Open the app's Download sheet and read its options.
            String sheet = unquote(js(s, "(()=>{let d=document.querySelector('dialog[open]');"
                + "if(!d){const b=[...document.querySelectorAll('header button')].find(b=>/Download|Saving/.test(b.textContent));"
                + "if(!b)return 'no download button';b.click();return 'opening'}"
                + "const t=d.innerText;d.querySelector('button')?.click();return t})()"));
            if (sheet.contains("Found while")) return sheet;
        }
        return "";
    }

    @Test
    public void findsAndDownloadsAMovieFromAProvider() throws Exception {
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            s.onActivity(a -> a.getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false));
            waitForPage(s, "vercel.app", 60000);
            String[] providers = { "cinesrc", "vidfast", "vidzee", "embedwave", "autoembed", "primesrc", "multiembed", "vidsrc-sh", "vidsrc-mov" };
            List<String> working = new ArrayList<>();
            for (String p : providers) {
                String found = tryProvider(s, p);
                Log.i(TAG, "provider " + p + " -> " + (found.isEmpty() ? "nothing found" : found.replace("\n", " | ")));
                if (!found.isEmpty()) working.add(p);
                if (working.size() >= 2) break;
            }
            Log.i(TAG, "providers with a downloadable stream: " + working);
            assertTrue("no provider exposed a downloadable stream", !working.isEmpty());

            // Download from the first that worked: pick its smallest option in the sheet.
            tryProvider(s, working.get(0));
            js(s, "(()=>{const b=[...document.querySelectorAll('header button')].find(b=>/Download/.test(b.textContent));b&&b.click()})()");
            Thread.sleep(1500);
            String picked = unquote(js(s, "(()=>{const o=[...document.querySelectorAll('dialog[open] li button')];"
                + "const b=o[o.length-1];if(!b)return '';const t=b.innerText;b.click();return t})()"));
            Log.i(TAG, "started download: " + picked.replace('\n', ' '));
            MovieDownloads d = MovieDownloads.get(inst.getTargetContext());
            boolean full = "1".equals(InstrumentationRegistry.getArguments().getString("full"));
            long end = SystemClock.uptimeMillis() + (full ? 40 * 60000 : 90000);
            JSONObject item = null;
            while (SystemClock.uptimeMillis() < end) {
                Thread.sleep(3000);
                JSONArray list = new JSONArray(d.list());
                for (int i = 0; i < list.length(); i++)
                    if (MOVIE.equals(list.getJSONObject(i).optString("movieId"))) item = list.getJSONObject(i);
                if (item != null) Log.i(TAG, "progress: " + item.optString("state") + " " + item.optLong("bytes") + " / " + item.optLong("total") + " " + item.optString("error"));
                if (item != null && ((!full && item.optLong("bytes") > 20L * 1024 * 1024) || "failed".equals(item.optString("state")) || "done".equals(item.optString("state")))) break;
            }
            assertTrue("download never started", item != null);
            assertTrue("download failed: " + item.optString("error"), !"failed".equals(item.optString("state")));
            assertTrue("no data arrived", item.optLong("bytes") > 0);
            if (full) {
                assertTrue("not finished: " + item.optString("state"), "done".equals(item.optString("state")));
                String id = item.optString("id");
                java.io.File main = new java.io.File(d.dir(id), d.find(id).optString("main"));
                long ms = MovieDownloadsTest.playOffline(inst.getTargetContext(), main, "hls".equals(item.optString("kind")));
                Log.i(TAG, "offline playback ready, length " + (ms / 60000) + " min, saved " + item.optLong("bytes") / (1024 * 1024) + " MB");
                assertTrue("whole movie expected, got " + ms + " ms", ms > 130 * 60000);
            }
            d.delete(item.optString("id"));
        }
    }
}
