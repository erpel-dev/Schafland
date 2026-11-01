<script>
  import Sheep from "./Sheep.svelte";
  import { euro } from "../lib/money.js";
  import { settings } from "../lib/settings.svelte.js";
  import Deko from "./Deko.svelte";
  import { aktionById } from "../lib/aktionen.js";

  let { total, onDone } = $props();

  $effect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  });
</script>

<button class="party" onclick={onDone} aria-label="Weiter">
  <div class="msg">
    <b>Danke für deinen Einkauf!</b>
    <span>{euro(total)} · {aktionById(settings.value.aktion)?.thanksText ?? "Bis bald in Schafland"}</span>
  </div>
  <div class="runner"><Sheep size="9rem" class="run" /></div>
  <div class="grass"></div>
  <Deko aktion={settings.value.aktion} big />
</button>

<style>
  .party { position: fixed; inset: 0; width: 100%; border: 0; z-index: 30; background: linear-gradient(var(--sky), var(--sky-bottom) 70%); overflow: hidden; display: grid; place-items: center; }
  .msg { text-align: center; display: flex; flex-direction: column; gap: 0.4rem; animation: pop 0.4s ease-out; }
  .msg b { font-family: var(--f-display); font-size: 3.6rem; font-weight: 800; line-height: 1; color: var(--sky-ink); }
  .msg span { font-family: var(--f-display); font-size: 1.6rem; color: var(--sky-ink-soft); }
  .grass { position: absolute; left: 0; right: 0; bottom: 0; height: 6rem; background: var(--meadow);
    -webkit-mask: radial-gradient(circle at 1rem 0, transparent 1rem, #000 1.05rem) 0 0 / 2rem 100% repeat-x; }
  .runner { position: absolute; bottom: 4.5rem; left: 0; animation: run 3s linear forwards; z-index: 1; }
  /* das Schaf schaut nach links, also läuft es von rechts nach links */
  @keyframes run { from { transform: translateX(110vw); } to { transform: translateX(-12rem); } }
  .runner :global(.run) { animation: hop 0.3s ease-in-out infinite; }
  @keyframes hop { 50% { transform: translateY(-1rem); } }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }

  @media (max-width: 760px), (max-height: 500px) {
    .msg { padding: 0 1rem; }
    .msg b { font-size: clamp(2rem, 9vw, 3.2rem); }
    .msg span { font-size: clamp(1.1rem, 4.5vw, 1.5rem); }
    .runner :global(.run) { width: 6rem !important; height: 6rem !important; }
  }
</style>
