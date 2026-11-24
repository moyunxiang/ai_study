#!/usr/bin/env python3
"""线上现版“只换颜色”的最终备选：浅色五套、深色五套，分开选。
生成 design_lab/colors/l-<名字>.css、d-<名字>.css 和 design_lab/colors.json。

最终备选在 FINAL 里，每一项指向下面两类来源之一（名字为空是现版本身，不生成文件）：
  SCHEMES  照着真实网站和公开配色方案的思路定的：每套给出深色、浅色各一组“纸、字、强调色”，
           其余的中间色（次要字、线、控件边）按现版的明暗层次在纸和字之间取；不带发光和首页的光晕。
  TINTS    把现版的颜色在 OKLCH 里整体转一个色相，其他都不动（发光也保留）。
没进 FINAL 的来源留在这里备用，不生成文件。

只改颜色变量，版式、字体、十六条分支各自的颜色、“已读 / 解决 / 使用”这类有含义的红绿蓝都不动。
浅色文件只在浅色外观下生效，深色文件只在深色外观下生效，所以两边可以各选各的。
强调色对底色的对比度不到 4.5 时，脚本会自动把它调深（或调亮）到够，并在输出里标出来。

  python3 scripts/lab_colors.py          生成，并打印对比度
  python3 scripts/lab_colors.py --check  只打印，不写文件
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "assets" / "style.css"
LAB = ROOT / "design_lab"
OUT = LAB / "colors"

# 名字: (显示名, 一句说明, 深色 {...}, 浅色 {...})；每组至少有 paper / ink / accent，其余可以指定也可以让脚本取
SCHEMES = {
    "mono": ("黑白", "纯黑纯白，不用任何彩色；参考极简的开发者工具站",
             dict(paper="#000000", ink="#EDEDED", accent="#FFFFFF", **{"paper-2": "#111111", "card": "#0A0A0A", "rule": "#333333", "rule-2": "#222222", "muted": "#8F8F8F"}),
             dict(paper="#FFFFFF", ink="#000000", accent="#000000", **{"paper-2": "#FAFAFA", "card": "#FFFFFF", "rule": "#E5E5E5", "rule-2": "#EFEFEF", "muted": "#666666"})),
    "green": ("素绿", "白纸黑字，只留一点深绿，是现版的绿去掉发光之后的样子；参考长文阅读站",
              dict(paper="#121212", ink="#EDEDED", accent="#6CC58F"),
              dict(paper="#FFFFFF", ink="#191919", accent="#1A7F37", **{"paper-2": "#F7F7F7"})),
    "news": ("报纸", "新闻纸的米白、黑字，全页只有一处红；参考报纸和新闻周刊的网站",
             dict(paper="#141414", ink="#ECE8E0", accent="#F0584C"),
             dict(paper="#F6F3EC", ink="#121212", accent="#E3120B")),
    "salmon": ("粉纸", "三文鱼粉的纸色，青绿的链接；参考财经报纸的网站",
               dict(paper="#262A33", ink="#F3E3D3", accent="#5FC1CC"),
               dict(paper="#FFF1E5", ink="#33302E", accent="#0D7680", **{"card": "#FFF8F2"})),
    "wiki": ("百科", "纯白、深灰字、链接蓝，像一页百科条目；参考百科网站",
             dict(paper="#101418", ink="#EAECF0", accent="#88A3E8", **{"paper-2": "#1B1E22"}),
             dict(paper="#FFFFFF", ink="#202122", accent="#3366CC", **{"paper-2": "#F8F9FA", "rule": "#C8CCD1", "rule-2": "#EAECF0", "muted": "#54595D"})),
    "code": ("代码", "冷白和冷黑、细灰线、标准的蓝；参考代码托管网站的设计规范",
             dict(paper="#0D1117", ink="#F0F6FC", accent="#4493F8", **{"paper-2": "#151B23", "rule": "#3D444D", "rule-2": "#262C36", "muted": "#9198A1"}),
             dict(paper="#FFFFFF", ink="#1F2328", accent="#0969DA", **{"paper-2": "#F6F8FA", "rule": "#D1D9E0", "rule-2": "#E4E9EE", "muted": "#59636E"})),
    "note": ("笔记", "暖灰的字和线，一点不抢眼的蓝；参考笔记应用",
             dict(paper="#191919", ink="#D9D8D5", accent="#529CCA", **{"paper-2": "#202020", "rule": "#373737"}),
             dict(paper="#FFFFFF", ink="#37352F", accent="#0B6E99", **{"paper-2": "#F7F6F3", "rule": "#E3E2DE", "rule-2": "#EEEDEA"})),
    "zhumo": ("朱墨", "宣纸、墨色、朱砂；参考书画和线装书",
              dict(paper="#181613", ink="#EBE4D4", accent="#E8705F"),
              dict(paper="#F5EFE0", ink="#1F1B16", accent="#B3322A")),
    "qinghua": ("青花", "白底钴蓝；深色下是整页的钴蓝底配白字。参考青花瓷",
                dict(paper="#14306B", ink="#F4F6FA", accent="#FFFFFF", **{"paper-2": "#1A3A7C", "card": "#112A5E"}),
                dict(paper="#F8F8F4", ink="#16233F", accent="#1D4E9E")),
    "solar": ("日晒", "米黄的纸、青灰的字（深色下是墨青底）；参考Solarized配色方案",
              dict(paper="#002B36", ink="#EEE8D5", accent="#268BD2", **{"paper-2": "#073642", "ink-2": "#B4BFBD", "muted": "#839496"}),
              dict(paper="#FDF6E3", ink="#073642", accent="#268BD2", **{"paper-2": "#EEE8D5", "ink-2": "#4B6168", "muted": "#657B83"})),
    "gruv": ("复古", "发黄的暖色，像旧显示器和旧纸；参考Gruvbox配色方案",
             dict(paper="#282828", ink="#EBDBB2", accent="#FABD2F", **{"paper-2": "#32302F", "rule": "#504945", "muted": "#A89984"}),
             dict(paper="#FBF1C7", ink="#3C3836", accent="#AF3A03", **{"paper-2": "#F2E5BC", "rule": "#D5C4A1", "muted": "#7C6F64"})),
    "nord": ("北欧", "偏蓝的冷灰，颜色都压得很低；参考Nord配色方案",
             dict(paper="#2E3440", ink="#ECEFF4", accent="#88C0D0", **{"paper-2": "#3B4252", "ink-2": "#D8DEE9", "rule": "#4C566A"}),
             dict(paper="#ECEFF4", ink="#2E3440", accent="#5E81AC", **{"paper-2": "#E5E9F0", "card": "#F4F6FA"})),
}

# 名字: (显示名, 说明, 强调色的目标色相, 底色和文字的彩度倍数, 强调色的彩度倍数, 深色强调色亮度, 浅色强调色亮度)
TINTS = {
    "blue":     ("蓝", "现版转色相：深海军蓝底、天蓝强调色", 255, 1.2, 1.7, 0.77, None),
    "indigo":   ("靛", "现版转色相：蓝紫底、靛蓝强调色", 280, 1.2, 1.7, 0.76, None),
    "violet":   ("紫", "现版转色相：暗紫底、淡紫强调色", 305, 1.1, 1.5, 0.79, None),
    "cyan":     ("青", "现版转色相：青黑底、湖青强调色", 205, 1.0, 1.0, None, None),
    "amber":    ("琥珀", "现版转色相：暖黑底、琥珀黄强调色", 78, 0.9, 1.1, None, None),
    "rose":     ("玫红", "现版转色相：酒红黑底、玫瑰粉强调色", 5, 0.9, 1.4, 0.8, None),
    "graphite": ("石墨", "现版去掉颜色：黑白灰，强调色是白（浅色下是黑）", 252, 0.12, 0.0, 0.93, 0.24),
}
# 最终备选。每项：(来源名字, 显示名, 一句说明)；来源名字为空是现版
FINAL = {
    "l": [("", "原版", "现在线上的浅色：淡绿白的纸、深绿"),
          ("mono", "黑白", "纯白纸、纯黑字，不用任何彩色"),
          ("news", "报纸", "新闻纸的米白、黑字，全页只有一处红"),
          ("qinghua", "青花", "米白的纸、藏青的字、钴蓝"),
          ("salmon", "粉纸", "三文鱼粉的纸、青绿的链接")],
    "d": [("", "原版", "现在线上的深色：墨绿黑底、薄荷绿"),
          ("amber", "琥珀", "现版换成暖色：暖黑底、琥珀黄"),
          ("blue", "蓝", "现版换成蓝色：深海军蓝底、天蓝"),
          ("cyan", "青", "现版换成青色：青黑底、湖青"),
          ("graphite", "石墨", "现版去掉颜色：近黑的灰底、白")],
}
# 跟着换的变量；--red / --green / --blue 有固定含义，不动
TOKENS = ["paper", "paper-2", "card", "ink", "ink-2", "muted", "rule", "rule-2", "ctl",
          "accent", "accent-ink", "accent-soft", "halo", "shadow"]
ACCENTS = {"accent", "accent-soft", "halo"}
# 中间色在“纸 → 字”之间的位置，量的是现版的明暗层次
STEPS = {"paper-2": 0.045, "rule-2": 0.09, "rule": 0.17, "ctl": 0.44, "muted": 0.62, "ink-2": 0.82}


def to_oklab(r, g, b):
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    l = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
    m = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
    s = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def to_oklch(r, g, b):
    L, A, B = to_oklab(r, g, b)
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
    L = min(1.0, max(0.0, L))
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


hexs = lambda rgb: "#%02X%02X%02X" % tuple(rgb)
lch = lambda hexv: to_oklch(*(c / 255 for c in parse(hexv)[:3]))


def lum(hexv):
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c / 255) for c in parse(hexv)[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def mix(a, b, t):
    """在 OKLab 里从 a 走到 b 的 t 处。"""
    la, lb = (to_oklab(*(c / 255 for c in parse(x)[:3])) for x in (a, b))
    L, A, B = (p + (q - p) * t for p, q in zip(la, lb))
    return hexs(to_srgb(L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360))


def fit(color, bg, target):
    """把 color 的亮度往远离 bg 的方向挪，直到对比度够 target；返回 (新颜色, 是否动过)。"""
    if contrast(color, bg) >= target:
        return color, False
    L, C, H = lch(color)
    step = 0.004 if lum(bg) < 0.18 else -0.004
    for _ in range(250):
        L += step
        c = hexs(to_srgb(L, C, H))
        if contrast(c, bg) >= target:
            return c, True
    return c, True


def block(css, start):
    i = css.index(start) + len(start)
    return dict(re.findall(r"--([a-z0-9-]+):\s*([^;]+);", css[i:css.index("}", i)]))


def scheme(spec, dark):
    """由“纸、字、强调色”补齐一整组变量。"""
    t, notes = dict(spec), []
    paper, ink = t["paper"], t["ink"]
    for k, s in STEPS.items():
        t.setdefault(k, mix(paper, ink, s))
    t.setdefault("card", mix(paper, ink, 0.025) if dark else mix(paper, "#FFFFFF", 0.6))
    for k, target in (("muted", 4.6), ("ink-2", 7.0), ("ctl", 3.0), ("accent", 4.5)):
        t[k], moved = fit(t[k], paper, target)
        if moved and k in spec:
            notes.append(f"{k} {spec[k]}→{t[k]}")
    if "accent-ink" not in t:
        t["accent-ink"] = max((paper if dark else "#FFFFFF", "#FFFFFF", mix(paper, "#000000", 0.6) if dark else ink),
                              key=lambda c: contrast(c, t["accent"]))
    r, g, b, _ = parse(t["accent"])
    t["accent-soft"] = f"rgb({r} {g} {b} / {'.12' if dark else '.08'})"
    t["halo"] = "transparent"
    ir, ig, ib, _ = parse(ink)
    t["shadow"] = "0 18px 44px rgb(0 0 0 / .5)" if dark else f"0 14px 36px rgb({ir} {ig} {ib} / .14)"
    t["gl"] = "0px"
    Lp = lch(paper)[0]
    t["osl"] = ("%.3f" % (Lp + 0.07 if dark else min(0.935, Lp - 0.04))).lstrip("0")     # 分支色的浅底跟着纸的明暗走
    return t, notes


def shift(tokens, hue, cn, ca, acc_l):
    base = lch(tokens["accent"])[2]
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
        new = f"rgb({r} {g} {b} / {p[3]})" if p[3] else hexs((r, g, b))
        out[k] = v[:m.start()] + new + v[m.end():]
    return out


def css(note, mode, t, flat=False):
    """只在一种外观下生效：深色是没有 data-theme（或跟随系统且系统是深色），浅色是 data-theme=light（或跟随系统且系统是浅色）。
    flat 为真时连首页标题后面那团淡淡的光晕也去掉。"""
    decl = ";".join(f"--{k}:{v}" for k, v in t.items())
    if mode == "l":
        on, media = ["html:root[data-theme=light]"], "light"
    else:
        on, media = ["html:root:not([data-theme])", 'html:root[data-theme=""]', "html:root[data-theme=dark]"], "dark"
    rule = lambda sels, suffix, body: ",".join(x + suffix for x in sels) + "{" + body + "}"
    hide = "display:none"
    return (f"/* {note}。由 scripts/lab_colors.py 生成，不要手改。只换颜色，只在{'浅色' if mode == 'l' else '深色'}外观下生效。 */\n"
            "@media screen{\n" + rule(on, "", decl) + "\n" + (rule(on, " .hero::before", hide) + "\n" if flat else "")
            + f"@media (prefers-color-scheme:{media}){{" + rule(["html:root[data-theme=auto]"], "", decl)
            + (rule(["html:root[data-theme=auto]"], " .hero::before", hide) if flat else "") + "}\n}\n")


def tokens(src, mode, base):
    """来源名字 → 这一档外观下的整组变量和“调过”的说明。"""
    if not src:
        return base, []
    if src in SCHEMES:
        return scheme(SCHEMES[src][2 if mode == "d" else 3], mode == "d")
    _, _, hue, cn, ca, ld, ll = TINTS[src]
    return shift(base, hue, cn, ca, ld if mode == "d" else ll), []


def main():
    src = SRC.read_text(encoding="utf-8")
    base = {"d": block(src, ":root{"), "l": block(src, ":root[data-theme=light]{")}
    check = "--check" in sys.argv
    pairs = [("正文", "ink", "paper"), ("次要字", "muted", "paper"), ("控件边", "ctl", "paper"), ("强调色", "accent", "paper"), ("强调色上的字", "accent-ink", "accent")]
    print("对比度（%s）：" % " / ".join(p[0] for p in pairs))
    low, files, listing = 0, {}, {}
    for mode, label in (("l", "浅色"), ("d", "深色")):
        listing[mode] = []
        for key, name, note in FINAL[mode]:
            t, notes = tokens(key, mode, base[mode])
            bad = [m for m, a, b in pairs if contrast(t[a], t[b]) < (3.0 if a == "ctl" else 4.5)]
            low += len(bad)
            print(f"  {label} {name:4s} " + " / ".join("%.1f" % contrast(t[a], t[b]) for _, a, b in pairs)
                  + ("   ← 有不够的：" + "、".join(bad) if bad else "") + ("   调过：" + "；".join(notes) if notes else ""))
            if key:
                files[f"{mode}-{key}"] = css(f"{label} · {name}：{note}", mode, t, flat=key in SCHEMES)
            listing[mode].append({"key": key, "name": name, "note": note, **{k: t[k] for k in ("paper", "ink", "accent")}})
    if check:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.css"):
        old.unlink()
    for key, text in files.items():
        (OUT / f"{key}.css").write_text(text, encoding="utf-8")
    (LAB / "colors.json").write_text(json.dumps(listing, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"已写入 {len(files)} 个文件到 {OUT.relative_to(ROOT)}/，清单 design_lab/colors.json；对比度不够的有 {low} 处")


if __name__ == "__main__":
    main()
