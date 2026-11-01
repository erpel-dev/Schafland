<script>
  import Sheep from "./Sheep.svelte";
  import { music } from "../lib/music.svelte.js";
  import { settings } from "../lib/settings.svelte.js";
  import Deko from "./Deko.svelte";

  let { onOpenSettings } = $props();

  // 2 Sekunden auf das Schaf drücken öffnet den Eltern-Bereich
  let pressTimer;
  let pressing = $state(false);
  function pressStart() {
    pressing = true;
    pressTimer = setTimeout(() => {
      pressing = false;
      onOpenSettings();
    }, 2000);
  }
  function pressEnd() {
    pressing = false;
    clearTimeout(pressTimer);
  }
</script>

<header>
  <div
    class="brand"
    class:pressing
    role="button"
    tabindex="-1"
    aria-label="Lange drücken für den Eltern-Bereich"
    onpointerdown={pressStart}
    onpointerup={pressEnd}
    onpointerleave={pressEnd}
    onpointercancel={pressEnd}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <Sheep size="3.3rem" class="logo" />
    <div>
      <b>Schafland</b>
      <small>Hier bin ich Schaf, hier kauf ich ein</small>
    </div>
  </div>

  <Deko aktion={settings.value.aktion} />
  <div class="spacer"></div>

  {#if music.tracks.length}
    <div class="music">
      <button class="round" onclick={() => music.toggle()} aria-label={music.playing ? "Musik anhalten" : "Musik abspielen"}>
        <span class="emoji">{music.playing ? "⏸️" : "🎵"}</span>
      </button>
      <span class="title">{music.playing || music.index >= 0 ? music.current?.title : "Musik"}</span>
      <button class="round" onclick={() => music.next()} aria-label="Nächstes Lied"><span class="emoji">⏭️</span></button>
    </div>
  {/if}
</header>

<style>
  header {
    height: 4.4rem; flex: none;
    display: flex; align-items: center; gap: 1rem;
    padding: 0 1.1rem;
    background: var(--sky);
    position: relative;
  }
  header::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -0.7rem; height: 0.7rem; z-index: 2;
    background: radial-gradient(circle at 0.7rem 0, var(--sky) 0.7rem, transparent 0.72rem) 0 0 / 1.4rem 0.7rem repeat-x;
    pointer-events: none;
  }
  .brand { display: flex; align-items: center; gap: 0.6rem; cursor: default; touch-action: none; }
  .brand :global(.logo) { transition: transform 2s linear; }
  .brand.pressing :global(.logo) { transform: rotate(360deg) scale(1.15); }
  b { font-family: var(--f-display); font-weight: 800; font-size: 2rem; line-height: 0.9; display: block; color: var(--sky-ink); }
  small { font-family: var(--f-display); font-weight: 500; font-size: 0.95rem; color: var(--sky-ink-soft); }
  .spacer { flex: 1; }
  .music {
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--wool); border-radius: 99px; padding: 0.3rem;
    max-width: 22rem;
  }
  .title { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .round {
    width: 2.8rem; height: 2.8rem; border-radius: 50%; flex: none;
    display: grid; place-items: center; font-size: 1.3rem; background: #fff;
  }

  /* Handy: kompakte Kopfzeile, Musik nur als Knöpfe */
  @media (max-width: 760px), (max-height: 500px) {
    header { height: 3.6rem; padding: 0 0.7rem; gap: 0.5rem; }
    .brand :global(.logo) { width: 2.6rem !important; height: 2.6rem !important; }
    b { font-size: 1.6rem; }
    small { font-size: 0.8rem; }
    .music .title { display: none; }
    .round { width: 2.5rem; height: 2.5rem; }
  }
  @media (max-width: 420px) {
    small { display: none; }
  }
</style>
