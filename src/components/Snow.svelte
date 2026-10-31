<script>
  // Stern und fallende Schneeflocken für die Weihnachts-Aktion. big: über den ganzen Himmel (Start, Danke)
  let { big = false } = $props();
  // [x %, Startverzögerung s, Größe rem, Dauer s] – fest, damit es bei jedem Start gleich aussieht
  const flakes = big
    ? [[4, 0, 1.6, 11], [12, 4, 1, 9], [19, 2, 2, 13], [27, 7, 1.2, 10], [35, 1, 1.5, 12], [43, 5, 0.9, 9], [52, 3, 1.8, 14],
       [60, 8, 1.1, 10], [68, 0.5, 1.4, 11], [76, 6, 1, 9], [84, 2.5, 1.9, 13], [92, 4.5, 1.2, 10], [97, 7.5, 0.9, 12]]
    : [[33, 0, 0.8, 6], [44, 2, 0.6, 5], [56, 1, 0.9, 7], [67, 3, 0.7, 5.5], [76, 1.5, 0.8, 6.5], [86, 4, 0.6, 5]];
</script>

<div class="deko" class:big aria-hidden="true">
  <svg class="star" viewBox="0 0 40 40">
    <path d="M20 2l5.3 11.6 12.7 1.4-9.5 8.6 2.7 12.5L20 29.7 8.8 36.1l2.7-12.5L2 15l12.7-1.4z" fill="#ffd24a" stroke="#fff3c4" stroke-width="1.5" stroke-linejoin="round" />
  </svg>
  {#each flakes as [x, delay, size, dur], i (i)}
    <svg class="flake" style:left="{x}%" style:width="{size}rem" style:animation-delay="-{delay}s" style:animation-duration="{dur}s" viewBox="0 0 20 20">
      <g stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.9">
        <path d="M10 1v18M2.2 5.5l15.6 9M2.2 14.5l15.6-9" />
        <path d="M10 4l-2-2M10 4l2-2M10 16l-2 2M10 16l2 2" />
      </g>
    </svg>
  {/each}
</div>

<style>
  .deko { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .star { position: absolute; left: 40%; top: 0.5rem; width: 3.2rem; height: 3.2rem; filter: drop-shadow(0 0 0.7rem rgba(255, 210, 74, 0.7)); }
  .big .star { left: auto; right: 9%; top: 6%; width: 8rem; height: 8rem; }
  .flake { position: absolute; top: -2rem; height: auto; animation: fall linear infinite; }
  @keyframes fall {
    from { transform: translateY(0) rotate(0deg); }
    50% { transform: translate(0.8rem, 50vh) rotate(90deg); }
    to { transform: translate(-0.4rem, 105vh) rotate(180deg); }
  }
  /* in der Kopfzeile nur die Kopfzeile hinunter */
  .deko:not(.big) .flake { animation-name: fall-small; }
  @keyframes fall-small { to { transform: translateY(6rem) rotate(120deg); } }
  @media (prefers-reduced-motion: reduce) { .flake { animation: none; top: 30%; } }
</style>
