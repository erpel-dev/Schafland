import { kvGet, kvSet } from "./db.js";
import { settings } from "./settings.svelte.js";
import { onSound } from "./sounds.js";

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
export const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;

const prettyName = (file) =>
  file.replace(AUDIO_EXT, "").replace(/^\d+[\s._-]+/, "").replace(/[_]+/g, " ").trim();

async function collect(dirHandle, prefix = "", out = []) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "directory") await collect(entry, `${prefix}${entry.name}/`, out);
    else if (AUDIO_EXT.test(entry.name)) out.push({ path: prefix + entry.name, title: prettyName(entry.name), handle: entry });
  }
  return out;
}

class Music {
  tracks = $state([]); // { path, title, handle? , file? }
  index = $state(-1);
  playing = $state(false);
  folderName = $state("");
  needsPermission = $state(false);
  time = $state(0);
  duration = $state(0);
  error = $state("");

  #audio = typeof Audio !== "undefined" ? new Audio() : null;
  #dir = null;
  #url = null;
  #duckTimer = null;
  #ducked = false;
  #order = [];

  constructor() {
    if (!this.#audio) return;
    const a = this.#audio;
    a.addEventListener("ended", () => this.next());
    a.addEventListener("play", () => (this.playing = true));
    a.addEventListener("pause", () => (this.playing = false));
    a.addEventListener("timeupdate", () => (this.time = a.currentTime));
    a.addEventListener("loadedmetadata", () => (this.duration = a.duration));
    a.addEventListener("error", () => {
      this.error = `„${this.current?.title}“ lässt sich nicht abspielen.`;
      setTimeout(() => this.next(), 800);
    });
    onSound((ms) => this.duck(ms));
  }

  get current() {
    return this.tracks[this.index] ?? null;
  }

  /** Beim App-Start: gespeicherten Ordner wieder öffnen, wenn die Erlaubnis noch gilt. */
  async restore() {
    this.#dir = await kvGet("musicDir", null);
    if (!this.#dir) return;
    this.folderName = this.#dir.name;
    try {
      const perm = await this.#dir.queryPermission({ mode: "read" });
      if (perm === "granted") await this.#load();
      else this.needsPermission = true;
    } catch {
      this.needsPermission = true;
    }
  }

  /** Muss aus einer Berührung heraus aufgerufen werden (z. B. "Laden öffnen"). */
  async regainPermission() {
    if (!this.#dir || !this.needsPermission) return;
    try {
      if ((await this.#dir.requestPermission({ mode: "read" })) === "granted") {
        this.needsPermission = false;
        await this.#load();
      }
    } catch {
      // Abgelehnt: Musik bleibt aus, im Eltern-Bereich kann der Ordner neu gewählt werden.
    }
  }

  async pickFolder() {
    const dir = await window.showDirectoryPicker({ id: "schafland-musik", mode: "read", startIn: "music" });
    this.#dir = dir;
    this.folderName = dir.name;
    this.needsPermission = false;
    try {
      await kvSet("musicDir", dir);
    } catch {
      // Ordner merken klappt nicht (z. B. privates Fenster): Musik läuft trotzdem bis zum Neustart.
    }
    await this.#load();
  }

  /** Rückfall ohne File System Access API: <input webkitdirectory>. Gilt nur bis zum Neustart. */
  useFiles(fileList) {
    const files = [...fileList].filter((f) => AUDIO_EXT.test(f.name));
    this.stop();
    this.folderName = files[0]?.webkitRelativePath?.split("/")[0] || "Ausgewählte Dateien";
    this.tracks = files
      .map((f) => ({ path: f.webkitRelativePath || f.name, title: prettyName(f.name), file: f }))
      .sort((a, b) => a.path.localeCompare(b.path, "de"));
    this.#shuffleOrder();
  }

  async #load() {
    this.error = "";
    const list = await collect(this.#dir);
    list.sort((a, b) => a.path.localeCompare(b.path, "de"));
    this.stop();
    this.tracks = list;
    this.#shuffleOrder();
    if (!list.length) this.error = "In diesem Ordner sind keine Musikdateien.";
  }

  #shuffleOrder() {
    this.#order = this.tracks.map((_, i) => i);
    if (settings.value.musicShuffle) {
      for (let i = this.#order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.#order[i], this.#order[j]] = [this.#order[j], this.#order[i]];
      }
    }
  }

  async play(i = this.index >= 0 ? this.index : this.#order[0] ?? 0) {
    const track = this.tracks[i];
    if (!track || !this.#audio) return;
    if (i !== this.index || !this.#url) {
      const file = track.file ?? (await track.handle.getFile());
      if (this.#url) URL.revokeObjectURL(this.#url);
      this.#url = URL.createObjectURL(file);
      this.#audio.src = this.#url;
      this.index = i;
    }
    this.error = "";
    this.applyVolume();
    try {
      await this.#audio.play();
    } catch {
      this.playing = false;
    }
  }

  pause() {
    this.#audio?.pause();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  #step(dir) {
    if (!this.tracks.length) return;
    const pos = this.#order.indexOf(this.index);
    const nextPos = (pos + dir + this.#order.length) % this.#order.length;
    this.play(this.#order[nextPos]);
  }

  next() {
    this.#step(1);
  }

  prev() {
    this.#step(-1);
  }

  stop() {
    this.#audio?.pause();
    if (this.#url) URL.revokeObjectURL(this.#url);
    this.#url = null;
    this.index = -1;
    this.time = 0;
    this.duration = 0;
  }

  seek(seconds) {
    if (this.#audio) this.#audio.currentTime = seconds;
  }

  applyVolume() {
    if (this.#audio) this.#audio.volume = settings.value.musicVolume * (this.#ducked ? 0.25 : 1);
  }

  reshuffle() {
    this.#shuffleOrder();
  }

  /** Musik kurz leiser, während ein Geräusch läuft. */
  duck(ms) {
    this.#ducked = true;
    this.applyVolume();
    clearTimeout(this.#duckTimer);
    this.#duckTimer = setTimeout(() => {
      this.#ducked = false;
      this.applyVolume();
    }, ms);
  }
}

export const music = new Music();

export const mmss = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
