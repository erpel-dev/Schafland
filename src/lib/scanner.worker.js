import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Die WASM-Datei wird mit der App ausgeliefert, damit das Scannen auch offline geht.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
  fireImmediately: true,
});

const OPTIONS = {
  formats: ["EAN13", "EAN8", "UPCA", "UPCE", "QRCode"],
  tryHarder: true,
  tryRotate: false,
  maxNumberOfSymbols: 1,
};

/**
 * Nachschärfen nur in Querrichtung (Unschärfemaske, Radius 3, Stärke 2).
 * Strichcodes bestehen aus senkrechten Strichen; das macht kleine und leicht
 * unscharfe Codes alter Fixfokus-Webcams wieder lesbar.
 */
function sharpen(img, radius = 3, amount = 2) {
  const { width: w, height: h, data } = img;
  const row = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row[x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    let sum = 0;
    let n = 0;
    for (let x = 0; x < radius && x < w; x++) (sum += row[x]), n++;
    for (let x = 0; x < w; x++) {
      if (x + radius < w) (sum += row[x + radius]), n++;
      if (x - radius - 1 >= 0) (sum -= row[x - radius - 1]), n--;
      const v = row[x] + amount * (row[x] - sum / n);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return img;
}

self.onmessage = async ({ data }) => {
  try {
    const img = data.sharpen ? sharpen(data.img) : data.img;
    const results = await readBarcodes(img, OPTIONS);
    self.postMessage(results.filter((r) => r.isValid).map((r) => ({ text: r.text, format: r.format })));
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
