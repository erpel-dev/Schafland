<script>
  import { onMount } from "svelte";
  import { cart, findByEan, findPfand, pfandWahl } from "../lib/shop.svelte.js";
  import { pfandCents, pfandName, PFAND_QUELLE } from "../lib/pfand.js";
  import { scanLog } from "../lib/scanlog.svelte.js";
  import { settings } from "../lib/settings.svelte.js";
  import { layout } from "../lib/layout.svelte.js";
  import { isValidEan } from "../lib/ean.js";
  import { isPressCode } from "../lib/presse.js";
  import { euro } from "../lib/money.js";
  import { beep, nope, klapper } from "../lib/sounds.js";
  import ProductImage from "./ProductImage.svelte";
  import GlutenBadge from "./GlutenBadge.svelte";
  import { glutenRelevant } from "../lib/gluten.js";
  import Sheep from "./Sheep.svelte";
  import { schaf } from "../lib/sprache/schaf.svelte.js";

  // mode: "kauf" (Produkte in den Korb) oder "pfand" (leere Flaschen und Dosen zurückgeben)
  let { onClose, mode = "kauf" } = $props();
  let pfandMode = $derived(mode === "pfand");

  let video = $state();
  let camState = $state("start"); // start | live | error
  let camError = $state("");
  let status = $state("idle"); // idle | looking | found | added | unknown | unavailable | offline | pfand-ok | pfand-frage | pfand-kein
  let pfandFund = $state(null); // { ean, product, name, pfand, pfandQuelle, cents }
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
      if (pfandMode) return handlePfand(ean, my);
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

    // Pfand-Modus: Flasche oder Dose erkennen und das Pfand gleich gutschreiben
    async function handlePfand(ean, my) {
      status = "looking";
      found = null;
      pfandFund = null;
      const t0 = Date.now();
      const r = await findPfand(ean);
      scanLog.add({
        code: ean,
        result: r.pfand === null ? "Pfand unbekannt" : r.pfand === "kein" ? "kein Pfand" : `Pfand: ${pfandName(r.pfand)}`,
        trace: [...r.trace, `${((Date.now() - t0) / 1000).toFixed(1)} s`],
      });
      if (stopped || my !== lookup) return;
      pfandFund = { ean, ...r };
      zeigePfand(r.pfand);
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
      alive = false;
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

  // Produkte ohne Strichcode: Bild an LFM3-Omni („Was ist das?“)
  let seeing = $state(false);
  let alive = true; // Ansicht noch offen? (Bilderkennung kann länger dauern als das Kind wartet)
  let maybe = $state([]); // Vorschläge, wenn das Modell unsicher ist
  async function whatIsThis() {
    if (seeing || !video?.videoWidth) return;
    seeing = true;
    clearTimeout(addTimer);
    status = "seeing";
    found = null;
    maybe = [];
    const t0 = Date.now();
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const grab = (sx, sy, sw, sh) => {
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
        return ctx.getImageData(0, 0, sw, sh);
      };
      // Kinder halten die Sache in die Mitte (Wolke): dort ausschneiden, damit sie groß genug ist
      const side = Math.round(Math.min(w, h) * 0.75);
      const crop = grab(Math.round((w - side) / 2), Math.round((h - side) / 2), side, side);
      const full = grab(0, 0, w, h);
      const { product, candidates, tries } = await schaf.recognizeProduct({ crop, full });
      scanLog.add({
        code: "Kamerabild",
        result: product ? `erkannt: ${product.name}` : candidates.length ? "unsicher" : "nicht erkannt",
        trace: [...tries.map((t) => `${t.what}: „${t.answer}“`), `${((Date.now() - t0) / 1000).toFixed(1)} s`],
      });
      if (!alive) return; // inzwischen „Fertig gescannt“: nichts mehr in den Korb legen
      if (product) {
        beep();
        found = { product, source: "Bilderkennung" };
        status = "found";
        addTimer = setTimeout(addFound, AUTO_ADD_MS * 2);
      } else if (candidates.length) {
        maybe = candidates;
        status = "maybe";
      } else {
        status = "notseen";
        nope();
      }
    } catch (err) {
      console.warn("Bilderkennung", err);
      scanLog.add({ code: "Kamerabild", result: "Fehler", trace: [`${err?.message ?? err}`, `${((Date.now() - t0) / 1000).toFixed(1)} s`] });
      if (alive) status = "notseen";
    } finally {
      seeing = false;
    }
  }

  function pickMaybe(product) {
    found = { product, source: "Bilderkennung" };
    status = "found";
    maybe = [];
    addFound();
  }

  function zeigePfand(art) {
    if (art === null || art === undefined) {
      if (settings.value.pfandFragen) {
        status = "pfand-frage";
        beep();
        return;
      }
      art = "kein";
    }
    if (art === "kein") {
      status = "pfand-kein";
      nope();
      return;
    }
    const cents = pfandCents(art, settings.value);
    cart.addPfand(art, cents);
    pfandFund = { ...pfandFund, pfand: art, cents };
    status = "pfand-ok";
    klapper();
  }

  // Das Kind wählt, was auf der Flasche steht. Gilt ab jetzt für diesen Code.
  async function waehlePfand(art) {
    if (!pfandFund || status !== "pfand-frage") return;
    const fund = pfandFund;
    await pfandWahl.set(fund.ean, { art, name: fund.name, quelle: "kind" });
    if (pfandFund !== fund) return; // inzwischen etwas anderes gescannt
    pfandFund = { ...fund, pfandQuelle: "kind" };
    zeigePfand(art);
  }

  function addFound() {
    clearTimeout(addTimer);
    if (!found || status !== "found") return;
    cart.add(found.product);
    status = "added";
  }
</script>

<section class="scan" class:pfand={pfandMode}>
  <div class="feed">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class:mirror muted playsinline></video>
    {#if pfandMode}
      <div class="plate"><span class="emoji">♻️</span> Pfandautomat</div>
    {/if}
    <div class="frame" class:hit={status === "found" || status === "added" || status === "pfand-ok"}>
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
      {:else if pfandMode}
        Halte den Strichcode der Flasche in den Automaten
      {:else if schaf.canSeeProducts}
        Strichcode in die Wolke halten – oder „Was ist das?“ tippen
      {:else}
        Halte den Strichcode in die Wolke
      {/if}
    </p>
    <button class="big-btn light done" onclick={onClose}>{pfandMode ? "✓ Fertig mit Pfand" : "✓ Fertig gescannt"}</button>
    {#if schaf.canSeeProducts && !pfandMode}
      <button class="see" onclick={whatIsThis} disabled={seeing}><span class="emoji">🐑</span> {seeing ? "Ich schaue …" : "Was ist das?"}</button>
    {/if}
    {#if cameras.length > 1}
      <button class="switch" onclick={() => switchCamera()} aria-label="Andere Kamera"><span class="emoji">🔄</span> Kamera</button>
    {/if}
  </div>

  <div class="found">
    {#if pfandMode}
      {#if status === "looking"}
        <div class="pimg"><Sheep size="6rem" class="think" /></div>
        <b class="t">Ich schaue nach …</b>
        <small>Code {lastCode}</small>
      {:else if status === "pfand-ok" && pfandFund}
        <span class="src pf">{PFAND_QUELLE[pfandFund.pfandQuelle] ?? "Pfand"}</span>
        <div class="pimg">{#if pfandFund.product}<ProductImage product={pfandFund.product} size={layout.narrow || layout.short ? "4.2rem" : "7rem"} />{:else}<span class="emoji">🍾</span>{/if}</div>
        <b class="t">{pfandFund.name || "Flasche"}</b>
        <div class="plus"><b>+{euro(pfandFund.cents)}</b><small>{pfandName(pfandFund.pfand)}</small></div>
        <div class="added">✓ Klappert in den Automaten!</div>
      {:else if status === "pfand-frage" && pfandFund}
        <div class="frage-head">
          {#if pfandFund.product}<ProductImage product={pfandFund.product} size="2.6rem" />{:else}<span class="emoji">🍾</span>{/if}
          <span><b>{pfandFund.name || "Unbekannte Flasche"}</b><small>Code {pfandFund.ean}</small></span>
        </div>
        <b class="t">Wie viel Pfand hat das?</b>
        <button class="wahl" onclick={() => waehlePfand("einweg")}><span class="emoji">🥤</span><span>Dose oder Plastik&shy;flasche</span><b>{euro(pfandCents("einweg", settings.value))}</b></button>
        <button class="wahl" onclick={() => waehlePfand("mehrweg")}><span class="emoji">🍾</span><span>Glasflasche</span><b>{euro(pfandCents("mehrweg", settings.value))}</b></button>
        <button class="wahl" onclick={() => waehlePfand("kein")}><span class="emoji">🚫</span><span>Kein Pfand-Zeichen</span><b>{euro(0)}</b></button>
        <small>Das Pfand-Zeichen steht neben dem Strichcode. Die Antwort wird für diesen Code gemerkt.</small>
      {:else if status === "pfand-kein" && pfandFund}
        <div class="pimg">{#if pfandFund.product}<ProductImage product={pfandFund.product} size={layout.narrow || layout.short ? "4.2rem" : "7rem"} />{:else}<span class="emoji">📦</span>{/if}</div>
        <b class="t">{pfandFund.name || "Unbekannt"}</b>
        <div class="kein"><Sheep size="3.6rem" class="shrug" /><span><b>Da ist kein Pfand drauf.</b><small>Pfand gibt es nur für Flaschen und Dosen.</small></span></div>
      {:else if status === "unknown"}
        <div class="pimg"><Sheep size="6rem" class="shrug" /></div>
        <b class="t">Das ist kein Flaschen-Code.</b>
        <small>Halte den Strichcode auf dem Etikett in den Automaten.</small>
      {:else}
        <div class="pimg"><span class="emoji">🍾</span></div>
        <b class="t">Pfand abgeben</b>
        <small>Leere Flaschen und Dosen mit dem Strichcode in den Automaten halten. Das Pfand wird vom Einkauf abgezogen.</small>
      {/if}
      {#key cart.pfandTick}
        <div class="zaehler" class:bump={cart.pfandTick > 0}>
          <small>Schon im Automaten</small>
          <span><b>{cart.pfandCount === 1 ? "1 Flasche" : `${cart.pfandCount} Flaschen`}</b><b class="sum">{euro(cart.pfandCents)}</b></span>
        </div>
      {/key}
    {:else if status === "seeing"}
      <div class="pimg"><Sheep size="6rem" class="think" /></div>
      <b class="t">Ich schaue genau hin …</b>
      <small>Halte die Sache ruhig in die Kamera.</small>
    {:else if status === "maybe"}
      <b class="t">Ist es eins davon?</b>
      <div class="maybe">
        {#each maybe as p (p.id)}
          <button class="maybe-item" onclick={() => pickMaybe(p)}>
            <ProductImage product={p} size="2.8rem" />
            <span>{p.name}</span>
          </button>
        {/each}
      </div>
    {:else if status === "notseen"}
      <div class="pimg"><Sheep size="6rem" class="shrug" /></div>
      <b class="t">Das erkenne ich nicht.</b>
      <small>Halte es näher an die Kamera oder tippe es im Regal an.</small>
    {:else if status === "looking"}
      <div class="pimg"><Sheep size="6rem" class="think" /></div>
      <b class="t">Ich schaue nach …</b>
      <small>Code {lastCode}</small>
    {:else if (status === "found" || status === "added") && found}
      <span class="src">gefunden · {found.source}</span>
      <div class="pimg"><ProductImage product={found.product} size={layout.narrow || layout.short ? "4.2rem" : "8rem"} /></div>
      <b class="t">{found.product.name}</b>
      <small>{[found.product.brand, found.product.quantity].filter(Boolean).join(" · ")}</small>
      {#if glutenRelevant(found.product)}<GlutenBadge product={found.product} mode="text" />{/if}
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
  .see {
    position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2;
    display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1rem; border-radius: 99px;
    background: var(--sky); color: var(--sky-ink); font-weight: 800; font-size: 1.05rem;
  }
  .see:disabled { opacity: 0.7; }
  /* Handy hochkant: unten ist „Fertig gescannt“ – der Knopf kommt nach oben links */
  @media (max-width: 760px) {
    .see { bottom: auto; top: 3rem; left: 0.6rem; padding: 0.5rem 0.85rem; font-size: 1rem; }
  }
  .maybe { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.5rem; }
  .maybe-item { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.5rem; border-radius: 1rem; background: var(--wool); border: 2px solid var(--wool-line); font-weight: 800; }
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

  /* ---- Pfand-Modus: Automat statt Wollwolke ---- */
  .plate {
    position: absolute; top: 3rem; left: 50%; transform: translateX(-50%); z-index: 1;
    display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1.2rem 0.45rem 0.9rem; border-radius: 0.9rem;
    background: var(--pfand); color: #fff; box-shadow: 0 0.25rem 0 var(--pfand-dark);
    font-family: var(--f-display); font-weight: 800; font-size: 1.5rem; white-space: nowrap;
  }
  .scan.pfand .wool { display: none; }
  .scan.pfand .frame { border: 0.6rem solid var(--pfand); border-radius: 2.2rem; box-shadow: 0 0 0 0.35rem rgba(255, 255, 255, 0.85); transition: box-shadow 0.2s; }
  .scan.pfand .frame.hit { box-shadow: 0 0 0 0.35rem #7fd6e0, 0 0 1.4rem #7fd6e0; }
  .src.pf { background: var(--pfand-bg); color: var(--pfand-dark); }
  .plus { display: flex; align-items: center; gap: 0.7rem; background: var(--pfand-bg); border-radius: 1rem; padding: 0.5rem 0.8rem; }
  .plus b { font-family: var(--f-display); font-size: 2.2rem; font-weight: 800; color: var(--pfand); line-height: 1; white-space: nowrap; }
  .plus small { color: var(--pfand-dark); line-height: 1.2; }
  .frage-head { display: flex; align-items: center; gap: 0.6rem; }
  .frage-head .emoji { font-size: 2.2rem; }
  .frage-head span { display: flex; flex-direction: column; min-width: 0; }
  .frage-head b { overflow-wrap: anywhere; line-height: 1.15; }
  .wahl {
    display: grid; grid-template-columns: 2.2rem 1fr auto; align-items: center; gap: 0.5rem; text-align: left;
    min-height: 3.3rem; padding: 0.35rem 0.7rem 0.35rem 0.5rem; border-radius: 1rem;
    background: #fff; border: 2px solid var(--wool-line); box-shadow: 0 0.2rem 0 var(--wool-line);
    font-weight: 800; line-height: 1.15;
  }
  .wahl:active { transform: translateY(0.15rem); box-shadow: none; }
  .wahl .emoji { font-size: 1.7rem; text-align: center; }
  .wahl b { font-family: var(--f-display); font-size: 1.15rem; color: var(--pfand); white-space: nowrap; }
  .kein { display: flex; align-items: center; gap: 0.6rem; background: var(--wool-2); border-radius: 1rem; padding: 0.6rem 0.7rem; }
  .kein span { display: flex; flex-direction: column; gap: 0.15rem; }
  .kein b { font-family: var(--f-display); font-size: 1.2rem; line-height: 1.1; }
  .kein :global(.shrug) { animation: shrug 0.6s ease-in-out 2; flex: none; }
  .zaehler { margin-top: auto; border-radius: 1rem; background: var(--pfand); color: #fff; padding: 0.6rem 0.8rem; display: flex; flex-direction: column; }
  .zaehler small { color: #fff; opacity: 0.9; }
  .zaehler span { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .zaehler b { font-family: var(--f-display); font-size: 1.25rem; white-space: nowrap; }
  .zaehler .sum { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
  .zaehler.bump { animation: hop 0.35s ease-out; }
  @keyframes hop { 40% { transform: translateY(-0.3rem); } }
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
    /* Pfand: Auswahl und Zähler über die ganze Breite */
    .found > .frage-head, .found > .wahl, .found > .zaehler { grid-column: 1 / -1; }
    .plate { top: 2.6rem; font-size: 1.15rem; }
    .plus b { font-size: 1.6rem; }
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
