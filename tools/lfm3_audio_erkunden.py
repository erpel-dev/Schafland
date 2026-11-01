# Liest Aufbau des Modellpakets LFM3-Audio-2B-ONNX (für den Browser-Prototyp von „Frag das Schaf“):
# Dateiliste, Modellkarte, Konfiguration und Ein-/Ausgänge aller ONNX-Graphen. Läuft auf GitHub.
import json, os, sys
from huggingface_hub import HfApi, hf_hub_download
import onnx

REPO = sys.argv[1] if len(sys.argv) > 1 else "LiquidAI/LFM3-Audio-2B-ONNX"
api = HfApi()
info = api.model_info(REPO, files_metadata=True)
print("== Dateien")
for s in sorted(info.siblings, key=lambda s: s.rfilename):
    print(f"{s.rfilename}\t{(s.size or 0) / 1e6:.1f} MB")
names = [s.rfilename for s in info.siblings]
for n in names:
    if n.endswith((".md", ".json", ".txt", ".jinja", ".py", ".js", ".mjs", ".ts", ".html")) and not n.startswith("onnx/"):
        p = hf_hub_download(REPO, n)
        if os.path.getsize(p) > 400_000:
            print(f"== {n} (zu groß, {os.path.getsize(p)} Bytes)")
            continue
        print(f"== {n}")
        print(open(p, encoding="utf8", errors="replace").read())
for n in names:
    if not n.endswith(".onnx"):
        continue
    p = hf_hub_download(REPO, n)
    m = onnx.load(p, load_external_data=False)
    def shape(t):
        dims = t.type.tensor_type.shape.dim
        return [d.dim_param or d.dim_value for d in dims]
    def dtype(t):
        return onnx.TensorProto.DataType.Name(t.type.tensor_type.elem_type)
    print(f"== Graph {n}  (opset {[o.version for o in m.opset_import]}, {len(m.graph.node)} Knoten)")
    ins = list(m.graph.input)
    outs = list(m.graph.output)
    for t in ins[:12]: print(f"  in  {t.name} {dtype(t)} {shape(t)}")
    if len(ins) > 12: print(f"  … {len(ins) - 12} weitere Eingänge, z. B. {[t.name for t in ins[12:16]]} … {[t.name for t in ins[-3:]]}")
    for t in outs[:12]: print(f"  out {t.name} {dtype(t)} {shape(t)}")
    if len(outs) > 12: print(f"  … {len(outs) - 12} weitere Ausgänge, z. B. {[t.name for t in outs[12:16]]} … {[t.name for t in outs[-3:]]}")
    meta = {p.key: p.value[:300] for p in m.metadata_props}
    if meta: print("  meta", json.dumps(meta, ensure_ascii=False))
