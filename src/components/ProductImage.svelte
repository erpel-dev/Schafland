<script>
  let { product, size = "3rem" } = $props();

  let blobUrl = $state(null);
  let failed = $state(false);

  $effect(() => {
    if (!product.imageBlob) return;
    const url = URL.createObjectURL(product.imageBlob);
    blobUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  // Eigene Bilder (z. B. Brötchensorten) kommen mit der App und gehen auch offline
  let src = $derived(product.icon ?? blobUrl ?? (navigator.onLine ? product.imageUrl : null));
</script>

{#if src && !failed}
  <img {src} alt="" class:icon={!!product.icon} style:width={size} style:height={size} onerror={() => (failed = true)} draggable="false" />
{:else}
  <span class="emoji" style:font-size={size}>{product.emoji}</span>
{/if}

<style>
  img { object-fit: contain; border-radius: 0.5rem; background: #fff; }
  img.icon { background: none; border-radius: 0; }
</style>
