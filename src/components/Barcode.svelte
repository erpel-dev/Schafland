<script>
  import JsBarcode from "jsbarcode";
  let { value } = $props();
  let svg;
  $effect(() => {
    JsBarcode(svg, value, { format: "EAN13", width: 2.4, height: 70, fontSize: 18, margin: 6, font: "monospace" });
  });
</script>

<svg bind:this={svg}></svg>
