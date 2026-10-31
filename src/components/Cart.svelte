<script>
  import { cart } from "../lib/shop.svelte.js";
  import { euro, amount } from "../lib/money.js";
  import { pop } from "../lib/sounds.js";
  import ProductImage from "./ProductImage.svelte";
  import Sheep from "./Sheep.svelte";

  let { onPay } = $props();

  // "Korb leeren" braucht zwei Berührungen
  let confirmClear = $state(false);
  let clearTimer;
  function clearTap() {
    if (confirmClear) {
      cart.clear();
      confirmClear = false;
      return;
    }
    confirmClear = true;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => (confirmClear = false), 3000);
  }

  function change(id, d) {
    pop();
    cart.change(id, d);
  }
</script>

<aside class="cart">
  <h2>
    Einkaufskorb
    <span>{cart.count === 1 ? "1 Sache" : `${cart.count} Sachen`}</span>
  </h2>

  <div class="lines">
    {#each cart.lines as l (l.product.id)}
      <div class="ln" class:new={l.product.id === cart.lastId}>
        <ProductImage product={l.product} size="1.9rem" />
        <span class="nm"><span class="name">{l.product.name}</span><small>{euro(l.product.priceCents)}</small></span>
        <span class="qty">
          <button onclick={() => change(l.product.id, -1)} aria-label="Eins weniger">−</button>
          <b>{l.qty}</b>
          <button onclick={() => change(l.product.id, 1)} aria-label="Eins mehr">+</button>
        </span>
        <span class="sum">{amount(l.qty * l.product.priceCents)}</span>
      </div>
    {:else}
      <div class="empty">
        <Sheep size="6rem" />
        <p>Der Korb ist leer.<br />Tippe auf etwas Leckeres!</p>
      </div>
    {/each}
  </div>

  {#if cart.lines.length}
    <button class="clear" class:confirm={confirmClear} onclick={clearTap}>
      {confirmClear ? "Wirklich alles raus? Nochmal tippen" : "Korb leeren"}
    </button>
  {/if}

  <div class="total">
    <span>Zusammen</span>
    <b>{euro(cart.totalCents)}</b>
  </div>
  <button class="big-btn pay" disabled={!cart.lines.length} onclick={onPay}>Bezahlen</button>
</aside>

<style>
  .cart {
    display: flex; flex-direction: column; min-height: 0;
    background: #fff; border-left: 2px solid var(--wool-line);
    padding: 1.2rem 0.8rem 0.8rem;
  }
  h2 {
    margin: 0 0.3rem 0.5rem; font-family: var(--f-display); font-size: 1.6rem;
    display: flex; justify-content: space-between; align-items: baseline;
  }
  h2 span { font-family: var(--f-body); font-size: 0.95rem; color: var(--ink-soft); }
  .lines { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; }
  .ln {
    display: grid; grid-template-columns: 2.2rem 1fr auto 3.4rem; gap: 0.5rem; align-items: center;
    background: var(--wool); border-radius: 0.9rem; padding: 0.4rem 0.55rem;
  }
  .ln.new { background: #fff3c4; }
  .nm { font-weight: 800; min-width: 0; }
  /* lange Namen zweizeilig, getrennt an weichen Trennzeichen (Laugen-brötchen) */
  .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.15; hyphens: manual; overflow-wrap: anywhere; }
  .nm small { display: block; color: var(--ink-soft); font-weight: 600; font-size: 0.85rem; }
  .qty { display: flex; align-items: center; gap: 0.3rem; }
  .qty button {
    width: 2.1rem; height: 2.1rem; border-radius: 50%; background: #fff; border: 2px solid var(--wool-line);
    font-weight: 800; font-size: 1.2rem; line-height: 1;
  }
  .qty b { min-width: 1.2rem; text-align: center; font-size: 1.1rem; }
  .sum { font-family: var(--f-display); font-weight: 700; font-size: 1.15rem; text-align: right; font-variant-numeric: tabular-nums; }
  .empty { margin: auto; text-align: center; color: var(--ink-soft); display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .empty p { margin: 0; font-size: 1.05rem; }
  .clear { align-self: flex-end; margin: 0.4rem 0.2rem 0; color: var(--ink-soft); font-size: 0.9rem; padding: 0.3rem 0.6rem; border-radius: 0.6rem; }
  .clear.confirm { background: var(--danger); color: #fff; }
  .total {
    margin-top: 0.5rem; padding: 0.6rem 0.9rem; border-radius: 1rem; background: var(--wool-2);
    display: flex; justify-content: space-between; align-items: baseline;
  }
  .total span { font-weight: 800; color: var(--ink-soft); }
  .total b { font-family: var(--f-display); font-size: 2.5rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .pay { margin-top: 0.7rem; font-size: 1.7rem; padding: 0.7rem; }
</style>
