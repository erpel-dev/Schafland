// Ende-zu-Ende-Test für den Linux-Starter (release/schafland).
// Aufruf: npm run test:starter (vorher npm run build:starter).
// Der Starter bekommt als "Browser" ein kleines Skript, das Playwrights Chromium unsichtbar mit
// Fernsteuerung und Test-Kamera startet. So läuft alles wie beim Doppelklick, nur steuerbar.
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeFixtures } from "./fixtures.mjs";

const R = fileURLToPath(new URL("../..", import.meta.url));
const BIN = path.join(R, "release", "schafland");
const FIX = await makeFixtures();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "schafland-starter-"));
const { version } = JSON.parse(fs.readFileSync(path.join(R, "package.json"), "utf8"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

if (!fs.existsSync(BIN)) {
  console.error("release/schafland fehlt. Erst „npm run build:starter“ ausführen.");
  process.exit(1);
}

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

/** Test-"Browser": echtes Chromium, unsichtbar, mit Fernsteuerung auf debugPort und Test-Kamera. */
function fakeBrowser(debugPort, { headless = true } = {}) {
  const file = path.join(TMP, `browser-${debugPort}.sh`);
  fs.writeFileSync(file, `#!/bin/sh
echo "$@" > "${TMP}/args-${debugPort}.txt"
exec "${chromium.executablePath()}" "$@" ${headless ? "--headless=new" : ""} --no-sandbox --remote-debugging-port=${debugPort} \\
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture="${FIX}/own.y4m"
`, { mode: 0o755 });
  return file;
}

async function cdpReady(port, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return true; } catch {}
    await wait(200);
  }
  return false;
}

function startStarter(args, env = {}) {
  const p = spawn(BIN, args, { env: { ...process.env, ...env } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.exitInfo = new Promise((res) => p.on("exit", (code) => res(code)));
  p.output = () => out;
  return p;
}
const exitedWithin = (p, ms) => Promise.race([p.exitInfo.then((c) => ({ exited: true, code: c })), wait(ms).then(() => ({ exited: false }))]);

try {
  // --version
  const v = spawnSync(BIN, ["--version"], { encoding: "utf8" });
  check("--version zeigt die Version", v.stdout.trim() === `Schafland ${version}`, v.stdout.trim());
  check("Datei ist eigenständig (statisch gebaut)", /statically linked/.test(spawnSync("file", [BIN], { encoding: "utf8" }).stdout || "statically linked"));

  // Normaler Start wie per Doppelklick
  const port = await freePort();
  const debug = await freePort();
  const profile = path.join(TMP, "profil");
  const starter = startStarter(["--port", String(port), "--browser", fakeBrowser(debug), "--profil", profile]);
  check("Starter öffnet den Browser", await cdpReady(debug), starter.output().split("\n")[0]);
  const args = fs.readFileSync(path.join(TMP, `args-${debug}.txt`), "utf8");
  check("Browser im Kiosk-Modus mit eigenem Profil", args.includes(`--kiosk --app=http://localhost:${port}/`) && args.includes(`--user-data-dir=${profile}`) && args.includes("--no-first-run"), args.trim());

  const ping = await (await fetch(`http://127.0.0.1:${port}/__schafland`)).text();
  check("Eingebauter Webserver antwortet", ping === `schafland ${version}`, ping);
  const html = await fetch(`http://127.0.0.1:${port}/`);
  check("App wird ausgeliefert, immer frisch (no-cache)", html.ok && html.headers.get("cache-control") === "no-cache");
  const wasmName = fs.readdirSync(path.join(R, "dist", "assets")).find((f) => f.endsWith(".wasm"));
  const wasm = await fetch(`http://127.0.0.1:${port}/assets/${wasmName}`);
  check("Barcode-Erkennung mit richtigem Dateityp (application/wasm)", wasm.headers.get("content-type") === "application/wasm");
  let outside = false;
  for (const ifs of Object.values(os.networkInterfaces())) for (const a of ifs ?? []) {
    if (a.internal || a.family !== "IPv4") continue;
    try { await fetch(`http://${a.address}:${port}/`, { signal: AbortSignal.timeout(800) }); outside = true; } catch {}
  }
  check("Nur auf diesem Rechner erreichbar, nicht im Netzwerk", !outside);

  // Die App im Browser bedienen
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debug}`);
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith(`http://localhost:${port}`)) ?? browser.contexts()[0].pages()[0];
  await page.waitForSelector("text=Laden öffnen", { timeout: 15000 });
  await page.click("text=Laden öffnen");
  await page.click(".tile:has-text('Banane')");
  await page.click("text=Scannen!");
  let scanned = true;
  try { await page.locator(".found .t:has-text('Apfel')").waitFor({ timeout: 15000 }); } catch { scanned = false; }
  check("Kamera und Barcode-Erkennung laufen im Starter", scanned);
  await page.click("text=✓ Fertig gescannt");
  check("Warenkorb rechnet", (await page.textContent(".total b")).replace(/\s/g, " ") === "0,80 €", await page.textContent(".total b"));
  await page.keyboard.press("Control+,");
  const shown = (await page.textContent("header small")).match(/Version (\S+)/)?.[1];
  check("App-Version im Eltern-Bereich passt zum Starter", shown === version, shown);
  await page.click("text=Zurück zum Laden");
  await page.click(".pay");
  await page.click("text=Bezahlt! Neuer Einkauf");
  await page.locator(".party").waitFor();
  check("Bezahlen funktioniert", true);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});

  // Zweiter Doppelklick, während Schafland läuft
  const second = startStarter(["--port", String(port), "--browser", fakeBrowser(await freePort()), "--profil", profile]);
  const s2 = await exitedWithin(second, 15000);
  check("Zweiter Start benutzt den laufenden Server", second.output().includes("läuft schon"), second.output().trim().split("\n")[0]);
  check("Zweiter Start beendet sich, die Kasse läuft weiter", s2.exited && (await fetch(`http://127.0.0.1:${port}/__schafland`)).ok);

  // Browser schließen (wie Alt+F4) → Starter beendet sich, Port wird frei
  await browser.newBrowserCDPSession().then((s) => s.send("Browser.close")).catch(() => {});
  const ex = await exitedWithin(starter, 10000);
  check("Browser schließen beendet den Starter", ex.exited, `Exit-Code ${ex.code}`);
  let stillUp = true;
  try { await fetch(`http://127.0.0.1:${port}/__schafland`, { signal: AbortSignal.timeout(800) }); } catch { stillUp = false; }
  check("Danach ist der Port wieder frei", !stillUp);

  // Neustart: gespeicherte Daten (Kassenbon) sind noch da
  const debug2 = await freePort();
  const again = startStarter(["--port", String(port), "--browser", fakeBrowser(debug2), "--profil", profile]);
  await cdpReady(debug2);
  const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${debug2}`);
  const p2 = b2.contexts()[0].pages().find((p) => p.url().includes(`:${port}`)) ?? b2.contexts()[0].pages()[0];
  await p2.waitForSelector("text=Laden öffnen", { timeout: 15000 });
  await p2.click("text=Laden öffnen");
  await p2.keyboard.press("Control+,");
  await p2.click("nav >> text=Kassenbons");
  await wait(300);
  check("Nach Neustart: Kassenbon vom letzten Mal noch da", (await p2.textContent(".pane")).includes("Banane"));
  await b2.newBrowserCDPSession().then((s) => s.send("Browser.close")).catch(() => {});
  await exitedWithin(again, 10000);

  // Port von fremdem Programm belegt
  const foreign = net.createServer((s) => s.end("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nfremd")).listen(0, "127.0.0.1");
  await new Promise((r) => foreign.on("listening", r));
  const fport = foreign.address().port;
  const busy = startStarter(["--port", String(fport), "--nur-server"]);
  await wait(1500);
  check("Port belegt von fremdem Programm: nimmt den nächsten freien", /belegt, nehme \d+/.test(busy.output()), busy.output().trim().split("\n")[0]);
  busy.kill("SIGTERM");
  const bk = await exitedWithin(busy, 5000);
  check("--nur-server lässt sich sauber beenden", bk.exited && bk.code === 0, `Exit-Code ${bk.code}`);
  foreign.close();

  // Kein Browser installiert
  const nob = spawnSync(BIN, ["--port", String(await freePort())], { encoding: "utf8", env: { PATH: path.join(TMP, "leer"), HOME: TMP } });
  check("Ohne Chromium: verständliche Meldung, Exit-Code 1", nob.status === 1 && nob.stderr.includes("sudo apt install chromium"), nob.stderr.trim());

  // Kartenzahlung mit USB-Chipkartenleser (PC/SC) über den Starter
  // a) Testleser: Karte „liegt auf“, solange eine Datei existiert
  {
    const kartenPort = await freePort();
    const karte = path.join(TMP, "karte");
    const srv = startStarter(["--port", String(kartenPort), "--nur-server"], { SCHAFLAND_TESTKARTE: karte });
    for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${kartenPort}/__schafland`).then((r) => r.ok, () => false)); i++) await wait(100);
    const info = await (await fetch(`http://127.0.0.1:${kartenPort}/__schafland/karte`)).json();
    check("Starter meldet den Kartenleser", info.leser?.[0] === "Testleser", JSON.stringify(info));
    const b = await chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1366, height: 768 } });
    await pg.goto(`http://localhost:${kartenPort}/`);
    await pg.click("text=Laden öffnen");
    await pg.click(".tile:has-text('Banane')");
    await pg.click(".pay");
    await pg.waitForSelector("text=Karte hinhalten");
    check("PC: Kartenoption mit „auflegen oder stecken“", (await pg.locator(".opt.on:has-text('auflegen oder stecken')").count()) === 1);
    fs.writeFileSync(karte, "");
    let ok = await pg.waitForSelector(".terminal.ok", { timeout: 5000 }).then(() => true, () => false);
    check("PC: Karte aufgelegt → bezahlt", ok);
    await pg.waitForSelector(".party", { timeout: 5000 }).catch(() => {});
    await wait(3800);
    // Karte bleibt liegen: nächster Einkauf bezahlt erst nach Wegnehmen und neu Auflegen
    await pg.click(".tile:has-text('Apfel')");
    await pg.click(".pay");
    await pg.waitForSelector("text=Karte hinhalten");
    await wait(1200);
    check("PC: liegengebliebene Karte bezahlt nicht von selbst", (await pg.locator(".terminal.ok").count()) === 0);
    fs.rmSync(karte);
    await wait(600);
    fs.writeFileSync(karte, "");
    ok = await pg.waitForSelector(".terminal.ok", { timeout: 5000 }).then(() => true, () => false);
    check("PC: weggenommen und wieder aufgelegt → bezahlt", ok);
    fs.rmSync(karte, { force: true });
    await b.close();
    srv.kill();
    await srv.exitInfo;
  }
  // b) echter Chipkarten-Dienst pcscd mit virtuellem Leser und virtueller Karte (wenn installiert)
  const vicc = spawnSync("sh", ["-c", "command -v vicc"], { encoding: "utf8" }).stdout.trim();
  if (fs.existsSync("/run/pcscd/pcscd.comm") && vicc) {
    const kartenPort = await freePort();
    const srv = startStarter(["--port", String(kartenPort), "--nur-server"]);
    for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${kartenPort}/__schafland`).then((r) => r.ok, () => false)); i++) await wait(100);
    const b = await chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1366, height: 768 } });
    await pg.goto(`http://localhost:${kartenPort}/`);
    await pg.click("text=Laden öffnen");
    await pg.keyboard.press("Control+,");
    await pg.waitForSelector("text=Kartenleser bereit", { timeout: 5000 }).catch(() => {});
    const status = (await pg.textContent("#nfc-on >> xpath=../..")).replace(/\s+/g, " ");
    check("pcscd: Eltern-Bereich zeigt den Leser", /Kartenleser bereit: Virtual PCD/.test(status), status.slice(0, 160));
    await pg.click("text=Zurück zum Laden");
    await pg.click(".tile:has-text('Banane')");
    await pg.click(".pay");
    await pg.waitForSelector("text=Karte hinhalten");
    await wait(500);
    await pg.screenshot({ path: path.join(R, "tests/e2e/.output/karte-pc.png") });
    const card = spawn(vicc, ["-t", "iso7816"]);
    const ok = await pg.waitForSelector(".terminal.ok", { timeout: 8000 }).then(() => true, () => false);
    check("pcscd: virtuelle Karte eingesteckt → bezahlt", ok);
    card.kill();
    await b.close();
    srv.kill();
    await srv.exitInfo;
  } else console.log("INFO  pcscd/vicc nicht installiert: Test mit echtem Chipkarten-Dienst übersprungen");

  // Autostart einrichten und entfernen
  const home = path.join(TMP, "home");
  fs.mkdirSync(home);
  const a = spawnSync(BIN, ["--autostart"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: home } });
  const desktop = path.join(home, ".config", "autostart", "schafland.desktop");
  check("--autostart richtet Autostart und Menüeintrag ein", a.status === 0 && fs.readFileSync(desktop, "utf8").includes(`Exec="${BIN}"`) && fs.existsSync(path.join(home, ".local", "share", "icons", "schafland.png")));
  spawnSync(BIN, ["--kein-autostart"], { env: { PATH: process.env.PATH, HOME: home } });
  check("--kein-autostart entfernt ihn wieder", !fs.existsSync(desktop));
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}
