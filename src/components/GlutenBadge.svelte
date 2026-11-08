<script>
  // Kennzeichnung glutenhaltiger Produkte (Eltern-Bereich → Gescannte Produkte: an/aus)
  import { settings } from "../lib/settings.svelte.js";
  import { glutenOf, GLUTEN } from "../lib/gluten.js";

  // mode: "zeichen" (nur 🌾 bei Gluten/Spuren, für Kacheln und Korb) | "text" (immer, mit Wort, beim Scannen)
  let { product, mode = "zeichen" } = $props();
  let g = $derived(settings.value.glutenZeigen ? glutenOf(product) : undefined);
</script>

{#if mode === "text" && g !== undefined}
  <span class="gluten-text" class:enthalten={g === "enthalten"} class:spuren={g === "spuren"} class:frei={g === "frei"}>
    {g === "frei" ? "✓" : g ? "🌾" : "?"} {g ? GLUTEN[g].label : "Gluten: keine Angabe"}
  </span>
{:else if g === "enthalten" || g === "spuren"}
  <span class="gluten" class:spuren={g === "spuren"} title={GLUTEN[g].label} aria-label={GLUTEN[g].label} role="img">🌾</span>
{/if}

<style>
  .gluten {
    display: inline-grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%;
    background: #fff4d6; box-shadow: 0 0 0 0.12rem #e7b84a; font-size: 1rem; line-height: 1;
  }
  /* Spuren: blasser, gestrichelter Rand */
  .gluten.spuren { opacity: 0.75; box-shadow: none; outline: 0.12rem dashed #e7b84a; }
  .gluten-text { font-weight: 800; font-size: 0.95rem; color: var(--ink-soft); }
  .gluten-text.enthalten { color: #9a6700; }
  .gluten-text.spuren { color: #9a6700; }
  .gluten-text.frei { color: var(--grass-dark); }
</style>
