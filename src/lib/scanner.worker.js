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

self.onmessage = async (event) => {
  try {
    const results = await readBarcodes(event.data, OPTIONS);
    self.postMessage(results.filter((r) => r.isValid).map((r) => ({ text: r.text, format: r.format })));
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
