<script>
  // Mond und Fledermäuse für die Halloween-Aktion. big: über den ganzen Himmel (Start, Danke)
  let { big = false } = $props();
  // Fledermaus von vorn: Kopf mit Ohren, Flügel mit gezacktem Unterrand (viewBox 60×32)
  const BAT =
    "M30 9l-2.5-5-1.2 5.5C22 8 12 4 1 9c6 2 8 7 8 13 3-3 7-3 9 0 2-3 5-3 7-1 1-3 3-5 5-5s4 2 5 5c2-2 5-2 7 1 2-3 6-3 9 0 0-6 2-11 8-13-11-5-21-1-25.3.5L32.5 4z";
  // [x %, y %, Breite rem, Drehung]
  const bats = big
    ? [[10, 16, 5.5, -10], [24, 8, 3.6, 8], [70, 24, 4.4, 12], [82, 34, 3, -8], [58, 9, 3.2, 4]]
    : [[47, 8, 2.6, -10], [55, 42, 2, 10], [64, 18, 2.3, -6]];
</script>

<div class="deko" class:big aria-hidden="true">
  <svg class="moon" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="17" fill="#fff4c9" />
    <circle cx="13" cy="15" r="3" fill="#efe0a8" /><circle cx="25" cy="25" r="4.5" fill="#efe0a8" /><circle cx="26" cy="12" r="2" fill="#efe0a8" />
  </svg>
  {#each bats as [x, y, s, r], i (i)}
    <svg class="bat" style:left="{x}%" style:top="{y}%" style:width="{s}rem" style:animation-delay="{i * -0.7}s" style:rotate="{r}deg" viewBox="0 0 60 32">
      <path d={BAT} fill="#0f0a1a" />
      <circle cx="28" cy="10" r="0.9" fill="#ffcf5c" /><circle cx="32" cy="10" r="0.9" fill="#ffcf5c" />
    </svg>
  {/each}
</div>

<style>
  .deko { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .moon { position: absolute; left: 40%; top: 0.55rem; width: 3.2rem; height: 3.2rem; filter: drop-shadow(0 0 0.8rem rgba(255, 244, 201, 0.55)); }
  .big .moon { left: auto; right: 9%; top: 6%; width: 9rem; height: 9rem; }
  .bat { position: absolute; height: auto; animation: flap 2.4s ease-in-out infinite; }
  @keyframes flap { 50% { transform: translateY(-0.35rem) scaleY(0.75); } }
  @media (prefers-reduced-motion: reduce) { .bat { animation: none; } }
</style>
