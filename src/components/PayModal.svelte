<script>
  import { cart } from "../lib/shop.svelte.js";
  import { settings } from "../lib/settings.svelte.js";
  import { euro, euroText, plain } from "../lib/money.js";
  import QrCode from "./QrCode.svelte";

  let { onClose, onPaid } = $props();

  let method = $state("spiel-qr");
  let total = cart.totalCents;

  let payload = $derived(
    method === "paypal"
      ? `https://paypal.me/${settings.value.paypalName}/${plain(total)}EUR`
      : `Danke für Ihren Einkauf bei Schafland im Wert von ${euroText(total)}`,
  );
</script>

<div class="dim" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
    <h2 id="pay-title">Wie möchtest du bezahlen? <span>{euro(total)}</span></h2>

    <div class="opts">
      <button class="opt" class:on={method === "spiel-qr"} onclick={() => (method = "spiel-qr")}>
        <span class="emoji">🐑</span><b>Schaf-Code</b><small>Spiel-QR zum Scannen</small>
      </button>
      {#if settings.paypalReady}
        <button class="opt" class:on={method === "paypal"} onclick={() => (method = "paypal")}>
          <span class="emoji">💙</span><b>PayPal</b><small>echtes Geld</small>
        </button>
      {/if}
    </div>

    <div class="qrrow">
      <QrCode text={payload} size="14rem" />
      <div class="txt">
        <b>Halte dein Handy an den Code!</b>
        {#if method === "paypal"}
          <p>PayPal öffnet sich mit dem Betrag. Bitte <strong>„Freunde und Familie“</strong> auswählen.</p>
        {:else}
          <p>Mit der Kamera-App scannen. Das Handy zeigt dann den Kassenbon-Text.</p>
        {/if}
        <code>{payload}</code>
      </div>
    </div>

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
  .opt.on { border-color: var(--grass); background: #f0f8ea; }
  .qrrow { display: flex; gap: 1.4rem; align-items: center; background: #fff; border-radius: 1.3rem; padding: 1rem; }
  .txt { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .txt b { font-family: var(--f-display); font-size: 1.5rem; }
  .txt p { margin: 0; color: var(--ink-soft); font-size: 1.05rem; }
  .txt code { font-size: 0.8rem; background: var(--wool-2); border-radius: 0.5rem; padding: 0.5rem 0.7rem; word-break: break-all; }
  .row { display: flex; justify-content: flex-end; gap: 0.8rem; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes up { from { transform: translateY(1.5rem); } }
</style>
