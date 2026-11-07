package de.schafland.kasse;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.provider.Settings;
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
 * Vorlesen für „Frag das Schaf“ (die WebView hat keine Sprachausgabe) und Kartenzahlung spielen
 * mit NFC (die WebView hat kein Web NFC).
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
            if (status != TextToSpeech.SUCCESS) {
                tts = null;
            } else {
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

    /** Gibt es eine Sprachausgabe mit deutscher Stimme? { available, german, engine } */
    @PluginMethod
    public void speechInfo(PluginCall call) {
        withTts(() -> {
            JSObject result = new JSObject();
            boolean available = tts != null && tts.getDefaultEngine() != null;
            int lang = available ? tts.isLanguageAvailable(Locale.GERMAN) : TextToSpeech.LANG_NOT_SUPPORTED;
            result.put("available", available);
            result.put("german", lang >= TextToSpeech.LANG_AVAILABLE);
            result.put("engine", available ? tts.getDefaultEngine() : "");
            call.resolve(result);
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

    // ---------- Kartenzahlung spielen (NFC) ----------
    // Es zählt nur, DASS eine Karte hingehalten wurde: keine Kartendaten lesen, nichts speichern.

    private boolean nfcActive = false;

    private NfcAdapter nfc() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void nfcInfo(PluginCall call) {
        NfcAdapter adapter = nfc();
        JSObject result = new JSObject();
        result.put("available", adapter != null);
        result.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(result);
    }

    private void enableReader() {
        NfcAdapter adapter = nfc();
        if (adapter == null || getActivity() == null) return;
        int flags = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F
                | NfcAdapter.FLAG_READER_NFC_V | NfcAdapter.FLAG_READER_NFC_BARCODE
                // eigener Piep in der App; ohne NDEF-Prüfung reagiert der Leser schneller
                | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
        adapter.enableReaderMode(getActivity(), tag -> notifyListeners("nfcCard", new JSObject()), flags, null);
    }

    /** Auf Karten warten; jede Karte meldet das Ereignis „nfcCard“. */
    @PluginMethod
    public void nfcStart(PluginCall call) {
        NfcAdapter adapter = nfc();
        if (adapter == null) {
            call.reject("Kein NFC auf diesem Gerät");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("NFC ist ausgeschaltet");
            return;
        }
        getActivity().runOnUiThread(() -> {
            nfcActive = true;
            enableReader();
            call.resolve();
        });
    }

    @PluginMethod
    public void nfcStop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            nfcActive = false;
            NfcAdapter adapter = nfc();
            if (adapter != null) {
                try {
                    adapter.disableReaderMode(getActivity());
                } catch (Exception ignored) {
                    // war nicht an
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void nfcSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NFC_SETTINGS));
        } catch (Exception e) {
            getActivity().startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
        }
        call.resolve();
    }

    // Der Lesemodus gilt nur, solange die App im Vordergrund ist: nach dem Zurückkehren neu einschalten
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (nfcActive) enableReader();
    }
}
