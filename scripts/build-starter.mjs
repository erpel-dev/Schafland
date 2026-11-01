// Baut den Schafland-Starter: eine Datei für Windows (release/schafland.exe) und eine für
// Linux (release/schafland). Beide enthalten die fertige App aus dist/ und brauchen nur einen
// installierten Browser (Edge/Chrome unter Windows, Chromium unter Linux).
// Aufruf: npm run build:starter (baut vorher dist/). Braucht Go ≥ 1.22.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LAUNCHER = path.join(ROOT, "launcher");
const WEB = path.join(LAUNCHER, "web");
const OUT = path.join(ROOT, "release");
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: LAUNCHER, stdio: "inherit", env: { ...process.env, ...env } });

try {
  execFileSync("go", ["version"], { stdio: "ignore" });
} catch {
  console.error("Go fehlt. Installieren: https://go.dev/dl/ (oder sudo apt install golang)");
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("dist/ fehlt. Erst „npm run build“ ausführen.");
  process.exit(1);
}

// 1. App in den Starter kopieren (wird eingebettet)
for (const f of fs.readdirSync(WEB)) if (f !== ".gitkeep") fs.rmSync(path.join(WEB, f), { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "dist"), WEB, { recursive: true });

// 2. Windows-Icon und Versionsinfo (optional: braucht beim ersten Mal Internet für go-winres)
try {
  run("go", ["run", "github.com/tc-hib/go-winres@v0.3.3", "simply",
    "--icon", path.join(ROOT, "public", "icon-512.png"),
    "--product-name", "Schafland", "--file-description", "Schafland – Spiel-Kasse",
    "--product-version", version, "--file-version", version, "--manifest", "gui", "--arch", "amd64"]);
} catch {
  console.warn("Hinweis: Windows-Icon nicht erzeugt (go-winres nicht erreichbar). Die exe funktioniert trotzdem.");
}

// 3. Bauen (ohne C-Abhängigkeiten, daher direkt für beide Systeme)
fs.mkdirSync(OUT, { recursive: true });
const ldflags = `-s -w -X main.version=${version}`;
run("go", ["build", "-trimpath", "-ldflags", `${ldflags} -H windowsgui`, "-o", path.join(OUT, "schafland.exe"), "."], { GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" });
run("go", ["build", "-trimpath", "-ldflags", ldflags, "-o", path.join(OUT, "schafland"), "."], { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" });

for (const f of ["schafland.exe", "schafland"]) {
  const mb = (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1);
  console.log(`release/${f}  ${mb} MB  (Version ${version})`);
}
