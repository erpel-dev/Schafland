package de.schafland.kasse;

import android.app.ActivityManager;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tablet-Funktionen, die ein Browser nicht hat:
 * Drucken (Etiketten) über den Android-Druckdialog und App anpinnen, damit das Kind sie nicht verlässt.
 */
@CapacitorPlugin(name = "Kiosk")
public class KioskPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String title = call.getString("title", "Schafland");
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title);
            PrintAttributes attributes = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
            printManager.print(title, adapter, attributes);
            call.resolve();
        });
    }

    @PluginMethod
    public void pin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("Anpinnen nicht möglich: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void unpin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().stopLockTask();
            } catch (Exception ignored) {
                // war nicht angepinnt
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void isPinned(PluginCall call) {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        JSObject result = new JSObject();
        result.put("pinned", am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
        call.resolve(result);
    }
}
