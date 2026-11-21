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
ALLOWED = {"id", "who", "venue", "links", *SHORT, *LONG, "limits", "relations", "prereq", "terms", "check", "aka"}

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
            if not isinstance(lim, dict) or not lim.get("text") or set(lim) - {"text", "solved_by", "stated", "open"}:
                err(rel, "limits 每项应为 {text, solved_by?, stated?, open?}")
                continue
            if "stated" in lim and lim["stated"] is not True:
                err(rel, "limits.stated 只能是 true（作者在原文里明确写了这个局限）；不确定就不要写")
            if "open" in lim and not (isinstance(lim["open"], str) and len(lim["open"]) >= 8):
                err(rel, "limits.open 应是一句依据（出处和年份），说明这个问题至今未解决；没有依据就不要写")
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


AREAS = {"idea", "math", "prob", "opt", "ml", "nn", "seq", "gen", "rl", "vis", "aud", "emb", "sys", "eval"}
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
            if k not in {"key", "short", "body", "example", "pitfalls", "needs", "aka", "origin", "nodes"}:
                err(rel, f"未知字段 {k!r}")
        for k in ("short", "body"):
            if not c.get(k):
                err(rel, f"缺少字段 {k!r}")
        if cjk_len(c.get("body")) < 180:
            err(rel, f"body 只有 {cjk_len(c.get('body'))} 个汉字，至少 180")
        for d in c.get("needs") or []:
            if d not in reg:
                err(rel, f"needs 引用了未登记的概念 {d!r}")
        reg[key].update({k: c[k] for k in ("short", "body", "example", "pitfalls", "needs", "aka", "origin", "nodes") if c.get(k)})
        reg[key]["has"] = True
    # 基础概念的别名和出处节点集中放在一个文件里：{概念key: {"aka": [...], "origin": 节点id}}
    p = DATA / "concepts.aka.json"
    if p.exists():
        try:
            meta = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err("data/concepts.aka.json", f"不是合法JSON：{e}")
            meta = {}
        for key, m in meta.items():
            if key not in reg:
                err("data/concepts.aka.json", f"概念 {key!r} 未登记")
            elif not isinstance(m, dict) or not isinstance(m.get("aka", []), list):
                err("data/concepts.aka.json", f"{key}: 应为 {{aka: [...], origin: 节点id}}")
            else:
                reg[key]["aka"] = [str(x).strip() for x in list(reg[key].get("aka") or []) + m.get("aka", []) if str(x).strip()]
                if m.get("origin"):
                    reg[key]["origin"] = m["origin"]
    return reg


def load_ideas(nodes, concepts, track_keys):
    """研究思路与话题：data/ideas/<track>.json，一个列表，每项 {key, name, en, aka, blurb, body, origin, nodes}。
    并入概念表（area='idea'），和基础概念一样可以搜、可以链接、可以在树上看它的节点。"""
    n_ok = 0
    for k in track_keys:
        p = DATA / "ideas" / f"{k}.json"
        if not p.exists():
            continue
        where = f"data/ideas/{k}.json"
        try:
            items = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(where, f"不是合法JSON：{e}")
            continue
        if not isinstance(items, list):
            err(where, "应为一个列表")
            continue
        for it in items:
            key = it.get("key") if isinstance(it, dict) else None
            if not key or not ID_RE.match(key):
                err(where, f"思路 key {key!r} 只能用小写字母、数字、连字符")
                continue
            if key in concepts:
                err(where, f"思路 key {key!r} 与已有的概念或思路重复（已有：{concepts[key]['name']}）")
                continue
            for f in it:
                if f not in {"key", "name", "en", "aka", "blurb", "body", "origin", "nodes"}:
                    err(where, f"{key}: 未知字段 {f!r}")
            name, blurb = (it.get("name") or "").strip(), (it.get("blurb") or "").strip()
            if not name or not blurb:
                err(where, f"{key}: 缺少 name 或 blurb")
                continue
            ids = [i for i in it.get("nodes") or []]
            for i in ids + ([it["origin"]] if it.get("origin") else []):
                if i not in nodes:
                    err(where, f"{key}: 节点 {i!r} 未登记")
            ids = [i for i in ids if i in nodes]
            if len(ids) < 2:
                err(where, f"{key}: nodes 至少要有2个已登记的节点（只对应一个节点的叫法请写成该节点的别名）")
                continue
            if len(blurb) > 90:
                warn(where, f"{key}: blurb 过长（{len(blurb)} 字，限80字左右）")
            for m in LINK_RE.finditer(it.get("body") or ""):
                ref = m.group(1).strip()
                if (ref[2:] not in concepts and ref[2:] != key) if ref.startswith("c:") else ref not in nodes:
                    err(where, f"{key}: body 里的 [[{ref}]] 无法解析")
            aka = [str(x).strip() for x in it.get("aka") or [] if str(x).strip()]
            origin = it.get("origin") if it.get("origin") in nodes else min(ids, key=lambda i: date_key(nodes[i]["date"]))
            concepts[key] = {"key": key, "name": name, "en": (it.get("en") or "").strip(), "area": "idea", "level": 2, "has": True,
                             "short": blurb, "body": (it.get("body") or "").strip(), "aka": aka, "origin": origin, "nodes": ids, "track": k}
            n_ok += 1
    return n_ok


def load_aliases(nodes, content, track_keys):
    """搜索用的别名和缩写：新节点写在讲解文件的 aka 字段里，已有节点写在 data/aliases/<track>.json（{节点id: [别名…]}）。"""
    aka = defaultdict(list)
    for nid, c in content.items():
        a = c.get("aka")
        if a is not None and not (isinstance(a, list) and all(isinstance(x, str) for x in a)):
            err(f"data/content/{nodes[nid]['track']}/{nid}.json", "aka 应为字符串列表")
            continue
        aka[nid] += a or []
    for k in track_keys:
        p = DATA / "aliases" / f"{k}.json"
        if not p.exists():
            continue
        where = f"data/aliases/{k}.json"
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(where, f"不是合法JSON：{e}")
            continue
        for nid, a in (d.items() if isinstance(d, dict) else []):
            if nid not in nodes:
                err(where, f"节点 {nid!r} 未登记")
            elif not (isinstance(a, list) and all(isinstance(x, str) for x in a)):
                err(where, f"{nid}: 别名应为字符串列表")
            else:
                aka[nid] += a
    out = {}
    for nid, a in aka.items():
        seen, keep = set(), []
        for x in a:
            x = x.strip()
            if x and x.lower() not in seen:
                seen.add(x.lower())
                keep.append(x)
        if keep:
            out[nid] = keep
    return out


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


def build_edges(nodes, order, content, reviews=None):
    """边 = (较早的 from, 较晚的 to)。来源：骨架 parents、relations、limits.solved_by。
    做过来源核对的节点，以核对后的 relations 为准：登记表 parents 里有、但核对时从 relations 里删掉的关系不再生成边。"""
    reviews = reviews or {}
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

    dropped = []
    for nid in order:
        kept = {r.get("to") for r in content.get(nid, {}).get("relations") or [] if isinstance(r, dict)} if nid in reviews else None
        for p in nodes[nid]["parents"]:
            if kept is not None and p not in kept:
                dropped.append((p, nid))
                continue
            put(p, nid, "extends", "", False)
    build_edges.dropped = dropped
    for nid, c in content.items():
        for r in c.get("relations") or []:
            if r.get("to") in nodes and r.get("type") in REL_TYPES:
                put(r["to"], nid, r["type"], r.get("note", ""), True)
        for lim in c.get("limits") or []:
            if isinstance(lim, dict):
                for s in lim.get("solved_by") or []:
                    put(nid, s, "solves", lim.get("text", ""), False)
    return list(edges.values())


def load_tree(nodes, order, track_keys):
    """大方向、分支之间的分叉、每条分支下的主题线。给每个节点写入 n['th']，返回 (tree, threads)。"""
    tree = {"groups": [], "forks": {}, "joins": []}
    tp = DATA / "tree.json"
    if not tp.exists():
        warn("data/tree.json", "不存在，跳过树结构")
    else:
        tree = json.loads(tp.read_text(encoding="utf-8"))
        seen = [k for g in tree.get("groups", []) for k in g.get("tracks", [])]
        for k in track_keys:
            if seen.count(k) != 1:
                err("data/tree.json", f"分支 {k} 应恰好属于一个大方向，实际出现 {seen.count(k)} 次")
            if k not in tree.get("forks", {}):
                err("data/tree.json", f"forks 缺少分支 {k}")
        for k in seen:
            if k not in track_keys:
                err("data/tree.json", f"groups 里的 {k!r} 不是分支")
        for k, f in tree.get("forks", {}).items():
            if k not in track_keys:
                err("data/tree.json", f"forks 里的 {k!r} 不是分支")
            if f.get("from") and (f["from"] not in track_keys or f["from"] == k):
                err("data/tree.json", f"forks.{k}.from {f['from']!r} 无效")
            if f.get("at") and f["at"] not in nodes:
                err("data/tree.json", f"forks.{k}.at {f['at']!r} 不是已登记的节点")
        for j in tree.get("joins", []):
            for side in ("from", "to"):
                if j.get(side) not in nodes:
                    err("data/tree.json", f"joins 里的 {j.get(side)!r} 不是已登记的节点")

    by_track = defaultdict(list)
    for nid in order:
        by_track[nodes[nid]["track"]].append(nid)
    threads = {}
    for k in track_keys:
        p = DATA / "threads" / f"{k}.json"
        where = f"data/threads/{k}.json"
        ths, assign = [], {}
        if not p.exists():
            warn(where, "还没有主题线文件，整条分支暂时归入一条线")
        else:
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
                ths, assign = d.get("threads") or [], d.get("assign") or {}
            except Exception as e:  # noqa: BLE001
                err(where, f"JSON解析失败：{e}")
        good = []
        for t in ths:
            key = t.get("key") if isinstance(t, dict) else None
            if not key or not ID_RE.match(key):
                err(where, f"主题线 key {key!r} 只能用小写字母、数字、连字符")
            elif key in [g["key"] for g in good]:
                err(where, f"主题线 key {key!r} 重复")
            elif not (t.get("name") or "").strip():
                err(where, f"主题线 {key} 缺少 name")
            else:
                good.append({"key": key, "name": t["name"].strip(), "blurb": (t.get("blurb") or "").strip(),
                             "from": t.get("from") or None, "via": t.get("via") or None})
                aka = [str(x).strip() for x in (t.get("aka") or []) if str(x).strip()]
                if aka:
                    good[-1]["aka"] = aka      # 搜索用的别名和缩写，不显示
        if not good:
            good, assign = [{"key": "all", "name": "全部", "blurb": "", "from": None, "via": None}], {}
        elif not 5 <= len(good) <= 13:
            warn(where, f"主题线 {len(good)} 条，规范要求6–12条")
        tk = {t["key"]: t for t in good}
        for t in good:
            if len(t["name"]) > 12:
                warn(where, f"主题线 {t['key']} 的名称过长：{t['name']}")
            if len(t["blurb"]) > 48:
                warn(where, f"主题线 {t['key']} 的 blurb 过长（{len(t['blurb'])} 字，限40字左右）")
            if t["from"] and t["from"] not in tk:
                err(where, f"主题线 {t['key']} 的 from {t['from']!r} 不存在")
                t["from"] = None
            if t["via"] and t["via"] not in nodes:
                err(where, f"主题线 {t['key']} 的 via {t['via']!r} 不是已登记的节点")
                t["via"] = None
        for t in good:      # from 不能成环
            seen, cur = set(), t
            while cur and cur["from"]:
                if cur["key"] in seen:
                    err(where, f"主题线 {t['key']} 的 from 链成环")
                    t["from"] = None
                    break
                seen.add(cur["key"])
                cur = tk.get(cur["from"])
        for nid, th in assign.items():
            if nid not in nodes:
                err(where, f"assign 里的 {nid!r} 不是已登记的节点")
            elif nodes[nid]["track"] != k:
                err(where, f"assign 里的 {nid} 属于分支 {nodes[nid]['track']}，不应出现在这里")
            elif th not in tk:
                err(where, f"{nid} 指向不存在的主题线 {th!r}")
            else:
                nodes[nid]["th"] = th
        missing = [nid for nid in by_track[k] if "th" not in nodes[nid]]
        for nid in sorted(missing, key=lambda i: date_key(nodes[i]["date"])):   # 以后新增的节点不至于让构建失败
            par = next((q for q in nodes[nid]["parents"] if nodes[q]["track"] == k and "th" in nodes[q]), None)
            nodes[nid]["th"] = nodes[par]["th"] if par else good[0]["key"]
        if p.exists() and missing and len(good) > 1:
            warn(where, f"{len(missing)} 个节点没有归入主题线，已按parent自动归入：{', '.join(missing[:8])}{'…' if len(missing) > 8 else ''}")
        members = defaultdict(list)
        for nid in by_track[k]:
            members[nodes[nid]["th"]].append(nid)
        for t in good:
            ms = sorted(members[t["key"]], key=lambda i: date_key(nodes[i]["date"]))
            if not ms:
                err(where, f"主题线 {t['key']} 没有任何节点")
                continue
            if len(ms) < 3 and len(good) > 1:
                warn(where, f"主题线 {t['key']} 只有 {len(ms)} 个节点")
            t["n"], t["first"], t["last"] = len(ms), nodes[ms[0]]["date"], nodes[ms[-1]]["date"]
            if t["via"] and date_key(nodes[t["via"]]["date"])[:4] > date_key(t["first"])[:4]:
                warn(where, f"主题线 {t['key']} 的 via {t['via']} ({nodes[t['via']]['date']}) 晚于它的第一个节点 ({t['first']})")
        good = [t for t in good if "n" in t]
        ordered = []        # 分叉出来的线紧跟在母线后面

        by_start = sorted(good, key=lambda t: date_key(t["first"]))     # 按起始时间排，分叉出来的线紧跟母线

        def put(t):
            ordered.append(t)
            for c in by_start:
                if c["from"] == t["key"]:
                    put(c)
        for t in by_start:
            if not t["from"] or t["from"] not in {g["key"] for g in good}:
                t["from"] = None
                put(t)
        threads[k] = ordered
    return tree, threads


DAY_RE = re.compile(r"^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$")


def load_reviews(nodes, content):
    """内容审核记录：data/review/<id>.json。没有记录的节点一律是“待核对”。
    status: source = 这一次实际打开原始来源逐项核对过（AI可以写）；human = 真人复核（只有 _humans.json 里登记的人可以写）。"""
    out = {}
    root = DATA / "review"
    humans = set()
    hp = root / "_humans.json"
    if hp.exists():
        try:
            humans = set(json.loads(hp.read_text(encoding="utf-8")))
        except Exception as e:  # noqa: BLE001
            err("data/review/_humans.json", f"JSON解析失败：{e}")
    for path in sorted(root.glob("*.json")):
        if path.name.startswith("_"):
            continue
        rel = path.relative_to(ROOT)
        try:
            r = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"不是合法JSON：{e}")
            continue
        nid = r.get("id") if isinstance(r, dict) else None
        if nid != path.stem or nid not in nodes:
            err(rel, f"id {nid!r} 与文件名不一致，或不在节点登记表里")
            continue
        bad = set(r) - {"id", "status", "date", "by", "sources", "checked", "changed", "unverified", "edges", "registry", "note"}
        if bad:
            err(rel, f"未知字段 {sorted(bad)}")
        st = r.get("status")
        if st not in ("source", "human"):
            err(rel, "status 只能是 source（来源已核对）或 human（人工复核）")
            continue
        if not DAY_RE.match(str(r.get("date", ""))):
            err(rel, "date 应为 YYYY-MM-DD（做这次核对的日期）")
            continue
        by = str(r.get("by", "")).strip()
        if st == "human" and by not in humans:
            err(rel, "人工复核只能由 data/review/_humans.json 里登记的真人填写；AI做的核对请写 status: source")
            continue
        if st == "source" and not by:
            err(rel, "缺少 by（谁做的核对，例如 ai:claude-opus）")
            continue
        srcs = r.get("sources")
        if not isinstance(srcs, list) or not srcs or any(not isinstance(x, dict) or not str(x.get("url", "")).startswith("http") or not x.get("what") for x in srcs):
            err(rel, "sources 应为非空列表 [{url, what}]，只写这次实际打开读过的来源")
            continue
        chk = r.get("checked")
        if not isinstance(chk, list) or len([x for x in chk if isinstance(x, str) and x.strip()]) < (3 if st == "source" else 1):
            err(rel, "checked 至少逐项写3条核对了什么")
            continue
        for k in ("changed", "unverified"):
            if not isinstance(r.get(k, []), list):
                err(rel, f"{k} 应为列表")
        if nid not in content:
            err(rel, "这个节点还没有讲解，无从核对")
            continue
        c = content[nid]
        mine = {x.get("to") for x in c.get("relations") or [] if isinstance(x, dict)} | {s for lim in c.get("limits") or [] if isinstance(lim, dict) for s in lim.get("solved_by") or []}
        ed = r.get("edges") or {}
        if not isinstance(ed, dict):
            err(rel, "edges 应为 {对方节点id: ok|revised|weak}")
            ed = {}
        for o, v in ed.items():
            if o not in nodes:
                err(rel, f"edges 里的 {o!r} 不是已登记的节点")
            elif v not in ("ok", "revised", "weak"):
                err(rel, f"edges.{o} 应为 ok / revised / weak（不成立的关系直接从讲解里删掉，不要写在这里）")
            elif o not in mine:
                warn(rel, f"edges.{o}：讲解的 relations / solved_by 里已经没有这个节点")
        reg = r.get("registry") or {}
        if not isinstance(reg, dict) or set(reg) - {"date", "title", "full", "tier", "kind", "parents", "note"}:
            err(rel, "registry 应为 {date?, title?, full?, …}")
        out[nid] = r
    return out


def load_stories(nodes, concepts):
    """研究专题：data/stories/<key>.json。围绕一个问题，按时间把已有节点串成一条线。"""
    out = []
    for path in sorted((DATA / "stories").glob("*.json")):
        if path.name.startswith("_"):
            continue
        rel = path.relative_to(ROOT)
        try:
            s = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"不是合法JSON：{e}")
            continue
        key = s.get("key") if isinstance(s, dict) else None
        if key != path.stem or not ID_RE.match(key or ""):
            err(rel, f"key {key!r} 与文件名不一致")
            continue
        bad = set(s) - {"key", "order", "title", "question", "intro", "steps", "takeaway", "caveats", "figs", "next"}
        if bad:
            err(rel, f"未知字段 {sorted(bad)}")
        miss = [k for k in ("title", "question", "intro", "steps", "takeaway", "caveats") if not s.get(k)]
        if miss:
            err(rel, f"缺少字段 {miss}（caveats 必须写：这条叙事线简化了什么）")
            continue
        steps = s["steps"]
        if not isinstance(steps, list) or not 5 <= len(steps) <= 12:
            err(rel, "steps 应有6–10站")
            continue
        seen, ok = set(), True
        for st in steps:
            if not isinstance(st, dict) or st.get("node") not in nodes or not st.get("h") or not st.get("text"):
                err(rel, f"steps 每项应为 {{node: 已登记的节点id, h, text}}：{(st or {}).get('node') if isinstance(st, dict) else st!r}")
                ok = False
                continue
            if st["node"] in seen:
                err(rel, f"节点 {st['node']} 在专题里出现了两次")
            seen.add(st["node"])
            if not 60 <= cjk_len(st["text"]) <= 320:
                warn(rel, f"{st['node']} 这一站 {cjk_len(st['text'])} 个汉字，建议100–220")
        if not ok:
            continue
        years = [nodes[st["node"]]["date"][:4] for st in steps]
        if any(a > b for a, b in zip(years, years[1:])):
            warn(rel, "各站没有按时间顺序排列：" + " ".join(years))
        for txt in [s["intro"], s["takeaway"], s["caveats"]] + [st["text"] for st in steps]:
            for m in LINK_RE.finditer(txt or ""):
                ref = m.group(1).strip()
                if (ref[2:] not in concepts) if ref.startswith("c:") else ref not in nodes:
                    err(rel, f"[[{ref}]] 无法解析")
        s["order"] = s.get("order") if isinstance(s.get("order"), int) else 99
        out.append(s)
    out.sort(key=lambda x: (x["order"], x["key"]))
    keys = {s["key"] for s in out}
    for s in out:
        s["next"] = [k for k in s.get("next") or [] if k in keys and k != s["key"]]
    return out


COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(|(?:fill|stroke)=\"(?!none|url\()[a-zA-Z]+\"")


def load_figures(nodes, concepts):
    """机制图：data/figures/<key>.svg + <key>.json。SVG内联进页面，颜色只能用样式表里的class。"""
    import xml.etree.ElementTree as ET
    out = []
    for path in sorted((DATA / "figures").glob("*.json")):
        rel = path.relative_to(ROOT)
        try:
            m = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(rel, f"不是合法JSON：{e}")
            continue
        key = m.get("key") if isinstance(m, dict) else None
        if key != path.stem or not ID_RE.match(key or ""):
            err(rel, f"key {key!r} 与文件名不一致")
            continue
        bad = set(m) - {"key", "title", "caption", "concepts", "nodes", "source"}
        if bad:
            err(rel, f"未知字段 {sorted(bad)}")
        if not m.get("title") or cjk_len(m.get("caption")) < 40 or not m.get("source"):
            err(rel, "需要 title、不少于40个汉字的 caption、以及 source（画图时对照的出处）")
            continue
        cs = [c for c in m.get("concepts") or []]
        for c in cs:
            if c not in concepts:
                err(rel, f"concepts 里的 {c!r} 不是已登记的概念或思路")
        ns = [n for n in m.get("nodes") or []]
        for n in ns:
            if n not in nodes:
                err(rel, f"nodes 里的 {n!r} 不是已登记的节点")
        if not cs and not ns:
            err(rel, "concepts 和 nodes 至少要有一个，否则这张图没有地方显示")
        for mm in LINK_RE.finditer(m.get("caption") or ""):
            ref = mm.group(1).strip()
            if (ref[2:] not in concepts) if ref.startswith("c:") else ref not in nodes:
                err(rel, f"caption 里的 [[{ref}]] 无法解析")
        sp = path.with_suffix(".svg")
        srel = sp.relative_to(ROOT)
        if not sp.exists():
            err(srel, "缺少SVG文件")
            continue
        svg = sp.read_text(encoding="utf-8").strip()
        try:
            root = ET.fromstring(svg)
        except ET.ParseError as e:
            err(srel, f"不是合法的XML：{e}")
            continue
        vb = (root.get("viewBox") or "").split()
        if not root.tag.endswith("svg") or len(vb) != 4 or vb[:3] != ["0", "0", "420"] or not 160 <= float(vb[3]) <= 560:
            err(srel, "根元素应为 <svg viewBox=\"0 0 420 H\">，H在160到560之间")
        if root.get("role") != "img" or root.get("aria-labelledby") != f"{key}-title":
            err(srel, f"根元素需要 role=\"img\" aria-labelledby=\"{key}-title\"")
        first = next(iter(root), None)
        if first is None or not first.tag.endswith("title") or first.get("id") != f"{key}-title":
            err(srel, f"第一个子元素应为 <title id=\"{key}-title\">")
        for el in root.iter():
            tag = el.tag.split("}")[-1]
            if tag in ("style", "script", "image", "foreignObject", "a", "use"):
                err(srel, f"不允许使用 <{tag}>")
            for a in el.attrib:
                an = a.split("}")[-1]
                if an in ("style", "font-size", "font-family", "href") or an.startswith("on"):
                    err(srel, f"<{tag}> 上不允许 {an} 属性（样式只用class）")
            if el.get("id") and not el.get("id").startswith(key + "-"):
                err(srel, f"id {el.get('id')!r} 必须以 {key}- 开头")
        if COLOR_RE.search(svg):
            err(srel, f"SVG里不能写颜色值（发现 {COLOR_RE.search(svg).group(0)!r}），请用规范里的class")
        m["svg"] = re.sub(r">\s+<", "><", svg)
        m["concepts"], m["nodes"] = [c for c in cs if c in concepts], [n for n in ns if n in nodes]
        out.append(m)
    return out


def load_routes(nodes, stories):
    """入门路线和按目标进入的入口：data/routes.json。"""
    p = DATA / "routes.json"
    if not p.exists():
        return {}
    try:
        r = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err("data/routes.json", f"不是合法JSON：{e}")
        return {}
    skeys = {s["key"] for s in stories}
    for st in (r.get("intro") or {}).get("steps") or []:
        if st.get("node") not in nodes or not st.get("why"):
            err("data/routes.json", f"intro.steps 每项应为 {{node: 已登记的节点id, why}}：{st.get('node')!r}")
    for g in r.get("goals") or []:
        if not g.get("q") or (g.get("node") and g["node"] not in nodes):
            err("data/routes.json", f"goals 里的 {g.get('q')!r} 无效")
        elif g.get("story") and g["story"] not in skeys:
            warn("data/routes.json", f"goals 里的专题 {g['story']!r} 还没有写（站内暂时不显示这个入口）")
    return r


def main():
    check_only = "--check" in sys.argv
    tracks = json.loads((DATA / "tracks.json").read_text(encoding="utf-8"))
    track_keys = [t["key"] for t in tracks]
    eras_path = DATA / "eras.json"
    eras = json.loads(eras_path.read_text(encoding="utf-8")) if eras_path.exists() else []

    nodes, order = load_skeleton(set(track_keys))
    tree, threads = load_tree(nodes, order, track_keys)
    content = load_content(nodes)
    concepts = load_concepts()
    n_ideas = load_ideas(nodes, concepts, track_keys)
    aliases = load_aliases(nodes, content, track_keys)
    for key, c in concepts.items():
        for i in [c.get("origin")] + list(c.get("nodes") or []) if c["area"] != "idea" else []:
            if i and i not in nodes:
                err(f"data/concepts/{key}.json", f"节点 {i!r} 未登记")
    check_links(nodes, content, concepts)
    reviews = load_reviews(nodes, content)
    stories = load_stories(nodes, concepts)
    figures = load_figures(nodes, concepts)
    routes = load_routes(nodes, stories)
    edges = build_edges(nodes, order, content, reviews)

    for w in warnings:
        print(w)
    for e in errors:
        print(e)
    by_track = defaultdict(lambda: [0, 0])
    for nid in order:
        by_track[nodes[nid]["track"]][0] += 1
        by_track[nodes[nid]["track"]][1] += nid in content
    print(f"\n节点 {len(order)}（tier1 {sum(nodes[i]['tier'] == 1 for i in order)} / tier2 {sum(nodes[i]['tier'] == 2 for i in order)} / tier3 {sum(nodes[i]['tier'] == 3 for i in order)}）"
          f"，已有讲解 {len(content)}，边 {len(edges)}，概念 {sum(c['has'] for c in concepts.values()) - n_ideas}/{len(concepts) - n_ideas}，思路 {n_ideas}，"
          f"审核记录 {len(reviews)}（人工复核 {sum(r['status'] == 'human' for r in reviews.values())}），专题 {len(stories)}，机制图 {len(figures)}，错误 {len(errors)}，警告 {len(warnings)}")
    if "--stats" in sys.argv or not check_only:
        for k in track_keys:
            print(f"  {k:8s} {by_track[k][1]:4d} / {by_track[k][0]:4d}   主题线 {len(threads[k]):2d}：" + "、".join(f"{t['name']}{t['n']}" for t in threads[k]))
    if check_only:
        sys.exit(1 if errors else 0)
    if errors and "--force" not in sys.argv:
        print("\n有错误，未生成输出。（预览时可加 --force 强制生成，上线前必须0错误）")
        sys.exit(1)

    import shutil
    KIND_L = ["paper", "model", "system", "hardware", "dataset", "event", "concept"]
    REL_L = ["solves", "extends", "uses", "rivals"]
    CHUNK = 40
    sorted_ids = sorted(order, key=lambda i: (date_key(nodes[i]["date"]), track_keys.index(nodes[i]["track"])))
    idx = {nid: i for i, nid in enumerate(sorted_ids)}
    pos = {}                       # 节点在自己分支里（按时间）的位置，决定它的讲解在哪个分片文件里
    per_track = defaultdict(list)
    for nid in sorted_ids:
        pos[nid] = len(per_track[nodes[nid]["track"]])
        per_track[nodes[nid]["track"]].append(nid)
    rev_of = lambda nid: {"source": 1, "human": 2}.get((reviews.get(nid) or {}).get("status"), 0)

    # 关系边的核对结论：来自审核记录里的 edges
    verdict = {}
    for nid, r in reviews.items():
        for o, v in (r.get("edges") or {}).items():
            verdict[frozenset((nid, o))] = v
    rel_notes = defaultdict(dict)
    g_edges = []
    for e in edges:
        v = verdict.get(frozenset((e["from"], e["to"])))
        e["v"] = v
        g_edges.append([idx[e["from"]], idx[e["to"]], REL_L.index(e["type"]), (1 if e["note"] else 0) | (2 if v in ("ok", "revised") else 0) | (4 if v == "weak" else 0)])
        if e["note"]:
            rel_notes[e["from"]][e["to"]] = e["note"]
            rel_notes[e["to"]][e["from"]] = e["note"]

    # 每个概念/思路落在树上的哪些节点：列为前置的、正文里链接到它的、以及手工指定的
    used = defaultdict(set)
    for nid, c in content.items():
        for q in c.get("prereq") or []:
            used[q].add(nid)
        for v in c.values():
            for txt in ([v] if isinstance(v, str) else [x.get("text", "") + x.get("d", "") for x in v if isinstance(x, dict)] if isinstance(v, list) else []):
                for m in LINK_RE.finditer(txt):
                    if m.group(1).strip().startswith("c:"):
                        used[m.group(1).strip()[2:]].add(nid)
    ideas_of = defaultdict(list)
    for key, c in concepts.items():
        ids = (used.get(key, set()) | set(c.get("nodes") or [])) & set(nodes)
        if c["area"] == "idea":
            for i in c.get("nodes") or []:
                if i in nodes:
                    ideas_of[i].append(key)
        c["nodes"] = sorted(ids, key=lambda i: (date_key(nodes[i]["date"]), i))
        if c.get("origin") not in nodes:
            c.pop("origin", None)
    figs_of_c, figs_of_n = defaultdict(list), defaultdict(list)
    for f in figures:
        for c in f["concepts"]:
            figs_of_c[c].append(f["key"])
        for n in f["nodes"]:
            figs_of_n[n].append(f["key"])

    def limits_of(c):
        out = []
        for lim in c.get("limits") or []:
            if isinstance(lim, dict) and lim.get("text"):
                o = {"text": lim["text"], "by": [s for s in lim.get("solved_by") or [] if s in nodes]}
                if lim.get("stated") is True:
                    o["stated"] = 1
                if lim.get("open"):
                    o["open"] = lim["open"]
                out.append(o)
        return out

    def review_public(nid):
        r = reviews.get(nid)
        if not r:
            return None
        return {"status": r["status"], "date": r["date"], "by": r.get("by", ""), "sources": r["sources"], "checked": r["checked"],
                "unverified": r.get("unverified") or [], "changed": len(r.get("changed") or [])}

    for d in ("content", "brief3", "cbody"):
        shutil.rmtree(OUT / d, ignore_errors=True)
        (OUT / d).mkdir(parents=True, exist_ok=True)
    for old in ("graph.json", "concepts.json", "open.json"):
        (OUT / old).unlink(missing_ok=True)
    dump = lambda p, o: p.write_text(json.dumps(o, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    g_nodes, brief12, brief3, terms, full_nodes = [], {}, defaultdict(dict), {}, {}
    chunks = defaultdict(dict)
    for nid in sorted_ids:
        n = nodes[nid]
        c = content.get(nid, {})
        g_nodes.append([nid, n["date"], n["tier"], KIND_L.index(n["kind"]), n["title"], track_keys.index(n["track"]), n["th"], rev_of(nid)])
        b = [n["full"], c.get("who", ""), c.get("problem", ""), c.get("idea", ""), c.get("impact", "")]
        if n["tier"] <= 2:
            brief12[nid] = b
        else:
            brief3[n["track"]][nid] = b
        o = {"full": n["full"], "who": c.get("who", ""), **{k: c.get(k, "") for k in SHORT}}
        o.update({k: c[k] for k in ("venue", "links", *LONG, "prereq", "terms", "check") if c.get(k)})
        if c.get("limits"):
            o["limits"] = limits_of(c)
        if rel_notes.get(nid):
            o["rel"] = rel_notes[nid]
        if ideas_of.get(nid):
            o["ideas"] = ideas_of[nid]
        if figs_of_n.get(nid):
            o["figs"] = figs_of_n[nid]
        rv = review_public(nid)
        if rv:
            o["review"] = rv
        chunks[(n["track"], pos[nid] // CHUNK)][nid] = o
        full_nodes[nid] = o
        for t in c.get("terms") or []:
            key = t["t"].strip()
            slot = terms.setdefault(key, {"t": key, "d": t["d"], "nodes": []})
            if len(t["d"]) > len(slot["d"]):
                slot["d"] = t["d"]
            slot["nodes"].append(nid)
    for (k, i), o in chunks.items():
        dump(OUT / "content" / f"{k}-{i}.json", o)
    dump(OUT / "brief12.json", brief12)
    for k in track_keys:
        dump(OUT / "brief3" / f"{k}.json", brief3.get(k, {}))

    AREA_L = sorted(AREAS)
    g_concepts, cbody, c_search = [], defaultdict(dict), {}
    for key, c in concepts.items():
        g_concepts.append([key, c["name"], c.get("en", ""), c["area"], c["level"], c.get("track", ""), len(c["nodes"]), c.get("origin", ""), c.get("needs") or [], 1 if figs_of_c.get(key) else 0])
        grp = f"idea-{c['track']}" if c["area"] == "idea" else c["area"]
        cbody[grp][key] = {k: c[k] for k in ("short", "body", "example", "pitfalls", "needs", "aka", "nodes", "origin") if c.get(k)}
        if figs_of_c.get(key):
            cbody[grp][key]["figs"] = figs_of_c[key]
        c_search[key] = [c.get("short", ""), c.get("aka") or []]
    for grp, o in cbody.items():
        dump(OUT / "cbody" / f"{grp}.json", o)
    term_list = sorted(terms.values(), key=lambda x: x["t"])
    dump(OUT / "terms.json", term_list)
    th_aka = {k: {t["key"]: t.pop("aka") for t in threads[k] if t.get("aka")} for k in track_keys}
    dump(OUT / "search.json", {"full": [nodes[i]["full"] for i in sorted_ids], "who": [content.get(i, {}).get("who", "") for i in sorted_ids],
                               "aka": {str(idx[i]): a for i, a in aliases.items()}, "th": th_aka, "c": c_search,
                               "terms": [[t["t"], idx[t["nodes"][0]]] for t in term_list]})
    dump(OUT / "stories.json", {s["key"]: s for s in stories})
    dump(OUT / "figs.json", {f["key"]: f["svg"] for f in figures})
    # 审核的整体情况，站内“关于内容”页和构建输出都用
    n_rev = {"source": sum(1 for r in reviews.values() if r["status"] == "source"), "human": sum(1 for r in reviews.values() if r["status"] == "human")}
    n_rev["t1"] = sum(1 for i in reviews if nodes[i]["tier"] == 1)
    n_rev["edges"] = sum(1 for e in edges if e["v"] in ("ok", "revised"))
    n_rev["weak"] = sum(1 for e in edges if e["v"] == "weak")
    n_rev["changed"] = sum(len(r.get("changed") or []) for r in reviews.values())
    import time
    stamp = time.strftime("%Y%m%d%H%M")
    core = {"v": stamp, "chunk": CHUNK, "kinds": KIND_L, "rels": REL_L, "tracks": tracks, "eras": eras, "groups": tree.get("groups", []),
            "forks": tree.get("forks", {}), "joins": tree.get("joins", []), "threads": threads, "N": g_nodes, "E": g_edges, "C": g_concepts,
            "stories": [{"key": s["key"], "title": s["title"], "question": s["question"], "nodes": [st["node"] for st in s["steps"]]} for s in stories],
            "routes": routes, "figs": [{k: f[k] for k in ("key", "title", "caption", "concepts", "nodes", "source")} for f in figures],
            "review": n_rev, "nTerms": len(term_list)}
    dump(OUT / "core.json", core)

    # 不运行脚本也能读的静态页面 + sitemap
    import static_pages
    n_pages = static_pages.write_all(dict(root=ROOT, nodes=nodes, sorted_ids=sorted_ids, full=full_nodes, concepts=concepts, edges=edges, tracks=tracks, eras=eras,
                                          tree=tree, threads=threads, stories=stories, routes=routes, figures=figures, reviews=reviews, stamp=stamp,
                                          figs_of_c=figs_of_c, n_rev=n_rev, per_track=per_track))
    # 版本戳：让浏览器和CDN在每次构建后取到新的数据与脚本
    ipath = ROOT / "docs" / "index.html"
    html = ipath.read_text(encoding="utf-8")
    html = re.sub(r"\?v=\d+", f"?v={stamp}", html)
    html = re.sub(r'window\.AIMAP_V="\d+"', f'window.AIMAP_V="{stamp}"', html)
    ipath.write_text(html, encoding="utf-8")
    # 设计说明页（docs/design.html，不依赖脚本的静态页）里的数字：<b data-stat="nodes">…</b> 每次构建按当前数据重写
    dsg = ROOT / "docs" / "design.html"
    if dsg.exists():
        vals = {"nodes": len(nodes), "edges": len(edges), "concepts": len(concepts) - n_ideas, "ideas": n_ideas,
                "threads": sum(len(v) for v in threads.values()), "tracks": len(track_keys), "stamp": stamp,
                "reviewed": n_rev["source"] + n_rev["human"], "reviewed_t1": n_rev["t1"], "human": n_rev["human"], "edges_ok": n_rev["edges"],
                "stories": len(stories), "figures": len(figures), "pages": n_pages,
                **{f"tier{i}": sum(1 for n in nodes.values() if n["tier"] == i) for i in (1, 2, 3)},
                **{f"rel_{k}": sum(1 for e in edges if e["type"] == k) for k in REL_TYPES},
                **{f"kind_{k}": sum(1 for n in nodes.values() if n["kind"] == k) for k in KINDS}}
        d = dsg.read_text(encoding="utf-8")
        d = re.sub(r'(<b data-stat="(\w+)">)[^<]*(</b>)', lambda m: m.group(1) + str(vals.get(m.group(2), "?")) + m.group(3), d)
        dsg.write_text(d, encoding="utf-8")
    print(f"\n已生成 {OUT.relative_to(ROOT)}/（版本 {stamp}）和 {n_pages} 个静态页面")


if __name__ == "__main__":
    main()
