# Schafland

> Hier bin ich Schaf, hier kauf ich ein

Spiel-Kasse für den Kinderkaufladen. Produkte werden angetippt oder mit der Webcam gescannt, der Korb rechnet mit, bezahlt wird per QR-Code: entweder ein Spiel-Code mit Dankestext oder ein echter PayPal.me-Link. Dazu läuft Musik aus einem eigenen MP3-Ordner.

Gebaut für ein älteres Notebook (i5-4200U, 8 GB RAM) mit Chromium im Vollbild.

## Auf dem Notebook einrichten (Linux Mint / Ubuntu)

1. Chromium installieren (und Emojis, falls die Produktbilder als Kästchen erscheinen):
   ```bash
   sudo apt install chromium fonts-noto-color-emoji
   ```
2. Den Ordner `schafland` auf das Notebook kopieren, z. B. nach `~/schafland`. Der fertige Build liegt in `dist/`, Node.js wird zum Spielen **nicht** gebraucht.
3. Einmal testen:
   ```bash
   ~/schafland/kiosk/start-schafland.sh
   ```
   Beenden mit **Alt+F4**.
4. Automatisch beim Anmelden starten:
   ```bash
   ~/schafland/kiosk/install-autostart.sh
   ```

Beim ersten Scannen fragt Chromium oben links nach der Kamera. Dort **„Beim Besuch der Website zulassen“** (englisch: „Allow while visiting the site“) wählen, nicht „Nur dieses Mal“. Dann bleibt die Erlaubnis im eigenen Profil `~/.config/schafland-kiosk` gespeichert und die Frage kommt nicht wieder. Bis dahin zeigt die App „Bitte die Kamera erlauben“.

**Windows:** `kiosk/start-schafland-windows.bat` startet die App mit Microsoft Edge im Vollbild (braucht Python 3).

## Bedienung

| Was | Wie |
| --- | --- |
| Laden starten | „Laden öffnen“ antippen. Dabei werden Ton und Musik freigeschaltet. |
| Produkt in den Korb | Kachel antippen, oder „Scannen!“ und Strichcode in die Wollwolke halten |
| Menge ändern | − / + im Korb, bei 0 verschwindet die Zeile |
| Bezahlen | „Bezahlen“ → Schaf-Code oder PayPal → „Bezahlt! Neuer Einkauf“ |
| Eltern-Bereich | **2 Sekunden auf das Schaf oben links drücken** oder `Strg` + `,` |

### Eltern-Bereich

- **Bezahlen:** PayPal einschalten und den PayPal.me-Namen eintragen. Ein Test-Code über 1,00 € zeigt, ob der Empfänger stimmt. Ob „Freunde und Familie“ gewählt wird, entscheidet die zahlende Person in PayPal. Der Link kann das nicht vorgeben.
- **Musik:** Ordner wählen (Unterordner werden mitgenommen), Lautstärke, Zufall, Autostart. Bei Piep- und Mäh-Geräuschen wird die Musik kurz leiser.
- **Etiketten drucken:** Bogen mit eigenen EAN-13-Codes (Präfix 21) für Holzobst und Spielzeug-Lebensmittel. Die Codes kollidieren nie mit echten Produkten.
- **Gescannte Produkte:** Alles, was über Open Food Facts gefunden wurde. Preis ändern oder löschen.
- **Kassenbons:** Die letzten 30 Einkäufe.

## Scannen: so funktioniert es

1. Eigener Katalog (`src/lib/catalog.js`, Codes von den gedruckten Etiketten)
2. Bereits gescannte Produkte (IndexedDB, auch offline)
3. Open Food Facts → Open Beauty Facts → Open Products Facts (nur online)
4. Wikidata (nur online): über die Artikelnummer (Eigenschaft P3962) und bei Zeitschriften über die ISSN

Gefundene Produkte bekommen Name und Foto aus der Datenbank und einen Spielpreis aus ihrer Kategorie (Süßes 0,99 €, Milch 1,20 €, Zeitschrift 3,50 € …). Danach sind sie im Reiter „Gescannt“ auch ohne Internet da.

**Zeitschriften:** Codes, die mit **977** beginnen, enthalten die ISSN der Zeitschrift (977 + 7 ISSN-Ziffern + 2 Ziffern Ausgabe + Prüfziffer). Schafland rechnet die ISSN aus und fragt dafür zuerst Wikidata, wo die meisten Zeitschriften mit ISSN, Namen und Logo stehen. Deutsche Pressecodes, die mit **414** oder **419** beginnen, enthalten dagegen keine ISSN und stehen in keiner freien Datenbank. Welcher Code gelesen wurde, steht beim Scannen oben links im Kamerabild.

Die Erkennung läuft mit [zxing-wasm](https://github.com/Sec-Ant/zxing-wasm) in einem Web Worker. Die Kamera liefert 640×480, höchstens ca. 9 Bilder pro Sekunde werden ausgewertet. Abwechselnd wird der mittlere Bildstreifen gelesen und die Bildmitte 2× vergrößert, einmal davon quer nachgeschärft. So werden auch kleine und leicht unscharfe Codes alter Fixfokus-Kameras erkannt.

Ein Produkt, das ruhig vor der Kamera gehalten wird, kommt nur einmal in den Korb. Derselbe Code zählt erst wieder, wenn er 1,5 s nicht mehr im Bild war. Codes, die in keiner Datenbank stehen, werden 10 Minuten lang nicht erneut abgefragt.

**Tipps für alte Webcams:** Packung 15–25 cm vor die Kamera halten, gutes Licht, ruhig halten. Gedruckte Etiketten funktionieren am besten.

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # erzeugt dist/
npm run preview  # dist/ auf http://localhost:8080 testen
```

Svelte 5 + Vite, Dexie (IndexedDB), zxing-wasm, qrcode, JsBarcode, vite-plugin-pwa. Schriften (Baloo 2, Nunito) werden lokal mitgeliefert. Alle Geräusche werden per Web Audio erzeugt.

### Tests

```bash
npm test                # Unit-Tests (Node, wenige Sekunden)
npm run test:e2e        # Browser-Tests mit simulierter Kamera (ca. 5 Minuten)
npm run test:explore    # Erkundungstest: Zufallsbedienung + Dauerläufe (15 Minuten)
npm run test:explore -- --minutes=3 --seed=4242
```

Die Browser-Tests brauchen `ffmpeg` und Python 3, einmalig außerdem `npx playwright install chromium`. Kameras werden mit erzeugten Videos simuliert (sauberes Etikett, unbekannter Code, klein, unscharf), Open Food Facts mit festen Antworten. Testbilder und Ergebnisse landen in `tests/e2e/.fixtures/` und `tests/e2e/.output/`.

| Datei | Inhalt |
| --- | --- |
| `tests/unit/` | EAN-Prüfziffern, Katalog, Geldformat, Open-Food-Facts- und Wikidata-Abfrage, ISSN aus dem Strichcode |
| `tests/e2e/run.mjs` | Warenkorb, Scannen, Bezahlen, Einstellungen, Musik, Touch, Bildschirmgrößen, langsame CPU, offline |
| `tests/e2e/explore.mjs` | Affentest mit Prüfung nach jedem Schritt, Dauerlauf Kamera und Musik, Randfälle |

Ein Fund im Erkundungstest lässt sich mit demselben `--seed` wiederholen.

```
src/
  App.svelte              Ansichten: Start, Kasse, Scannen, Bezahlen, Eltern-Bereich
  components/             Oberfläche
  lib/catalog.js          Kategorien und eigene Produkte mit Preisen
  lib/shop.svelte.js      Warenkorb, Produktsuche per EAN
  lib/off.js              Open-Food-Facts-Abfrage
  lib/scanner.worker.js   Barcode-Erkennung
  lib/music.svelte.js     Musik-Ordner und Player
  lib/sounds.js           Piep, Plopp, Kassenklingel, Mäh
kiosk/                    Start- und Autostart-Skripte
```

Eigene Produkte oder Preise ändern: `src/lib/catalog.js` bearbeiten und `npm run build` ausführen. Die EAN-Codes werden aus der Position berechnet. Neue Produkte also hinten an die Liste einer Kategorie anhängen, damit die gedruckten Etiketten gültig bleiben.

## Browser

Gedacht für Chromium, Chrome oder Edge. In Firefox fehlt die Ordnerauswahl. Dort muss der Musik-Ordner nach jedem Start neu gewählt werden.
