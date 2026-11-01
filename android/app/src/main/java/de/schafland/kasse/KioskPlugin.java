package de.schafland.kasse;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.WebView;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tablet-Funktionen, die ein Browser nicht hat:
 * Drucken (Etiketten) über den Android-Druckdialog, App anpinnen, damit das Kind sie nicht verlässt,
 * und Vorlesen für „Frag das Schaf“ (die WebView hat keine Sprachausgabe).
 */
@CapacitorPlugin(name = "Kiosk")
public class KioskPlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final List<Runnable> waiting = new ArrayList<>();
    private final Map<String, PluginCall> speaking = new HashMap<>();
    private int utterance = 0;

    private void withTts(Runnable action) {
        if (ttsReady) {
            action.run();
            return;
        }
        waiting.add(action);
        if (tts != null) return;
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.GERMAN);
                tts.setSpeechRate(0.92f);
                tts.setPitch(1.15f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { finish(id); }
                    @Override public void onError(String id) { finish(id); }
                    @Override public void onStop(String id, boolean interrupted) { finish(id); }
                });
            }
            ttsReady = true;
            for (Runnable r : waiting) r.run();
            waiting.clear();
        });
    }

    private void finish(String id) {
        PluginCall call = speaking.remove(id);
        if (call != null) call.resolve();
    }

    /** Liest einen Text vor; erfüllt sich, wenn er zu Ende gesprochen ist. */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        withTts(() -> {
            if (tts == null || text.isEmpty()) {
                call.resolve();
                return;
            }
            String id = "schaf-" + (++utterance);
            speaking.put(id, call);
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id) != TextToSpeech.SUCCESS) finish(id);
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (tts != null) tts.stop();
        for (String id : new ArrayList<>(speaking.keySet())) finish(id);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
        tts = null;
        ttsReady = false;
    }

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
