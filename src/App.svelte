<script>
  import TopBar from "./components/TopBar.svelte";
  import Shelf from "./components/Shelf.svelte";
  import Cart from "./components/Cart.svelte";
  import ScanView from "./components/ScanView.svelte";
  import PayModal from "./components/PayModal.svelte";
  import Celebration from "./components/Celebration.svelte";
  import Settings from "./components/Settings.svelte";
  import StartScreen from "./components/StartScreen.svelte";
  import { cart } from "./lib/shop.svelte.js";
  import { music } from "./lib/music.svelte.js";
  import { settings } from "./lib/settings.svelte.js";
  import { unlockAudio, kaching, maeh } from "./lib/sounds.js";

  let opened = $state(false);
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
    document.documentElement.requestFullscreen?.().catch(() => {});
    await music.regainPermission();
    if (settings.value.musicAutoplay && music.tracks.length) music.play();
  }

  async function paid(method) {
    const total = cart.totalCents;
    await cart.checkout(method);
    paying = false;
    view = "shop";
    celebrate = total;
    kaching();
    setTimeout(maeh, 450);
  }

  function onKey(e) {
    // Strg + , öffnet den Eltern-Bereich auch mit der Tastatur
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      showSettings = true;
    }
    if (e.key === "Escape") paying = false;
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
    <TopBar onOpenSettings={() => (showSettings = true)} />
    <main>
      {#if view === "scan"}
        <ScanView onClose={() => (view = "shop")} />
      {:else}
        <Shelf onScan={() => (view = "scan")} />
      {/if}
      <Cart onPay={() => (paying = true)} />
    </main>
  </div>

  {#if paying}
    <PayModal onClose={() => (paying = false)} onPaid={paid} />
  {/if}
  {#if celebrate !== null}
    <Celebration total={celebrate} onDone={() => (celebrate = null)} />
  {/if}
{/if}

<style>
  .app { height: 100%; display: flex; flex-direction: column; }
  main { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 23rem; }
</style>
