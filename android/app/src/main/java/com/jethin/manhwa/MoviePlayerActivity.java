package com.jethin.manhwa;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import java.io.File;
import org.json.JSONObject;

/** Plays a downloaded movie from the device, full screen, and remembers where you stopped. */
@OptIn(markerClass = UnstableApi.class)
public class MoviePlayerActivity extends AppCompatActivity {
    static void open(Context context, String id) {
        context.startActivity(new Intent(context, MoviePlayerActivity.class).putExtra("id", id));
    }

    private ExoPlayer player;
    private String id;
    private SharedPreferences positions;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.hide(WindowInsetsCompat.Type.systemBars());
        insets.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

        id = getIntent().getStringExtra("id");
        MovieDownloads downloads = MovieDownloads.get(this);
        JSONObject item = id == null ? null : downloads.find(id);
        if (item == null || !"done".equals(item.optString("state"))) {
            finish();
            return;
        }
        File file = new File(downloads.dir(id), item.optString("main"));
        positions = getSharedPreferences("movie-positions", MODE_PRIVATE);

        PlayerView view = new PlayerView(this);
        view.setBackgroundColor(0xFF000000);
        view.setKeepScreenOn(true);
        setContentView(view);

        player = new ExoPlayer.Builder(this).setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).build();
        view.setPlayer(player);
        MediaItem.Builder media = new MediaItem.Builder().setUri(Uri.fromFile(file));
        if ("hls".equals(item.optString("kind"))) media.setMimeType(MimeTypes.APPLICATION_M3U8);
        player.setMediaItem(media.build());
        long at = positions.getLong(id, 0);
        if (at > 0) player.seekTo(at);
        player.prepare();
        player.play();
    }

    private void savePosition() {
        if (player == null || id == null) return;
        long pos = player.getCurrentPosition(), dur = player.getDuration();
        // Finished (or nearly): start from the beginning next time.
        long keep = dur > 0 && dur - pos < 120000 ? 0 : pos;
        positions.edit().putLong(id, keep).apply();
    }

    @Override
    protected void onPause() {
        super.onPause();
        savePosition();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        savePosition();
        if (player != null) player.release();
        player = null;
        super.onDestroy();
    }
}
