#!/usr/bin/env python3
"""汇总普查文件里的注释行（# FIX / # PARENT / # SUGGEST / # DROP / # NOTE）。

  python3 scripts/notes.py            打印汇总
  python3 scripts/notes.py --apply    把能自动解析的 # PARENT 写入 data/skeleton/_parents.txt（build.py 会读取）
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SK = ROOT / "data" / "skeleton"

ids = {}
for p in sorted(SK.glob("*.txt")):
    if p.name.startswith("_"):
        continue
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#") and line.count("|") == 6:
            f = [x.strip() for x in line.split("|")]
            ids[f[0]] = f[1]

notes = defaultdict(list)
for p in sorted(SK.glob("*.add*.txt")):
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"#\s*(FIX|PARENT|SUGGEST|DROP|NOTE)\b[:：]?\s*(.*)", line.strip())
        if m:
            notes[m.group(1)].append((p.name.split(".")[0], m.group(2).strip()))

parents, bad = [], []
for src, text in notes["PARENT"]:
    m = re.match(r"([a-z0-9.\-]+)\s*(?:<-|←)\s*(.*)", text)
    if not m or m.group(1) not in ids:
        bad.append((src, text))
        continue
    child, ok = m.group(1), []
    for tok in re.split(r"[,，、\s/]+|和|与", m.group(2)):
        tok = tok.strip(" .;；。()（）")
        if tok in ids and tok != child:
            if ids[tok][:4] <= ids[child][:4]:
                ok.append(tok)
        elif ok:          # 第一个不是id的词之后都是理由
            break
    (parents if ok else bad).append((child, ok) if ok else (src, text))

if "--apply" in sys.argv:
    out = ["# 由 scripts/notes.py --apply 生成：普查agent建议补上的 parent。格式：child <- p1, p2"]
    out += [f"{c} <- {', '.join(ps)}" for c, ps in parents]
    (SK / "_parents.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"已写入 {len(parents)} 条到 data/skeleton/_parents.txt")

print(f"PARENT 可解析 {len(parents)} 条，无法解析 {len(bad)} 条")
for src, text in bad:
    print(f"  ? [{src}] {text}")
for kind in ("FIX", "DROP", "NOTE"):
    print(f"\n{kind} {len(notes[kind])} 条")
    for src, text in notes[kind]:
        print(f"  [{src}] {text}")
by = defaultdict(list)
for src, text in notes["SUGGEST"]:
    m = re.match(r"([a-z]+)\s*[:：]\s*(.*)", text)
    by[m.group(1) if m else "?"].append((src, m.group(2) if m else text))
print(f"\nSUGGEST {len(notes['SUGGEST'])} 条")
for k in sorted(by):
    print(f"  → {k}: {len(by[k])}")
if "--suggest" in sys.argv:
    for k in sorted(by):
        print(f"\n## {k}")
        for src, text in by[k]:
            print(f"- (来自{src}) {text}")
