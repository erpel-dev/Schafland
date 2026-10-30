#!/usr/bin/env python3
"""Kleiner Webserver für Schafland. Nur über localhost erreichbar (Kamera braucht localhost oder HTTPS)."""
import functools
import http.server
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "dist")
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map[".wasm"] = "application/wasm"
handler.extensions_map[".webmanifest"] = "application/manifest+json"
handler.log_message = lambda *args: None

server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(handler, directory=str(root)))
print(f"Schafland läuft auf http://localhost:{port}/")
server.serve_forever()
