<script>
  import { settings } from "../lib/settings.svelte.js";
  import { music, mmss, canPickFolder } from "../lib/music.svelte.js";
  import { scanned } from "../lib/shop.svelte.js";
  import { scanLog } from "../lib/scanlog.svelte.js";
  import { aktionen } from "../lib/aktionen.js";
  import { isNativeApp, Kiosk } from "../lib/platform.js";
  import { isValidIban, normalizeIban, formatIban, giroPayload, MAX_NAME, MAX_TEXT, DEFAULT_TEXT } from "../lib/girocode.js";
  import { categoryById } from "../lib/catalog.js";
  import { db } from "../lib/db.js";
  import { nfcInfo } from "../lib/nfc.js";
  import { glutenRelevant, GLUTEN_GRUND } from "../lib/gluten.js";
  import { lookupOpenFacts } from "../lib/off.js";
  import { euro } from "../lib/money.js";
  import Sheep from "./Sheep.svelte";
  import Toggle from "./Toggle.svelte";
  import QrCode from "./QrCode.svelte";
  import LabelSheet from "./LabelSheet.svelte";
  import ProductImage from "./ProductImage.svelte";
  import { schaf, MODELLE, KI_MODELLE, gpuInfo, omniCrashed } from "../lib/sprache/schaf.svelte.js";
  import { speak, speechStatus } from "../lib/sprache/sprechen.js";

  let { onClose, initialTab = "bezahlen" } = $props();

  const TABS = [
    ["bezahlen", "Bezahlen"],
    ["musik", "Musik"],
    ["schaf", "Frag das Schaf"],
    ["aktionen", "Aktionen"],
    ["etiketten", "Etiketten drucken"],
    ["gescannt", "Gescannte Produkte"],
    ["bons", "Kassenbons"],
    ["protokoll", "Scan-Protokoll"],
    // nur in der Android-App
    ...(isNativeApp ? [["tablet", "Tablet"]] : []),
  ];
  let tab = $state(initialTab);

  // --- Bezahlen
  let paypalName = $state(settings.value.paypalName);
  let nameOk = $derived(/^[A-Za-z0-9]{1,20}$/.test(paypalName));
  function savePaypalName() {
    paypalName = paypalName.trim().replace(/^.*paypal\.me\//i, "").replace(/\/.*$/, "");
    settings.set({ paypalName });
  }

  // --- GiroCode
  let giroName = $state(settings.value.giroName);
  let giroIban = $state(formatIban(settings.value.giroIban));
  let giroText = $state(settings.value.giroText);
  let ibanOk = $derived(isValidIban(giroIban));
  function saveGiro() {
    giroName = giroName.trim().slice(0, MAX_NAME);
    giroText = giroText.trim().slice(0, MAX_TEXT) || DEFAULT_TEXT;
    if (ibanOk) giroIban = formatIban(giroIban);
    settings.set({ giroName, giroIban: normalizeIban(giroIban), giroText });
  }
  const onEnter = (e) => e.key === "Enter" && e.currentTarget.blur();

  // --- Frag das Schaf
  let loadingModel = $state(false);
  let modelError = $state("");
  async function preloadModel() {
    loadingModel = true;
    modelError = "";
    try {
      await schaf.loadModel();
    } catch (err) {
      modelError = "Laden hat nicht geklappt. Ist das Gerät online? " + (err?.message ?? "");
    } finally {
      loadingModel = false;
    }
  }
  function setModel(id) {
    settings.set({ fragModell: id });
    schaf.resetModel();
  }
  let voice = $state(null);
  $effect(() => {
    if (tab === "schaf" && !voice) speechStatus().then((v) => (voice = v));
  });

  // LFM3-Audio (Prototyp)
  let audioTesting = $state(false);
  let audioTestError = $state("");
  async function testAudioVoice() {
    audioTesting = true;
    audioTestError = "";
    try {
      await schaf.sayWithAudioModel("Hallo! Ich bin das Schaf von Schafland. Was möchtest du kaufen?");
    } catch (err) {
      audioTestError = /memory|Speicher|neu gestartet/i.test(err?.message ?? "") ? "Der Speicher der Grafik-Rechnung ist übergelaufen. Das Modell startet neu (dauert etwas), danach nochmal versuchen." : "Vorlesen ging nicht: " + (err?.message ?? err);
    } finally {
      audioTesting = false;
    }
  }

  // Stufe 2
  let gpu = $state(null);
  $effect(() => {
    if (tab === "schaf" && !gpu) gpuInfo().then((g) => (gpu = g));
  });
  function setKiModel(id) {
    settings.set({ kiModell: id });
    schaf.resetKi();
  }
  let kiQuestion = $state("Was ist gesund?");
  let kiAnswer = $state("");
  let kiAsking = $state(false);
  async function tryKi() {
    kiAsking = true;
    kiAnswer = "";
    try {
      await schaf.loadKi();
      if (schaf.ki !== "bereit") return;
      const r = await schaf.askKi(kiQuestion, (raw) => (kiAnswer = raw));
      kiAnswer = r ? r.text + (r.products.length ? `  (Bilder: ${r.products.map((p) => p.name.replace(/\u00ad/g, "")).join(", ")})` : "") : "(keine brauchbare Antwort – das Schaf würde einfach antworten)";
    } catch (err) {
      kiAnswer = "Fehler: " + (err?.message ?? err);
    } finally {
      kiAsking = false;
    }
  }

  let tryText = $state("Was kostet die Banane?");
  let tryReply = $derived(tryText.trim() ? schaf.preview(tryText).reply.say : "");
  let aliasHeard = $state("");
  let aliasProduct = $state("");
  let pool = $derived(schaf.pool);
  const productName = (id) => pool.find((p) => p.id === id)?.name.replace(/\u00ad/g, "") ?? "?";
  function addAlias(heard = aliasHeard, productId = aliasProduct) {
    heard = heard.trim().toLowerCase();
    if (!heard || !productId) return;
    schaf.addAlias(heard, productId);
    aliasHeard = "";
  }

  // --- Tablet (Android-App)
  let pinned = $state(false);
  let pinError = $state("");
  $effect(() => {
    if (tab === "tablet") Kiosk.isPinned().then((r) => (pinned = r.pinned)).catch(() => {});
  });
  async function setPinned(on) {
    pinError = "";
    try {
      await (on ? Kiosk.pin() : Kiosk.unpin());
      pinned = on;
    } catch (err) {
      pinError = err?.message ?? String(err);
      pinned = !on;
    }
  }
  async function exitApp() {
    const { App } = await import("@capacitor/app");
    await Kiosk.unpin().catch(() => {});
    App.exitApp();
  }

  // --- Musik
  let folderError = $state("");
  async function pick() {
    folderError = "";
    try {
      await music.pickFolder();
      if (settings.value.musicAutoplay && music.tracks.length) music.play();
    } catch (err) {
      if (err?.name !== "AbortError") folderError = "Der Ordner ließ sich nicht öffnen.";
    }
  }
  function seek(e) {
    const r = e.currentTarget.getBoundingClientRect();
    music.seek(((e.clientX - r.left) / r.width) * music.duration);
  }

  // --- Gescannt
  const priceText = (cents) => (cents / 100).toFixed(2).replace(".", ",");
  function setPrice(p, input) {
    const cents = Math.round(parseFloat(input.value.trim().replace(",", ".")) * 100);
    if (Number.isFinite(cents) && cents >= 0 && cents <= 99999) {
      scanned.update(p.id, { priceCents: cents });
      input.value = priceText(cents);
    } else {
      input.value = priceText(p.priceCents);
    }
  }

  function setName(p, input) {
    const name = input.value.trim().slice(0, 60);
    if (name) scanned.update(p.id, { name });
    else input.value = p.name;
  }

  // --- Kassenbons
  let receipts = $state([]);
  $effect(() => {
    if (tab === "bons") db.receipts.orderBy("createdAt").reverse().limit(30).toArray().then((r) => (receipts = r));
  });
  const when = (t) => new Date(t).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  // --- Gluten bei älteren Scans nachladen: noch nie oder nur nach den alten Regeln (ohne Zutaten)
  // ausgewertet; dann fehlt die Herkunft der Angabe. Von Hand Eingetragenes bleibt.
  const glutenOffen = $derived(scanned.list.filter((p) => /facts\.org$/.test(p.source ?? "") && p.glutenGrund === undefined));
  let glutenStatus = $state("");
  async function glutenNachladen() {
    const offen = [...glutenOffen];
    let ok = 0;
    let fehler = 0;
    for (const [i, p] of offen.entries()) {
      glutenStatus = `Lade ${i + 1} von ${offen.length} …`;
      try {
        const found = await lookupOpenFacts(p.ean);
        await scanned.update(p.id, { gluten: found?.gluten ?? null, glutenGrund: found?.glutenGrund ?? null });
        ok++;
      } catch {
        fehler++;
      }
    }
    glutenStatus = fehler ? `${ok} aktualisiert, ${fehler} nicht erreichbar (später nochmal versuchen).` : `${ok} aktualisiert.`;
  }

  const PAY = { "spiel-qr": "Schaf-Code", paypal: "PayPal", girocode: "Überweisung (GiroCode)", karte: "Karte (NFC)" };

  // --- Kartenzahlung (NFC)
  let nfcStatus = $state(null);
  $effect(() => {
    if (tab === "bezahlen") nfcInfo().then((i) => (nfcStatus = i));
  });

  // Zeiten von LFM3-Omni (Eltern-Bereich), nur was schon gemessen wurde
  const omniZeiten = $derived(
    [["warm", "Aufwärmen"], ["asr", "Erkennen"], ["tts", "Vorlesen"], ["bild", "Bild"]]
      .filter(([k]) => schaf.audioLastMs[k])
      .map(([k, name]) => `${name} ${(schaf.audioLastMs[k] / 1000).toFixed(1)} s`)
      .concat(schaf.kiViaAudio && schaf.kiLastMs ? [`Antwort ${(schaf.kiLastMs / 1000).toFixed(1)} s`] : [])
      .join(", "),
  );
</script>

<div class="settings">
  <header class="noprint">
    <Sheep size="3rem" />
    <div><b>Schafland</b><small>Eltern-Bereich · Version {__APP_VERSION__}</small></div>
    <span class="spacer"></span>
    <button class="big-btn light" onclick={onClose}>Zurück zum Laden</button>
  </header>

  <div class="body">
    <nav class="noprint">
      {#each TABS as [id, name] (id)}
        <button class:on={tab === id} onclick={() => (tab = id)}>{name}</button>
      {/each}
    </nav>

    <div class="pane">
      {#if tab === "bezahlen"}
        <h2>Bezahlen</h2>
        <div class="field">
          <label for="pp-on">PayPal-Code anbieten</label>
          <div class="row">
            <Toggle id="pp-on" label="PayPal-Code anbieten" checked={settings.value.paypalEnabled} onchange={(v) => settings.set({ paypalEnabled: v })} />
            <span class="muted">Zusätzlich zum Spiel-QR erscheint „PayPal“ beim Bezahlen.</span>
          </div>
        </div>
        <div class="field">
          <label for="pp-name">PayPal.me-Name</label>
          <div class="stack">
            <div class="prefix"><span>paypal.me/</span><input id="pp-name" bind:value={paypalName} onblur={savePaypalName} onkeydown={(e) => e.key === "Enter" && savePaypalName()} placeholder="deinName" autocomplete="off" spellcheck="false" /></div>
            {#if paypalName && !nameOk}<span class="err">Nur Buchstaben und Ziffern, höchstens 20 Zeichen.</span>{/if}
          </div>
        </div>
        <p class="muted">
          Den Namen findest du in PayPal unter „PayPal.Me“. Der Code öffnet PayPal mit Empfänger und Betrag. Ob „Freunde und Familie“ gewählt wird, entscheidet die zahlende Person. Das lässt sich über den Link nicht festlegen.
        </p>
        {#if settings.paypalReady}
          <div class="test">
            <QrCode text={`https://paypal.me/${settings.value.paypalName}/1.00EUR`} size="10rem" />
            <div><b>Test-Code über 1,00 €</b><code>https://paypal.me/{settings.value.paypalName}/1.00EUR</code><span class="muted">Mit dem Handy scannen und prüfen, ob der richtige Empfänger erscheint. Dann abbrechen.</span></div>
          </div>
        {/if}

        <h2 class="sub">Kartenzahlung (NFC)</h2>
        <div class="field">
          <label for="nfc-on">Karte zum Bezahlen</label>
          <div class="row">
            <Toggle id="nfc-on" label="Karte zum Bezahlen" checked={settings.value.nfcKarte} onchange={(v) => settings.set({ nfcKarte: v })} />
            <span class="muted">
              Beim Bezahlen erscheint ein Kartenterminal: Jede NFC-Karte oder jeder NFC-Aufkleber, der ans Gerät oder auf den Kartenleser gehalten (oder in den Kartenschlitz gesteckt) wird, „bezahlt“. Es wird nichts abgebucht und nichts von der Karte gespeichert.
              {#if nfcStatus === null}Prüfe NFC …{:else if nfcStatus.pc}<b>✓ Kartenleser bereit: {nfcStatus.leser.join(", ")}.</b> Karte auflegen oder einstecken.{:else if !nfcStatus.available}<b>Dieses Gerät kann kein NFC lesen</b> (geht in der Android-App, in Chrome auf Android-Handys mit NFC und am PC im Schafland-Starter mit einem USB-Chipkartenleser).{#if nfcStatus.hinweis} {nfcStatus.hinweis}{/if}{:else if !nfcStatus.enabled}<b>NFC ist am Gerät ausgeschaltet.</b>{:else}<b>✓ NFC bereit.</b>{/if}
            </span>
          </div>
        </div>

        <h2 class="sub">Überweisung (GiroCode)</h2>
        <div class="field">
          <label for="giro-on">GiroCode anbieten</label>
          <div class="row">
            <Toggle id="giro-on" label="GiroCode anbieten" checked={settings.value.giroEnabled} onchange={(v) => settings.set({ giroEnabled: v })} />
            <span class="muted">Beim Bezahlen erscheint „Überweisung“: ein QR-Code für Banking-Apps.</span>
          </div>
        </div>
        <div class="field">
          <label for="giro-name">Empfänger</label>
          <input id="giro-name" class="text" bind:value={giroName} onblur={saveGiro} onkeydown={onEnter} maxlength={MAX_NAME} placeholder="Vorname Nachname" autocomplete="off" />
        </div>
        <div class="field">
          <label for="giro-iban">IBAN</label>
          <div class="stack">
            <input id="giro-iban" class="text mono" bind:value={giroIban} onblur={saveGiro} onkeydown={onEnter} placeholder="DE00 0000 0000 0000 0000 00" autocomplete="off" spellcheck="false" />
            {#if giroIban && !ibanOk}<span class="err">Diese IBAN stimmt nicht. Bitte Ziffern prüfen.</span>{/if}
          </div>
        </div>
        <div class="field">
          <label for="giro-text">Verwendungszweck</label>
          <input id="giro-text" class="text" bind:value={giroText} onblur={saveGiro} onkeydown={onEnter} maxlength={MAX_TEXT} autocomplete="off" />
        </div>
        <p class="muted">
          Der GiroCode füllt in der Banking-App eine SEPA-Überweisung aus („Foto-Überweisung“). Geld fließt erst, wenn die zahlende Person sie in ihrer App bestätigt. Die IBAN bleibt nur auf diesem Notebook gespeichert.
        </p>
        {#if settings.giroReady}
          <div class="test">
            <QrCode text={giroPayload({ name: settings.value.giroName, iban: settings.value.giroIban, cents: 100, text: settings.value.giroText })} size="10rem" ecLevel="M" badge={false} />
            <div><b>Test-Code über 1,00 €</b><code>{settings.value.giroName} · {formatIban(settings.value.giroIban)}</code><span class="muted">Mit der Banking-App scannen und prüfen, ob Empfänger und IBAN stimmen. Dann abbrechen.</span></div>
          </div>
        {/if}

      {:else if tab === "musik"}
        <h2>Musik</h2>
        <div class="field">
          <span class="lbl">{canPickFolder ? "Musik-Ordner" : "Lieder"}</span>
          <div class="stack">
            <div class="row">
              {#if canPickFolder}
                <span class="path">{music.folderName || "Noch kein Ordner gewählt"}</span>
                <button class="big-btn light small" onclick={pick}>Ordner wählen …</button>
              {:else}
                <span class="path">{music.tracks.length ? `${music.tracks.length} Lieder · ${music.songsMB.toFixed(1)} MB` : "Noch keine Lieder"}</span>
                <label class="big-btn light small">Lieder hinzufügen …<input id="music-files" type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" multiple hidden onchange={async (e) => { const input = e.currentTarget; await music.importFiles(input.files); input.value = ""; }} /></label>
              {/if}
            </div>
            {#if music.needsPermission}
              <button class="big-btn small" onclick={() => music.regainPermission()}>Zugriff auf „{music.folderName}“ erlauben</button>
            {/if}
            {#if !canPickFolder}<span class="muted">Lieder auswählen (auch mehrere auf einmal). Sie werden in der App gespeichert und sind nach jedem Start da.</span>{/if}
            {#if folderError || music.error}<span class="err">{folderError || music.error}</span>{/if}
          </div>
        </div>
        <div class="field">
          <label for="vol">Lautstärke</label>
          <div class="row"><input id="vol" type="range" min="0" max="1" step="0.05" value={settings.value.musicVolume} oninput={(e) => { settings.set({ musicVolume: +e.currentTarget.value }); music.applyVolume(); }} /><span class="muted">{Math.round(settings.value.musicVolume * 100)} %</span></div>
        </div>
        <div class="field">
          <label for="shuf">Zufällige Reihenfolge</label>
          <Toggle id="shuf" label="Zufällige Reihenfolge" checked={settings.value.musicShuffle} onchange={(v) => { settings.set({ musicShuffle: v }); music.reshuffle(); }} />
        </div>
        <div class="field">
          <label for="auto">Beim Öffnen abspielen</label>
          <Toggle id="auto" label="Beim Öffnen abspielen" checked={settings.value.musicAutoplay} onchange={(v) => settings.set({ musicAutoplay: v })} />
        </div>

        {#if music.tracks.length}
          <div class="player">
            <div class="ctl">
              <button onclick={() => music.prev()} aria-label="Vorheriges Lied"><span class="emoji">⏮️</span></button>
              <button class="main" onclick={() => music.toggle()} aria-label="Abspielen oder Pause"><span class="emoji">{music.playing ? "⏸️" : "▶️"}</span></button>
              <button onclick={() => music.next()} aria-label="Nächstes Lied"><span class="emoji">⏭️</span></button>
            </div>
            <div class="now">
              <b>{music.current?.title ?? "Bereit"}</b>
              <small>{music.tracks.length} Titel</small>
              <button class="bar" onclick={seek} aria-label="Springen"><i style:width={`${music.duration ? (music.time / music.duration) * 100 : 0}%`}></i></button>
            </div>
            <small class="time">{mmss(music.time)} / {mmss(music.duration)}</small>
          </div>
          <div class="tracks">
            {#each music.tracks as t, i (t.songId ?? t.path)}
              <div class="track">
                <button class:on={i === music.index} onclick={() => music.play(i)}>
                  <span>{i === music.index ? "▶ " : ""}{t.title}</span><small>{t.path}</small>
                </button>
                {#if t.songId}<button class="del" onclick={() => music.removeSong(t.songId)} aria-label={`${t.title} entfernen`}>✕</button>{/if}
              </div>
            {/each}
          </div>
        {/if}

      {:else if tab === "schaf"}
        <h2>Frag das Schaf</h2>
        <p class="muted">
          Das Kind tippt auf „Frag das Schaf!“ und fragt zum Beispiel „Was kostet die Banane?“, „Ich möchte ein Eis“ oder „Was gibt es bei Obst?“.
          Das Schaf antwortet laut und in einer Sprechblase. Versteht es etwas nicht sicher, zeigt es Bilder zur Auswahl.
          Die Spracherkennung läuft komplett auf diesem Gerät: Keine Aufnahme verlässt das Gerät.
        </p>
        <div class="field">
          <label for="schaf-on">Frag das Schaf</label>
          <div class="row">
            <Toggle id="schaf-on" label="Frag das Schaf" checked={settings.value.fragSchaf} onchange={(v) => settings.set({ fragSchaf: v })} />
            <span class="muted">Zeigt den Knopf „Frag das Schaf!“ neben „Scannen!“. Beim ersten Fragen fragt das Gerät nach dem Mikrofon.</span>
          </div>
        </div>
        <div class="field">
          <span class="lbl">Spracherkennung</span>
          <div class="choice-row">
            {#each Object.entries(MODELLE) as [id, m] (id)}
              <label class="opt" class:on={settings.value.fragModell === id}>
                <input type="radio" name="modell" checked={settings.value.fragModell === id} onchange={() => setModel(id)} />
                <b>{m.name}</b><small>ca. {m.mb} MB, {m.info}</small>
              </label>
            {/each}
          </div>
          <div class="row">
            {#if schaf.modelReady}
              <span class="ok">✓ Geladen, funktioniert jetzt auch offline</span>
            {:else}
              <button class="big-btn light small" disabled={loadingModel} onclick={preloadModel}>
                {loadingModel ? `Lädt … ${Math.round(schaf.progress * 100)} %` : "Jetzt laden"}
              </button>
              <span class="muted">Einmal mit Internet laden, dann muss das Kind beim ersten Fragen nicht warten.</span>
            {/if}
          </div>
          {#if modelError}<p class="err">{modelError}</p>{/if}
          {#if schaf.lastMs}<small class="muted">Letzte Erkennung: {(schaf.lastMs / 1000).toFixed(1)} s</small>{/if}
        </div>
        <div class="field">
          <span class="lbl">Stimme</span>
          <div class="row">
            {#if voice === null}
              <span class="muted">Prüfe Stimme …</span>
            {:else if voice.ok}
              <button class="big-btn light small" onclick={() => speak("Hallo! Ich bin das Schaf von Schafland. Was möchtest du kaufen?")}>🔊 Probe hören</button>
              <span class="muted">{voice.name}</span>
            {:else if isNativeApp}
              <span class="err">Keine deutsche Stimme gefunden{voice.name ? ` (${voice.name})` : ""}. Das Schaf antwortet dann nur in der Sprechblase. Android: Einstellungen → System → Sprache → Sprachausgabe, dort z. B. „Sprachausgabe von Google“ mit Deutsch installieren.</span>
            {:else}
              <span class="err">Keine deutsche Stimme gefunden. Das Schaf antwortet dann nur in der Sprechblase. Linux: <code>sudo apt install speech-dispatcher espeak-ng</code>, danach den Browser neu starten.</span>
            {/if}
          </div>
        </div>
        <div class="field">
          <label for="schaf-try">Ausprobieren (tippen statt sprechen)</label>
          <div class="stack">
            <input id="schaf-try" bind:value={tryText} />
            {#if tryReply}<p class="answer">🐑 {tryReply}</p>{/if}
          </div>
        </div>

        <h3>Prototyp: LFM3-Omni (ein Modell zum Zuhören, Sprechen, Antworten und Sehen)</h3>
        <p class="muted">
          LFM3-Omni von Liquid AI hört zu und liest mit natürlicher Stimme vor, beantwortet freie Fragen und erkennt beim Scannen mit „🐑 Was ist das?“ Produkte ohne Strichcode.
          Was das Schaf über Preise und den Korb sagt, bestimmt weiter die Kasse. Läuft nur mit Grafikkarte im Browser (WebGPU), z. B. auf aktuellen Handys mit Chrome.
          Download ca. 2,6 GB; im Arbeitsspeicher zunächst ca. 1,9 GB (Sprachausgabe und Bilderkennung kommen erst bei Bedarf dazu). Empfohlen 8 GB Arbeitsspeicher.
          Klappt etwas nicht, übernimmt automatisch der bisherige Weg.
        </p>
        <div class="field">
          <label for="audio-on">LFM3-Omni verwenden</label>
          <div class="row">
            {#if gpu && !gpu.webgpu && !settings.value.audioModell}
              <span class="muted">Geht auf diesem Gerät nicht: keine Grafikkarte im Browser (WebGPU).</span>
            {:else}
              <Toggle id="audio-on" label="LFM3-Omni verwenden" checked={settings.value.audioModell} onchange={(v) => { settings.set({ audioModell: v }); if (!v) schaf.resetAudioModel(); }} />
              <span class="muted">Prototyp</span>
            {/if}
          </div>
        </div>
        {#if settings.value.audioModell}
          <div class="field">
            <span class="lbl">Modell</span>
            <div class="stack">
              <div class="row">
                {#if schaf.audio === "bereit"}
                  <span class="ok">✓ Geladen</span>
                  <button class="big-btn light small" disabled={audioTesting} onclick={testAudioVoice}>🔊 Stimme hören</button>
                {:else}
                  <button class="big-btn light small" disabled={schaf.audio === "lädt"} onclick={() => schaf.loadAudioModel()}>
                    {schaf.audio === "lädt" ? `Lädt … ${Math.round(schaf.audioProgress * 100)} %` : "Jetzt laden (ca. 2,6 GB)"}
                  </button>
                  <span class="muted">{schaf.audioStatus || "Am besten im WLAN und mit Ladekabel."}</span>
                {/if}
              </div>
              {#if schaf.audio === "fehler"}<p class="err">{schaf.audioError}</p>{/if}
              {#if schaf.audio !== "bereit" && schaf.audio !== "lädt" && omniCrashed()}
                <p class="err">
                  Beim letzten Laden ist der Browser abgestürzt, vermutlich war der Arbeitsspeicher zu knapp. Deshalb lädt die App LFM3-Omni nicht mehr von selbst.
                  Tipp: andere Apps und Browser-Tabs schließen, dann hier „Jetzt laden“ tippen. Klappt es wieder nicht, LFM3-Omni ausschalten.
                </p>
              {/if}
              {#if schaf.audioRestarts}<small class="muted">Nach einem Speicherüberlauf neu gestartet ({schaf.audioRestarts}×).</small>{/if}
              <div class="row">
                <Toggle id="omni-stimme" label="Natürliche Stimme" checked={settings.value.omniStimme} onchange={(v) => settings.set({ omniStimme: v })} />
                <span class="muted">Natürliche Stimme von LFM3-Omni zum Vorlesen. Klingt schöner, braucht aber pro Satz etliche Sekunden. Aus: die schnelle Stimme des Systems.</span>
              </div>
              {#if audioTestError}<p class="err">{audioTestError}</p>{/if}
              {#if omniZeiten}<small class="muted omni-zeiten">Zuletzt: {omniZeiten}</small>{/if}
            </div>
          </div>
        {/if}

        <h3>Stufe 2: Freie Fragen mit KI</h3>
        <p class="muted">
          Für Fragen wie „Was ist gesund?“, „Was passt zum Frühstück?“ oder „Welches Obst ist gelb?“ nutzt das Schaf ein kleines Sprachmodell (LFM von Liquid AI), das ebenfalls nur auf diesem Gerät läuft.
          Es darf nur Produkte aus dem Laden empfehlen und nennt keine Preise; die empfohlenen Produkte erscheinen als Bilder zum Antippen.
          Einfache Fragen (Preis, „Ich möchte …“, Summe) beantwortet weiter die schnelle Stufe 1.
        </p>
        <div class="field">
          <label for="ki-on">Freie Fragen mit KI</label>
          <div class="row">
            {#if gpu && !gpu.webgpu && !gpu.cpuErlaubt && !settings.value.kiAn}
              <span class="muted">Geht auf diesem Gerät nicht: Es braucht eine Grafikkarte im Browser (WebGPU). Ohne sie würde eine Antwort ein bis drei Minuten dauern. Die festen Antworten (gesund, Farben, Frühstück …) gibt es trotzdem.</span>
            {:else}
              <Toggle id="ki-on" label="Freie Fragen mit KI" checked={settings.value.kiAn} onchange={(v) => { settings.set({ kiAn: v }); if (!v) schaf.resetKi(); }} />
              <span class="muted">
                {#if gpu === null}Prüfe Grafikkarte …{:else if gpu.webgpu}Grafikkarte (WebGPU) gefunden: Antworten in wenigen Sekunden.{:else if gpu.cpuErlaubt}Testbetrieb auf dem Prozessor (sehr langsam).{:else}Keine Grafikkarte (WebGPU) gefunden: ausschalten, Stufe 1 antwortet.{/if}
              </span>
            {/if}
          </div>
        </div>
        {#if settings.value.kiAn && settings.value.audioModell}
          <p class="muted">Mit eingeschaltetem LFM3-Omni beantwortet dieses Modell auch die freien Fragen. Ein eigenes Sprachmodell wird dann nicht geladen.</p>
        {/if}
        {#if settings.value.kiAn && !settings.value.audioModell}
          <div class="field">
            <span class="lbl">Sprachmodell</span>
            <div class="choice-row">
              {#each Object.entries(KI_MODELLE) as [id, m] (id)}
                <label class="opt" class:on={settings.value.kiModell === id}>
                  <input type="radio" name="kimodell" checked={settings.value.kiModell === id} onchange={() => setKiModel(id)} />
                  <b>{m.name}</b><small>ca. {m.mb >= 1000 ? `${(m.mb / 1000).toFixed(1).replace(".", ",")} GB` : `${m.mb} MB`}. {m.info}</small>
                </label>
              {/each}
            </div>
            <div class="row">
              {#if schaf.ki === "bereit"}
                <span class="ok">✓ Geladen ({schaf.kiDevice === "webgpu" ? "Grafikkarte" : schaf.kiDevice === "wasm" ? "Prozessor" : schaf.kiDevice})</span>
              {:else}
                <button class="big-btn light small" disabled={schaf.ki === "lädt"} onclick={() => schaf.loadKi()}>
                  {schaf.ki === "lädt" ? `Lädt … ${Math.round(schaf.kiProgress * 100)} %` : "Jetzt laden"}
                </button>
                <span class="muted">Großer Download; am besten im WLAN. Danach offline nutzbar.</span>
              {/if}
            </div>
            {#if schaf.ki === "fehler"}<p class="err">{schaf.kiError}</p>{/if}
          </div>
          <div class="field">
            <label for="ki-try">KI ausprobieren</label>
            <div class="stack">
              <div class="row">
                <input id="ki-try" bind:value={kiQuestion} onkeydown={(e) => e.key === "Enter" && tryKi()} />
                <button class="big-btn light small" disabled={kiAsking || !kiQuestion.trim()} onclick={tryKi}>{kiAsking ? "…" : "Fragen"}</button>
              </div>
              {#if kiAnswer}<p class="answer ki-answer">🐑 {kiAnswer}</p>{/if}
              {#if schaf.kiLastMs}<small class="muted">Letzte Antwort: {(schaf.kiLastMs / 1000).toFixed(1)} s</small>{/if}
            </div>
          </div>
          <p class="muted">Lizenz: LFM Open License v1.0 (für private Nutzung frei). Kinder sollten die KI-Antworten nicht allein als Wissen nehmen; das Schaf ist ein Spielkamerad.</p>
        {/if}

        <h3>Aussprache des Kindes</h3>
        <p class="muted">Wenn das Kind ein Produkt anders ausspricht, hier eintragen, z. B. „Nane“ → Banane. Das Schaf versteht ähnliche Wörter auch so schon; Einträge hier gelten sicher.</p>
        {#each settings.value.sprachAliases ?? [] as a (a.heard)}
          <div class="alias"><span>„{a.heard}“</span><span>→ {productName(a.productId)}</span><button class="del" onclick={() => schaf.removeAlias(a.heard)} aria-label="Entfernen">✕</button></div>
        {/each}
        <div class="alias-add">
          <input placeholder="Das Kind sagt …" aria-label="Das Kind sagt" bind:value={aliasHeard} />
          <select aria-label="gemeint ist" bind:value={aliasProduct}>
            <option value="">gemeint ist …</option>
            {#each pool as p (p.id)}<option value={p.id}>{p.name.replace(/\u00ad/g, "")}</option>{/each}
          </select>
          <button class="big-btn light small" disabled={!aliasHeard.trim() || !aliasProduct} onclick={() => addAlias()}>Merken</button>
        </div>

        <h3>Zuletzt gefragt</h3>
        {#each schaf.log as e, i (`${e.at}-${i}`)}
          <div class="log" class:ok={!!e.product || ["category", "total", "hello", "thanks", "ki"].includes(e.intent)}>
            <div class="loghead"><b>„{e.text || "(nichts verstanden)"}“</b><small>{when(e.at)}</small></div>
            <small>
              {#if e.intent === "gewählt"}Kind hat danach {e.product} angetippt
                {#if e.text && !(settings.value.sprachAliases ?? []).some((a) => a.heard === e.text.toLowerCase())}
                  · <button class="link" onclick={() => addAlias(e.text, e.productId)}>„{e.text}“ als {e.product} merken</button>
                {/if}
              {:else if e.intent === "ki"}KI: „{e.answer}“
              {:else if e.product}verstanden: {e.product}{:else if e.intent === "category"}Frage nach {e.category}{:else if e.intent === "total"}Frage nach der Summe{:else if e.intent === "hello" || e.intent === "thanks"}Gruß{:else}nichts Passendes gefunden{/if}
            </small>
          </div>
        {:else}
          <p class="muted">Noch nichts gefragt.</p>
        {/each}
        {#if schaf.log.length}
          <button class="big-btn light small" style:align-self="flex-start" onclick={() => schaf.clearLog()}>Liste leeren</button>
        {/if}

      {:else if tab === "aktionen"}
        <h2>Aktionen</h2>
        <p class="muted">Eine Aktion gibt der Kasse ein eigenes Aussehen und einen zusätzlichen Reiter mit Aktionsprodukten. Alles andere funktioniert wie immer. Es ist höchstens eine Aktion aktiv.</p>
        {#each aktionen as a (a.id)}
          <div class="aktion" class:on={settings.value.aktion === a.id}>
            <span class="emoji big">{a.emoji}</span>
            <div class="text">
              <b>{a.name}</b>
              <span class="muted">{a.description}</span>
              <span class="items"><span class="emoji">{a.products.map((p) => p.emoji).join(" ")}</span> · {a.products.length} Produkte</span>
            </div>
            <Toggle id={`aktion-${a.id}`} label={`Aktion ${a.name}`} checked={settings.value.aktion === a.id} onchange={(v) => settings.set({ aktion: v ? a.id : null })} />
          </div>
        {/each}
        <p class="muted">Etiketten für die Aktionsprodukte gibt es unter „Etiketten drucken“. Sie lassen sich auch scannen, wenn die Aktion aus ist.</p>

      {:else if tab === "etiketten"}
        <h2 class="noprint">Etiketten drucken</h2>
        <LabelSheet />

      {:else if tab === "gescannt"}
        <h2>Gescannte Produkte</h2>
        <p class="muted">Alles, was schon einmal gescannt wurde. Name und Preis lassen sich hier ändern, z. B. „Zeitschrift“ in „c't“. Beim nächsten Scan zeigt die Kasse den neuen Namen.</p>
        <div class="field">
          <label for="gluten-on">Gluten kennzeichnen</label>
          <div class="row">
            <Toggle id="gluten-on" label="Gluten kennzeichnen" checked={settings.value.glutenZeigen} onchange={(v) => settings.set({ glutenZeigen: v })} />
            <span class="muted">
              🌾 an Regal und Korb: enthält Gluten (blass: wahrscheinlich, gestrichelt: kann Spuren enthalten). Eigene Produkte nach typischer Rezeptur, gescannte nach Open Food Facts: Allergene, Siegel „glutenfrei“, Zutaten (Weizen, Roggen, Gerste, Dinkel, Hafer …), sonst aus der Produktart (Brot, Nudeln, Kekse) geschätzt. Hier unten lässt sich jede Angabe ändern. Bei echten Allergien zählt immer die Verpackung.
            </span>
          </div>
        </div>
        {#if glutenOffen.length}
          <div class="field">
            <span class="lbl">Ältere Scans</span>
            <div class="row">
              <button class="big-btn light small" onclick={glutenNachladen} disabled={!!glutenStatus && glutenStatus.endsWith("…")}>Gluten-Angaben nachladen ({glutenOffen.length})</button>
              {#if glutenStatus}<span class="muted">{glutenStatus}</span>{/if}
            </div>
          </div>
        {:else if glutenStatus}
          <p class="muted">{glutenStatus}</p>
        {/if}
        {#each scanned.list as p (p.id)}
          <div class="prod">
            <ProductImage product={p} size="3rem" />
            <div class="info">
              <input class="name" id={`name-${p.id}`} value={p.name} aria-label="Name" onchange={(e) => setName(p, e.currentTarget)} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <small>{p.ean} · {categoryById(p.categoryId).name} · {p.source}{p.brand ? ` · ${p.brand}` : ""}{p.gluten && GLUTEN_GRUND[p.glutenGrund] ? ` · Gluten: ${GLUTEN_GRUND[p.glutenGrund]}` : ""}</small>
            </div>
            {#if glutenRelevant(p)}
              <select class="gluten-sel" id={`gluten-${p.id}`} aria-label="Gluten" value={p.gluten ?? ""} onchange={(e) => scanned.update(p.id, { gluten: e.currentTarget.value || null, glutenGrund: "eltern" })}>
                <option value="">Gluten: ?</option>
                <option value="enthalten">🌾 enthält Gluten</option>
                <option value="wahrscheinlich">🌾 wahrscheinlich</option>
                <option value="spuren">🌾 Spuren</option>
                <option value="frei">✓ glutenfrei</option>
              </select>
            {/if}
            <label class="price">
              <input id={`price-${p.id}`} inputmode="decimal" value={priceText(p.priceCents)} onchange={(e) => setPrice(p, e.currentTarget)} /> €
            </label>
            <button class="del" onclick={() => scanned.remove(p.id)} aria-label="Entfernen">✕</button>
          </div>
        {:else}
          <p class="muted">Noch nichts gescannt.</p>
        {/each}

      {:else if tab === "tablet"}
        <h2>Tablet</h2>
        <div class="field">
          <label for="pin-on">Kasse anpinnen</label>
          <div class="row">
            <Toggle id="pin-on" label="Kasse anpinnen" checked={pinned} onchange={setPinned} />
            <span class="muted">Angepinnt kann das Kind die App nicht verlassen, auch nicht mit der Home-Taste.</span>
          </div>
        </div>
        {#if pinError}<p class="err">{pinError}</p>{/if}
        <p class="muted">
          Android fragt beim ersten Anpinnen einmal nach. Lösen: hier ausschalten, oder „Zurück“ und „Übersicht“ gleichzeitig gedrückt halten (bei Gestensteuerung: vom unteren Rand nach oben wischen und halten).
        </p>
        <div class="field">
          <span class="lbl">App beenden</span>
          <button class="big-btn light small" style:justify-self="start" onclick={exitApp}>Schafland beenden</button>
        </div>
        <p class="muted">
          Die Zurück-Taste schließt nur Fenster in der Kasse, sie beendet die App nie. Kamera: Beim Scannen schaltet „🔄 Kamera“ zwischen Vorder- und Rückkamera um; die Wahl wird gemerkt.
        </p>

      {:else if tab === "protokoll"}
        <h2>Scan-Protokoll</h2>
        <p class="muted">Die letzten {scanLog.entries.length} Scans mit den Antworten der Datenbanken. Hilft herauszufinden, warum etwas nicht erkannt wurde.</p>
        {#each scanLog.entries as e, i (`${e.at}-${e.code}-${i}`)}
          <div class="log" class:ok={e.result.startsWith("gefunden")}>
            <div class="loghead"><code>{e.code}</code><b>{e.result}</b><small>{when(e.at)}</small></div>
            <small>{e.trace.join(" · ")}</small>
          </div>
        {:else}
          <p class="muted">Noch nichts gescannt.</p>
        {/each}
        {#if scanLog.entries.length}
          <button class="big-btn light small" style:align-self="flex-start" onclick={() => scanLog.clear()}>Protokoll leeren</button>
        {/if}

      {:else if tab === "bons"}
        <h2>Kassenbons</h2>
        {#each receipts as r (r.id)}
          <div class="bon">
            <div class="bonhead"><b>{euro(r.totalCents)}</b><small>{when(r.createdAt)} · {PAY[r.payment] ?? r.payment}</small></div>
            <small>{r.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</small>
          </div>
        {:else}
          <p class="muted">Noch keine Einkäufe.</p>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .settings { height: 100%; display: flex; flex-direction: column; background: #fff; }
  header { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 1.1rem; background: var(--wool-2); }
  header b { font-family: var(--f-display); font-weight: 800; font-size: 1.7rem; line-height: 0.9; display: block; }
  header small { color: var(--ink-soft); font-family: var(--f-display); }
  .spacer { flex: 1; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 14rem 1fr; }
  .choice-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .opt { display: flex; flex-direction: column; padding: 0.6rem 0.9rem; border-radius: 0.9rem; background: #fff; border: 2px solid var(--wool-line); cursor: pointer; min-width: 12rem; }
  .opt.on { border-color: var(--grass); }
  .opt.off { opacity: 0.45; cursor: not-allowed; }
  .opt input { position: absolute; opacity: 0; pointer-events: none; }
  .ok { color: var(--grass-dark); font-weight: 800; }
  .stack { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
  .answer { background: #fff; border-radius: 0.9rem; padding: 0.6rem 0.9rem; margin: 0.3rem 0 0; font-weight: 700; }
  .alias { display: flex; gap: 0.7rem; align-items: center; background: #fff; border-radius: 0.8rem; padding: 0.4rem 0.8rem; }
  .alias span:first-child { font-weight: 800; min-width: 8rem; }
  .alias .del { margin-left: auto; }
  .alias-add { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .alias-add input, .alias-add select { flex: 1; min-width: 10rem; }
  .link { color: var(--grass-dark); font-weight: 800; text-decoration: underline; padding: 0; background: none; }
  nav { background: var(--wool-2); padding: 0.8rem 0.6rem; display: flex; flex-direction: column; gap: 0.25rem; }
  nav button { text-align: left; padding: 0.7rem 0.9rem; border-radius: 0.8rem; font-weight: 800; }
  nav button.on { background: #fff; color: var(--grass-dark); }
  .pane { overflow-y: auto; padding: 1.2rem 1.6rem 2rem; display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  h2 { margin: 0; font-family: var(--f-display); font-size: 1.8rem; }
  .field { display: grid; grid-template-columns: 13rem 1fr; gap: 1rem; align-items: center; }
  .field > label, .lbl { font-weight: 800; }
  .row { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .stack { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
  .muted { color: var(--ink-soft); font-weight: 600; margin: 0; max-width: 60ch; }
  .err { color: var(--danger); font-weight: 700; }
  h2.sub { font-size: 1.4rem; margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--wool-line); }
  input.text { border: 2px solid var(--wool-line); border-radius: 0.7rem; background: var(--wool); padding: 0.5rem 0.7rem; font-size: 1rem; width: min(26rem, 100%); }
  input.text.mono { font-family: monospace; letter-spacing: 0.03em; }
  input.text:focus { outline: none; border-color: var(--grass); }
  .prefix { display: flex; align-items: center; border: 2px solid var(--wool-line); border-radius: 0.7rem; background: var(--wool); overflow: hidden; }
  .prefix span { padding: 0.5rem 0 0.5rem 0.7rem; color: var(--ink-soft); font-family: monospace; }
  .prefix input { border: 0; background: transparent; padding: 0.5rem 0.7rem 0.5rem 0; font-family: monospace; font-size: 1rem; outline: none; width: 14rem; }
  .test { display: flex; gap: 1.2rem; align-items: center; background: var(--wool); border-radius: 1rem; padding: 0.8rem; }
  .test > div { display: flex; flex-direction: column; gap: 0.3rem; }
  .test code { font-size: 0.85rem; }
  .path { font-family: monospace; background: var(--wool); border: 2px solid var(--wool-line); padding: 0.45rem 0.7rem; border-radius: 0.7rem; }
  :global(.big-btn.small) { font-size: 1rem; padding: 0.45rem 0.9rem; border-radius: 0.8rem; }
  input[type="range"] { width: 16rem; accent-color: var(--grass); }

  .player { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; background: var(--wool-2); border-radius: 1rem; padding: 0.7rem 1rem; }
  .ctl { display: flex; gap: 0.4rem; }
  .ctl button { width: 2.8rem; height: 2.8rem; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 1.2rem; }
  .ctl button.main { background: var(--grass); }
  .now { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .now b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .now small, .time { color: var(--ink-soft); }
  .bar { height: 0.5rem; border-radius: 99px; background: var(--wool-line); position: relative; overflow: hidden; margin-top: 0.3rem; }
  .bar i { position: absolute; inset: 0 auto 0 0; background: var(--grass); border-radius: 99px; }
  .tracks { display: flex; flex-direction: column; gap: 0.1rem; }
  .track { display: flex; gap: 0.4rem; align-items: center; }
  .track > button:first-child { flex: 1; min-width: 0; }
  .tracks button { display: flex; justify-content: space-between; gap: 1rem; text-align: left; padding: 0.4rem 0.7rem; border-radius: 0.6rem; }
  .tracks button.on { background: var(--ok-bg); font-weight: 800; }
  .tracks small { color: var(--ink-soft); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .prod { display: grid; grid-template-columns: 3.4rem 1fr auto auto auto; gap: 0.8rem; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--wool-line); }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .info small { color: var(--ink-soft); font-family: monospace; }
  .info .name { font-weight: 800; border: 2px solid transparent; border-radius: 0.5rem; padding: 0.15rem 0.4rem; margin-left: -0.4rem; background: transparent; width: 100%; }
  .info .name:hover, .info .name:focus { border-color: var(--wool-line); background: var(--wool); outline: none; }
  .price input { width: 5rem; text-align: right; border: 2px solid var(--wool-line); border-radius: 0.6rem; padding: 0.3rem 0.5rem; font-weight: 800; }
  .del { width: 2.2rem; height: 2.2rem; border-radius: 50%; background: var(--wool-2); font-weight: 800; }
  .aktion { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; padding: 0.9rem 1rem; border-radius: 1rem; background: var(--wool); border: 2px solid var(--wool-line); }
  .aktion.on { border-color: var(--grass); background: #fff3e4; }
  .aktion .big { font-size: 2.6rem; }
  .aktion .text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .aktion b { font-family: var(--f-display); font-size: 1.3rem; }
  .aktion .items { font-size: 0.95rem; color: var(--ink-soft); }
  .log { padding: 0.5rem 0.8rem; border-radius: 0.8rem; background: #fff6d6; display: flex; flex-direction: column; gap: 0.15rem; }
  .log.ok { background: var(--ok-bg); }
  .loghead { display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
  .loghead code { font-size: 0.9rem; }
  .log small { color: var(--ink-soft); }
  .prod .gluten-sel { grid-column: 3; }
  .prod .price { grid-column: 4; }
  .prod .del { grid-column: 5; }
  .gluten-sel { border: 2px solid var(--wool-line); border-radius: 0.6rem; padding: 0.3rem 0.4rem; background: #fff; font: inherit; font-size: 0.9rem; max-width: 10rem; }
  .bon { padding: 0.6rem 0.8rem; background: var(--wool); border-radius: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .bonhead { display: flex; gap: 0.8rem; align-items: baseline; }
  .bonhead b { font-family: var(--f-display); font-size: 1.3rem; }
  .bon small { color: var(--ink-soft); }

  @media print {
    .noprint { display: none !important; }
    .settings, .body, .pane { display: block; height: auto; overflow: visible; padding: 0; }
  }

  /* Handy: Reiter oben zum Wischen, Felder untereinander */
  @media (max-width: 760px) {
    header { padding: 0.5rem 0.7rem; }
    header b { font-size: 1.3rem; }
    header :global(.big-btn) { font-size: 0.95rem; padding: 0.45rem 0.7rem; }
    .body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    nav { flex-direction: row; overflow-x: auto; padding: 0.4rem 0.5rem; scrollbar-width: none; }
    nav::-webkit-scrollbar { display: none; }
    nav button { flex: none; padding: 0.5rem 0.8rem; }
    .pane { padding: 0.9rem 0.8rem 1.5rem; }
    .field { grid-template-columns: 1fr; gap: 0.35rem; }
    .test { flex-direction: column; align-items: flex-start; }
    .player { grid-template-columns: auto 1fr; }
    .player .time { grid-column: 1 / -1; }
    .aktion { grid-template-columns: auto 1fr; }
    .aktion :global(.toggle) { grid-column: 2; justify-self: start; }
    .prod { grid-template-columns: 2.8rem 1fr auto; }
    .prod .price { grid-column: 3; }
    .prod .del { grid-column: 3; }
    .prod .gluten-sel { grid-column: 2; grid-row: 2; justify-self: start; }
    input[type="range"] { width: 100%; }
  }
</style>
