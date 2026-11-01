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

echo "---- App-Meldungen (logcat, Auszug) ----"
adb logcat -d | grep -E "Capacitor/Console|chromium|AndroidRuntime|FATAL|Schafland|has died" | grep -v "Native Bridge" | tail -60 || true
echo "---- Fehler und Abstürze ----"
adb logcat -d "*:E" | grep -vE "gms|GoogleApiManager|Finsky|Phenotype|chromium.*(font_unique|simple_file|simple_index)" | tail -60 || true
adb logcat -d -b crash | tail -40 || true
adb shell pidof de.schafland.kasse || echo "App läuft nicht mehr"
exit ${STATUS:-0}
