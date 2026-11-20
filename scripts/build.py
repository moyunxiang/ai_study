#!/usr/bin/env python3
"""校验并构建站点数据。

  python3 scripts/build.py --check     只校验，不写任何文件（agent自检用）
  python3 scripts/build.py             校验 + 生成 docs/data/*.json
  python3 scripts/build.py --stats     额外打印各分支覆盖率

输入：
  data/tracks.json, data/eras.json
  data/skeleton/<track>.txt 与 <track>.add.txt   节点登记表（竖线分隔）
  data/content/<track>/<id>.json                 节点讲解
  data/concepts/<key>.json                       基础概念词条
输出：
  docs/data/graph.json        节点（短字段）、边、分支、时代
  docs/data/content/<track>.json   节点长讲解，按分支懒加载
  docs/data/concepts.json     概念词条 + 从各节点 terms 汇总的术语
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "data"

KINDS = {"paper", "model", "system", "hardware", "dataset", "event", "concept"}
REL_TYPES = {"solves", "extends", "uses", "rivals"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9.\-]*$")
DATE_RE = re.compile(r"^(19|20)\d\d(-(0[1-9]|1[0-2]))?$")

SHORT = ["problem", "idea", "impact"]
LONG = ["background", "method", "results", "legacy", "pitfalls", "learn"]
REQUIRED = {1: ["who", "links", "problem", "idea", "impact", "background", "method", "results", "legacy", "limits", "learn", "check"],
            2: ["who", "links", "problem", "idea", "impact", "background", "method", "legacy", "limits", "check"],
            3: ["who", "links", "problem", "idea", "impact", "method", "check"]}
MIN_LEN = {1: 500, 2: 280, 3: 110}   # background+method+results+legacy 的最少汉字数
ALLOWED = {"id", "who", "venue", "links", *SHORT, *LONG, "limits", "relations", "prereq", "terms", "check"}

errors, warnings = [], []


def err(where, msg):
    errors.append(f"ERROR  {where}: {msg}")


def warn(where, msg):
    warnings.append(f"warn   {where}: {msg}")


def date_key(d):
    return d if len(d) == 7 else d + "-00"


def load_skeleton(track_keys):
    nodes, order = {}, []
    for path in sorted((DATA / "skeleton").glob("*.txt")):
        if path.name.startswith("_"):
            continue
        track = path.name.split(".")[0]
        rel = path.relative_to(ROOT)
        if track not in track_keys:
            err(rel, f"文件名对应的分支 {track!r} 不在 tracks.json 中")
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            where = f"{rel}:{n}"
            if len(parts) != 7:
                err(where, f"应有7个字段，实际 {len(parts)} 个（标题里不要出现竖线）")
                continue
            nid, date, tier, kind, title, full, parents = parts
            if not ID_RE.match(nid):
                err(where, f"id {nid!r} 只能用小写字母、数字、连字符、点")
                continue
            if nid in nodes:
                err(where, f"id {nid!r} 重复，已在 {nodes[nid]['_where']} 定义")
                continue
            if not DATE_RE.match(date):
                err(where, f"{nid}: 日期 {date!r} 应为 YYYY 或 YYYY-MM")
                continue
            if tier not in ("1", "2", "3"):
                err(where, f"{nid}: tier 应为 1/2/3")
                continue
            if kind not in KINDS:
                err(where, f"{nid}: kind {kind!r} 不在 {sorted(KINDS)}")
                continue
            if not title:
                err(where, f"{nid}: title 为空")
                continue
            nodes[nid] = {"id": nid, "date": date, "tier": int(tier), "kind": kind, "title": title,
                          "full": full, "track": track,
                          "parents": [p.strip() for p in parents.split(",") if p.strip()],
                          "_where": where, "_added": path.name.endswith(".add.txt")}
            order.append(nid)
    extra = DATA / "skeleton" / "_parents.txt"      # 普查阶段建议补上的 parent：child <- p1, p2
    if extra.exists():
        for n, line in enumerate(extra.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            child, _, ps = line.partition("<-")
            child = child.strip()
            if child not in nodes:
                err(f"data/skeleton/_parents.txt:{n}", f"child {child!r} 不存在")
                continue
            nodes[child]["parents"] += [x.strip() for x in ps.split(",") if x.strip()]
    for nid in order:
        n = nodes[nid]
        keep = []
        for p in n["parents"]:
            if p == nid:
                err(n["_where"], f"{nid}: parent 不能是自己")
            elif p not in nodes:
                err(n["_where"], f"{nid}: parent {p!r} 不存在")
            else:
                if date_key(nodes[p]["date"])[:4] > date_key(n["date"])[:4]:
                    warn(n["_where"], f"{nid} ({n['date']}) 的 parent {p} ({nodes[p]['date']}) 比它晚")
                keep.append(p)
        n["parents"] = list(dict.fromkeys(keep))
    # 官方标题重复 → 多半是两个分支收了同一篇
    seen = {}
    for nid in order:
        f = re.sub(r"[^a-z0-9]", "", nodes[nid]["full"].lower())
        if len(f) > 12:
            if f in seen:
                warn(nodes[nid]["_where"], f"{nid} 与 {seen[f]} 的官方标题相同，可能重复收录")
            seen[f] = nid
    return nodes, order


def cjk_len(s):
    return len(re.findall(r"[一-鿿]", s or ""))


def load_content(nodes):
    content = {}
    root = DATA / "content"
    for path in sorted(root.glob("*/*.json")):
        rel = path.relative_to(ROOT)
        try:
            c = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"不是合法JSON：{e}")
            continue
        nid = c.get("id")
        if nid != path.stem:
            err(rel, f"id {nid!r} 与文件名不一致")
            continue
        if nid not in nodes:
            err(rel, f"id {nid!r} 不在节点登记表里")
            continue
        node = nodes[nid]
        if node["track"] != path.parent.name:
            err(rel, f"应放在 data/content/{node['track']}/ 下")
        for k in c:
            if k not in ALLOWED:
                err(rel, f"未知字段 {k!r}")
        for k in REQUIRED[node["tier"]]:
            if not c.get(k):
                err(rel, f"tier {node['tier']} 节点缺少字段 {k!r}")
        body = sum(cjk_len(c.get(k)) for k in ("background", "method", "results", "legacy"))
        if body < MIN_LEN[node["tier"]]:
            err(rel, f"讲解正文只有 {body} 个汉字，tier {node['tier']} 至少 {MIN_LEN[node['tier']]}")
        for k in SHORT:
            if cjk_len(c.get(k)) > 110:
                warn(rel, f"{k} 过长（{cjk_len(c.get(k))} 字），短字段应在一两句内")
        links = c.get("links") or []
        if not isinstance(links, list) or any(not isinstance(l, dict) or not str(l.get("url", "")).startswith("http") or not l.get("label") for l in links):
            err(rel, "links 应为 [{label, url}]，url 以 http 开头")
        for lim in c.get("limits") or []:
            if not isinstance(lim, dict) or not lim.get("text"):
                err(rel, "limits 每项应为 {text, solved_by?}")
                continue
            for s in lim.get("solved_by") or []:
                if s not in nodes:
                    err(rel, f"limits.solved_by 引用了不存在的 id {s!r}")
                elif date_key(nodes[s]["date"])[:4] < node["date"][:4]:
                    err(rel, f"limits.solved_by {s!r} 比本节点还早，方向反了")
        for r in c.get("relations") or []:
            if not isinstance(r, dict) or r.get("type") not in REL_TYPES or not r.get("note"):
                err(rel, f"relations 每项应为 {{to, type∈{sorted(REL_TYPES)}, note}}")
                continue
            if r.get("to") not in nodes:
                err(rel, f"relations.to 引用了不存在的 id {r.get('to')!r}")
            elif r["to"] == nid:
                err(rel, "relations.to 不能是自己")
            elif date_key(nodes[r["to"]]["date"])[:4] > node["date"][:4]:
                err(rel, f"relations.to {r['to']!r} 比本节点晚；relations 只指向更早的工作")
        for t in c.get("terms") or []:
            if not isinstance(t, dict) or not t.get("t") or not t.get("d"):
                err(rel, "terms 每项应为 {t, d}")
        chk = c.get("check")
        if chk and (not isinstance(chk, dict) or not chk.get("source") or not chk.get("confirmed")):
            err(rel, "check 应为 {source, confirmed}")
        content[nid] = c
    return content


AREAS = {"math", "prob", "opt", "ml", "nn", "seq", "gen", "rl", "vis", "aud", "emb", "sys", "eval"}
LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")


def load_concepts():
    """登记表 data/concepts.txt（key | 名称 | English | area | level）+ 正文 data/concepts/<key>.json。"""
    reg = {}
    path = DATA / "concepts.txt"
    if path.exists():
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [x.strip() for x in line.split("|")]
            where = f"data/concepts.txt:{n}"
            if len(parts) != 5:
                err(where, f"应有5个字段，实际 {len(parts)} 个")
                continue
            key, name, en, area, level = parts
            if not ID_RE.match(key) or key in reg:
                err(where, f"概念 key {key!r} 非法或重复")
                continue
            if area not in AREAS or level not in ("0", "1", "2"):
                err(where, f"{key}: area 或 level 非法")
                continue
            reg[key] = {"key": key, "name": name, "en": en, "area": area, "level": int(level), "has": False}
    for path in sorted((DATA / "concepts").glob("*.json")):
        rel = path.relative_to(ROOT)
        try:
            c = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"不是合法JSON：{e}")
            continue
        key = c.get("key")
        if key != path.stem or key not in reg:
            err(rel, f"key {key!r} 与文件名不一致，或不在 data/concepts.txt 登记表里")
            continue
        for k in c:
            if k not in {"key", "short", "body", "example", "pitfalls", "needs"}:
                err(rel, f"未知字段 {k!r}")
        for k in ("short", "body"):
            if not c.get(k):
                err(rel, f"缺少字段 {k!r}")
        if cjk_len(c.get("body")) < 180:
            err(rel, f"body 只有 {cjk_len(c.get('body'))} 个汉字，至少 180")
        for d in c.get("needs") or []:
            if d not in reg:
                err(rel, f"needs 引用了未登记的概念 {d!r}")
        reg[key].update({k: c[k] for k in ("short", "body", "example", "pitfalls", "needs") if c.get(k)})
        reg[key]["has"] = True
    return reg


def check_links(nodes, content, concepts):
    """正文里的 [[节点id]] 与 [[c:概念key]] 必须能解析。"""
    def scan(where, text):
        for m in LINK_RE.finditer(text or ""):
            ref = m.group(1).strip()
            if ref.startswith("c:"):
                if ref[2:] not in concepts:
                    err(where, f"[[{ref}]] 指向未登记的概念")
            elif ref not in nodes:
                err(where, f"[[{ref}]] 指向不存在的节点")
    for nid, c in content.items():
        where = f"data/content/{nodes[nid]['track']}/{nid}.json"
        for k in (*SHORT, *LONG):
            scan(where, c.get(k))
        for lim in c.get("limits") or []:
            if isinstance(lim, dict):
                scan(where, lim.get("text"))
        for p in c.get("prereq") or []:
            if p not in concepts:
                err(where, f"prereq {p!r} 不是已登记的概念 key（见 data/concepts.txt）")
    for key, c in concepts.items():
        for k in ("body", "example", "pitfalls"):
            scan(f"data/concepts/{key}.json", c.get(k))


def build_edges(nodes, order, content):
    """边 = (较早的 from, 较晚的 to)。来源：骨架 parents、relations、limits.solved_by。"""
    edges = {}

    def put(a, b, typ, note, strong):
        if a == b or a not in nodes or b not in nodes:
            return
        e = edges.get((a, b))
        if e is None:
            edges[(a, b)] = {"from": a, "to": b, "type": typ, "note": note}
        elif strong or (not e["note"] and note):
            if typ != "extends" or e["type"] == "extends":
                e["type"] = typ
            if note:
                e["note"] = note

    for nid in order:
        for p in nodes[nid]["parents"]:
            put(p, nid, "extends", "", False)
    for nid, c in content.items():
        for r in c.get("relations") or []:
            if r.get("to") in nodes and r.get("type") in REL_TYPES:
                put(r["to"], nid, r["type"], r.get("note", ""), True)
        for lim in c.get("limits") or []:
            if isinstance(lim, dict):
                for s in lim.get("solved_by") or []:
                    put(nid, s, "solves", lim.get("text", ""), False)
    return list(edges.values())


def main():
    check_only = "--check" in sys.argv
    tracks = json.loads((DATA / "tracks.json").read_text(encoding="utf-8"))
    track_keys = [t["key"] for t in tracks]
    eras_path = DATA / "eras.json"
    eras = json.loads(eras_path.read_text(encoding="utf-8")) if eras_path.exists() else []

    nodes, order = load_skeleton(set(track_keys))
    content = load_content(nodes)
    concepts = load_concepts()
    check_links(nodes, content, concepts)
    edges = build_edges(nodes, order, content)

    for w in warnings:
        print(w)
    for e in errors:
        print(e)
    by_track = defaultdict(lambda: [0, 0])
    for nid in order:
        by_track[nodes[nid]["track"]][0] += 1
        by_track[nodes[nid]["track"]][1] += nid in content
    print(f"\n节点 {len(order)}（tier1 {sum(nodes[i]['tier'] == 1 for i in order)} / tier2 {sum(nodes[i]['tier'] == 2 for i in order)} / tier3 {sum(nodes[i]['tier'] == 3 for i in order)}）"
          f"，已有讲解 {len(content)}，边 {len(edges)}，概念 {sum(c['has'] for c in concepts.values())}/{len(concepts)}，错误 {len(errors)}，警告 {len(warnings)}")
    if "--stats" in sys.argv or not check_only:
        for k in track_keys:
            print(f"  {k:8s} {by_track[k][1]:4d} / {by_track[k][0]:4d}")
    if check_only:
        sys.exit(1 if errors else 0)
    if errors and "--force" not in sys.argv:
        print("\n有错误，未生成输出。（预览时可加 --force 强制生成，上线前必须0错误）")
        sys.exit(1)

    (OUT / "content").mkdir(parents=True, exist_ok=True)
    g_nodes, long_by_track, terms = [], defaultdict(dict), {}
    for nid in sorted(order, key=lambda i: (date_key(nodes[i]["date"]), track_keys.index(nodes[i]["track"]))):
        n = nodes[nid]
        c = content.get(nid, {})
        g = {k: n[k] for k in ("id", "date", "tier", "kind", "title", "full", "track")}
        g["who"] = c.get("who", "")
        for k in SHORT:
            g[k] = c.get(k, "")
        g["has"] = nid in content
        g_nodes.append(g)
        if c:
            long_by_track[n["track"]][nid] = {k: c[k] for k in ("venue", "links", *LONG, "limits", "prereq", "terms", "check") if c.get(k)}
            for t in c.get("terms") or []:
                key = t["t"].strip()
                slot = terms.setdefault(key, {"t": key, "d": t["d"], "nodes": []})
                if len(t["d"]) > len(slot["d"]):
                    slot["d"] = t["d"]
                slot["nodes"].append(nid)
    dump = lambda p, o: p.write_text(json.dumps(o, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dump(OUT / "graph.json", {"tracks": tracks, "eras": eras, "nodes": g_nodes, "edges": edges})
    # 开放问题：没有 solved_by 的遗留问题
    dump(OUT / "open.json", [{"id": nid, "t": lim["text"]} for nid in order for lim in (content.get(nid, {}).get("limits") or [])
                             if isinstance(lim, dict) and lim.get("text") and not lim.get("solved_by")])
    for k in track_keys:
        dump(OUT / "content" / f"{k}.json", long_by_track.get(k, {}))
    used = defaultdict(list)
    for nid, c in content.items():
        for p in c.get("prereq") or []:
            used[p].append(nid)
    for key, c in concepts.items():
        c["nodes"] = used.get(key, [])
    dump(OUT / "concepts.json", {"concepts": list(concepts.values()), "terms": sorted(terms.values(), key=lambda x: x["t"])})
    # 版本戳：让浏览器和CDN在每次构建后取到新的数据与脚本
    import re, time
    stamp = time.strftime("%Y%m%d%H%M")
    idx = ROOT / "docs" / "index.html"
    html = idx.read_text(encoding="utf-8")
    html = re.sub(r"\?v=\d+", f"?v={stamp}", html)
    html = re.sub(r'window\.AIMAP_V="\d+"', f'window.AIMAP_V="{stamp}"', html)
    idx.write_text(html, encoding="utf-8")
    print(f"\n已生成 {OUT.relative_to(ROOT)}/（版本 {stamp}）")


if __name__ == "__main__":
    main()
