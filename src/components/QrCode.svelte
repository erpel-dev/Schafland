<script>
  import QRCode from "qrcode";
  import Sheep from "./Sheep.svelte";

  // ecLevel/badge: Spiel- und PayPal-Codes mit Schaf (Fehlerkorrektur H),
  // GiroCode genau nach Standard (Fehlerkorrektur M, nichts verdeckt)
  let { text, size = "15rem", ecLevel = "H", badge = true } = $props();
  let canvas;

  $effect(() => {
    // Fehlerkorrektur "H" verträgt das Schaf in der Mitte
    QRCode.toCanvas(canvas, text, { errorCorrectionLevel: ecLevel, margin: 2, width: 480, color: { dark: "#2a2f26", light: "#ffffff" } });
  });
</script>

<div class="qr" style:width={size} style:height={size}>
  <canvas bind:this={canvas} aria-label="QR-Code"></canvas>
  {#if badge}<span class="badge"><Sheep size="80%" /></span>{/if}
</div>

<style>
  .qr { position: relative; display: grid; place-items: center; background: #fff; border-radius: 1rem; flex: none; }
  canvas { width: 100% !important; height: 100% !important; }
  .badge { position: absolute; width: 20%; height: 20%; background: #fff; border-radius: 22%; display: grid; place-items: center; }
</style>
