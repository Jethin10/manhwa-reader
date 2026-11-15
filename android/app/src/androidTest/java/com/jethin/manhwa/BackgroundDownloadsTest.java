package com.jethin.manhwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.ActivityManager;
import android.app.Instrumentation;
import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * A chapter and an anime episode were downloading when the app closed. After a restart the
 * app must carry on by itself and finish both while it sits in the background.
 */
@RunWith(AndroidJUnit4.class)
public class BackgroundDownloadsTest {
    private static final String TAG = "KairoBG";
    private static final String CHAPTER = "weebcentral~01J76XYCPSY3C4BNPBRY8JMCBE~01J76XYXYZGGRVGEGATYQWFTD8";
    private static final String[] MORE = {
        "weebcentral~01J76XYCPSY3C4BNPBRY8JMCBE~01J76XYY5GEQSDQ86XR7B5NDK7",
        "mangakatana~21708~c179.6",
    };
    private static final String VIDEO = "v-0123456789abcdef0123456789abcdef";
    private final Instrumentation inst = InstrumentationRegistry.getInstrumentation();

    private String js(ActivityScenario<MainActivity> s, String script) throws Exception {
        AtomicReference<String> out = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        s.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, v -> {
            out.set(v);
            done.countDown();
        }));
        // onActivity needs the activity alive; it is, just stopped, while in the background.
        done.await(20, TimeUnit.SECONDS);
        String v = out.get();
        return v == null || v.equals("null") ? "" : new JSONArray("[" + v + "]").getString(0);
    }

    private void waitForPage(ActivityScenario<MainActivity> s, long ms) throws Exception {
        long end = SystemClock.uptimeMillis() + ms;
        while (SystemClock.uptimeMillis() < end) {
            if (js(s, "location.host + ' ' + document.readyState").matches(".*vercel\\.app complete")) return;
            Thread.sleep(1000);
        }
        throw new AssertionError("app never loaded");
    }

    private boolean serviceRunning() {
        ActivityManager am = (ActivityManager) inst.getTargetContext().getSystemService(Context.ACTIVITY_SERVICE);
        for (ActivityManager.RunningServiceInfo s : am.getRunningServices(50))
            if (s.service.getClassName().equals(MovieDownloadService.class.getName()) && s.foreground) return true;
        return false;
    }

    @Test
    public void restoredDownloadsFinishInTheBackground() throws Exception {
        try (ActivityScenario<MainActivity> s = ActivityScenario.launch(MainActivity.class)) {
            waitForPage(s, 60000);
            // As if the app closed mid-download: both were running, neither was paused.
            JSONObject chapter = new JSONObject()
                .put("id", CHAPTER)
                .put("series", new JSONObject().put("id", "weebcentral~01J76XYCPSY3C4BNPBRY8JMCBE").put("title", "Solo Leveling").put("cover", "").put("type", "Manhwa"))
                .put("number", "1").put("title", JSONObject.NULL)
                .put("state", "downloading").put("done", 5).put("total", 40);
            JSONObject episode = new JSONObject()
                .put("id", VIDEO)
                .put("anime", new JSONObject().put("id", "attack-on-titan-240").put("title", "Attack on Titan").put("cover", ""))
                .put("episode", new JSONObject().put("id", "4402").put("number", 1).put("title", "Episode 1"))
                .put("audio", "sub").put("quality", "best")
                .put("state", "downloading").put("done", 0).put("total", 0).put("bytes", 0);
            JSONArray queue = new JSONArray().put(chapter);
            StringBuilder clear = new StringBuilder("delete d['" + CHAPTER + "'];");
            for (String id : MORE) {
                queue.put(new JSONObject(chapter.toString()).put("id", id).put("number", id.substring(id.length() - 5)));
                clear.append("delete d['").append(id).append("'];");
            }
            js(s, "localStorage.setItem('mr:download-queue'," + JSONObject.quote(queue.toString()) + ");"
                + "const d=JSON.parse(localStorage.getItem('mr:downloads')||'{}');" + clear + "localStorage.setItem('mr:downloads',JSON.stringify(d));"
                + "localStorage.setItem('mr:video-downloads'," + JSONObject.quote(new JSONObject().put("version", 1).put("saved", new JSONObject()).put("jobs", new JSONArray().put(episode)).toString()) + ");"
                + "location.href = location.origin + '/settings'; 'ok'");
            // Leave the app straight away, as pressing Home does.
            Thread.sleep(800);
            s.onActivity(a -> a.moveTaskToBack(true));
            Thread.sleep(3000);

            boolean chapterDone = false, episodeDone = false, sawHidden = false, sawService = false;
            long end = SystemClock.uptimeMillis() + 30 * 60000;
            while (SystemClock.uptimeMillis() < end && !(chapterDone && episodeDone)) {
                Thread.sleep(5000);
                String state = js(s, "caches.open('video-downloads').then(c=>c.keys()).then(k=>{window.__vk=k.length});"
                    + "JSON.stringify({files:window.__vk,vis:document.visibilityState,"
                    + "chapter:(()=>{const d=JSON.parse(localStorage.getItem('mr:downloads')||'{}');return ['" + CHAPTER + "','" + String.join("','", MORE) + "'].every(id=>d[id])})(),"
                    + "queue:JSON.parse(localStorage.getItem('mr:download-queue')||'[]').map(j=>j.state+' '+(j.error||'')),"
                    + "video:(()=>{const v=JSON.parse(localStorage.getItem('mr:video-downloads')||'{}');"
                    + "return {saved:!!(v.saved||{})['" + VIDEO + "'],jobs:(v.jobs||[]).map(j=>j.state+' '+(j.error||''))}})()})");
                if (state.isEmpty()) continue;
                JSONObject o = new JSONObject(state);
                boolean service = serviceRunning();
                Log.i(TAG, state + " service=" + service);
                sawHidden |= "hidden".equals(o.optString("vis"));
                sawService |= service;
                chapterDone = o.optBoolean("chapter");
                episodeDone = o.getJSONObject("video").optBoolean("saved");
            }
            Log.i(TAG, "chapter=" + chapterDone + " episode=" + episodeDone + " hidden=" + sawHidden + " service=" + sawService);
            assertTrue("the app was never in the background", sawHidden);
            assertTrue("chapter didn't finish in the background", chapterDone);
            assertTrue("episode didn't finish in the background", episodeDone);
            assertTrue("no keep-alive service while downloading", sawService);
            assertEquals("", js(s, "localStorage.getItem('mr:download-queue')==='[]'?'':'left'"));
        }
    }
}
