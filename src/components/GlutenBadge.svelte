<script>
  // Kennzeichnung glutenhaltiger Produkte (Eltern-Bereich → Gescannte Produkte: an/aus)
  import { settings } from "../lib/settings.svelte.js";
  import { glutenOf, GLUTEN } from "../lib/gluten.js";

  // mode: "zeichen" (nur 🌾 bei Gluten/Spuren, für Kacheln und Korb) | "text" (immer, mit Wort, beim Scannen)
  let { product, mode = "zeichen", klein = false } = $props();
  let g = $derived(settings.value.glutenZeigen ? glutenOf(product) : undefined);
</script>

{#if mode === "text" && g !== undefined}
  <span class="gluten-text" class:enthalten={g === "enthalten" || g === "wahrscheinlich"} class:spuren={g === "spuren"} class:frei={g === "frei"} class:ohne={g === "ohne"}>
    {g === "frei" || g === "ohne" ? "✓" : g ? "🌾" : "?"} {g ? GLUTEN[g].label : "Gluten: keine Angabe"}
  </span>
{:else if g === "enthalten" || g === "wahrscheinlich" || g === "spuren"}
  <span class="gluten" class:klein class:spuren={g === "spuren"} class:wahrscheinlich={g === "wahrscheinlich"} title={GLUTEN[g].label} aria-label={GLUTEN[g].label} role="img">🌾</span>
{/if}

<style>
  .gluten {
    display: inline-grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%;
    background: #fff4d6; box-shadow: 0 0 0 0.12rem #e7b84a; font-size: 1rem; line-height: 1;
  }
  .gluten.klein { width: 1.15rem; height: 1.15rem; font-size: 0.72rem; vertical-align: -0.2rem; margin-left: 0.15rem; }
  /* Spuren: blasser, gestrichelter Rand */
  .gluten.spuren { opacity: 0.75; box-shadow: none; outline: 0.12rem dashed #e7b84a; }
  /* nur geschätzt: etwas blasser, Rand durchgezogen */
  .gluten.wahrscheinlich { opacity: 0.8; }
  .gluten-text { font-weight: 800; font-size: 0.95rem; color: var(--ink-soft); }
  .gluten-text.enthalten { color: #9a6700; }
  .gluten-text.spuren { color: #9a6700; }
  .gluten-text.frei { color: var(--grass-dark); }
  .gluten-text.ohne { color: var(--grass-dark); font-weight: 700; }
</style>
