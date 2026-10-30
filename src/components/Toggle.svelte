<script>
  let { checked = $bindable(false), id, label, onchange } = $props();
</script>

<button {id} class="toggle" class:on={checked} role="switch" aria-checked={checked} aria-label={label}
  onclick={() => { checked = !checked; onchange?.(checked); }}></button>

<style>
  .toggle { width: 3.2rem; height: 1.8rem; border-radius: 99px; background: #cfc8b5; position: relative; transition: background 0.15s; flex: none; }
  .toggle::after { content: ""; position: absolute; left: 0.2rem; top: 0.2rem; width: 1.4rem; height: 1.4rem; border-radius: 50%; background: #fff; transition: transform 0.15s; }
  .toggle.on { background: var(--grass); }
  .toggle.on::after { transform: translateX(1.4rem); }
</style>
