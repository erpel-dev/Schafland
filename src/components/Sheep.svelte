<script>
  import { settings } from "../lib/settings.svelte.js";
  let { size = "3rem", class: cls = "" } = $props();
  let costume = $derived(settings.value.aktion);
</script>

<svg class={cls} style:width={size} style:height={size} viewBox="0 0 110 110" aria-hidden="true">
  <g fill="#fffdf7" stroke="#d9d2bf" stroke-width="2">
    <circle cx="38" cy="58" r="18" /><circle cx="58" cy="46" r="20" /><circle cx="80" cy="50" r="18" />
    <circle cx="90" cy="68" r="16" /><circle cx="70" cy="78" r="18" /><circle cx="46" cy="78" r="17" />
    <circle cx="60" cy="64" r="22" stroke="none" />
  </g>
  <rect class="leg l1" x="44" y="88" width="7" height="16" rx="3" fill="#2b2b2b" />
  <rect class="leg l2" x="72" y="88" width="7" height="16" rx="3" fill="#2b2b2b" />
  <g class="head">
    <ellipse cx="22" cy="44" rx="9" ry="5" fill="#2b2b2b" transform="rotate(-25 22 44)" />
    <ellipse cx="22" cy="44" rx="5" ry="2.5" fill="#f29bab" transform="rotate(-25 22 44)" />
    <ellipse cx="30" cy="54" rx="15" ry="18" fill="#2b2b2b" />
    <circle cx="25" cy="50" r="3.2" fill="#fff" /><circle cx="35" cy="50" r="3.2" fill="#fff" />
    <circle cx="25.6" cy="50.6" r="1.6" fill="#2b2b2b" /><circle cx="35.6" cy="50.6" r="1.6" fill="#2b2b2b" />
    <ellipse cx="30" cy="62" rx="5" ry="3" fill="#f29bab" />
    <g fill="#fffdf7"><circle cx="24" cy="38" r="6" /><circle cx="31" cy="35" r="6.5" /><circle cx="38" cy="38" r="6" /></g>
    {#if costume === "halloween"}
      <!-- Hexenhut -->
      <g transform="rotate(-12 31 36)">
        <path d="M21 35 L31 3 Q34 12 42 16 Q36 18 41 34 Z" fill="#5b2a86" />
        <path d="M31 3 Q34 12 42 16 Q36 18 37 22" fill="none" stroke="#3f1c60" stroke-width="1.2" />
        <rect x="21.5" y="29" width="19" height="4.5" rx="1" fill="#ef7a1a" />
        <ellipse cx="31" cy="35.5" rx="17" ry="3.6" fill="#4a2270" />
      </g>
    {:else if costume === "weihnachten"}
      <!-- Weihnachtsmütze, Zipfel fällt nach hinten -->
      <g transform="rotate(-8 31 36)">
        <path d="M18 35C19 20 30 9 45 11c6 1 9 6 7 13-4-5-9-6-12-4 2 4 3 9 3 15z" fill="#d42d3a" />
        <path d="M40 20c-3 2-4 7-3 15" fill="none" stroke="#a51f2b" stroke-width="1.2" />
        <rect x="15.5" y="31" width="30" height="7" rx="3.5" fill="#fffdf7" stroke="#e6e0d0" stroke-width="0.8" />
        <circle cx="51" cy="25" r="4.6" fill="#fffdf7" stroke="#e6e0d0" stroke-width="0.8" />
      </g>
    {:else if costume === "baustelle"}
      <!-- gelber Bauhelm -->
      <g transform="rotate(-10 31 36)">
        <path d="M16 36 Q16 18 31 17 Q46 18 46 36 Z" fill="#ffd400" stroke="#d9a900" stroke-width="1" />
        <path d="M31 17 V35 M24 19 Q23 27 23 35 M38 19 Q39 27 39 35" fill="none" stroke="#e8b800" stroke-width="1.4" />
        <rect x="12" y="33.5" width="38" height="4.5" rx="2.2" fill="#f2c200" stroke="#d9a900" stroke-width="0.8" />
      </g>
    {/if}
  </g>
</svg>
