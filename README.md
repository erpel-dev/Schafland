# Schafland

> Hier bin ich Schaf, hier kauf ich ein

Spiel-Kasse für den Kinderkaufladen. Produkte werden angetippt oder mit der Webcam gescannt, der Korb rechnet mit, bezahlt wird per QR-Code: entweder ein Spiel-Code mit Dankestext oder ein echter PayPal.me-Link. Dazu läuft Musik aus einem eigenen MP3-Ordner.

Gebaut für ein älteres Notebook (i5-4200U, 8 GB RAM) mit Chromium im Vollbild.

**Sofort ausprobieren:** https://erpel-dev.github.io/Schafland/ – läuft im Browser (Chrome, Edge, Safari, Firefox) und lässt sich als App installieren: Chrome/Edge → „App installieren“, iPhone/iPad → Teilen → „Zum Home-Bildschirm“. Danach geht alles außer der Produktsuche auch offline. Gescannte Produkte, Kassenbons und Einstellungen bleiben nur auf dem jeweiligen Gerät. Neue Versionen kommen bei jedem Push nach `main` automatisch (`.github/workflows/pages.yml`).

**Fertige Dateien** (Android-APK, Windows, Linux, Web-Version): GitHub → **Releases**.

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

## Android-App für Tablets und Smartphones

Schafland gibt es auch als **APK** für Android 7 und neuer. Die App enthält die komplette Kasse und braucht keinen Server; Internet nur für die Produktsuche.

**Herunterladen:** Am einfachsten unter GitHub → **Releases**: Dort hängen an jeder Version die APK, die Windows-exe, die Linux-Datei und die Web-Version. Zwischenstände: Die APK wird außerdem bei jedem Push gebaut: GitHub → **Actions** → „Android-APK“ → letzter Lauf → unten bei **Artifacts** „schafland-apk“ (eine ZIP mit `schafland-<version>.apk`).

**Installieren:** APK aufs Gerät kopieren (USB, Cloud, E-Mail) und antippen. Android fragt einmal, ob Apps aus dieser Quelle installiert werden dürfen. Beim ersten Scannen fragt die App nach der Kamera.

Unterschiede zur Browser-Version:

| | Tablet / Smartphone |
| --- | --- |
| Kamera | Rückkamera mit Autofokus (scannt deutlich besser), Knopf „🔄 Kamera“ zum Wechseln, Wahl wird gemerkt |
| Ansicht | Tablet und Handy quer: Regal links, Korb rechts. Handy hochkant: Korb als Leiste unten, antippen zeigt ihn als Blatt |
| Musik | Lieder einmal über „Lieder hinzufügen“ importieren (Android hat keine Ordnerauswahl); sie bleiben in der App gespeichert |
| Etiketten | Drucken über den Android-Druckdialog |
| Kind kommt nicht raus | Eltern-Bereich → **Tablet** → „Kasse anpinnen“. Die Zurück-Taste schließt nur Fenster und beendet die App nie; „Schafland beenden“ ebenfalls dort |
| Bildschirm | bleibt an, Vollbild ohne Android-Leisten. Beim allerersten Start zeigt Android einmal „Vollbildmodus – zum Beenden von oben wischen“: einmal mit „OK“ bestätigen |
| Updates | neue APK installieren (Daten bleiben, siehe Signatur) |

**Signatur und Updates:** Eine neue APK lässt sich nur über die alte installieren, wenn beide mit demselben Schlüssel signiert sind. Dafür einmal einen Schlüssel erzeugen und als GitHub-Secrets hinterlegen (Repository → Settings → Secrets and variables → Actions):

```bash
keytool -genkeypair -keystore schafland.jks -storetype PKCS12 -alias schafland -keyalg RSA -keysize 2048 -validity 10950 -dname "CN=Schafland"
base64 -w0 schafland.jks   # Ausgabe als Secret SCHAFLAND_KEYSTORE_BASE64
```

Das gewählte Passwort als Secret `SCHAFLAND_KEYSTORE_PASSWORD`. Den Schlüssel gut aufheben und nicht ins Repo legen. Ohne die Secrets wird die APK mit einem Test-Schlüssel signiert: Sie lässt sich installieren, vor jedem Update muss die alte App aber deinstalliert werden (dabei gehen gescannte Produkte und Einstellungen verloren).

**Tests:** Der GitHub-Lauf startet die App zusätzlich in einem Android-Emulator (Pixel-Tablet quer, Pixel 7 hochkant) und bedient sie: Start, Kasse, Kamera, Zurück-Taste, Bezahlen, Eltern-Bereich, eigenes Kiosk-Plugin (`android/ci/smoke.mjs`). Screenshots stehen als `SCREENSHOT`-Zeilen im Protokoll des Laufs.

**Selbst bauen** (braucht Android Studio bzw. Android-SDK und Java 21): `npm run build:apk` → `android/app/build/outputs/apk/release/app-release.apk`.

## Bedienung

| Was | Wie |
| --- | --- |
| Laden starten | „Laden öffnen“ antippen. Dabei werden Ton und Musik freigeschaltet. |
| Produkt in den Korb | Kachel antippen, oder „Scannen!“ und Strichcode in die Wollwolke halten |
| Menge ändern | − / + im Korb, bei 0 verschwindet die Zeile |
| Bezahlen | „Bezahlen“ → Karte (NFC), Schaf-Code oder PayPal → „Bezahlt! Neuer Einkauf“ |
| Eltern-Bereich | **2 Sekunden auf das Schaf oben links drücken** oder `Strg` + `,` |

### Eltern-Bereich

- **Bezahlen:** PayPal einschalten und den PayPal.me-Namen eintragen. Ein Test-Code über 1,00 € zeigt, ob der Empfänger stimmt. Ob „Freunde und Familie“ gewählt wird, entscheidet die zahlende Person in PayPal. Der Link kann das nicht vorgeben.
- **Kartenzahlung (NFC):** Standardmäßig an. Kann das Gerät NFC lesen (Android-App, oder Chrome auf einem Android-Handy mit NFC), erscheint beim Bezahlen ein Kartenterminal. Jede NFC-Karte, jeder NFC-Aufkleber oder Schlüsselanhänger „bezahlt“, sobald er ans Gerät gehalten wird. Es wird nichts abgebucht und nichts von der Karte gelesen oder gespeichert. In Chrome muss der Kartenleser einmal per Antippen eingeschaltet werden. Am PC geht es mit dem Schafland-Starter (exe/Linux) und einem USB-Chipkartenleser (PC/SC, z. B. ein Leser für den Personalausweis mit NFC): Karte auflegen oder in den Schlitz stecken. Unter Linux braucht es einmal `sudo apt install pcscd`, unter Windows nichts weiter.
- **Überweisung (GiroCode):** Einschalten, Empfänger und IBAN eintragen (Tippfehler in der IBAN werden erkannt), optional den Verwendungszweck ändern. Beim Bezahlen erscheint dann „Überweisung“: ein QR-Code nach EPC-Standard, den Banking-Apps als „Foto-Überweisung“ einlesen. Empfänger, IBAN, Betrag und Verwendungszweck sind ausgefüllt; Geld fließt erst, wenn die zahlende Person in ihrer App bestätigt. Ein Test-Code über 1,00 € zeigt, ob alles stimmt. Der GiroCode hat kein Schaf in der Mitte und nutzt die vom Standard vorgesehene Fehlerkorrektur, damit jede Banking-App ihn sicher liest.
- **Musik:** Ordner wählen (Unterordner werden mitgenommen), Lautstärke, Zufall, Autostart. Bei Piep- und Mäh-Geräuschen wird die Musik kurz leiser.
- **Aktionen:** Eine Aktion ein- oder ausschalten (höchstens eine zugleich). Sie gibt der Kasse ein eigenes Aussehen und einen zusätzlichen Reiter mit 12 Aktionsprodukten; alles andere funktioniert wie immer.
  - **Halloween:** Nachthimmel mit Mond und Fledermäusen, Kürbis-Orange, Spinnennetz, Schafe mit Hexenhut, „Süßes oder Saures!“ beim Bezahlen. Etiketten-Codes `2150…`.
  - **Weihnachten:** Winternacht mit Stern und Schneeflocken, verschneite Wiese mit Tannen und Geschenken, Weihnachtsrot, Tannenzweig mit Kugeln, Schafe mit Weihnachtsmütze, „Frohe Weihnachten!“ beim Bezahlen. Etiketten-Codes `2151…`.
- **Etiketten drucken:** Bogen mit eigenen EAN-13-Codes (Präfix 21) für Holzobst und Spielzeug-Lebensmittel. Die Codes kollidieren nie mit echten Produkten.
- **Gescannte Produkte:** Alles, was schon einmal gescannt wurde. Name und Preis ändern oder löschen.
- **Kassenbons:** Die letzten 30 Einkäufe.
- **Scan-Protokoll:** Die letzten 50 Scans mit Code und den Antworten der Datenbanken. Hilft, wenn etwas nicht erkannt wird.

Oben im Eltern-Bereich steht die **Version** (z. B. „Version 1.16.1 vom 02.11.2026“). So lässt sich prüfen, ob das Notebook nach `git pull` den neuen Stand zeigt.

**Updates:** `git pull` und die Kasse neu starten. Die Kasse speichert sich für den Offline-Betrieb zwischen und zeigt beim Start zuerst kurz die alte Version. Sobald die neue geladen ist, wechselt sie automatisch: sofort, solange der Startbildschirm zu sehen ist, sonst nach dem nächsten Bezahlen, damit nie mitten im Spiel neu geladen wird.

## Frag das Schaf (Fragen per Sprache)

Eltern-Bereich → **Frag das Schaf** einschalten. Dann gibt es neben „Scannen!“ den Knopf **„Frag das Schaf!“**: antippen und sprechen. Das Schaf hört zu, bis das Kind eine kurze Pause macht, und antwortet laut und in einer Sprechblase.

| Das Kind sagt | Das Schaf |
| --- | --- |
| „Was kostet die Banane?“ | „Die Banane kostet 30 Cent. Soll ich sie in den Korb legen?“ + Knopf „Ja, in den Korb“ |
| „Ich möchte ein Eis“ | legt das Eis in den Korb: „Das Eis ist im Korb!“ |
| „Wie viel muss ich bezahlen?“ | nennt Anzahl und Summe im Korb |
| „Was gibt es bei Obst?“ | zählt Produkte auf und zeigt Bilder |
| „Was ist gesund?“, „Welches Obst ist gelb?“, „Ich habe Durst“, „Ist die Banane gesund?“ | antwortet aus festem Wissen über das Sortiment (gesund, Frühstück, Durst, Naschen, Party, Farben …) |
| etwas Unklares („Ki…“) | „Meinst du eins von diesen?“ mit Bildern zum Antippen |

- **Undeutliche Aussprache:** Das Schaf vergleicht nach Klang und erkennt auch verschluckte Silben („Nane“ → Banane, „Tokolade“ → Schokolade) sowie andere Wörter (Möhre, Semmel, Schoki …). Im Eltern-Bereich lassen sich eigene Aussprachen des Kindes hinterlegen. Unter „Zuletzt gefragt“ steht, was das Schaf verstanden hat; tippt das Kind nach einer unklaren Frage ein Bild an, lässt sich das mit einem Tipp als Aussprache merken.
- **Datenschutz:** Die Spracherkennung (Whisper) läuft komplett auf dem Gerät. Aufnahmen verlassen das Gerät nicht und werden nicht gespeichert.
- **Erstes Laden:** Das Erkennungsmodell wird einmal aus dem Internet geladen („Sehr genau“ ca. 250 MB, „Genau“ ca. 80 MB, „Schnell“ ca. 40 MB) und danach im Browser behalten; am besten im Eltern-Bereich vorab „Jetzt laden“ tippen. Danach geht es offline.
- **Vorlesen:** Browser: deutsche Stimme des Systems (Windows hat sie dabei; Linux: `sudo apt install speech-dispatcher espeak-ng`, danach Browser neu starten). Android-App: Androids Sprachausgabe. Ohne Stimme antwortet das Schaf nur in der Sprechblase.
- **Tempo:** Auf dem alten Notebook dauert das Erkennen 1–3 Sekunden; auf sehr langsamen Geräten „Schnell“ wählen.
- **Stufe 2, freie Fragen mit KI (optional):** Im Eltern-Bereich unter „Frag das Schaf“ zuschaltbar. Offene Fragen wie „Was ist gesund?“, „Was passt zum Frühstück?“ oder „Welches Obst ist gelb?“ beantwortet dann ein kleines Sprachmodell von Liquid AI, ebenfalls nur auf dem Gerät. Beide Modelle brauchen WebGPU, also eine Grafikkarte, die der Browser nutzen kann (ohne sie dauerte eine Antwort im Test 40–180 Sekunden): „Klein“ (LFM2.5, 350 Mio. Parameter, ca. 300 MB) für einfache Grafikkarten, „Groß“ (LFM3, 1,7 Mrd. Parameter, ca. 1,2 GB) für bessere Antworten. Das Modell bekommt nur das Sortiment und den Korb. Seine Antwort wird geprüft: Sätze mit Zahlen oder Preisen fliegen raus, genannte Produkte erscheinen als Bilder zum Antippen (mit dem echten Preis der Kasse). Einfache Fragen beantwortet weiter Stufe 1. Lizenz der Modelle: LFM Open License v1.0, privat frei nutzbar.
- **Prototyp LFM3-Omni (optional, nur mit Grafikkarte):** Im Eltern-Bereich unter „Frag das Schaf“ → „LFM3-Omni verwenden“. Dann macht ein Modell (LFM3-Omni-2B von Liquid AI, ca. 2,6 GB) alles: Es hört zu, liest mit natürlicher Stimme vor, beantwortet freie Fragen (kein eigenes Stufe-2-Modell nötig) und erkennt beim Scannen mit „🐑 Was ist das?“ Produkte ohne Strichcode. Was das Schaf über Preise und den Korb sagt, bestimmt weiter die Kasse. Gedacht für aktuelle Handys/PCs mit Chrome (WebGPU) und 8 GB Arbeitsspeicher; scheitert es, übernehmen Whisper und die Systemstimme. Umsetzung: `src/lib/sprache/lfm3audio.js` (portiert aus Liquids Referenz `onnx-export`), Test mit dem echten Modell: `.github/workflows/lfm3-audio.yml` (Zuhören, Sprechen, freie Fragen, Produktbilder); dort unter „Artifacts“ auch Hörproben.
- **Tests:** `tests/unit/sprache.test.js`, `tests/unit/ki.test.js`, `tests/unit/lfm3audio.test.js` (Verstehen, Antworten, keine Fehlzuordnung von Alltagswörtern), Abschnitt `schaf` in `npm run test:e2e` (Mikrofon, Ablauf, Eltern-Bereich, Handy) und `.github/workflows/sprache.yml` mit echter Spracherkennung, gesprochenen Testsätzen und dem echten kleinen Sprachmodell (`tests/e2e/ki-echt.mjs`).

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
npm run test:mutation   # Mutationstests der Unit-Tests mit Stryker (Bericht: reports/mutation/index.html)
(cd launcher && go test ./... && go run github.com/go-gremlins/gremlins/cmd/gremlins@v0.5.0 unleash .)
```

Mutationstests bauen absichtlich kleine Fehler in den Code ein (z. B. `<` statt `<=`) und prüfen, ob die Tests sie bemerken. Stryker arbeitet inkrementell: Nach dem ersten Lauf (ca. 45 Minuten) werden nur geänderte Stellen neu geprüft. Die Unit-Tests laufen in Node mit einer IndexedDB-Attrappe und übersetzen die Svelte-Dateien selbst (`tests/unit/hilfen/`).

Die Browser-Tests brauchen `ffmpeg` und Python 3, einmalig außerdem `npx playwright install chromium`. Kameras werden mit erzeugten Videos simuliert (sauberes Etikett, unbekannter Code, klein, unscharf), Open Food Facts mit festen Antworten. Testbilder und Ergebnisse landen in `tests/e2e/.fixtures/` und `tests/e2e/.output/`.

| Datei | Inhalt |
| --- | --- |
| `tests/unit/` | EAN-Prüfziffern, Katalog und Aktionen, Geldformat, Warenkorb und Produktsuche, Kartenzahlung, Abfragen bei Open Food Facts, Wikidata, Google Books und Open Library, ISSN und ISBN aus dem Strichcode, Spracherkennung (Kölner Phonetik, Ähnlichkeit, Absichten), Antworten des Schafs |
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

## Neue Version veröffentlichen

Version in `package.json` erhöhen (z. B. `npm version 1.12.0 --no-git-tag-version`), committen und nach `main` pushen. Gibt es zu dieser Version noch kein Release, baut GitHub APK, Windows-exe, Linux-Datei und Web-Version und legt das Release samt Tag `v1.12.0` an (`.github/workflows/release.yml`).
