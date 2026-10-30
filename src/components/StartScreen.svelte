<script>
  import Sheep from "./Sheep.svelte";
  let { onOpen } = $props();
</script>

<div class="start">
  <div class="hero">
    <Sheep size="13rem" class="bob" />
    <h1>Schafland</h1>
    <p>Hier bin ich Schaf, hier kauf ich ein</p>
  </div>
  <button class="big-btn open" onclick={onOpen}>Laden öffnen</button>
  <div class="grass"></div>
</div>

<style>
  .start { position: fixed; inset: 0; background: linear-gradient(var(--sky), #eaf6fd 75%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; overflow: hidden; }
  .hero { text-align: center; display: flex; flex-direction: column; align-items: center; }
  h1 { margin: 0; font-family: var(--f-display); font-weight: 800; font-size: 6rem; line-height: 0.9; }
  p { margin: 0.4rem 0 0; font-family: var(--f-display); font-size: 1.9rem; color: var(--ink-soft); }
  .open { font-size: 2.2rem; padding: 1rem 3rem; border-radius: 1.6rem; z-index: 1; }
  .grass { position: absolute; left: 0; right: 0; bottom: 0; height: 5rem; background: var(--grass);
    -webkit-mask: radial-gradient(circle at 1rem 0, transparent 1rem, #000 1.05rem) 0 0 / 2rem 100% repeat-x; }
  .hero :global(.bob) { animation: bob 3s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(-0.5rem) rotate(-3deg); } }
</style>
