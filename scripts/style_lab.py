#!/usr/bin/env python3
"""设计备选的本地预览和发布。

    python3 scripts/style_lab.py [端口，默认 8793]     本地预览：打开 http://127.0.0.1:8793/lab/
    python3 scripts/style_lab.py --publish             把 design_lab/ 里要发布的部分复制到 docs/lab/

本地预览时：
  /                 线上现版（docs/ 原样），页面底部多一条设计切换条
  /lab/             全部设计的总览页（design_lab/index.html）
  /lab/<名字>/      一套设计的原型（design_lab/<名字>/），读的是 /data/ 里线上同一份数据

原型页面里的地址全是相对的，所以复制到 docs/lab/ 之后在 /ai_study/lab/ 下不用改就能跑。
发布只复制 styles.json 里列出的设计、shared/、总览页和缩略图；README、skins/ 和 layout.mjs 不发布。
线上现版的页面不会被改动：切换条只在本地预览时加到现版页面上。
"""
import json
import mimetypes
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
DOCS, LAB = ROOT / "docs", ROOT / "design_lab"
SWITCH = '<script src="/lab/shared/switch.js"></script>'


def publish():
    out = DOCS / "lab"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    styles = json.loads((LAB / "styles.json").read_text(encoding="utf-8"))
    skip = shutil.ignore_patterns("*.mjs", "*.md", ".DS_Store")
    for name in [s["dir"] for s in styles if s["dir"]] + ["shared", "thumbs"]:
        shutil.copytree(LAB / name, out / name, ignore=skip)
    for name in ("index.html", "styles.json"):
        shutil.copy2(LAB / name, out / name)
    files = [f for f in out.rglob("*") if f.is_file()]
    print(f"已发布到 {out.relative_to(ROOT)}/：{len(files)} 个文件，{sum(f.stat().st_size for f in files) / 1024:.0f} KB")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(DOCS), **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/lab" or path.startswith("/lab/"):
            f = (LAB / path[len("/lab/"):]).resolve()
            if f != LAB.resolve() and LAB.resolve() not in f.parents:
                return self.send_error(404)
            if f.is_dir():
                if not path.endswith("/"):
                    self.send_response(301)
                    self.send_header("Location", path + "/")
                    return self.end_headers()
                f = f / "index.html"
            if not f.is_file():
                return self.send_error(404)
            ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype.endswith(("javascript", "json")):
                ctype += "; charset=utf-8"
            return self._send(f.read_bytes(), ctype)
        f = DOCS / path.lstrip("/")
        if f.is_dir():
            f = f / "index.html"
        if f.suffix == ".html" and f.is_file() and DOCS.resolve() in f.resolve().parents:
            html = f.read_text(encoding="utf-8").replace("</body>", SWITCH + "\n</body>", 1)
            return self._send(html.encode("utf-8"), "text/html; charset=utf-8")
        return super().do_GET()


if __name__ == "__main__":
    if "--publish" in sys.argv:
        publish()
    else:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8793
        print(f"设计预览：http://127.0.0.1:{port}/lab/  （Ctrl+C 停止）", flush=True)
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
