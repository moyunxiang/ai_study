#!/usr/bin/env python3
"""配色备选的本地预览和发布。

    python3 scripts/style_lab.py [端口，默认 8793]     本地预览：打开 http://127.0.0.1:8793/lab/
    python3 scripts/style_lab.py --publish             生成 docs/lab/

/lab/ 只有一个页面：它是线上现版 docs/index.html 的一份副本，资源和数据请求都指回上一级的站点根目录，
多加载浅色、深色各一份可以原地更换的配色样式表（design_lab/colors/l-<名字>.css、d-<名字>.css）和页面底部的色块条（design_lab/bar.js）。
配色由 scripts/lab_colors.py 生成。现版自己的页面、样式和脚本都不改；现版改了 index.html 之后要重新发布一次。
"""
import json
import mimetypes
import re
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
DOCS, LAB = ROOT / "docs", ROOT / "design_lab"


def colors():
    return json.loads((LAB / "colors.json").read_text(encoding="utf-8"))


def lab_page():
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'\b(href|src)="(?!#|https?:|data:|/|\.\./|mailto:)([^"]+)"', r'\1="../\2"', html)
    keys = json.dumps({m: [c["key"] for c in colors()[m] if c["key"]] for m in ("l", "d")}, separators=(",", ":"))
    head = ('<meta name="robots" content="noindex">\n'
            f"<script>(function(){{var K={keys},q=new URLSearchParams(location.search);window.LAB_KEY={{}};"
            "['l','d'].forEach(function(m){var k=q.get(m);"
            "if(k==null)try{k=localStorage.getItem('aimap.lab.'+m)}catch(e){}"
            "k=K[m].indexOf(k)<0?'':k;LAB_KEY[m]=k;"
            "document.write('<link id=\"labcss-'+m+'\" rel=\"stylesheet\"'+(k?' href=\"colors/'+m+'-'+k+'.css\"':'')+'>')})})()</script>\n")
    shim = ("<script>(function(f){window.fetch=function(u,o){return f(typeof u==='string'&&u.indexOf('data/')===0?'../'+u:u,o)};"
            "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');"
            "if(/^(n\\/|c\\/|[a-z0-9_-]+\\.html)/.test(h))a.setAttribute('href','../'+h)},true)})(window.fetch)</script>\n")
    assert "</head>" in html and "<script>window.AIMAP_V" in html, "docs/index.html 的结构变了，lab_page 要跟着改"
    html = html.replace("</head>", head + "</head>", 1)
    html = html.replace("<script>window.AIMAP_V", shim + "<script>window.AIMAP_V", 1)
    data = json.dumps(colors(), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return html.replace("</body>", f'<script>window.LAB_COLORS={data}</script>\n<script src="bar.js"></script>\n</body>', 1)


def publish():
    out = DOCS / "lab"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    (out / "index.html").write_text(lab_page(), encoding="utf-8")
    shutil.copytree(LAB / "colors", out / "colors", ignore=shutil.ignore_patterns(".DS_Store"))
    shutil.copy2(LAB / "bar.js", out / "bar.js")
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
        if path == "/lab":
            self.send_response(301)
            self.send_header("Location", "/lab/")
            return self.end_headers()
        if path in ("/lab/", "/lab/index.html"):
            return self._send(lab_page().encode("utf-8"), "text/html; charset=utf-8")
        if path.startswith("/lab/"):
            f = (LAB / path[len("/lab/"):]).resolve()
            if LAB.resolve() not in f.parents or not f.is_file() or f.suffix not in (".css", ".js"):
                return self.send_error(404)
            ctype = (mimetypes.guess_type(f.name)[0] or "application/octet-stream") + "; charset=utf-8"
            return self._send(f.read_bytes(), ctype)
        return super().do_GET()


if __name__ == "__main__":
    if "--publish" in sys.argv:
        publish()
    else:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8793
        print(f"配色预览：http://127.0.0.1:{port}/lab/  （Ctrl+C 停止）", flush=True)
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
