<script>
  import { onMount } from "svelte";
  import { cart, findByEan } from "../lib/shop.svelte.js";
  import { scanLog } from "../lib/scanlog.svelte.js";
  import { settings } from "../lib/settings.svelte.js";
  import { layout } from "../lib/layout.svelte.js";
  import { isValidEan } from "../lib/ean.js";
  import { isPressCode } from "../lib/presse.js";
  import { euro } from "../lib/money.js";
  import { beep, nope } from "../lib/sounds.js";
  import ProductImage from "./ProductImage.svelte";
  import Sheep from "./Sheep.svelte";

  let { onClose } = $props();

  let video = $state();
  let camState = $state("start"); // start | live | error
  let camError = $state("");
  let status = $state("idle"); // idle | looking | found | added | unknown | unavailable | offline
  let found = $state(null); // { product, source }
  let lastCode = $state("");
  let fps = $state(0);

  const RESULT_TEXT = { unknown: "unbekannt", unavailable: "Datenbank gestört", offline: "kein Internet" };
  const data_format = (code) => (/^https?:/.test(code) ? "Link" : /^\d+$/.test(code) ? `${code.length} Ziffern` : "Text");

  // Derselbe Code zählt erst wieder, wenn er so lange nicht mehr im Bild war
  const SAME_CODE_GONE_MS = 1500;
  const AUTO_ADD_MS = 1000;
  // Nach so langer Startzeit wartet der Browser vermutlich auf die Kamera-Erlaubnis
  const PERMISSION_HINT_MS = 2500;

  let addTimer;
  let slowStart = $state(false);
  let mirror = $state(true); // Frontkamera spiegeln wie ein Spiegel, Rückkamera nicht
  let cameras = $state([]); // mehrere Kameras (Tablet): Knopf zum Umschalten
  let switchCamera = () => {};

  onMount(() => {
    let stream;
    let stopped = false;
    let busy = false;
    let loopTimer;
    let lastSeen = { code: "", at: 0, addOn: "" };
    let lookup = 0; // verwirft Antworten älterer Suchen
    let frameNo = 0;
    let frames = 0;
    const fpsTimer = setInterval(() => ((fps = frames), (frames = 0)), 1000);
    const slowTimer = setTimeout(() => (slowStart = true), PERMISSION_HINT_MS);

    const worker = new Worker(new URL("../lib/scanner.worker.js", import.meta.url), { type: "module" });
    const canvas = document.createElement("canvas");
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });

    worker.onmessage = async ({ data }) => {
      busy = false;
      frames++;
      if (stopped || !Array.isArray(data) || !data.length) return;
      const code = data[0].text.trim();
      const addOn = data[0].addOn ?? "";
      const now = Date.now();
      const same = code === lastSeen.code && now - lastSeen.at < SAME_CODE_GONE_MS;
      // Zusatzcode (Ausgabe) erst in einem späteren Bild gelesen: nachtragen statt neu zählen
      if (same && addOn && !lastSeen.addOn) lateAddOn(code, addOn);
      lastSeen = { code, at: now, addOn: addOn || (same ? lastSeen.addOn : "") };
      if (!same) await handleCode(code, addOn);
    };

    async function handleCode(code, addOn = "") {
      clearTimeout(addTimer);
      const my = ++lookup;
      lastCode = code;
      // UPC-A (12 Stellen) ist eine EAN-13 mit führender 0
      const ean = /^\d{12}$/.test(code) ? "0" + code : code;
      if (!isValidEan(ean)) {
        status = "unknown";
        found = null;
        scanLog.add({ code, result: "kein Produktcode", trace: [`${data_format(code)}, keine gültige EAN`] });
        nope();
        return;
      }
      beep();
      status = "looking";
      found = null;
      const t0 = Date.now();
      let result;
      try {
        result = await findByEan(ean, { issue: addOn });
      } catch (err) {
        result = { error: "unavailable", trace: [`Fehler: ${err?.message ?? err}`] };
      }
      const ms = Date.now() - t0;
      scanLog.add({
        code: addOn ? `${ean} + ${addOn}` : ean,
        result: result.product ? `gefunden: ${result.product.name}` : RESULT_TEXT[result.error],
        trace: [...(result.trace ?? []), `${(ms / 1000).toFixed(1)} s`],
      });
      if (stopped || my !== lookup) return;
      if (result.error) {
        status = result.error;
        nope();
        return;
      }
      found = result;
      status = "found";
      addTimer = setTimeout(addFound, AUTO_ADD_MS);
    }

    async function lateAddOn(code, addOn) {
      if (!isPressCode(code) || !found || found.product.ean !== code) return;
      const result = await findByEan(code, { issue: addOn });
      if (!stopped && result.product && found?.product.ean === code) found = { ...found, product: result.product };
    }

    function tick() {
      if (stopped) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const sh = Math.round(h * 0.6);
        // Abwechselnd: mittlerer Streifen; die Bildmitte 2× vergrößert (für kleine oder unscharfe
        // Codes alter Fixfokus-Webcams), einmal davon nachgeschärft; das ganze Bild mit Drehung
        // (für hochkant gehaltene Bücher und Packungen).
        const mode = frameNo++ % 4;
        const full = mode === 3;
        canvas.width = w;
        canvas.height = full ? h : sh;
        ctx2d.imageSmoothingQuality = "high";
        if (mode === 0) ctx2d.drawImage(video, 0, (h - sh) / 2, w, sh, 0, 0, w, sh);
        else if (full) ctx2d.drawImage(video, 0, 0, w, h);
        else ctx2d.drawImage(video, w / 4, (h - sh / 2) / 2, w / 2, sh / 2, 0, 0, w, sh);
        const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
        busy = true;
        worker.postMessage({ img, sharpen: mode === 2, rotate: full }, [img.data.buffer]);
      }
      loopTimer = setTimeout(tick, 110); // höchstens ca. 9 Bilder pro Sekunde
    }

    // Gewählte Kamera genau nehmen; fehlt sie (anderes Gerät, abgesteckt), die Rückkamera bzw. Webcam
    async function startCamera(deviceId) {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            // gemerkte Kamera, sonst die Rückkamera (Tablet) bzw. die einzige Webcam
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }),
          },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const track = stream.getVideoTracks()[0];
        const info = track?.getSettings() ?? {};
        mirror = info.facingMode !== "environment";
        video.srcObject = stream;
        await video.play();
        camState = "live";
        // Erst nach der Erlaubnis verrät der Browser alle Kameras
        cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        current = info.deviceId ?? deviceId ?? null;
        // Gemerkte Kamera unter neuer Kennung wiederfinden (über ihren Namen)
        const wanted = settings.value.cameraLabel && cameras.find((c) => c.label === settings.value.cameraLabel);
        if (wanted && wanted.deviceId !== current && !relabeled) {
          relabeled = true;
          settings.set({ cameraId: wanted.deviceId });
          return startCamera(wanted.deviceId);
        }
        if (!looping) {
          looping = true;
          tick();
        }
      } catch (err) {
        if (deviceId && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
          return startCamera(null);
        }
        camState = "error";
        camError =
          err?.name === "NotAllowedError"
            ? "Die Kamera wurde nicht erlaubt."
            : err?.name === "NotFoundError"
              ? "Es wurde keine Kamera gefunden."
              : "Die Kamera lässt sich gerade nicht starten.";
      }
    }
    let looping = false;
    let current = null;
    let relabeled = false;
    switchCamera = () => {
      if (cameras.length < 2) return;
      const i = cameras.findIndex((c) => c.deviceId === current);
      const next = cameras[(i + 1) % cameras.length];
      settings.set({ cameraId: next.deviceId, cameraLabel: next.label || null });
      relabeled = true;
      startCamera(next.deviceId);
    };
    startCamera(settings.value.cameraId);

    return () => {
      stopped = true;
      // Schon gepiept und angezeigt, aber "Fertig" kam vor dem automatischen Hinzufügen
      if (status === "found") addFound();
      clearTimeout(loopTimer);
      clearTimeout(addTimer);
      clearTimeout(slowTimer);
      clearInterval(fpsTimer);
      worker.terminate();
      stream?.getTracks().forEach((t) => t.stop());
      // Ohne das hält der Browser das Video samt ganzer Scan-Ansicht im Speicher (Leck pro Scan)
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  });

  function addFound() {
    clearTimeout(addTimer);
    if (!found || status !== "found") return;
    cart.add(found.product);
    status = "added";
  }
</script>

<section class="scan">
  <div class="feed">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class:mirror muted playsinline></video>
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
        {slowStart ? "Bitte die Kamera erlauben" : "Kamera startet …"}
      {:else}
        Halte den Strichcode in die Wolke
      {/if}
    </p>
    <button class="big-btn light done" onclick={onClose}>✓ Fertig gescannt</button>
    {#if cameras.length > 1}
      <button class="switch" onclick={() => switchCamera()} aria-label="Andere Kamera"><span class="emoji">🔄</span> Kamera</button>
    {/if}
  </div>

  <div class="found">
    {#if status === "looking"}
      <div class="pimg"><Sheep size="6rem" class="think" /></div>
      <b class="t">Ich schaue nach …</b>
      <small>Code {lastCode}</small>
    {:else if (status === "found" || status === "added") && found}
      <span class="src">gefunden · {found.source}</span>
      <div class="pimg"><ProductImage product={found.product} size={layout.narrow || layout.short ? "4.2rem" : "8rem"} /></div>
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
      <small>Den Code gibt es in keiner Datenbank.</small>
    {:else if status === "unavailable"}
      <div class="pimg"><Sheep size="6rem" class="shrug" /></div>
      <b class="t">Ich kann gerade nicht nachschauen.</b>
      <small>Die Datenbank antwortet gerade nicht. Halte es gleich nochmal vor die Kamera.</small>
    {:else if status === "offline"}
      <div class="pimg"><Sheep size="6rem" class="shrug" /></div>
      <b class="t">Kein Internet.</b>
      <small>Neue Sachen kann ich nur mit Internet nachschauen. Bekannte Sachen gehen immer.</small>
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
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  video.mirror { transform: scaleX(-1); }
  .switch { position: absolute; top: 1rem; right: 1rem; padding: 0.5rem 0.9rem; border-radius: 99px; background: rgba(255, 255, 255, 0.9); font-weight: 800; display: flex; gap: 0.4rem; align-items: center; }
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
  .src { font-size: 0.75rem; font-family: monospace; background: var(--sky); color: var(--sky-ink); padding: 0.2rem 0.5rem; border-radius: 0.4rem; align-self: flex-start; }
  .added { font-family: var(--f-display); font-size: 1.5rem; font-weight: 800; color: var(--grass-dark); text-align: center; padding: 0.5rem; background: var(--ok-bg); border-radius: 1rem; }
  .pimg :global(.think) { animation: think 1s ease-in-out infinite; }
  .pimg :global(.shrug) { animation: shrug 0.6s ease-in-out 2; }
  @keyframes think { 50% { transform: rotate(-8deg); } }
  @keyframes shrug { 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }

  /* Handy hochkant: Kamera oben, Fund darunter als schmale Zeile */
  @media (max-width: 760px) {
    .scan { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
    .frame { width: 80%; }
    .hint { font-size: 1.25rem; bottom: 4.4rem; }
    .found { border-left: 0; border-top: 2px solid var(--wool-line); display: grid; grid-template-columns: 5.5rem 1fr; column-gap: 0.8rem; row-gap: 0.2rem; padding: 0.7rem; align-content: start; }
    /* Bild links über alle Zeilen, alles andere rechts daneben */
    .found > * { grid-column: 2; min-width: 0; }
    .found .pimg { grid-column: 1; grid-row: 1 / span 6; height: 5.5rem; font-size: 3rem; align-self: start; }
    .t { font-size: 1.2rem; }
    .price { font-size: 1.8rem; }
    .src { font-size: 0.7rem; }
    .found :global(.big-btn), .added { font-size: 1.05rem; padding: 0.45rem 0.8rem; }
  }
  /* Handy quer */
  @media (max-height: 500px) {
    .scan { grid-template-columns: 1fr 13rem; }
    .found { padding: 0.7rem; gap: 0.35rem; }
    .pimg { height: 5.5rem; font-size: 3rem; }
    .t { font-size: 1.15rem; }
    .price { font-size: 1.7rem; }
    .hint { font-size: 1.15rem; bottom: 3.8rem; }
    .done { bottom: 0.6rem; font-size: 1.05rem; padding: 0.45rem 0.9rem; }
  }
</style>
