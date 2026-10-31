<script>
  import Sheep from "./Sheep.svelte";
  import Deko from "./Deko.svelte";
  import { settings } from "../lib/settings.svelte.js";
  import { aktionById } from "../lib/aktionen.js";
  let aktion = $derived(aktionById(settings.value.aktion));
  let { onOpen } = $props();
</script>

<div class="start">
  <div class="hero">
    <Sheep size="13rem" class="bob" />
    <h1>Schafland</h1>
    <p>Hier bin ich Schaf, hier kauf ich ein</p>
  </div>
  {#if aktion}
    <Deko aktion={aktion.id} big />
    <p class="aktion"><span class="emoji">{aktion.emoji}</span> {aktion.startText} <span class="emoji">{aktion.emoji}</span></p>
  {/if}
  <button class="big-btn open" onclick={onOpen}>Laden öffnen</button>
  <div class="grass"></div>
  {#if aktion}
    <div class="ground" aria-hidden="true">
      {#each aktion.ground as g, i (i)}<span class="emoji">{g}</span>{/each}
    </div>
  {/if}
</div>

<style>
  .start { position: fixed; inset: 0; background: linear-gradient(var(--sky), var(--sky-bottom) 75%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; overflow: hidden; }
  .hero { text-align: center; display: flex; flex-direction: column; align-items: center; }
  h1 { margin: 0; font-family: var(--f-display); font-weight: 800; font-size: 6rem; line-height: 0.9; color: var(--sky-ink); }
  p { margin: 0.4rem 0 0; font-family: var(--f-display); font-size: 1.9rem; color: var(--sky-ink-soft); }
  .open { font-size: 2.2rem; padding: 1rem 3rem; border-radius: 1.6rem; z-index: 1; }
  .grass { position: absolute; left: 0; right: 0; bottom: 0; height: 5rem; background: var(--meadow);
    -webkit-mask: radial-gradient(circle at 1rem 0, transparent 1rem, #000 1.05rem) 0 0 / 2rem 100% repeat-x; }
  .hero :global(.bob) { animation: bob 3s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(-0.5rem) rotate(-3deg); } }
  .aktion { font-size: 1.6rem; color: var(--sun); margin-top: -1rem; }
  .ground { position: absolute; bottom: 2.6rem; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 8%; font-size: 4.5rem; pointer-events: none; }
  .ground span:nth-child(2) { font-size: 3.2rem; align-self: flex-end; }
</style>
