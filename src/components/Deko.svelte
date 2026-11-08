<script>
  // Himmels-Deko der aktiven Aktion (Kopfzeile, Start, Danke)
  import Bats from "./Bats.svelte";
  import Snow from "./Snow.svelte";
  import Kran from "./Kran.svelte";
  let { aktion, big = false } = $props();
</script>

{#if aktion === "halloween"}
  <Bats {big} />
{:else if aktion === "weihnachten"}
  <Snow {big} />
{:else if aktion === "baustelle"}
  <Kran {big} />
{/if}
