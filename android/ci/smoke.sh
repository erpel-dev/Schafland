#!/bin/bash
# Rauchtest im Android-Emulator (GitHub Actions): installiert die Debug-APK, startet sie und
# bedient die App über die WebView-Fernsteuerung (smoke.mjs). Aufruf: android/ci/smoke.sh <apk> <name>
set -euo pipefail
APK="$1"
NAME="$2"
PKG=de.schafland.kasse
cd "$(dirname "$0")/../.."

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
# Android zeigt beim ersten Vollbild einmalig "Viewing full screen … Got it"; auf dem Gerät tippt man
# das einmal weg. Im Test vorab als gesehen markieren, sonst fängt der Hinweis die Zurück-Taste ab.
adb shell settings put secure immersive_mode_confirmations confirmed
adb install -r -g "$APK"            # -g: Kamera-Erlaubnis gleich erteilen
adb logcat -c
adb logcat -b main,system,crash -v time > logcat.txt 2>&1 &   # alles mitschreiben, der Puffer läuft sonst über
LOGPID=$!
adb shell am start -n "$PKG/.MainActivity"

# Fernsteuerung der WebView suchen und auf localhost:9222 weiterleiten
for i in $(seq 1 60); do
  SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1 || true)
  [ -n "$SOCK" ] && break
  sleep 1
done
echo "WebView-Fernsteuerung: ${SOCK:-nicht gefunden}"
adb forward tcp:9222 "localabstract:$SOCK"

node android/ci/smoke.mjs "$NAME" || STATUS=$?

sleep 1; kill $LOGPID 2>/dev/null || true
echo "---- App-Meldungen (logcat, Auszug) ----"
grep -E "Capacitor/Console|AndroidRuntime|FATAL|F DEBUG|F/DEBUG|Schafland|schafland|lowmemorykiller|lmkd|has died|Abort message|Kamera|Camera.*(error|Error)" logcat.txt \
  | grep -vE "Native Bridge|gms" | tail -80 || true
echo "---- Vor dem Ende der App ----"
grep -B80 -m1 "WIN DEATH.*schafland" logcat.txt | grep -vE "AppsFilter|ImeTracker|CarrierSvc|ImsResolver|AiAiEcho" | tail -70 || true
grep -E "Fatal signal|F/libc|F/DEBUG|backtrace|#0[0-9] pc|Abort message|Kill '|lmkd.*kill|Killing.*schafland" logcat.txt | head -40 || true
echo "---- Java-Ausnahmen ----"
grep -B2 -A25 -E "FATAL EXCEPTION|Please include Java exception|Uncaught exception" logcat.txt | grep -vE "com\.google\.android\.(gm|gms)" | head -120 || true
adb shell pidof $PKG || echo "App läuft nicht mehr"
exit ${STATUS:-0}
