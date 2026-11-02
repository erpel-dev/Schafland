// Leistungsmessung: Start, Laden öffnen, Tippen→Korb, Reiter, Eltern-Bereich, Frag das Schaf –
// bei 4× gedrosseltem Prozessor (ungefähr das alte Notebook) und als Handy. Aufruf: node tests/e2e/leistung.mjs (nach vite build)
import { chromium, devices } from "playwright";
import { spawn } from "node:child_process";
const srv = spawn("python3", ["kiosk/server.py", "dist", "8799"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
for (const [name, opts] of [["Notebook (4× langsamer)", { viewport: { width: 1366, height: 768 } }], ["Handy (Pixel 7, 4× langsamer)", devices["Pixel 7"]]]) {
  const ctx = await b.newContext({ ...opts, permissions: ["camera", "microphone"] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let t = Date.now();
  await p.goto("http://localhost:8799/");
  await p.waitForSelector("text=Laden öffnen");
  const start = Date.now() - t;
  t = Date.now();
  await p.click("text=Laden öffnen");
  await p.waitForSelector(".tile");
  const shop = Date.now() - t;
  // Tippen bis Korb aktualisiert
  const taps = [];
  for (let i = 0; i < 8; i++) {
    t = Date.now();
    await p.locator(".tile").nth(i % 6).click();
    await p.waitForFunction((n) => [...document.querySelectorAll(".ln .qty b, .bar")].length > 0, i);
    taps.push(Date.now() - t);
  }
  // Reiterwechsel
  t = Date.now();
  await p.locator(".cat").nth(3).click();
  await p.waitForTimeout(50);
  const tab = Date.now() - t;
  // Eltern-Bereich öffnen, Frag-das-Schaf-Reiter
  t = Date.now();
  await p.keyboard.press("Control+,");
  await p.waitForSelector("text=Eltern-Bereich");
  const settingsMs = Date.now() - t;
  t = Date.now();
  await p.click("nav >> text=Frag das Schaf");
  await p.waitForSelector("#schaf-on");
  const schafTab = Date.now() - t;
  await p.click("#schaf-on");
  // Tippen ins Ausprobieren-Feld (wird bei jedem Zeichen ausgewertet)
  await p.fill("#schaf-try", "");
  t = Date.now();
  await p.type("#schaf-try", "Was kostet die Banane?", { delay: 0 });
  const typing = Date.now() - t;
  await p.click("text=Zurück zum Laden");
  t = Date.now();
  await p.evaluate(() => window.__fragDasSchaf.hear("Was ist gesund?"));
  const hear = Date.now() - t;
  const mem = await p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  console.log(`${name}: Start ${start} ms, Laden öffnen ${shop} ms, Tippen→Korb ${Math.min(...taps)}–${Math.max(...taps)} ms, Reiter ${tab} ms, Eltern ${settingsMs} ms, Reiter Frag das Schaf ${schafTab} ms, 22 Zeichen tippen ${typing} ms, Antwort ${hear} ms, JS-Speicher ${(mem / 1e6).toFixed(0)} MB`);
  await ctx.close();
}
await b.close();
srv.kill();
