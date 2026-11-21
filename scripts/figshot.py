#!/usr/bin/env python3
"""把一张机制图渲染成PNG，用来目检。

  python3 scripts/figshot.py <key> [输出目录]

输出四张图：手机宽度（约360px）和桌面宽度（560px），各一张浅色、一张深色。
依赖本机的 Google Chrome（无头模式）。只读 data/figures/<key>.svg 和 docs/assets/style.css，不改任何文件。
"""
import json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def main():
    key = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.gettempdir()) / "aimap-figs"
    out.mkdir(parents=True, exist_ok=True)
    svg = (ROOT / "data" / "figures" / f"{key}.svg").read_text(encoding="utf-8")
    meta = json.loads((ROOT / "data" / "figures" / f"{key}.json").read_text(encoding="utf-8"))
    css = (ROOT / "docs" / "assets" / "style.css").read_text(encoding="utf-8")
    for theme in ("light", "dark"):
        for w in (360, 560):
            html = (f'<!doctype html><html lang="zh-CN" data-theme="{theme}"><meta charset="utf-8"><style>{css}</style>'
                    f'<body style="margin:0;padding:16px"><figure class="fig" style="width:{w}px;margin:0">{svg}'
                    f'<figcaption><b>{meta.get("title", "")}</b></figcaption></figure></body></html>')
            page = out / f"{key}-{theme}-{w}.html"
            page.write_text(html, encoding="utf-8")
            png = out / f"{key}-{theme}-{w}.png"
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-proxy-server", "--hide-scrollbars",
                            "--force-device-scale-factor=2", f"--window-size={max(w + 60, 520)},760",
                            f"--screenshot={png}", page.as_uri()], capture_output=True, timeout=60)
            print(png)

if __name__ == "__main__":
    main()
