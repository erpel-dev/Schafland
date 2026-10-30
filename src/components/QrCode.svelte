<script>
  import QRCode from "qrcode";
  import Sheep from "./Sheep.svelte";

  let { text, size = "15rem" } = $props();
  let canvas;

  $effect(() => {
    // Fehlerkorrektur "H" verträgt das Schaf in der Mitte
    QRCode.toCanvas(canvas, text, { errorCorrectionLevel: "H", margin: 2, width: 480, color: { dark: "#2a2f26", light: "#ffffff" } });
  });
</script>

<div class="qr" style:width={size} style:height={size}>
  <canvas bind:this={canvas} aria-label="QR-Code"></canvas>
  <span class="badge"><Sheep size="80%" /></span>
</div>

<style>
  .qr { position: relative; display: grid; place-items: center; background: #fff; border-radius: 1rem; flex: none; }
  canvas { width: 100% !important; height: 100% !important; }
  .badge { position: absolute; width: 20%; height: 20%; background: #fff; border-radius: 22%; display: grid; place-items: center; }
</style>
