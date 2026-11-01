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

## Als einzelne Datei (Windows und Linux)

Statt Startskript und Python gibt es Schafland auch als **eine einzige Datei** pro Betriebssystem, etwa 8 MB groß:

| Datei | System | Braucht |
| --- | --- | --- |
| `schafland.exe` | Windows 10/11 (64 Bit) | Microsoft Edge (ist immer installiert) oder Google Chrome |
| `schafland` | Linux (64 Bit) | Chromium oder Google Chrome (`sudo apt install chromium`) |

Die Datei enthält die komplette Kasse und einen kleinen Webserver. Ein Doppelklick startet den Browser im Vollbild, **Alt+F4** beendet alles. Sie benutzt dieselbe Adresse (`localhost:8080`) und denselben Profil-Ordner wie die Startskripte, gespeicherte Produkte, Einstellungen und Kassenbons bleiben also erhalten. Ein zweiter Doppelklick, während Schafland läuft, öffnet kein zweites Mal.

```bash
./schafland --autostart       # beim Anmelden starten (Linux: auch im Anwendungsmenü)
./schafland --kein-autostart  # wieder entfernen
./schafland --version
```

Unter Windows genauso: `schafland.exe --autostart` (z. B. über eine Verknüpfung mit diesem Zusatz). Beim ersten Start einer unsignierten exe zeigt Windows „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen → Trotzdem ausführen** klicken. Unter Linux die Datei einmal ausführbar machen: `chmod +x schafland`.

**Selbst bauen** (braucht Go ≥ 1.22, baut beide Dateien unter Linux, Windows oder macOS):

```bash
npm run build:starter    # → release/schafland.exe und release/schafland
npm run test:starter     # Go-Tests und Ende-zu-Ende-Test der Linux-Datei
```

Der Quellcode liegt in `launcher/` (Go, nur Standardbibliothek). Beim Bauen wird `dist/` hineinkopiert und eingebettet; das Schaf-Icon der exe erzeugt `go-winres` (braucht beim ersten Bauen Internet, sonst fehlt nur das Icon).

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
- **Überweisung (GiroCode):** Einschalten, Empfänger und IBAN eintragen (Tippfehler in der IBAN werden erkannt), optional den Verwendungszweck ändern. Beim Bezahlen erscheint dann „Überweisung“: ein QR-Code nach EPC-Standard, den Banking-Apps als „Foto-Überweisung“ einlesen. Empfänger, IBAN, Betrag und Verwendungszweck sind ausgefüllt; Geld fließt erst, wenn die zahlende Person in ihrer App bestätigt. Ein Test-Code über 1,00 € zeigt, ob alles stimmt. Der GiroCode hat kein Schaf in der Mitte und nutzt die vom Standard vorgesehene Fehlerkorrektur, damit jede Banking-App ihn sicher liest.
- **Musik:** Ordner wählen (Unterordner werden mitgenommen), Lautstärke, Zufall, Autostart. Bei Piep- und Mäh-Geräuschen wird die Musik kurz leiser.
- **Aktionen:** Eine Aktion ein- oder ausschalten (höchstens eine zugleich). Sie gibt der Kasse ein eigenes Aussehen und einen zusätzlichen Reiter mit 12 Aktionsprodukten; alles andere funktioniert wie immer.
  - **Halloween:** Nachthimmel mit Mond und Fledermäusen, Kürbis-Orange, Spinnennetz, Schafe mit Hexenhut, „Süßes oder Saures!“ beim Bezahlen. Etiketten-Codes `2150…`.
  - **Weihnachten:** Winternacht mit Stern und Schneeflocken, verschneite Wiese mit Tannen und Geschenken, Weihnachtsrot, Tannenzweig mit Kugeln, Schafe mit Weihnachtsmütze, „Frohe Weihnachten!“ beim Bezahlen. Etiketten-Codes `2151…`.
- **Etiketten drucken:** Bogen mit eigenen EAN-13-Codes (Präfix 21) für Holzobst und Spielzeug-Lebensmittel. Die Codes kollidieren nie mit echten Produkten.
- **Gescannte Produkte:** Alles, was schon einmal gescannt wurde. Name und Preis ändern oder löschen.
- **Kassenbons:** Die letzten 30 Einkäufe.
- **Scan-Protokoll:** Die letzten 50 Scans mit Code und den Antworten der Datenbanken. Hilft, wenn etwas nicht erkannt wird.

Oben im Eltern-Bereich steht die **Version** (z. B. „Version 1.10.0 vom 31.10.2026“). So lässt sich prüfen, ob das Notebook nach `git pull` den neuen Stand zeigt.

**Updates:** `git pull` und die Kasse neu starten. Die Kasse speichert sich für den Offline-Betrieb zwischen und zeigt beim Start zuerst kurz die alte Version. Sobald die neue geladen ist, wechselt sie automatisch: sofort, solange der Startbildschirm zu sehen ist, sonst nach dem nächsten Bezahlen, damit nie mitten im Spiel neu geladen wird.

## Scannen: so funktioniert es

1. Eigener Katalog (`src/lib/catalog.js`, Codes von den gedruckten Etiketten)
2. Bereits gescannte Produkte (IndexedDB, auch offline)
3. Open Food Facts → Open Beauty Facts → Open Products Facts (nur online)
4. Wikidata (nur online): über die Artikelnummer (Eigenschaft P3962), bei Zeitschriften über die ISSN, bei Büchern über die ISBN

**Bücher:** Codes, die mit **978** oder **979** beginnen, sind die ISBN des Buchs. Sie werden bei Google Books, dann Open Library, dann Wikidata gesucht, die Lebensmittel-Datenbanken werden dabei übersprungen. Angezeigt werden Titel, Autor, Verlag und Cover; der Spielpreis für Bücher ist 5,00 € (im Eltern-Bereich änderbar). Google Books funktioniert ohne Schlüssel, hat aber ein Tageslimit; ist es erreicht, springt Open Library ein.

Gefundene Produkte bekommen Name und Foto aus der Datenbank und einen Spielpreis aus ihrer Kategorie (Süßes 0,99 €, Milch 1,20 €, Zeitschrift 3,50 €, Buch 5,00 € …). Danach sind sie im Reiter „Gescannt“ auch ohne Internet da.

**Zeitschriften:** Es gibt zwei Arten von Codes.
- Beginnt der Code mit **977**, steckt die ISSN darin (977 + 7 ISSN-Ziffern + 2 Ziffern Ausgabe + Prüfziffer). Schafland rechnet die ISSN aus und sucht damit bei Wikidata, wo die meisten Zeitschriften mit Namen und Logo stehen.
- Deutsche **Pressecodes** beginnen mit **414** oder **419** (z. B. die c't: `419 91484 0700 3`). Sie stehen in keiner freien Datenbank, enthalten aber Titelnummer und Verkaufspreis (hier 7,00 €). Schafland legt sie direkt als „Zeitschrift“ mit diesem Preis an, ohne Internet. Den kleinen Zusatzcode daneben liest die Kasse als Ausgabe („Ausgabe 23“). Im Eltern-Bereich unter **Gescannte Produkte** lässt sich der Name einmal eintragen (z. B. „c't“), danach zeigt die Kasse ihn bei jedem Scan.

Die Erkennung läuft mit [zxing-wasm](https://github.com/Sec-Ant/zxing-wasm) in einem Web Worker. Die Kamera liefert 640×480, höchstens ca. 9 Bilder pro Sekunde werden ausgewertet, reihum auf vier Arten:
1. der mittlere Bildstreifen,
2. die Bildmitte 2× vergrößert (für kleine Codes),
3. dasselbe quer nachgeschärft (für unscharfe Codes alter Fixfokus-Kameras),
4. das ganze Bild, auch gedreht (für hochkant gehaltene Bücher und Packungen).

Kleine Zusatzcodes neben dem Hauptcode (Ausgabe bei Zeitschriften, Preis bei US-Büchern) werden mitgelesen; gesucht wird immer mit dem Hauptcode.

Ein Produkt, das ruhig vor der Kamera gehalten wird, kommt nur einmal in den Korb. Derselbe Code zählt erst wieder, wenn er 1,5 s nicht mehr im Bild war. Codes, die sicher in keiner Datenbank stehen, werden 2 Minuten lang nicht erneut abgefragt.

**Wenn eine Datenbank hakt:** Open Food Facts ist ein freies Projekt, dessen Server manchmal langsam oder überlastet sind. Schafland unterscheidet deshalb:

| Antwort | Was die App macht | Was das Kind sieht |
| --- | --- | --- |
| nicht gefunden | nächste Datenbank fragen, am Ende 2 Minuten merken | „Das kenne ich nicht.“ |
| Serverfehler, zu viele Anfragen, Wartungsseite | einmal wiederholen, dann nächste Datenbank, **nicht** merken | „Ich kann gerade nicht nachschauen.“ |
| keine Antwort nach 8 s | nächste Datenbank, **nicht** merken | „Ich kann gerade nicht nachschauen.“ |
| keine Verbindung | einmal wiederholen, dann aufhören | „Kein Internet.“ |

Im Eltern-Bereich unter **Scan-Protokoll** stehen die letzten 50 Scans mit Code, Ergebnis und der Antwort jeder Datenbank, z. B. `openfoodfacts.org: Serverfehler 503 · wikidata.org: nicht gefunden · 0.7 s`. Steht dort gar kein Eintrag, hat die Kamera den Code nicht gelesen.

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
| `tests/unit/` | EAN-Prüfziffern, Katalog, Geldformat, Abfragen bei Open Food Facts, Wikidata, Google Books und Open Library, ISSN und ISBN aus dem Strichcode |
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

Neue Aktionen kommen in `src/lib/aktionen.js` (Name, Emoji, Texte für Start und Danke, Deko auf der Wiese, Produkte). Das Aussehen steht in `src/app.css` unter `:root[data-aktion="…"]`, das Kostüm der Schafe in `src/components/Sheep.svelte`, die Himmels-Deko in `src/components/Deko.svelte`. Jede Aktion bekommt eigene Etiketten-Codes (`2150…`, `2151…`, …).

**Sortiment:** Obst, Gemüse, Milch, Backwaren (mit sechs Brötchensorten), Süßes, Getränke und **Spielzeug**: Schaf-Spielzeug (Kuschelschaf, Schaf-Puzzle, Wollknäuel, Schaf-Bilderbuch), Minecraft (Schwert, Spitzhacke, Grasblock, Diamant) und Hot Wheels (Rennwagen, Monstertruck, Rennbahn, Polizeiauto). Minecraft- und Hot-Wheels-Bilder sind eigene Zeichnungen im typischen Stil, ohne Original-Logos oder -Figuren.

Eigene Produkte oder Preise ändern: `src/lib/catalog.js` bearbeiten und `npm run build` ausführen. Die EAN-Codes werden aus der Position berechnet. Neue Produkte also hinten an die Liste einer Kategorie anhängen, damit die gedruckten Etiketten gültig bleiben.

## Browser

Gedacht für Chromium, Chrome oder Edge. In Firefox fehlt die Ordnerauswahl. Dort muss der Musik-Ordner nach jedem Start neu gewählt werden.
