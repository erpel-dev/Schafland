<script>
  import { cart } from "../lib/shop.svelte.js";
  import { settings } from "../lib/settings.svelte.js";
  import { euro, euroText, plain } from "../lib/money.js";
  import QrCode from "./QrCode.svelte";
  import { giroPayload, formatIban } from "../lib/girocode.js";
  import { nfcInfo, watchCards, openNfcSettings } from "../lib/nfc.js";
  import { beep, unlockAudio } from "../lib/sounds.js";
  import { onDestroy } from "svelte";

  let { onClose, onPaid } = $props();

  let method = $state("spiel-qr");
  let total = cart.totalCents;

  // --- Kartenzahlung spielen (NFC): jede Karte wird angenommen
  let nfc = $state(null); // { available, enabled, needsTap }
  let terminal = $state("aus"); // aus | start (Antippen nötig) | bereit | ok | nfc-aus | fehler
  let terminalError = $state("");
  let stopReader = null;
  let closed = false;

  if (settings.value.nfcKarte) {
    nfcInfo().then((info) => {
      if (closed || !info.available) return;
      nfc = info;
      method = "karte"; // Gerät kann Karten lesen: gleich das Terminal zeigen
      startTerminal(false);
    });
  }

  async function startTerminal(tapped) {
    if (!nfc || terminal === "ok") return;
    if (!nfc.enabled) {
      // NFC in den Android-Einstellungen aus: beim Zurückkommen nochmal nachsehen
      const info = await nfcInfo();
      if (closed) return;
      nfc = info;
      if (!info.enabled) return (terminal = "nfc-aus");
    }
    if (nfc.needsTap && !tapped) return (terminal = "start");
    if (stopReader) return (terminal = "bereit");
    terminalError = "";
    try {
      const stop = await watchCards(cardTapped);
      if (closed) return stop();
      stopReader = stop;
      nfc = { ...nfc, needsTap: false };
      terminal = "bereit";
    } catch (err) {
      if (closed) return;
      if (err?.name === "NotAllowedError") {
        terminal = "fehler";
        terminalError = "NFC wurde nicht erlaubt. In den Website-Einstellungen von Chrome lässt es sich wieder erlauben.";
      } else if (/ausgeschaltet|NotReadableError/.test(`${err?.name} ${err?.message}`)) terminal = "nfc-aus";
      else {
        terminal = "fehler";
        terminalError = `Kartenleser startet nicht: ${err?.message ?? err}`;
      }
    }
  }

  function stopTerminal() {
    stopReader?.();
    stopReader = null;
  }

  function cardTapped() {
    if (method !== "karte" || terminal !== "bereit" || closed) return;
    terminal = "ok";
    beep();
    navigator.vibrate?.(120);
    stopTerminal();
    setTimeout(() => !closed && onPaid("karte"), 1300);
  }

  function choose(m) {
    unlockAudio();
    method = m;
    if (m === "karte") startTerminal(true);
  }

  // NFC in den Android-Einstellungen eingeschaltet und zurück in die App
  function onVisible() {
    if (document.visibilityState === "visible" && method === "karte" && terminal === "nfc-aus") startTerminal(false);
  }

  onDestroy(() => {
    closed = true;
    stopTerminal();
  });

  let payload = $derived(
    method === "paypal"
      ? `https://paypal.me/${settings.value.paypalName}/${plain(total)}EUR`
      : method === "girocode"
        ? giroPayload({ name: settings.value.giroName, iban: settings.value.giroIban, cents: total, text: settings.value.giroText })
        : `Danke für Ihren Einkauf bei Schafland im Wert von ${euroText(total)}`,
  );
</script>

<!-- Absichtlich kein Schließen durch Tippen daneben: ein Doppeltipp auf "Bezahlen" schloss das Fenster sofort wieder -->
<svelte:document onvisibilitychange={onVisible} />

<div class="dim" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
    <h2 id="pay-title">Wie möchtest du bezahlen? <span>{euro(total)}</span></h2>

    <div class="opts">
      {#if nfc}
        <button class="opt" class:on={method === "karte"} onclick={() => choose("karte")}>
          <span class="emoji">💳</span><b>Karte</b><small>{nfc.pc ? "auflegen oder stecken" : "ans Gerät halten"}</small>
        </button>
      {/if}
      <button class="opt" class:on={method === "spiel-qr"} onclick={() => choose("spiel-qr")}>
        <span class="emoji">🐑</span><b>Schaf-Code</b><small>Spiel-QR zum Scannen</small>
      </button>
      {#if settings.paypalReady}
        <button class="opt" class:on={method === "paypal"} onclick={() => choose("paypal")}>
          <span class="emoji">💙</span><b>PayPal</b><small>echtes Geld</small>
        </button>
      {/if}
      {#if settings.giroReady}
        <button class="opt" class:on={method === "girocode"} onclick={() => choose("girocode")}>
          <span class="emoji">🏦</span><b>Überweisung</b><small>GiroCode · echtes Geld</small>
        </button>
      {/if}
    </div>

    {#if method === "karte"}
      <div class="qrrow karte">
        <div class="terminal" class:ok={terminal === "ok"} aria-live="polite">
          <div class="screen">
            <span class="amount">{euro(total)}</span>
            {#if terminal === "ok"}
              <span class="msg">✓ Zahlung erfolgreich</span>
            {:else if terminal === "bereit"}
              <span class="msg">Karte hinhalten</span>
            {:else}
              <span class="msg">Bitte warten …</span>
            {/if}
          </div>
          <svg class="wave" viewBox="0 0 40 40" aria-hidden="true">
            {#each [6, 12, 18] as r, i}<path d={`M ${8 + r * 0.5} ${20 - r} A ${r} ${r} 0 0 1 ${8 + r * 0.5} ${20 + r}`} style:animation-delay={`${i * 0.2}s`} />{/each}
          </svg>
        </div>
        <div class="txt">
          {#if terminal === "ok"}
            <b>Bezahlt. Danke schön!</b>
          {:else if terminal === "start"}
            <b>Kartenleser einschalten</b>
            <p>Einmal antippen, dann darf Schafland Karten lesen.</p>
            <button class="big-btn" onclick={() => startTerminal(true)}>💳 Kartenleser an</button>
          {:else if terminal === "nfc-aus"}
            <b>NFC ist ausgeschaltet</b>
            <p>Bitte NFC in den Einstellungen des Geräts einschalten und dann zurückkommen.</p>
            <button class="big-btn light" onclick={openNfcSettings}>Einstellungen öffnen</button>
          {:else if terminal === "fehler"}
            <b>Das klappt gerade nicht</b>
            <p>{terminalError}</p>
            <button class="big-btn light" onclick={() => startTerminal(true)}>Nochmal versuchen</button>
          {:else}
            {#if nfc?.pc}
              <b>Karte auf den Leser legen oder reinstecken!</b>
            {:else}
              <b>Halte deine Karte an das Gerät!</b>
            {/if}
            <p>Jede Karte geht: Spielkarte, NFC-Aufkleber, Schlüsselanhänger. Es wird nichts abgebucht.</p>
          {/if}
        </div>
      </div>
    {:else}
    <div class="qrrow">
      <QrCode text={payload} size="14rem" ecLevel={method === "girocode" ? "M" : "H"} badge={method !== "girocode"} />
      <div class="txt">
        <b>Halte dein Handy an den Code!</b>
        {#if method === "paypal"}
          <p>PayPal öffnet sich mit dem Betrag. Bitte <strong>„Freunde und Familie“</strong> auswählen.</p>
        {:else if method === "girocode"}
          <p>Mit der Banking-App scannen („Foto-Überweisung“ oder „GiroCode“). Die Überweisung ist ausgefüllt und muss in der App bestätigt werden.</p>
        {:else}
          <p>Mit der Kamera-App scannen. Das Handy zeigt dann den Kassenbon-Text.</p>
        {/if}
        {#if method === "girocode"}
          <code class="giro">{settings.value.giroName} · {formatIban(settings.value.giroIban)} · {euro(total)} · {settings.value.giroText}</code>
        {:else}
          <code>{payload}</code>
        {/if}
      </div>
    </div>
    {/if}

    <div class="row">
      <button class="big-btn light" onclick={onClose}>Zurück</button>
      <button class="big-btn" onclick={() => onPaid(method)}>Bezahlt! Neuer Einkauf</button>
    </div>
  </div>
</div>

<style>
  .dim { position: fixed; inset: 0; background: rgba(40, 50, 35, 0.5); display: grid; place-items: center; z-index: 20; animation: fade 0.15s; }
  .modal { background: var(--wool); border-radius: 2rem; padding: 1.4rem 1.6rem; width: min(52rem, 94vw); display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3); animation: up 0.2s ease-out; }
  h2 { margin: 0; font-family: var(--f-display); font-size: 1.9rem; display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  h2 span { font-size: 2.5rem; color: var(--grass-dark); font-variant-numeric: tabular-nums; }
  .opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.8rem; }
  .opt { background: #fff; border: 3px solid var(--wool-line); border-radius: 1.3rem; padding: 0.7rem; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }
  .opt .emoji { font-size: 2.3rem; }
  .opt b { font-family: var(--f-display); font-size: 1.3rem; }
  .opt small { color: var(--ink-soft); }
  .opt.on { border-color: var(--grass); background: var(--ok-bg); }
  .qrrow { display: flex; gap: 1.4rem; align-items: center; background: #fff; border-radius: 1.3rem; padding: 1rem; }
  .txt { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .txt b { font-family: var(--f-display); font-size: 1.5rem; }
  .txt p { margin: 0; color: var(--ink-soft); font-size: 1.05rem; }
  .txt code { font-size: 0.8rem; background: var(--wool-2); border-radius: 0.5rem; padding: 0.5rem 0.7rem; word-break: break-all; }
  .txt code.giro { word-break: normal; overflow-wrap: anywhere; }
  .row { display: flex; justify-content: flex-end; gap: 0.8rem; }
  /* Kartenterminal */
  .karte { justify-content: center; }
  .terminal { width: 11rem; flex: none; background: #3b4252; border-radius: 1.4rem 1.4rem 1.8rem 1.8rem; padding: 0.9rem 0.8rem 1.1rem; display: flex; flex-direction: column; align-items: center; gap: 0.7rem; box-shadow: inset 0 -0.4rem 0 rgba(0, 0, 0, 0.25); }
  .screen { width: 100%; background: #dfe8d0; border-radius: 0.6rem; padding: 0.6rem 0.4rem; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; font-variant-numeric: tabular-nums; color: #2b3326; }
  .screen .amount { font-family: var(--f-display); font-size: 1.6rem; }
  .screen .msg { font-size: 0.95rem; text-align: center; }
  .terminal.ok .screen { background: #bfe6a8; }
  .wave { width: 2.8rem; height: 2.8rem; }
  .wave path { fill: none; stroke: #cfd6e0; stroke-width: 3.2; stroke-linecap: round; animation: wave 1.4s infinite; }
  .terminal.ok .wave path { animation: none; stroke: #8fd16a; }
  .karte .txt :global(.big-btn) { align-self: flex-start; }
  @keyframes wave { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes up { from { transform: translateY(1.5rem); } }

  /* Handy: Fenster über die ganze Breite, QR-Code über dem Text */
  @media (max-width: 760px) {
    .modal { padding: 1rem; gap: 0.7rem; border-radius: 1.4rem; max-height: 96%; overflow-y: auto; }
    h2 { font-size: 1.3rem; flex-wrap: wrap; }
    h2 span { font-size: 1.8rem; }
    .opts { grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: 0.5rem; }
    .opt { padding: 0.5rem 0.3rem; }
    .opt .emoji { font-size: 1.6rem; }
    .opt b { font-size: 1rem; }
    .opt small { font-size: 0.75rem; }
    .qrrow { flex-direction: column; gap: 0.6rem; padding: 0.7rem; }
    .qrrow :global(.qr) { width: min(13rem, 70vw) !important; height: min(13rem, 70vw) !important; }
    .txt { text-align: center; }
    .terminal { width: 9.5rem; padding: 0.7rem 0.6rem 0.8rem; gap: 0.4rem; }
    .karte .txt :global(.big-btn) { align-self: stretch; }
    .txt b { font-size: 1.2rem; }
    .txt p { font-size: 0.95rem; }
    .row { flex-direction: column-reverse; }
    .row :global(.big-btn) { width: 100%; font-size: 1.15rem; }
  }
  /* Handy quer: QR neben dem Text, aber kleiner */
  @media (max-height: 500px) {
    .modal { padding: 0.8rem 1rem; gap: 0.5rem; max-height: 96%; overflow-y: auto; }
    h2 { font-size: 1.3rem; }
    h2 span { font-size: 1.7rem; }
    /* Bezahlarten als flache Zeile, damit der QR-Code groß bleiben kann */
    .opt { padding: 0.3rem 0.6rem; flex-direction: row; justify-content: center; gap: 0.5rem; }
    .opt .emoji { font-size: 1.4rem; }
    .opt small { display: none; }
    .qrrow { padding: 0.5rem; gap: 0.9rem; }
    .qrrow :global(.qr) { width: min(11.5rem, 48vh) !important; height: min(11.5rem, 48vh) !important; }
    .txt p { font-size: 0.9rem; }
    .row :global(.big-btn) { font-size: 1.05rem; padding: 0.5rem 0.9rem; }
  }
</style>
