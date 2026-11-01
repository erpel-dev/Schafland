<script>
  // Sprechblase von „Frag das Schaf“: zuhören, überlegen, antworten, Auswahl zum Antippen.
  import Sheep from "./Sheep.svelte";
  import ProductImage from "./ProductImage.svelte";
  import { schaf } from "../lib/sprache/schaf.svelte.js";
  import { euro } from "../lib/money.js";

  const bars = [0.5, 0.8, 1, 0.8, 0.5];
  const clean = (n) => n.replace(/­/g, "");
</script>

{#if schaf.phase !== "idle"}
  <div class="backdrop" onclick={() => schaf.close()} role="presentation"></div>
  <div class="panel" role="dialog" aria-label="Frag das Schaf">
    <button class="x" onclick={() => schaf.close()} aria-label="Schließen">✕</button>
    <div class="row">
      <div class="sheep" class:talking={schaf.phase === "answer"} class:listening={schaf.phase === "listening"}>
        <Sheep size="6.5rem" />
      </div>
      <div class="bubble">
        {#if schaf.phase === "loading"}
          <p class="big">Das Schaf spitzt die Ohren …</p>
          <div class="meter"><div style:width={`${Math.round(schaf.progress * 100)}%`}></div></div>
          <small>Beim ersten Mal wird die Spracherkennung geladen ({Math.round(schaf.progress * 100)} %). Danach geht es ohne Warten und ohne Internet.</small>
        {:else if schaf.phase === "listening"}
          <p class="big">Ich höre zu …</p>
          <div class="level" aria-hidden="true">
            {#each bars as b}<span style:transform={`scaleY(${0.15 + schaf.level * b})`}></span>{/each}
          </div>
          <button class="btn" onclick={() => schaf.ask()}>Fertig gesprochen</button>
        {:else if schaf.phase === "thinking"}
          <p class="big">Hmm, ich überlege <span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
        {:else if schaf.phase === "error"}
          <p class="big">Oh!</p>
          <p>{schaf.error}</p>
          <button class="btn mic" onclick={() => schaf.ask()}>🎤 Nochmal</button>
        {:else if schaf.reply}
          {#if schaf.heard}<small class="heard">Du hast gesagt: „{schaf.heard}“</small>{/if}
          {#if schaf.reply.streaming && !schaf.reply.say}
            <p class="big">Hmm, ich überlege <span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
          {:else}
            <p class="big" class:streaming={schaf.reply.streaming}>{schaf.reply.say}</p>
          {/if}
          {#if schaf.reply.choices?.length}
            <div class="choices">
              {#each schaf.reply.choices as p (p.id)}
                <button class="choice" onclick={() => schaf.choose(p)}>
                  <ProductImage product={p} size="2.6rem" />
                  <span class="nm">{clean(p.name)}</span>
                  <span class="pr">{euro(p.priceCents)}</span>
                </button>
              {/each}
            </div>
          {/if}
          {#if !schaf.reply.streaming}
          <div class="actions">
            {#if schaf.reply.offerAdd}
              <button class="btn yes" onclick={() => schaf.confirmAdd(schaf.reply.offerAdd)}>🧺 Ja, in den Korb</button>
            {/if}
            <button class="btn mic" onclick={() => schaf.ask()}>🎤 {schaf.reply.retry ? "Nochmal sagen" : "Noch eine Frage"}</button>
          </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(40, 50, 30, 0.25); z-index: 40; }
  .panel {
    position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); z-index: 41;
    width: min(46rem, calc(100% - 1.5rem)); max-height: calc(100% - 2rem); overflow-y: auto;
    background: var(--wool); border-radius: 1.6rem; padding: 1.1rem 1.2rem 1.2rem;
    box-shadow: 0 0.6rem 2rem rgba(0, 0, 0, 0.25); border: 3px solid #fff;
    animation: up 0.2s ease-out;
  }
  @keyframes up { from { transform: translate(-50%, 1.5rem); opacity: 0; } }
  .x { position: absolute; top: 0.5rem; right: 0.7rem; font-size: 1.3rem; width: 2.6rem; height: 2.6rem; border-radius: 99px; background: #fff; }
  .row { display: flex; gap: 1rem; align-items: flex-start; }
  .sheep { flex: none; transform-origin: 50% 90%; }
  .sheep.listening { animation: lean 1.2s ease-in-out infinite; }
  .sheep.talking { animation: nod 0.5s ease-in-out 3; }
  @keyframes lean { 50% { transform: rotate(-6deg); } }
  @keyframes nod { 50% { transform: translateY(-0.3rem) rotate(3deg); } }
  .bubble {
    flex: 1; min-width: 0; position: relative; background: #fff; border-radius: 1.3rem; padding: 0.9rem 1.1rem;
    display: flex; flex-direction: column; gap: 0.6rem; margin-right: 2.4rem;
  }
  .bubble::before {
    content: ""; position: absolute; left: -0.7rem; top: 1.6rem; border: 0.7rem solid transparent; border-right-color: #fff; border-left: 0;
  }
  .big { font-family: var(--f-display); font-weight: 800; font-size: 1.55rem; line-height: 1.2; margin: 0; }
  .heard { color: var(--ink-soft); }
  .streaming::after { content: "▍"; animation: blink 0.8s infinite; color: var(--grass); }
  small { color: var(--ink-soft); }
  .meter { height: 0.8rem; background: var(--wool-2); border-radius: 99px; overflow: hidden; }
  .meter div { height: 100%; background: var(--grass); transition: width 0.2s; }
  .level { display: flex; gap: 0.35rem; align-items: center; height: 3.2rem; }
  .level span { width: 0.8rem; height: 100%; background: var(--grass); border-radius: 99px; transition: transform 0.08s; }
  .dots i { animation: blink 1s infinite; font-style: normal; }
  .dots i:nth-child(2) { animation-delay: 0.2s; }
  .dots i:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 50% { opacity: 0.2; } }
  .choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: 0.5rem; }
  .choice {
    display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.5rem 0.3rem;
    background: var(--wool); border-radius: 1rem; border: 2px solid var(--wool-line);
  }
  .choice .nm { font-weight: 800; font-size: 0.95rem; text-align: center; line-height: 1.1; }
  .choice .pr { font-family: var(--f-display); font-weight: 800; color: var(--grass-dark); }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn { padding: 0.75rem 1.1rem; border-radius: 99px; font-weight: 800; font-size: 1.05rem; background: var(--wool-2); }
  .btn.yes { background: var(--grass); color: #fff; }
  .btn.mic { background: var(--sky); color: var(--sky-ink); }

  @media (max-width: 760px) {
    .panel { bottom: 0.5rem; padding: 0.8rem; }
    .row { flex-direction: column; align-items: center; gap: 0.4rem; }
    .bubble { margin-right: 0; width: 100%; }
    .bubble::before { left: 50%; top: -0.7rem; border: 0.7rem solid transparent; border-bottom-color: #fff; border-top: 0; transform: translateX(-50%); }
    .big { font-size: 1.3rem; }
  }
</style>
