<script>
  // Baukran mit schwingendem Haken und kleinen Wolken für die Baustellen-Aktion. big: groß (Start, Danke)
  let { big = false } = $props();
  const clouds = big ? [[8, 14, 7, 60], [38, 8, 5, 75], [70, 20, 6, 68]] : [[22, 18, 2.6, 50], [52, 8, 2, 62]];
</script>

<div class="deko" class:big aria-hidden="true">
  {#each clouds as [x, y, w, dur], i (i)}
    <svg class="cloud" style:left="{x}%" style:top="{y}%" style:width="{w}rem" style:animation-duration="{dur}s" viewBox="0 0 60 30">
      <g fill="#fff" opacity="0.9"><circle cx="18" cy="18" r="10" /><circle cx="32" cy="12" r="12" /><circle cx="45" cy="18" r="9" /><rect x="10" y="18" width="42" height="10" rx="5" /></g>
    </svg>
  {/each}
  <svg class="kran" viewBox="0 0 120 120">
    <!-- Turm -->
    <g stroke="#e8a000" stroke-width="2.2" fill="none">
      <path d="M78 118V22M90 118V22" />
      <path d="M78 118L90 104L78 90L90 76L78 62L90 48L78 34L90 22" />
    </g>
    <!-- Ausleger und Gegengewicht -->
    <path d="M10 22H112" stroke="#e8a000" stroke-width="4" />
    <path d="M14 22L84 8L110 22" fill="none" stroke="#e8a000" stroke-width="1.6" />
    <rect x="96" y="24" width="14" height="10" fill="#555" />
    <rect x="76" y="14" width="16" height="10" rx="1.5" fill="#ffd400" stroke="#c99700" stroke-width="1" />
    <!-- Haken mit Last, schwingt -->
    <g class="haken">
      <path d="M30 22V64" stroke="#444" stroke-width="1.2" />
      <path d="M30 64q0 6 4 6" fill="none" stroke="#444" stroke-width="2" />
      <rect x="20" y="70" width="20" height="10" fill="#c8964f" stroke="#8d6631" stroke-width="1.2" />
    </g>
  </svg>
</div>

<style>
  .deko { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .kran { position: absolute; right: 6rem; bottom: -0.4rem; width: 4.6rem; height: 4.6rem; }
  .big .kran { right: 6%; bottom: 18%; width: 16rem; height: 16rem; }
  .haken { transform-origin: 30px 22px; animation: schwingen 3.5s ease-in-out infinite; }
  .cloud { position: absolute; height: auto; animation: ziehen linear infinite alternate; }
  @keyframes schwingen { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
  @keyframes ziehen { from { transform: translateX(-1.5rem); } to { transform: translateX(1.5rem); } }
  @media (prefers-reduced-motion: reduce) { .haken, .cloud { animation: none; } }
</style>
