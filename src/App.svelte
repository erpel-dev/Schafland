<script>
  import TopBar from "./components/TopBar.svelte";
  import Shelf from "./components/Shelf.svelte";
  import Cart from "./components/Cart.svelte";
  import ScanView from "./components/ScanView.svelte";
  import PayModal from "./components/PayModal.svelte";
  import Celebration from "./components/Celebration.svelte";
  import Settings from "./components/Settings.svelte";
  import StartScreen from "./components/StartScreen.svelte";
  import FragDasSchaf from "./components/FragDasSchaf.svelte";
  import { schaf } from "./lib/sprache/schaf.svelte.js";
  import { cart } from "./lib/shop.svelte.js";
  import { music } from "./lib/music.svelte.js";
  import { settings } from "./lib/settings.svelte.js";
  import { unlockAudio, kaching, maeh } from "./lib/sounds.js";
  import { update } from "./lib/update.svelte.js";
  import { isNativeApp } from "./lib/platform.js";
  import { layout } from "./lib/layout.svelte.js";
  import { onMount } from "svelte";

  let opened = $state(false);

  // Neue Version: auf dem Startbildschirm sofort laden, mitten im Spiel erst nach dem Bezahlen
  $effect(() => {
    if (update.ready && !opened) update.apply();
  });

  // Aktive Aktion steuert das Farbschema (siehe app.css)
  $effect(() => {
    const id = settings.value.aktion;
    if (id) document.documentElement.dataset.aktion = id;
    else delete document.documentElement.dataset.aktion;
  });
  let view = $state("shop"); // shop | scan
  let paying = $state(false);
  let celebrate = $state(null); // Betrag in Cent
  let showSettings = $state(false);

  // Bildschirm soll beim Spielen nicht dunkel werden
  let wakeLock = null;
  async function keepAwake() {
    try {
      if (!wakeLock && document.visibilityState === "visible") {
        wakeLock = await navigator.wakeLock?.request("screen");
        wakeLock?.addEventListener("release", () => (wakeLock = null));
      }
    } catch {
      // nicht unterstützt oder abgelehnt: dann greifen die Energieeinstellungen
    }
  }

  async function open() {
    unlockAudio();
    opened = true;
    keepAwake();
    // In der APK sorgt Android für das Vollbild
    if (!isNativeApp) document.documentElement.requestFullscreen?.().catch(() => {});
    await music.regainPermission();
    if (settings.value.musicAutoplay && music.tracks.length) music.play();
  }

  // Schnelles Mehrfach-Tippen auf "Bezahlt!" darf nur einen Kassenbon ergeben
  let checkingOut = false;
  async function paid(method) {
    if (checkingOut || !cart.lines.length) return;
    checkingOut = true;
    const total = cart.totalCents;
    try {
      await cart.checkout(method);
    } finally {
      checkingOut = false;
    }
    paying = false;
    view = "shop";
    celebrate = total;
    kaching();
    setTimeout(maeh, 450);
  }

  // Android-Zurück-Taste: eine Ebene zurück, aber nie die App verlassen (Kind tippt gern darauf).
  // Beenden geht nur im Eltern-Bereich.
  onMount(() => {
    if (!isNativeApp) return;
    let listener;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          if (schaf.phase !== "idle") schaf.close();
          else if (celebrate !== null) celebrate = null;
          else if (paying) paying = false;
          else if (showSettings) showSettings = false;
          else if (view === "scan") view = "shop";
        }),
      )
      .then((l) => (listener = l))
      .catch((err) => console.warn("Zurück-Taste nicht verfügbar", err));
    return () => listener?.remove();
  });

  function openSettings() {
    paying = false;
    schaf.close();
    showSettings = true;
  }

  function onKey(e) {
    // Strg + , öffnet den Eltern-Bereich auch mit der Tastatur
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      openSettings();
    }
    if (e.key === "Escape") {
      paying = false;
      schaf.close();
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  oncontextmenu={(e) => !e.target.closest?.("input, textarea") && e.preventDefault()}
/>
<svelte:document onvisibilitychange={() => opened && keepAwake()} />

{#if !opened}
  <StartScreen onOpen={open} />
{:else if showSettings}
  <Settings onClose={() => (showSettings = false)} />
{:else}
  <div class="app">
    <TopBar onOpenSettings={openSettings} />
    <main class:narrow={layout.narrow}>
      {#if view === "scan"}
        <ScanView onClose={() => (view = "shop")} />
      {:else}
        <Shelf onScan={() => (view = "scan")} />
      {/if}
      <Cart onPay={() => { schaf.close(); paying = true; }} compact={layout.narrow} />
    </main>
  </div>

  <FragDasSchaf />
  {#if paying}
    <PayModal onClose={() => (paying = false)} onPaid={paid} />
  {/if}
  {#if celebrate !== null}
    <Celebration
      total={celebrate}
      onDone={() => {
        celebrate = null;
        update.apply();
      }}
    />
  {/if}
{/if}

<style>
  .app { height: 100%; display: flex; flex-direction: column; }
  main { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 23rem; }
  /* Handy hochkant: Regal über die ganze Breite, der Korb ist eine Leiste unten (Platz dafür freihalten) */
  main.narrow { grid-template-columns: 1fr; padding-bottom: calc(4.6rem + env(safe-area-inset-bottom, 0px)); }
  /* Handy quer: schmalerer Korb */
  @media (max-height: 500px) and (min-width: 761px) {
    main { grid-template-columns: 1fr 20.5rem; }
  }
</style>
