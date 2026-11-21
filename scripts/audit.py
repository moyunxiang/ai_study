#!/usr/bin/env python3
"""内容审计：不改任何数据，只把需要人看的地方列出来，写到 data/_audit/。

  python3 scripts/audit.py            生成全部报告
  python3 scripts/audit.py --links    另外联网检查主干和重要节点的出处链接是否还能打开（慢，约几分钟）

报告：
  queue.md     待核对节点的优先顺序（主干、入门路线和专题里的、连接多的、2024年以后的、措辞强的排前面）
  claims.md    说得很满的措辞（“彻底解决”“完全取代”“首次”“证明了”…），逐条列出所在节点和原句
  dups.md      可能重复的研究思路、主题线、节点
  sources.md   出处有问题的节点：没有出处、只有二手来源、链接格式不对
  dates.md     时间对不上的关系（按月份比较）
  stale.md     带有“目前”“至今”“最新”这类会过时的说法的节点
  links.md     （--links）打不开的出处链接
  summary.json 各项的数量，供设计说明页和日志引用
"""
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402

OUT = B.DATA / "_audit"
STRONG = [("彻底解决|完全解决|根本解决|一劳永逸", "解决得太满"), ("完全取代|彻底取代|全面取代|淘汰了|被淘汰|被放弃|终结了|宣告了.{0,6}终结", "取代、淘汰"),
          ("直接催生|直接启发|直接导致|直接促成", "直接因果"), ("证明了|证实了", "证明（实验结果应写“显示”）"), ("首次|第一次|第一个|最早的|史上", "优先权（首次、第一个）"),
          ("唯一的|所有.{0,8}都|任何.{0,8}都|从此|彻底改变|颠覆", "绝对化"), ("远超|碾压|大幅超越|遥遥领先|完胜", "比较措辞")]
STALE = re.compile(r"目前|至今|迄今|截至|最新的|现在的|今天的|当前最|仍是最")
SECONDARY = ("wikipedia.org", "news.google.com", "techcrunch.com", "cnbc.com", "theverge.com", "reuters.com", "bloomberg.com", "zhihu.com", "medium.com", "36kr.com")
TEXT_FIELDS = ("problem", "idea", "impact", "background", "method", "results", "legacy", "pitfalls")


def load():
    tracks = json.loads((B.DATA / "tracks.json").read_text(encoding="utf-8"))
    keys = [t["key"] for t in tracks]
    nodes, order = B.load_skeleton(set(keys))
    tree, threads = B.load_tree(nodes, order, keys)
    content = B.load_content(nodes)
    concepts = B.load_concepts()
    B.load_ideas(nodes, concepts, keys)
    reviews = B.load_reviews(nodes, content)
    stories = B.load_stories(nodes, concepts)
    routes = B.load_routes(nodes, stories)
    edges = B.build_edges(nodes, order, content, reviews)
    return dict(tracks=tracks, keys=keys, nodes=nodes, order=order, threads=threads, content=content, concepts=concepts, reviews=reviews, stories=stories, routes=routes, edges=edges)


def sent(text, m):
    a = max(text.rfind("。", 0, m.start()), text.rfind("\n", 0, m.start())) + 1
    b = text.find("。", m.end())
    return text[a:b + 1 if b >= 0 else len(text)].strip()[:160]


def main():
    d = load()
    nodes, content, reviews, edges = d["nodes"], d["content"], d["reviews"], d["edges"]
    OUT.mkdir(exist_ok=True)
    summary = {"date": time.strftime("%Y-%m-%d"), "nodes": len(nodes), "reviewed": len(reviews)}
    deg = Counter()
    for e in edges:
        deg[e["from"]] += 1
        deg[e["to"]] += 1
    featured = {s["node"] for s in (d["routes"].get("intro") or {}).get("steps") or []} | {st["node"] for s in d["stories"] for st in s["steps"]}

    # —— 措辞 ——
    claims, per_node = [], Counter()
    for nid, c in content.items():
        texts = [(k, c.get(k) or "") for k in TEXT_FIELDS] + [("relations", r.get("note", "")) for r in c.get("relations") or [] if isinstance(r, dict)]
        for field, txt in texts:
            for pat, label in STRONG:
                for m in re.finditer(pat, txt):
                    claims.append((nid, field, label, m.group(0), sent(txt, m)))
                    per_node[nid] += 1
    by_label = Counter(c[2] for c in claims)
    lines = ["# 说得很满的措辞", "", f"共 {len(claims)} 处，涉及 {len(per_node)} 个节点。这些不一定是错的，但每一处都应该有依据：能核对就核对，核对不了就降级。", "",
             "| 类型 | 处数 |", "|---|---|"] + [f"| {k} | {v} |" for k, v in by_label.most_common()] + ["", "## 按节点（主干和重要节点、尚未核对的）", ""]
    for nid, n in sorted(per_node.items(), key=lambda x: (nodes[x[0]]["tier"], -x[1])):
        if nodes[nid]["tier"] > 2 or nid in reviews:
            continue
        lines.append(f"### {nid}（{nodes[nid]['title']}，tier {nodes[nid]['tier']}，{n}处）")
        lines += [f"- `{f}` **{w}**：{s}" for i, f, _, w, s in claims if i == nid]
        lines.append("")
    (OUT / "claims.md").write_text("\n".join(lines), encoding="utf-8")
    summary["strong_claims"] = len(claims)
    summary["strong_claims_unreviewed_t12"] = sum(v for k, v in per_node.items() if nodes[k]["tier"] <= 2 and k not in reviews)

    # —— 出处 ——
    no_check, secondary, bad_url, no_links = [], [], [], []
    hosts = Counter()
    for nid in d["order"]:
        c = content.get(nid, {})
        chk = (c.get("check") or {}).get("source", "")
        links = [l.get("url", "") for l in c.get("links") or [] if isinstance(l, dict)]
        if not chk:
            no_check.append(nid)
        for u in [chk] + links:
            if not u:
                continue
            p = urlparse(u)
            if p.scheme not in ("http", "https") or "." not in p.netloc or " " in u:
                bad_url.append((nid, u))
            hosts[p.netloc.replace("www.", "")] += 1
        if not links:
            no_links.append(nid)
        allu = [u for u in [chk] + links if u]
        if allu and all(any(h in u for h in SECONDARY) for u in allu):
            secondary.append(nid)
    fmt = lambda ids: "、".join(f"`{i}`" for i in ids) if ids else "（无）"
    t12 = lambda ids: [i for i in ids if nodes[i]["tier"] <= 2]
    (OUT / "sources.md").write_text("\n".join([
        "# 出处有问题的节点", "", f"- 没有 `check.source`：{len(no_check)} 个　{fmt(no_check[:60])}", f"- 没有任何 `links`：{len(no_links)} 个　{fmt(no_links[:60])}",
        f"- 链接格式不对：{len(bad_url)} 处　" + "；".join(f"`{i}` {u}" for i, u in bad_url[:30]),
        f"- 只有二手来源（维基、新闻、博客）：{len(secondary)} 个，其中主干和重要节点 {len(t12(secondary))} 个", "", "## 只有二手来源的主干和重要节点", "", fmt(t12(secondary)), "",
        "## 全部只有二手来源的节点", "", fmt(secondary), "", "## 出处的域名分布（前30）", "", "| 域名 | 次数 |", "|---|---|"] + [f"| {h} | {n} |" for h, n in hosts.most_common(30)]), encoding="utf-8")
    summary.update(no_check=len(no_check), no_links=len(no_links), bad_url=len(bad_url), secondary_only=len(secondary))

    # —— 时间 ——
    dk = B.date_key
    bad_dates = [(e["from"], e["to"]) for e in edges if len(nodes[e["from"]]["date"]) == 7 and len(nodes[e["to"]]["date"]) == 7 and dk(nodes[e["from"]]["date"]) > dk(nodes[e["to"]]["date"])]
    (OUT / "dates.md").write_text("\n".join(["# 时间对不上的关系", "", f"较早的一端比较晚的一端日期还晚（按月份比较）：{len(bad_dates)} 条。可能是登记表日期有误，也可能是关系方向写反了。", ""] +
                                            [f"- `{a}`（{nodes[a]['date']}）→ `{b}`（{nodes[b]['date']}）" for a, b in bad_dates]), encoding="utf-8")
    summary["date_conflicts"] = len(bad_dates)

    # —— 重复 ——
    ideas = [c for c in d["concepts"].values() if c["area"] == "idea"]
    norm = lambda s: re.sub(r"[^a-z0-9一-鿿]", "", (s or "").lower())
    pairs = []
    for i, a in enumerate(ideas):
        na = {norm(a["name"]), norm(a.get("en")), *map(norm, a.get("aka") or [])} - {""}
        sa = set(a.get("nodes") or [])
        for b in ideas[i + 1:]:
            nb = {norm(b["name"]), norm(b.get("en")), *map(norm, b.get("aka") or [])} - {""}
            sb = set(b.get("nodes") or [])
            jac = len(sa & sb) / len(sa | sb) if sa | sb else 0
            common = na & nb
            if common or jac >= 0.5:
                pairs.append((a, b, sorted(common), jac))
    th_names = defaultdict(list)
    for k, ths in d["threads"].items():
        for t in ths:
            th_names[norm(t["name"])].append(f"{k}/{t['key']}")
    link_owner = defaultdict(list)
    for nid, c in content.items():
        for l in (c.get("links") or [])[:1]:
            m = re.search(r"arxiv\.org/abs/([0-9.]+)", l.get("url", ""))
            if m:
                link_owner[m.group(1)].append(nid)
    same_paper = [v for v in link_owner.values() if len(v) > 1]
    (OUT / "dups.md").write_text("\n".join(
        ["# 可能重复的内容", "", f"## 研究思路：名称或别名相同，或成员节点重合一半以上（{len(pairs)} 对）", ""] +
        [f"- `{a['key']}`（{a['name']}） ↔ `{b['key']}`（{b['name']}）　{'共同叫法：' + '、'.join(c) if c else ''}　成员重合 {j:.0%}" for a, b, c, j in sorted(pairs, key=lambda x: -x[3])] +
        ["", "## 主题线：不同分支里名字相同", ""] + [f"- {' / '.join(v)}" for v in th_names.values() if len(v) > 1] +
        ["", f"## 节点：第一个链接指向同一篇arXiv论文（{len(same_paper)} 组）", ""] + [f"- {fmt(v)}" for v in same_paper]), encoding="utf-8")
    summary.update(dup_idea_pairs=len(pairs), same_paper_groups=len(same_paper))

    # —— 会过时的说法 ——
    stale = []
    for nid, c in content.items():
        hits = [sent(c[k], m) for k in TEXT_FIELDS if c.get(k) for m in STALE.finditer(c[k])]
        if hits:
            stale.append((nid, hits))
    stale.sort(key=lambda x: (nodes[x[0]]["tier"], -len(x[1])))
    (OUT / "stale.md").write_text("\n".join(["# 会过时的说法", "", f"{len(stale)} 个节点的讲解里有“目前”“至今”“最新”这类说法。它们写于2026年11月，之后需要定期重看。下面只列主干和重要节点。", ""] +
                                           [f"- `{nid}`（{nodes[nid]['title']}）：{h[0]}" + (f"　等{len(h)}处" if len(h) > 1 else "") for nid, h in stale if nodes[nid]["tier"] <= 2]), encoding="utf-8")
    summary["stale_nodes"] = len(stale)

    # —— 待核对的优先顺序 ——
    def score(nid):
        n = nodes[nid]
        return ({1: 100, 2: 30, 3: 0}[n["tier"]] + (40 if nid in featured else 0) + min(deg[nid], 40) + (25 if n["date"][:4] >= "2024" else 0)
                + min(per_node[nid] * 4, 24) + (15 if nid in secondary else 0) + (20 if nid in no_check else 0))
    todo = sorted((i for i in d["order"] if i not in reviews), key=lambda i: -score(i))
    lines = ["# 待核对节点的优先顺序", "", f"已核对 {len(reviews)} / {len(nodes)}。下面是还没核对的，按优先级排（主干、入门路线和专题里的、连接多的、2024年以后的、措辞强的、出处弱的排前面）。按 `guide/review.md` 核对。", "",
             "| # | 节点 | 标题 | 档 | 日期 | 连接 | 强措辞 | 分 |", "|---|---|---|---|---|---|---|---|"]
    lines += [f"| {k} | `{i}` | {nodes[i]['title']} | {nodes[i]['tier']} | {nodes[i]['date']} | {deg[i]} | {per_node[i]} | {score(i)} |" for k, i in enumerate(todo[:400], 1)]
    (OUT / "queue.md").write_text("\n".join(lines), encoding="utf-8")
    summary["unreviewed_t1"] = sum(1 for i in todo if nodes[i]["tier"] == 1)
    summary["unreviewed_featured"] = sum(1 for i in todo if i in featured)

    if "--links" in sys.argv:
        summary.update(check_links(d, featured))
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))


def check_links(d, featured):
    """只查主干、重要节点和专题里节点的出处；每个域名之间留间隔，不对同一个站连续猛发。"""
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor
    nodes, content = d["nodes"], d["content"]
    urls = defaultdict(list)
    for nid, c in content.items():
        if nodes[nid]["tier"] > 2 and nid not in featured:
            continue
        for u in [(c.get("check") or {}).get("source")] + [l.get("url") for l in c.get("links") or [] if isinstance(l, dict)]:
            if u and u.startswith("http"):
                urls[u].append(nid)
    by_host = defaultdict(list)
    for u in urls:
        by_host[urlparse(u).netloc].append(u)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler())
    res = {}

    def host_job(us):
        for u in us:
            code = None
            for method in ("HEAD", "GET"):
                try:
                    req = urllib.request.Request(u, method=method, headers={"User-Agent": "Mozilla/5.0 (link checker)"})
                    with opener.open(req, timeout=15) as r:
                        code = r.status
                    break
                except Exception as e:  # noqa: BLE001
                    code = getattr(e, "code", None) or type(e).__name__
                    if code in (403, 405, 429, 999):      # 很多站拒绝HEAD或拒绝脚本，不算坏链接
                        continue
            res[u] = code
            time.sleep(1.2 if len(us) > 20 else 0.3)
    with ThreadPoolExecutor(12) as ex:
        list(ex.map(host_job, by_host.values()))
    dead = {u: c for u, c in res.items() if c in (404, 410) or (isinstance(c, str) and "URLError" in c)}
    unsure = {u: c for u, c in res.items() if u not in dead and c != 200 and not (isinstance(c, int) and 200 <= c < 400)}
    (OUT / "links.md").write_text("\n".join(
        ["# 出处链接检查", "", f"{time.strftime('%Y-%m-%d')} 检查了主干、重要节点和专题里的节点的 {len(res)} 个链接：{len(res) - len(dead) - len(unsure)} 个正常，{len(dead)} 个确定打不开（404/410/域名不存在），{len(unsure)} 个没能判断（网站拒绝脚本访问、超时等）。", "",
         "## 确定打不开", ""] + [f"- {u}　`{c}`　{'、'.join(urls[u])}" for u, c in sorted(dead.items())] + ["", "## 没能判断", ""] + [f"- {u}　`{c}`　{'、'.join(urls[u])}" for u, c in sorted(unsure.items())]), encoding="utf-8")
    return {"links_checked": len(res), "links_dead": len(dead), "links_unsure": len(unsure)}


if __name__ == "__main__":
    main()
