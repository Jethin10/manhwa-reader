package com.jethin.manhwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps downloads running while the app is in the background, with a progress notification:
 * movies (downloaded here, natively) and chapters or episodes (downloaded by the web app,
 * which needs the app kept alive and unfrozen while they run).
 */
public class MovieDownloadService extends Service {
    private static final String CHANNEL = "movie-downloads";
    private static final int NOTIFICATION = 41;
    private static volatile boolean running = false;
    private static final Object LOCK = new Object();
    /** Web app downloads in progress: key -> notification label. */
    private static final Map<String, String> webWork = new LinkedHashMap<>();

    static void start(Context context) {
        ContextCompat.startForegroundService(context, new Intent(context, MovieDownloadService.class));
    }

    /** The web app reports a kind of download running (label) or finished (empty label). */
    static void setWebWork(Context context, String key, String label) {
        boolean starting;
        synchronized (LOCK) {
            if (label == null || label.isEmpty()) webWork.remove(key);
            else webWork.put(key, label);
            starting = !webWork.isEmpty();
            LOCK.notifyAll();
        }
        if (starting) start(context);
    }

    static boolean webWorkActive() {
        synchronized (LOCK) {
            return !webWork.isEmpty();
        }
    }

    private final MovieDownloads.Listener listener = this::updateNotification;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        Notification n = build("Preparing download", 0, 0);
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIFICATION, n);
        synchronized (LOCK) {
            LOCK.notifyAll(); // a new movie download: wake the loop
        }
        if (!running) {
            running = true;
            MovieDownloads downloads = MovieDownloads.get(this);
            downloads.addListener(listener);
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            PowerManager.WakeLock lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kairo:movie-download");
            // With the screen off, Wi-Fi drops into power save and downloads crawl; keep it awake.
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            @SuppressWarnings("deprecation")
            WifiManager.WifiLock wifiLock = wifi == null ? null
                : wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "kairo:downloads");
            if (wifiLock != null) wifiLock.setReferenceCounted(false);
            new Thread(() -> {
                lock.acquire(6 * 60 * 60 * 1000L);
                if (wifiLock != null) wifiLock.acquire();
                try {
                    while (true) {
                        downloads.runQueue();
                        synchronized (LOCK) {
                            if (downloads.hasWork()) continue;
                            if (webWork.isEmpty()) break;
                            showWebWork();
                            try {
                                LOCK.wait(30000);
                            } catch (InterruptedException e) {
                                break;
                            }
                        }
                    }
                } finally {
                    if (lock.isHeld()) lock.release();
                    if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
                    downloads.removeListener(listener);
                    running = false;
                    stopForeground(STOP_FOREGROUND_REMOVE);
                    stopSelf();
                    // A download added while this one was finishing.
                    if (downloads.hasWork() || webWorkActive()) start(getApplicationContext());
                }
            }, "movie-downloads").start();
        }
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Chapters, episodes and movies saving for offline use");
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private Notification build(String title, int max, int progress) {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setContentIntent(pi)
            .setProgress(max, progress, max == 0)
            .build();
    }

    private void showWebWork() {
        String label = webWork.values().iterator().next();
        getSystemService(NotificationManager.class).notify(NOTIFICATION, build(label, 0, 0));
    }

    private void updateNotification() {
        try {
            JSONArray list = new JSONArray(MovieDownloads.get(this).list());
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.getJSONObject(i);
                if (!"downloading".equals(o.optString("state"))) continue;
                long total = o.optLong("total"), bytes = o.optLong("bytes");
                int pct = total > 0 ? (int) Math.min(100, bytes * 100 / total) : 0;
                getSystemService(NotificationManager.class)
                    .notify(NOTIFICATION, build("Downloading " + o.optString("title") + " · " + pct + "%", 100, pct));
                return;
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
