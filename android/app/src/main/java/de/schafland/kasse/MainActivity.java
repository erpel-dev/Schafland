package de.schafland.kasse;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        super.onCreate(savedInstanceState);
        // Beim Spielen soll das Tablet nicht dunkel werden oder sperren
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
        // Stürzt die Darstellung ab (z. B. wenig Speicher), startet die Kasse neu statt leer zu bleiben
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                android.util.Log.w("Schafland", "Darstellung beendet (Absturz: " + detail.didCrash() + "), starte neu");
                // Laut Android-Doku: tote WebView entfernen und zerstören, Neustart erst danach
                if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                new Handler(Looper.getMainLooper()).post(MainActivity.this::recreate);
                return true;
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Vollbild: Status- und Navigationsleiste ausblenden; Wischen vom Rand zeigt sie kurz. */
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
