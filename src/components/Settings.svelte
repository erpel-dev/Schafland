<script>
  import { settings } from "../lib/settings.svelte.js";
  import { music, mmss, canPickFolder } from "../lib/music.svelte.js";
  import { scanned } from "../lib/shop.svelte.js";
  import { scanLog } from "../lib/scanlog.svelte.js";
  import { categoryById } from "../lib/catalog.js";
  import { db } from "../lib/db.js";
  import { euro } from "../lib/money.js";
  import Sheep from "./Sheep.svelte";
  import Toggle from "./Toggle.svelte";
  import QrCode from "./QrCode.svelte";
  import LabelSheet from "./LabelSheet.svelte";
  import ProductImage from "./ProductImage.svelte";

  let { onClose, initialTab = "bezahlen" } = $props();

  const TABS = [
    ["bezahlen", "Bezahlen"],
    ["musik", "Musik"],
    ["etiketten", "Etiketten drucken"],
    ["gescannt", "Gescannte Produkte"],
    ["bons", "Kassenbons"],
    ["protokoll", "Scan-Protokoll"],
  ];
  let tab = $state(initialTab);

  // --- Bezahlen
  let paypalName = $state(settings.value.paypalName);
  let nameOk = $derived(/^[A-Za-z0-9]{1,20}$/.test(paypalName));
  function savePaypalName() {
    paypalName = paypalName.trim().replace(/^.*paypal\.me\//i, "").replace(/\/.*$/, "");
    settings.set({ paypalName });
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
  const PAY = { "spiel-qr": "Schaf-Code", paypal: "PayPal" };
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

      {:else if tab === "musik"}
        <h2>Musik</h2>
        <div class="field">
          <span class="lbl">Musik-Ordner</span>
          <div class="stack">
            <div class="row">
              <span class="path">{music.folderName || "Noch kein Ordner gewählt"}</span>
              {#if canPickFolder}
                <button class="big-btn light small" onclick={pick}>Ordner wählen …</button>
              {:else}
                <label class="big-btn light small">Ordner wählen …<input id="music-files" type="file" webkitdirectory multiple hidden onchange={(e) => music.useFiles(e.currentTarget.files)} /></label>
              {/if}
            </div>
            {#if music.needsPermission}
              <button class="big-btn small" onclick={() => music.regainPermission()}>Zugriff auf „{music.folderName}“ erlauben</button>
            {/if}
            {#if !canPickFolder}<span class="muted">Dieser Browser merkt sich den Ordner nicht. Mit Chrome oder Chromium bleibt er gespeichert.</span>{/if}
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
            {#each music.tracks as t, i (t.path)}
              <button class:on={i === music.index} onclick={() => music.play(i)}>
                <span>{i === music.index ? "▶ " : ""}{t.title}</span><small>{t.path}</small>
              </button>
            {/each}
          </div>
        {/if}

      {:else if tab === "etiketten"}
        <h2 class="noprint">Etiketten drucken</h2>
        <LabelSheet />

      {:else if tab === "gescannt"}
        <h2>Gescannte Produkte</h2>
        <p class="muted">Alles, was schon einmal gescannt wurde. Name und Preis lassen sich hier ändern, z. B. „Zeitschrift“ in „c't“. Beim nächsten Scan zeigt die Kasse den neuen Namen.</p>
        {#each scanned.list as p (p.id)}
          <div class="prod">
            <ProductImage product={p} size="3rem" />
            <div class="info">
              <input class="name" id={`name-${p.id}`} value={p.name} aria-label="Name" onchange={(e) => setName(p, e.currentTarget)} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <small>{p.ean} · {categoryById(p.categoryId).name} · {p.source}{p.brand ? ` · ${p.brand}` : ""}</small>
            </div>
            <label class="price">
              <input id={`price-${p.id}`} inputmode="decimal" value={priceText(p.priceCents)} onchange={(e) => setPrice(p, e.currentTarget)} /> €
            </label>
            <button class="del" onclick={() => scanned.remove(p.id)} aria-label="Entfernen">✕</button>
          </div>
        {:else}
          <p class="muted">Noch nichts gescannt.</p>
        {/each}

      {:else if tab === "protokoll"}
        <h2>Scan-Protokoll</h2>
        <p class="muted">Die letzten {scanLog.entries.length} Scans mit den Antworten der Datenbanken. Hilft herauszufinden, warum etwas nicht erkannt wurde.</p>
        {#each scanLog.entries as e (e.at + e.code)}
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
  .tracks button { display: flex; justify-content: space-between; gap: 1rem; text-align: left; padding: 0.4rem 0.7rem; border-radius: 0.6rem; }
  .tracks button.on { background: #f0f8ea; font-weight: 800; }
  .tracks small { color: var(--ink-soft); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .prod { display: grid; grid-template-columns: 3.4rem 1fr auto auto; gap: 0.8rem; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--wool-line); }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .info small { color: var(--ink-soft); font-family: monospace; }
  .info .name { font-weight: 800; border: 2px solid transparent; border-radius: 0.5rem; padding: 0.15rem 0.4rem; margin-left: -0.4rem; background: transparent; width: 100%; }
  .info .name:hover, .info .name:focus { border-color: var(--wool-line); background: var(--wool); outline: none; }
  .price input { width: 5rem; text-align: right; border: 2px solid var(--wool-line); border-radius: 0.6rem; padding: 0.3rem 0.5rem; font-weight: 800; }
  .del { width: 2.2rem; height: 2.2rem; border-radius: 50%; background: var(--wool-2); font-weight: 800; }
  .log { padding: 0.5rem 0.8rem; border-radius: 0.8rem; background: #fff6d6; display: flex; flex-direction: column; gap: 0.15rem; }
  .log.ok { background: #f0f8ea; }
  .loghead { display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
  .loghead code { font-size: 0.9rem; }
  .log small { color: var(--ink-soft); }
  .bon { padding: 0.6rem 0.8rem; background: var(--wool); border-radius: 0.8rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .bonhead { display: flex; gap: 0.8rem; align-items: baseline; }
  .bonhead b { font-family: var(--f-display); font-size: 1.3rem; }
  .bon small { color: var(--ink-soft); }

  @media print {
    .noprint { display: none !important; }
    .settings, .body, .pane { display: block; height: auto; overflow: visible; padding: 0; }
  }
</style>
