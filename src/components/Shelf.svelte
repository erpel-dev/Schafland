<script>
  import { categories, products, SCANNED } from "../lib/catalog.js";
  import { aktionById } from "../lib/aktionen.js";
  import { settings } from "../lib/settings.svelte.js";
  import { cart, scanned } from "../lib/shop.svelte.js";
  import { euro } from "../lib/money.js";
  import { pop } from "../lib/sounds.js";
  import ProductImage from "./ProductImage.svelte";

  let { onScan } = $props();

  let aktion = $derived(aktionById(settings.value.aktion));
  // Aktionsreiter ganz vorne, gescannte Produkte ganz hinten
  let tabs = $derived([...(aktion ? [aktion.category] : []), ...categories, ...(scanned.list.length ? [SCANNED] : [])]);
  // Bei aktiver Aktion startet das Regal im Aktionsreiter
  let active = $state(aktionById(settings.value.aktion)?.id ?? categories[0].id);
  $effect(() => {
    if (!tabs.some((t) => t.id === active)) active = tabs[0].id;
  });
  let shown = $derived(
    active === SCANNED.id ? scanned.list : aktion?.id === active ? aktion.products : products.filter((p) => p.categoryId === active),
  );

  function add(p) {
    pop();
    cart.add(p);
  }
</script>

<section class="shelf">
  <nav class="cats">
    {#each tabs as c (c.id)}
      <button class="cat" class:on={active === c.id} class:aktion={c.aktion} onclick={() => (active = c.id)}>
        <span class="emoji">{c.emoji}</span>{c.name}
      </button>
    {/each}
  </nav>

  <div class="grid">
    {#each shown as p (p.id)}
      {#key cart.lastId === p.id ? cart.lastTick : 0}
        <button class="tile" class:hit={cart.lastId === p.id} onclick={() => add(p)}>
          <ProductImage product={p} size="3.4rem" />
          <span class="nm">{p.name}</span>
          <span class="pr">{euro(p.priceCents)}</span>
        </button>
      {/key}
    {/each}
  </div>

  <button class="scanbar" onclick={onScan}>
    <span class="cam" aria-hidden="true"></span>
    <span><b>Scannen!</b><small>Halte einen Strichcode vor die Kamera</small></span>
  </button>
</section>

<style>
  .shelf {
    display: flex; flex-direction: column; gap: 0.8rem; min-width: 0; min-height: 0;
    padding: 1.3rem 1.1rem 1rem;
    background: linear-gradient(180deg, var(--wool), var(--wool-2));
  }
  .cats { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .cat {
    display: flex; gap: 0.35rem; align-items: center;
    padding: 0.5rem 0.8rem; border-radius: 99px;
    background: #fff; border: 2px solid var(--wool-line);
    font-weight: 800; font-size: 1rem;
  }
  .cat .emoji { font-size: 1.25rem; }
  .cat.on { background: var(--grass); border-color: var(--grass); color: #fff; }
  /* Aktionsreiter fällt auf: dunkler Nachthimmel, leuchtet wenn gewählt */
  .cat.aktion { background: var(--sky); border-color: var(--sky); color: var(--sky-ink); }
  .cat.aktion.on { box-shadow: 0 0 0 3px var(--sun); }

  .grid {
    flex: 1; min-height: 0; overflow-y: auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(8.2rem, 1fr)); gap: 0.75rem;
    align-content: start; padding: 0.35rem 0.25rem 0.5rem;
  }
  .tile {
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    background: #fff; border-radius: 1.4rem; padding: 0.7rem 0.4rem 0.55rem;
    box-shadow: 0 0.2rem 0 var(--wool-line);
    transition: transform 0.08s;
  }
  .tile:active { transform: scale(0.95); }
  .nm { font-weight: 800; font-size: 1rem; text-align: center; line-height: 1.15; }
  .pr { font-family: var(--f-display); font-weight: 800; font-size: 1.25rem; color: var(--grass-dark); }
  .tile.hit { outline: 0.25rem solid var(--sun); animation: hop 0.35s ease-out; }
  .tile.hit::after {
    content: "+1"; position: absolute; top: -0.5rem; right: -0.3rem;
    background: var(--sun); border-radius: 99px; padding: 0 0.55rem;
    font-family: var(--f-display); font-weight: 800; font-size: 1rem;
    animation: rise 0.6s ease-out;
  }
  @keyframes hop { 40% { transform: translateY(-0.4rem); } }
  @keyframes rise { from { transform: translateY(0.6rem); opacity: 0; } }

  .scanbar {
    display: flex; align-items: center; gap: 0.9rem; text-align: left;
    background: #fff; border: 2px dashed #cfc8b5; border-radius: 1.2rem; padding: 0.55rem 0.8rem;
  }
  .scanbar b { font-family: var(--f-display); font-size: 1.3rem; display: block; line-height: 1.1; }
  .scanbar small { color: var(--ink-soft); }
  .cam { width: 5.5rem; height: 3.2rem; border-radius: 0.6rem; background: #3a3f36; position: relative; overflow: hidden; flex: none; }
  .cam::after {
    content: ""; position: absolute; inset: 0.8rem 1rem;
    background: repeating-linear-gradient(90deg, #eee 0 2px, transparent 2px 4px, #eee 4px 5px, transparent 5px 8px); opacity: 0.7;
  }
  .cam::before {
    content: ""; position: absolute; left: 0.5rem; right: 0.5rem; top: 50%; height: 2px; z-index: 1;
    background: #ff5b6e; box-shadow: 0 0 6px #ff5b6e;
    animation: laser 1.6s ease-in-out infinite;
  }
  @keyframes laser { 50% { transform: translateY(-0.7rem); } }
</style>
