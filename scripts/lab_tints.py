#!/usr/bin/env python3
"""线上现版“只换颜色”的几套配色：读 docs/assets/style.css 里深色和浅色两组颜色变量，
在 OKLCH 里只转色相（亮度不动，彩度按比例），写成 design_lab/skins/tint-<名字>.css。

这样每套的明暗层次、对比度和现版一致，只有颜色不同；现版改了底色或强调色，重跑一遍就跟上。
分支自己的颜色（按色相 --h 算）和“已读 / 解决 / 使用”这类有含义的红绿蓝不动。

  python3 scripts/lab_tints.py          生成全部
  python3 scripts/lab_tints.py --check  只打印每套的对比度，不写文件
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "assets" / "style.css"
OUT = ROOT / "design_lab" / "skins"

# 名字: (说明, 强调色的目标色相, 底色和文字的彩度倍数, 强调色的彩度倍数, 深色强调色亮度, 浅色强调色亮度)
TINTS = {
    "blue":     ("蓝：深海军蓝底、天蓝强调色", 255, 1.2, 1.7, 0.77, None),
    "indigo":   ("靛：蓝紫底、靛蓝强调色", 280, 1.2, 1.7, 0.76, None),
    "violet":   ("紫：暗紫底、淡紫强调色", 305, 1.1, 1.5, 0.79, None),
    "cyan":     ("青：青黑底、湖青强调色", 205, 1.0, 1.0, None, None),
    "amber":    ("琥珀：暖黑底、琥珀黄强调色", 78, 0.9, 1.1, None, None),
    "rose":     ("玫红：酒红黑底、玫瑰粉强调色", 5, 0.9, 1.4, 0.8, None),
    "graphite": ("石墨：不带颜色的黑白灰，强调色是白（浅色下是黑）", 252, 0.12, 0.0, 0.93, 0.24),
}
# 跟着转色相的变量；--red / --green / --blue 有固定含义，不动
TOKENS = ["paper", "paper-2", "card", "ink", "ink-2", "muted", "rule", "rule-2", "ctl",
          "accent", "accent-ink", "accent-soft", "halo", "shadow"]
ACCENTS = {"accent", "accent-soft", "halo"}


def to_oklch(r, g, b):
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    l = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
    m = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
    s = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def to_lin(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def to_srgb(L, C, H):
    """超出 sRGB 时只降彩度，亮度和色相不动。"""
    ok = lambda c: all(-1e-4 <= v <= 1 + 1e-4 for v in to_lin(L, c, H))
    if not ok(C):
        lo, hi = 0.0, C
        for _ in range(30):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if ok(mid) else (lo, mid)
        C = lo
    enc = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return tuple(round(255 * enc(min(1, max(0, v)))) for v in to_lin(L, C, H))


def parse(v):
    """'#RRGGBB' 或 'rgb(r g b / a)' → (r, g, b, 透明度写法或 None)；别的写法返回 None。"""
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", v)
    if m:
        h = m.group(1)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), None
    m = re.fullmatch(r"rgb\((\d+) (\d+) (\d+) / ([.\d]+)\)", v)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
    return None


def block(css, start):
    i = css.index(start) + len(start)
    return dict(re.findall(r"--([a-z0-9-]+):\s*([^;]+);", css[i:css.index("}", i)]))


def shift(tokens, hue, cn, ca, acc_l):
    base = to_oklch(*(c / 255 for c in parse(tokens["accent"])[:3]))[2]
    out = {}
    for k in TOKENS:
        v = tokens[k]
        m = re.search(r"#[0-9a-fA-F]{6}|rgb\([^)]*\)", v)      # --shadow 的值前面还有偏移和模糊
        p = parse(m.group(0)) if m else None
        if not p:
            out[k] = v
            continue
        L, C, H = to_oklch(*(c / 255 for c in p[:3]))
        acc = k in ACCENTS
        if acc and acc_l is not None:
            L = acc_l
        if k == "accent-ink" and acc_l is not None:            # 强调色亮度反过来了，上面的字也要反
            L = 0.13 if acc_l > 0.6 else 1.0
        r, g, b = to_srgb(L, C * (ca if acc else cn), (H + hue - base) % 360)
        new = f"rgb({r} {g} {b} / {p[3]})" if p[3] else "#%02X%02X%02X" % (r, g, b)
        out[k] = v[:m.start()] + new + v[m.end():]
    return out


def lum(hexv):
    r, g, b = (c / 255 for c in parse(hexv)[:3])
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def main():
    css = SRC.read_text(encoding="utf-8")
    dark, light = block(css, ":root{"), block(css, ":root[data-theme=light]{")
    check = "--check" in sys.argv
    pairs = [("正文", "ink", "paper"), ("次要字", "muted", "paper"), ("强调色", "accent", "paper"), ("强调色上的字", "accent-ink", "accent")]
    print("对比度（%s）：" % " / ".join(p[0] for p in pairs))
    rows = [("现版", dark, light)]
    for name, (note, hue, cn, ca, ld, ll) in TINTS.items():
        d, l = shift(dark, hue, cn, ca, ld), shift(light, hue, cn, ca, ll)
        rows.append((name, d, l))
        if check:
            continue
        decl = lambda t: ";".join(f"--{k}:{t[k]}" for k in TOKENS)
        (OUT / f"tint-{name}.css").write_text(
            f"/* {note}。由 scripts/lab_tints.py 从现版的颜色变量转色相得到，不要手改。\n"
            "   只换颜色：版式、字体、分支各自的颜色都和现版一样；深色、浅色、跟随系统三档照常切换。 */\n"
            "@media screen{\n"
            f"html:root{{{decl(d)}}}\n"
            f"html:root[data-theme=light]{{{decl(l)}}}\n"
            f"@media (prefers-color-scheme:light){{html:root[data-theme=auto]{{{decl(l)}}}}}\n"
            "}\n", encoding="utf-8")
    for name, d, l in rows:
        f = lambda t: " / ".join("%.1f" % contrast(t[a], t[b]) for _, a, b in pairs)
        print(f"  {name:9s} 深色 {f(d)}   浅色 {f(l)}   强调色 {d['accent']} {l['accent']}  底色 {d['paper']} {l['paper']}")
    if not check:
        print(f"已写入 {len(TINTS)} 个文件到 {OUT.relative_to(ROOT)}/tint-*.css")


if __name__ == "__main__":
    main()
