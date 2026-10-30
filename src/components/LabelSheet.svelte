<script>
  import { categories, products } from "../lib/catalog.js";
  import { euro } from "../lib/money.js";
  import Barcode from "./Barcode.svelte";

  let picked = $state(new Set(categories.map((c) => c.id)));
  let withPrice = $state(true);
  let shown = $derived(products.filter((p) => picked.has(p.categoryId)));

  function toggle(id) {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    picked = next;
  }
</script>

<div class="tools noprint">
  <div class="chips">
    {#each categories as c (c.id)}
      <button class="chip" class:on={picked.has(c.id)} onclick={() => toggle(c.id)}><span class="emoji">{c.emoji}</span> {c.name}</button>
    {/each}
  </div>
  <label class="check"><input id="label-price" type="checkbox" bind:checked={withPrice} /> Preis aufdrucken</label>
  <button class="big-btn" onclick={() => window.print()} disabled={!shown.length}>🖨 {shown.length} Etiketten drucken</button>
</div>
<p class="note noprint">
  Ausschneiden und auf das Spielzeug kleben. Die Codes beginnen mit 21 und sind nur für Schafland gedacht. Groß gedruckt erkennt die Webcam sie am besten.
</p>

<div class="sheet">
  {#each shown as p (p.id)}
    <div class="label">
      <div class="head"><span class="emoji">{p.emoji}</span><b>{p.name}</b>{#if withPrice}<span class="pr">{euro(p.priceCents)}</span>{/if}</div>
      <Barcode value={p.ean} />
    </div>
  {/each}
</div>

<style>
  .tools { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; flex: 1; }
  .chip { padding: 0.35rem 0.8rem; border-radius: 99px; background: #fff; border: 2px solid var(--wool-line); font-weight: 800; }
  .chip.on { background: var(--grass); border-color: var(--grass); color: #fff; }
  .check { display: flex; gap: 0.4rem; align-items: center; font-weight: 700; }
  .check input { width: 1.2rem; height: 1.2rem; accent-color: var(--grass); }
  .note { margin: 0; color: var(--ink-soft); font-size: 0.95rem; }
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.6rem; }
  .label { border: 2px dashed #cfc8b5; border-radius: 0.8rem; padding: 0.5rem 0.6rem 0.2rem; background: #fff; display: flex; flex-direction: column; align-items: center; break-inside: avoid; }
  .head { display: flex; align-items: center; gap: 0.4rem; width: 100%; font-size: 1.1rem; }
  .head .emoji { font-size: 1.6rem; }
  .head b { flex: 1; font-family: var(--f-display); }
  .pr { font-family: var(--f-display); font-weight: 800; color: var(--grass-dark); }
  .label :global(svg) { width: 100%; height: auto; }

  @media print {
    .sheet { grid-template-columns: repeat(3, 1fr); gap: 4mm; }
    .label { border-color: #999; border-radius: 3mm; padding: 2mm 3mm 0; }
    .head { font-size: 12pt; }
  }
</style>
