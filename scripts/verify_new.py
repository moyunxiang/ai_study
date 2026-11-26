#!/usr/bin/env python3
"""核对一轮新登记的节点：标题和日期是不是和公开文献库对得上。

  python3 scripts/verify_new.py more1            核对 data/skeleton/*.more1.txt 里的全部节点
  python3 scripts/verify_new.py more1 --track sci 只核对一条分支

做法：
  1. 讲解文件的 links / check.source 里有 arXiv 编号的，批量查 arXiv 官方记录，比对标题（和登记表的 full）与首次提交月份（和登记表的 date）。
  2. 没有 arXiv 编号、但有英文原题的论文，用 Crossref 按标题查，只比对有没有标题几乎相同的记录。
  3. 其余（模型发布、系统、事件、没有英文原题的）不核对，标 skip。
结果打印出来，并写到 data/_reports/verify_<轮次>.tsv（不入库）。状态：
  ok        标题对得上，日期相差不超过容许范围
  title?    arXiv 编号存在，但那篇论文的标题和登记的 full 差得多（可能链接贴错，或 full 写的不是官方标题）
  date?     标题对得上，日期和 arXiv 首次提交月份相差超过 2 个月（登记的可能是正式发表日期）
  missing   arXiv 编号查不到记录，或 Crossref 没有标题相近的记录
  no-file   登记了但没有讲解文件
  skip      没有可核对的线索
这是机械核对，只能发现“查无此文”“链接贴错”“日期差得远”，不能代替读原文。
"""
import difflib
import json
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lookup import fetch, throttle  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
NS = {"a": "http://www.w3.org/2005/Atom"}
ARX = re.compile(r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})", re.I)


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def close(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0 if min(len(a), len(b)) >= 12 else 0.8
    return difflib.SequenceMatcher(None, a, b).ratio()


def months(a, b):
    ya, ma = int(a[:4]), int(a[5:7] or 6) if len(a) >= 7 else 6
    yb, mb = int(b[:4]), int(b[5:7])
    return (ya - yb) * 12 + (ma - mb)


def registry(rnd, only):
    rows = []
    for p in sorted((DATA / "skeleton").glob(f"*.{rnd}.txt")):
        track = p.name.split(".")[0]
        if only and track != only:
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            f = [x.strip() for x in line.split("|")]
            if len(f) == 7:
                rows.append(dict(track=track, id=f[0], date=f[1], tier=f[2], kind=f[3], title=f[4], full=f[5]))
    return rows


def arxiv_batch(ids):
    out = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i:i + 40]
        throttle()
        xml = fetch("https://export.arxiv.org/api/query?max_results=60&id_list=" + ",".join(chunk), tries=6, timeout=40)
        for e in ET.fromstring(xml).findall("a:entry", NS):
            g = lambda t: re.sub(r"\s+", " ", (e.findtext(f"a:{t}", "", NS) or "")).strip()
            m = re.search(r"abs/(.+?)(v\d+)?$", g("id"))
            if m and g("title"):
                out[m.group(1)] = (g("title"), g("published")[:7])
    return out


def crossref(q):
    try:
        data = json.loads(fetch("https://api.crossref.org/works?rows=5&select=title,issued&query.title=" + urllib.parse.quote(q), tries=3))
    except Exception as e:  # 网络问题不算节点的错
        return None, f"Crossref查询失败：{e}"
    best = (0.0, "", "")
    for w in data.get("message", {}).get("items", []):
        t = (w.get("title") or [""])[0]
        parts = (w.get("issued", {}).get("date-parts") or [[None]])[0]
        d = "-".join(f"{x:02d}" if i else str(x) for i, x in enumerate(parts) if x)
        r = close(q, t)
        if r > best[0]:
            best = (r, t, d)
    return best, ""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    rnd = args[0]
    only = sys.argv[sys.argv.index("--track") + 1] if "--track" in sys.argv else None
    rows = registry(rnd, only)
    for r in rows:
        f = DATA / "content" / r["track"] / f"{r['id']}.json"
        r["arx"] = None
        if not f.exists():
            r["status"], r["note"] = "no-file", ""
            continue
        try:
            c = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            r["status"], r["note"] = "no-file", f"讲解文件不是合法JSON：{e}"
            continue
        blob = json.dumps([c.get("links"), (c.get("check") or {}).get("source") if isinstance(c.get("check"), dict) else c.get("check")], ensure_ascii=False)
        ids = ARX.findall(blob)
        r["arx"] = ids[0] if ids else None
    found = arxiv_batch(sorted({r["arx"] for r in rows if r["arx"]}))
    for r in rows:
        if "status" in r:
            continue
        if r["arx"]:
            hit = found.get(r["arx"])
            if not hit:
                r["status"], r["note"] = "missing", f"arXiv:{r['arx']} 查不到记录"
                continue
            t, d = hit
            sim = close(r["full"] or r["title"], t)
            gap = months(r["date"], d)
            if r["full"] and sim < 0.72:
                r["status"], r["note"] = "title?", f"arXiv:{r['arx']} 的标题是《{t}》（{d}），相似度{sim:.2f}"
            elif abs(gap) > 2:
                r["status"], r["note"] = "date?", f"登记{r['date']}，arXiv:{r['arx']} 首次提交{d}（差{gap:+d}个月）"
            else:
                r["status"], r["note"] = "ok", f"arXiv:{r['arx']} {d}"
        elif r["full"] and r["kind"] in ("paper", "dataset"):
            best, errmsg = crossref(r["full"])
            if best is None:
                r["status"], r["note"] = "skip", errmsg
            elif best[0] >= 0.85:
                r["status"], r["note"] = "ok", f"Crossref：《{best[1]}》 {best[2]}"
            else:
                r["status"], r["note"] = "missing", f"Crossref最接近的是《{best[1]}》（相似度{best[0]:.2f}）"
        else:
            r["status"], r["note"] = "skip", ""
    count = {}
    lines = ["status\ttrack\tid\tdate\tkind\tfull\tnote"]
    for r in rows:
        count[r["status"]] = count.get(r["status"], 0) + 1
        lines.append("\t".join([r["status"], r["track"], r["id"], r["date"], r["kind"], r["full"], r["note"]]))
        if r["status"] not in ("ok", "skip"):
            print(f"{r['status']:8s} {r['track']:7s} {r['id']:28s} {r['note']}")
    out = DATA / "_reports" / f"verify_{rnd}{'.' + only if only else ''}.tsv"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n共{len(rows)}个：" + "、".join(f"{k} {v}" for k, v in sorted(count.items())) + f"；明细 {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
