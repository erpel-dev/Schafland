<script>
  import { onMount } from "svelte";
  import { cart, findByEan } from "../lib/shop.svelte.js";
  import { isValidEan } from "../lib/ean.js";
  import { euro } from "../lib/money.js";
  import { beep, nope } from "../lib/sounds.js";
  import ProductImage from "./ProductImage.svelte";
  import Sheep from "./Sheep.svelte";

  let { onClose } = $props();

  let video = $state();
  let camState = $state("start"); // start | live | error
  let camError = $state("");
  let status = $state("idle"); // idle | looking | found | unknown
  let found = $state(null); // { product, source }
  let lastCode = $state("");
  let fps = $state(0);

  const SAME_CODE_PAUSE = 1500;
  const AUTO_ADD_MS = 1000;

  onMount(() => {
    let stream;
    let stopped = false;
    let busy = false;
    let loopTimer;
    let addTimer;
    let lastHit = { code: "", at: 0 };
    let frames = 0;
    const fpsTimer = setInterval(() => ((fps = frames), (frames = 0)), 1000);

    const worker = new Worker(new URL("../lib/scanner.worker.js", import.meta.url), { type: "module" });
    const canvas = document.createElement("canvas");
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });

    worker.onmessage = async ({ data }) => {
      busy = false;
      frames++;
      if (stopped || !Array.isArray(data) || !data.length) return;
      const code = data[0].text.trim();
      const now = Date.now();
      if (code === lastHit.code && now - lastHit.at < SAME_CODE_PAUSE) return;
      lastHit = { code, at: now };
      await handleCode(code);
    };

    async function handleCode(code) {
      clearTimeout(addTimer);
      lastCode = code;
      // UPC-A (12 Stellen) ist eine EAN-13 mit führender 0
      const ean = /^\d{12}$/.test(code) ? "0" + code : code;
      if (!isValidEan(ean)) {
        status = "unknown";
        found = null;
        nope();
        return;
      }
      beep();
      status = "looking";
      found = null;
      const result = await findByEan(ean);
      if (stopped) return;
      if (!result) {
        status = "unknown";
        nope();
        return;
      }
      found = result;
      status = "found";
      addTimer = setTimeout(() => addFound(), AUTO_ADD_MS);
    }

    function tick() {
      if (stopped) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        // Nur einen mittleren Streifen auswerten: spart Rechenzeit auf langsamer CPU
        const w = video.videoWidth;
        const h = video.videoHeight;
        const sh = Math.round(h * 0.6);
        const sy = Math.round((h - sh) / 2);
        canvas.width = w;
        canvas.height = sh;
        ctx2d.drawImage(video, 0, sy, w, sh, 0, 0, w, sh);
        const img = ctx2d.getImageData(0, 0, w, sh);
        busy = true;
        worker.postMessage(img, [img.data.buffer]);
      }
      loopTimer = setTimeout(tick, 110); // höchstens ca. 9 Bilder pro Sekunde
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        video.srcObject = stream;
        await video.play();
        camState = "live";
        tick();
      } catch (err) {
        camState = "error";
        camError =
          err?.name === "NotAllowedError"
            ? "Die Kamera wurde nicht erlaubt."
            : err?.name === "NotFoundError"
              ? "Es wurde keine Kamera gefunden."
              : "Die Kamera lässt sich gerade nicht starten.";
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(loopTimer);
      clearTimeout(addTimer);
      clearInterval(fpsTimer);
      worker.terminate();
      stream?.getTracks().forEach((t) => t.stop());
    };
  });

  function addFound() {
    if (!found) return;
    cart.add(found.product);
    status = "added";
  }
</script>

<section class="scan">
  <div class="feed">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} muted playsinline></video>
    <div class="frame" class:hit={status === "found" || status === "added"}>
      <div class="wool"></div>
      <div class="laser"></div>
    </div>
    <div class="stats">
      {#if camState === "live"}<span>{video?.videoWidth}×{video?.videoHeight}</span><span>{fps} Bilder/s</span>{/if}
      {#if lastCode}<span>{lastCode}</span>{/if}
    </div>
    <p class="hint">
      {#if camState === "error"}
        {camError}
      {:else if camState === "start"}
        Kamera startet …
      {:else}
        Halte den Strichcode in die Wolke
      {/if}
    </p>
    <button class="big-btn light done" onclick={onClose}>✓ Fertig gescannt</button>
  </div>

  <div class="found">
    {#if status === "looking"}
      <div class="pimg"><Sheep size="6rem" class="think" /></div>
      <b class="t">Ich schaue nach …</b>
      <small>Code {lastCode}</small>
    {:else if (status === "found" || status === "added") && found}
      <span class="src">gefunden · {found.source}</span>
      <div class="pimg"><ProductImage product={found.product} size="8rem" /></div>
      <b class="t">{found.product.name}</b>
      <small>{[found.product.brand, found.product.quantity].filter(Boolean).join(" · ")}</small>
      <div class="price">{euro(found.product.priceCents)}</div>
      {#if status === "added"}
        <div class="added">✓ Im Korb</div>
      {:else}
        <button class="big-btn" onclick={addFound}>In den Korb</button>
      {/if}
    {:else if status === "unknown"}
      <div class="pimg"><Sheep size="6rem" class="shrug" /></div>
      <b class="t">Das kenne ich nicht.</b>
      <small>{navigator.onLine ? "Den Code gibt es in keiner Datenbank." : "Ohne Internet kann ich neue Sachen nicht nachschauen."}</small>
    {:else}
      <div class="pimg"><span class="emoji">📦</span></div>
      <b class="t">Was kaufst du?</b>
      <small>Gescannte Sachen landen automatisch im Korb.</small>
    {/if}
  </div>
</section>

<style>
  .scan { display: grid; grid-template-columns: 1fr 17rem; min-height: 0; min-width: 0; }
  .feed { position: relative; background: #2f342b; overflow: hidden; display: grid; place-items: center; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .frame { position: relative; width: 26rem; max-width: 80%; aspect-ratio: 16 / 9; }
  .wool {
    position: absolute; inset: -1.8rem; border-radius: 3.5rem; padding: 1.8rem;
    background: radial-gradient(circle, var(--wool) 0.95rem, transparent 1rem) 0 0 / 2.1rem 2.1rem;
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    transition: filter 0.2s;
  }
  .frame.hit .wool { filter: drop-shadow(0 0 0.6rem var(--grass)) sepia(1) hue-rotate(50deg) saturate(3); }
  .laser { position: absolute; left: 1rem; right: 1rem; top: 50%; height: 3px; background: #ff5b6e; box-shadow: 0 0 12px #ff5b6e; animation: sweep 1.8s ease-in-out infinite; }
  @keyframes sweep { 50% { transform: translateY(-2.5rem); } }
  .stats { position: absolute; top: 1.2rem; left: 0.9rem; display: flex; gap: 0.4rem; }
  .stats span { background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 0.75rem; font-family: monospace; padding: 0.2rem 0.5rem; border-radius: 0.4rem; }
  .hint { position: absolute; bottom: 4.8rem; left: 0; right: 0; margin: 0; text-align: center; color: #fff; font-family: var(--f-display); font-size: 1.6rem; font-weight: 700; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
  .done { position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); }
  .done:active { transform: translateX(-50%) translateY(0.2rem); }

  .found { padding: 1.3rem 1rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; background: #fff; border-left: 2px solid var(--wool-line); min-width: 0; }
  .pimg { height: 10rem; border-radius: 1.2rem; background: var(--wool-2); display: grid; place-items: center; font-size: 5rem; }
  .t { font-family: var(--f-display); font-size: 1.5rem; line-height: 1.15; overflow-wrap: anywhere; }
  small { color: var(--ink-soft); }
  .price { font-family: var(--f-display); font-size: 2.6rem; font-weight: 800; color: var(--grass-dark); line-height: 1; }
  .src { font-size: 0.75rem; font-family: monospace; background: var(--sky); padding: 0.2rem 0.5rem; border-radius: 0.4rem; align-self: flex-start; }
  .added { font-family: var(--f-display); font-size: 1.5rem; font-weight: 800; color: var(--grass-dark); text-align: center; padding: 0.5rem; background: #f0f8ea; border-radius: 1rem; }
  .pimg :global(.think) { animation: think 1s ease-in-out infinite; }
  .pimg :global(.shrug) { animation: shrug 0.6s ease-in-out 2; }
  @keyframes think { 50% { transform: rotate(-8deg); } }
  @keyframes shrug { 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
</style>
