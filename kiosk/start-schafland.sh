#!/usr/bin/env bash
# Startet Schafland im Vollbild (Kiosk-Modus). Beenden mit Alt+F4.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=8080

python3 "$HERE/server.py" "$HERE/../dist" "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

BROWSER=""
for b in chromium chromium-browser google-chrome google-chrome-stable microsoft-edge; do
  if command -v "$b" >/dev/null; then BROWSER="$b"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "Kein Chromium/Chrome gefunden. Bitte installieren: sudo apt install chromium" >&2
  exit 1
fi

# Eigenes Profil: Kamera-Erlaubnis und Musik-Ordner bleiben gespeichert, das normale Surf-Profil bleibt unberührt.
"$BROWSER" \
  --kiosk --app="http://localhost:$PORT/" \
  --user-data-dir="$HOME/.config/schafland-kiosk" \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --disable-features=Translate,TouchpadOverscrollHistoryNavigation \
  --overscroll-history-navigation=0 --disable-pinch \
  --check-for-update-interval=31536000
