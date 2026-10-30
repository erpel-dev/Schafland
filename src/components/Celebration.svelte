<script>
  import Sheep from "./Sheep.svelte";
  import { euro } from "../lib/money.js";

  let { total, onDone } = $props();

  $effect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  });
</script>

<button class="party" onclick={onDone} aria-label="Weiter">
  <div class="msg">
    <b>Danke für deinen Einkauf!</b>
    <span>{euro(total)} · Bis bald in Schafland</span>
  </div>
  <div class="runner"><Sheep size="9rem" class="run" /></div>
  <div class="grass"></div>
</button>

<style>
  .party { position: fixed; inset: 0; width: 100%; border: 0; z-index: 30; background: linear-gradient(var(--sky), #e9f5fc 70%); overflow: hidden; display: grid; place-items: center; }
  .msg { text-align: center; display: flex; flex-direction: column; gap: 0.4rem; animation: pop 0.4s ease-out; }
  .msg b { font-family: var(--f-display); font-size: 3.6rem; font-weight: 800; line-height: 1; }
  .msg span { font-family: var(--f-display); font-size: 1.6rem; color: var(--ink-soft); }
  .grass { position: absolute; left: 0; right: 0; bottom: 0; height: 6rem; background: var(--grass);
    -webkit-mask: radial-gradient(circle at 1rem 0, transparent 1rem, #000 1.05rem) 0 0 / 2rem 100% repeat-x; }
  .runner { position: absolute; bottom: 4.5rem; left: 0; animation: run 3s linear forwards; z-index: 1; }
  /* das Schaf schaut nach links, also läuft es von rechts nach links */
  @keyframes run { from { transform: translateX(110vw); } to { transform: translateX(-12rem); } }
  .runner :global(.run) { animation: hop 0.3s ease-in-out infinite; }
  @keyframes hop { 50% { transform: translateY(-1rem); } }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
</style>
