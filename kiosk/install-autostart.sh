#!/usr/bin/env bash
# Richtet Schafland als Autostart und als Symbol auf dem Schreibtisch ein (Linux Mint, Ubuntu, Lubuntu …).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$HERE/start-schafland.sh"
ICON="$(cd "$HERE/.." && pwd)/public/icon-512.png"

entry="[Desktop Entry]
Type=Application
Name=Schafland
Comment=Hier bin ich Schaf, hier kauf ich ein
Exec=$HERE/start-schafland.sh
Icon=$ICON
Terminal=false
X-GNOME-Autostart-enabled=true"

mkdir -p "$HOME/.config/autostart" "$HOME/.local/share/applications"
echo "$entry" > "$HOME/.config/autostart/schafland.desktop"
echo "$entry" > "$HOME/.local/share/applications/schafland.desktop"
DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
  echo "$entry" > "$DESKTOP/schafland.desktop"
  chmod +x "$DESKTOP/schafland.desktop"
fi
echo "Fertig. Schafland startet ab jetzt nach dem Anmelden automatisch."
echo "Autostart wieder entfernen: rm ~/.config/autostart/schafland.desktop"
