"""不运行脚本也能读的静态页面。由 build.py 调用，输出到 docs/ 下：

  n/<id>.html      每个节点的讲解
  c/<key>.html     每个概念、研究思路
  s/<key>.html     研究专题
  t/<track>.html   每条分支的全部节点（按主题线，演化树的列表版）
  start.html       入门路线、专题、完整主干路线
  timeline.html    九个时代和每个时代的主干、重要节点
  fields.html      大方向 › 分支 › 主题线
  glossary.html    全部概念与思路
  about.html       内容是怎么来的、审核状态是什么意思、怎么报错
  sitemap.xml

每页有自己的 title、description、canonical 和 Open Graph 信息。正文和交互版用的是同一份数据。
"""
import html
import re
from collections import defaultdict
from urllib.parse import quote

SITE = "https://moyunxiang.com/ai_study/"
REPO = "https://github.com/moyunxiang/ai_study"
KIND = {"paper": "论文", "model": "模型", "system": "系统", "hardware": "硬件", "dataset": "数据集", "event": "事件", "concept": "思想"}
TIER = {1: "主干", 2: "重要", 3: "延伸"}
REL = {"solves": "改进", "extends": "延续", "uses": "使用", "rivals": "竞争"}
AREA = {"idea": "研究思路", "math": "数学预备", "prob": "概率统计与信息论", "opt": "优化与训练", "ml": "机器学习基础", "nn": "神经网络组件", "seq": "序列与语言模型",
        "gen": "生成模型", "rl": "强化学习", "vis": "视觉", "aud": "语音", "emb": "具身与控制", "sys": "系统与硬件", "eval": "评测与实验方法"}
REV = {0: "待核对", 1: "来源已核对", 2: "人工复核"}
LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")

h = lambda s: html.escape(str(s if s is not None else ""), quote=True)
fmt_date = lambda d: f"{d[:4]}.{d[5:]}" if len(d) == 7 else d


def plain(s, n=150):
    """去掉标记，取前n个字，用作 description。"""
    s = LINK.sub(lambda m: m.group(2) or "", s or "")
    s = re.sub(r"[`*\n]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n - 1] + "…"


class Site:
    def __init__(self, x):
        self.__dict__.update(x)
        self.docs = self.root / "docs"
        self.track_by = {t["key"]: t for t in self.tracks}
        self.th_by = {k: {t["key"]: t for t in v} for k, v in self.threads.items()}
        self.inn, self.out = defaultdict(list), defaultdict(list)
        for e in self.edges:
            self.out[e["from"]].append(e)
            self.inn[e["to"]].append(e)
        self.rev = lambda nid: {"source": 1, "human": 2}.get((self.reviews.get(nid) or {}).get("status"), 0)
        self.fig_by = {f["key"]: f for f in self.figures}
        import hashlib      # 样式表用内容哈希做版本号：只有样式真的变了，静态页才会跟着变
        self.cssv = hashlib.md5((self.docs / "assets" / "style.css").read_bytes()).hexdigest()[:8]
        self.written = []

    # ——— 正文标记，与前端 app.js 的 inline / rich 保持一致 ———
    def inline(self, s, rel):
        def link(m):
            ref, txt = m.group(1).strip(), m.group(2)
            if ref.startswith("c:"):
                c = self.concepts.get(ref[2:])
                return f'<a class="lc" href="{rel}c/{quote(c["key"])}.html">{txt or h(c["name"])}</a>' if c else h(txt or ref)
            n = self.nodes.get(ref)
            return f'<a class="ln" href="{rel}n/{quote(n["id"])}.html">{txt or h(n["title"])}</a>' if n else h(txt or ref)
        s = h(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
        return LINK.sub(link, s)

    def rich(self, text, rel):
        if not text:
            return ""
        out, lst = [], []

        def flush():
            if lst:
                out.append("<ul>" + "".join(f"<li>{self.inline(x, rel)}</li>" for x in lst) + "</ul>")
                lst.clear()
        for block in re.split(r"\n{2,}", str(text)):
            para = []
            for line in block.split("\n"):
                m = re.match(r"^\s*[-•]\s+(.*)$", line)
                if m:
                    if para:
                        out.append(f"<p>{self.inline(' '.join(para), rel)}</p>")
                        para = []
                    lst.append(m.group(1))
                else:
                    flush()
                    para.append(line.strip())
            flush()
            if para:
                t = "\n".join(para).strip()
                out.append(f'<p class="formula">{self.inline(t, rel)}</p>' if re.match(r"^`[^`]+`$", t) else f"<p>{self.inline(' '.join(para), rel)}</p>")
        return "".join(out)

    def fig(self, key, rel):
        f = self.fig_by.get(key)
        return f'<figure class="fig">{f["svg"]}<figcaption><b>{h(f["title"])}</b>　{self.inline(f["caption"], rel)}</figcaption></figure>' if f else ""

    def nlink(self, nid, rel, extra=""):
        n = self.nodes[nid]
        return f'<a class="chip hue" style="--h:{self.track_by[n["track"]]["hue"]}" href="{rel}n/{quote(nid)}.html">{h(n["title"])}</a>{extra}'

    def page(self, path, title, desc, body, route="", kind="article"):
        rel = "../" * path.count("/")
        url = SITE + quote(path)
        doc = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111213">
<title>{h(title)} · AI脉络</title>
<meta name="description" content="{h(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:site_name" content="AI脉络">
<meta property="og:locale" content="zh_CN">
<meta property="og:type" content="{kind}">
<meta property="og:title" content="{h(title)}">
<meta property="og:description" content="{h(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}assets/og.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23111213'/%3E%3Cpath d='M12 40h12c12 0 12-20 26-20M24 40c12 0 14 8 26 8' fill='none' stroke='%23E8E8E8' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='50' cy='20' r='4.5' fill='%23E8E8E8'/%3E%3Ccircle cx='50' cy='48' r='4.5' fill='%23E8E8E8'/%3E%3Ccircle cx='12' cy='40' r='4.5' fill='%23ECEDEE'/%3E%3C/svg%3E">
<link rel="stylesheet" href="{rel}assets/style.css?v={self.cssv}">
<script>try{{var t=JSON.parse(localStorage.getItem('aimap.theme')||'""');if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
</head>
<body class="static">
<header class="top">
  <a class="brand" href="{rel}index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 15h5c4.5 0 4.5-8 9.5-8H21M8 15c4.5 0 5 3.5 9.5 3.5H21"/><circle cx="21" cy="7" r="1.7" fill="currentColor" stroke="none"/><circle cx="21" cy="18.5" r="1.7" fill="currentColor" stroke="none"/><circle cx="3" cy="15" r="1.7" fill="currentColor" stroke="none"/></svg><span>AI脉络</span></a>
  <nav class="nav" aria-label="主导航"><a href="{rel}start.html">开始学习</a><a href="{rel}timeline.html">时间线</a><a href="{rel}fields.html">领域地图</a><a href="{rel}glossary.html">知识索引</a></nav>
  <a class="btn sm go" href="{rel}index.html#/{route}">交互版</a>
  <button class="tbtn" type="button" aria-label="切换深色和浅色外观" title="切换深色 / 浅色" onclick="(function(){{var r=document.documentElement,t=r.dataset.theme,l=t==='light'||(t==='auto'&&matchMedia('(prefers-color-scheme: light)').matches),n=l?'':'light';if(n)r.dataset.theme=n;else delete r.dataset.theme;try{{localStorage.setItem('aimap.theme',JSON.stringify(n))}}catch(e){{}}}})()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg></button>
</header>
<main class="page">
{body}
<footer class="foot"><span>© Yunxiang (Kevin) Mo · <a href="{rel}about.html">关于内容与纠错</a></span><span>讲解由AI模型撰写，除标注“来源已核对”的以外未逐条核对，引用前请以原文为准。</span></footer>
</main>
</body>
</html>
'''
        p = self.docs / path
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists() or p.read_text(encoding="utf-8") != doc:
            p.write_text(doc, encoding="utf-8")
        self.written.append(path)

    # ——— 节点 ———
    def issue_url(self, n):
        title = f"[纠错] {n['title']}（{n['id']}）"
        body = f"节点：{n['id']}\n页面：{SITE}n/{n['id']}.html\n\n哪一句有问题：\n\n应该是什么（最好附上出处链接）：\n"
        return f"{REPO}/issues/new?title={quote(title)}&body={quote(body)}"

    def rel_list(self, es, key, rel):
        if not es:
            return ""
        li = []
        for e in es:
            o = self.nodes[e[key]]
            mark = ' <span class="vk ok">已核对</span>' if e.get("v") in ("ok", "revised") else ' <span class="vk">待核对</span>' if e.get("v") == "weak" else ""
            li.append(f'<li><span class="ty {e["type"]}">{REL[e["type"]]}</span><div>{self.nlink(o["id"], rel)}<span class="yr">{fmt_date(o["date"])} · {h(self.track_by[o["track"]]["short"])}</span>{mark}'
                      f'{"<div class=nt>" + self.inline(e["note"], rel) + "</div>" if e["note"] else ""}</div></li>')
        return '<ul class="rels">' + "".join(li) + "</ul>"

    def node(self, nid):
        n, c, rel = self.nodes[nid], self.full.get(nid, {}), "../"
        t = self.track_by[n["track"]]
        th = self.th_by[n["track"]].get(n["th"])
        grp = next((g for g in self.tree.get("groups", []) if n["track"] in g["tracks"]), None)
        rv, r = self.rev(nid), self.reviews.get(nid)
        sec = lambda title, text, anchor="": f'<h2{" id=" + anchor if anchor else ""}>{title}</h2>{self.rich(text, rel)}' if text else ""
        vr = lambda e: 0 if e.get("v") in ("ok", "revised") else 1 if e.get("v") == "weak" else 2      # 核对过的关系排前面
        before = sorted(self.inn[nid], key=lambda e: (vr(e), self.nodes[e["from"]]["tier"], self.nodes[e["from"]]["date"]))
        after = sorted(self.out[nid], key=lambda e: (vr(e), self.nodes[e["to"]]["tier"], self.nodes[e["to"]]["date"]))
        lim = ""
        if c.get("limits"):
            items = []
            for l in c["limits"]:
                if l.get("open"):
                    st = f'<b>仍是开放问题</b>　{h(l["open"])}'
                elif l["by"]:
                    st = "后来针对它的工作　" + " ".join(self.nlink(i, rel) for i in l["by"])
                else:
                    st = "本站还没有记录针对它的后续工作（不代表没有人解决）"
                items.append(f'<li>{self.inline(l["text"], rel)}{"<span class=vk>作者在原文中指出</span>" if l.get("stated") else ""}<div class="by">{st}</div></li>')
            lim = '<h2 id="limits">局限与后续</h2><ul class="limits">' + "".join(items) + "</ul>"
        pre = c.get("prereq") or []
        figs = "".join(self.fig(k, rel) for k in c.get("figs") or [])
        if r:
            rvbox = (f'<div class="rv r{rv}"><b>{REV[rv]}</b>　{h(r["date"])} · {"人工" if rv == 2 else "由AI模型对照原始来源逐项核对，未经人工复核"}'
                     f'<details><summary>核对了什么</summary><ul>{"".join(f"<li>{h(x)}</li>" for x in r["checked"])}</ul>'
                     f'{"<p>仍未能核对：</p><ul>" + "".join(f"<li>{h(x)}</li>" for x in r.get("unverified") or []) + "</ul>" if r.get("unverified") else ""}'
                     f'<p>核对时打开的来源：</p><ul>{"".join(f"""<li><a href="{h(s["url"])}" rel="noopener">{h(s["url"])}</a>　{h(s["what"])}</li>""" for s in r["sources"])}</ul></details></div>')
        else:
            rvbox = (f'<div class="rv r0"><b>待核对</b>　这篇讲解由AI模型撰写，尚未对照原始来源独立核对。'
                     + ("写作时记录的出处：" + "、".join(f'<a href="{h(u)}" rel="noopener">{h(u)}</a>' for u in re.split(r"[\s;；]+", c["check"]["source"]) if u.startswith("http")) + f'（{h(c["check"]["confirmed"])}）' if c.get("check") else "") + "</div>")
        ords = self.per_track[n["track"]]
        k = ords.index(nid)
        prev, nxt = (self.nodes[ords[k - 1]] if k else None), (self.nodes[ords[k + 1]] if k + 1 < len(ords) else None)
        body = f'''<article class="hue" style="--h:{t["hue"]}"><div class="narrow" style="margin:0 auto">
<div class="article-head">
<div class="eyebrow">{h(grp["name"]) + " › " if grp else ""}<a href="{rel}t/{t["key"]}.html">{h(t["name"])}</a>{" › " + h(th["name"]) if th and th["key"] != "all" else ""}</div>
<h1>{h(n["title"])}</h1>
{f'<div class="full">{h(n["full"])}</div>' if n["full"] else ""}
<div class="meta"><span>{fmt_date(n["date"])}</span><span>{KIND[n["kind"]]}</span><span>{TIER[n["tier"]]}</span>{f"<span>{h(c['venue'])}</span>" if c.get("venue") else ""}{f"<span>{h(c['who'])}</span>" if c.get("who") else ""}<span class="rvb r{rv}">{REV[rv]}</span></div>
<div class="acts">{"".join(f'<a class="btn sm" href="{h(l["url"])}" rel="noopener">{h(l["label"])} ↗</a>' for l in c.get("links") or [])}<a class="btn sm" href="{rel}index.html#/n/{quote(nid)}">在交互版中打开（演化树、学习进度）</a></div>
</div>
{f'<div class="gist"><div><h4>问题</h4><p>{self.inline(c.get("problem"), rel)}</p></div><div><h4>方法</h4><p>{self.inline(c.get("idea"), rel)}</p></div><div><h4>影响</h4><p>{self.inline(c.get("impact"), rel)}</p></div></div>' if c.get("problem") else ""}
<div class="prose">
{sec("背景", c.get("background"))}{sec("方法", c.get("method"))}{figs}{sec("结果", c.get("results"))}{sec("后来的发展", c.get("legacy"))}{sec("容易误解的地方", c.get("pitfalls"))}
{lim}
{f'<h2 id="before">它建立在什么之上</h2>{self.rel_list(before, "from", rel)}' if before else ""}
{f'<h2 id="after">后来的相关工作</h2>{self.rel_list(after, "to", rel)}' if after else ""}
{'<p class="muted" style="font-size:13.5px">这些关系由AI模型整理。“改进”指后来的工作针对它的某个问题做了改进，不代表问题已经解决；“竞争”指同一问题的不同路线，不代表谁取代了谁。标有“已核对”的对照过原始来源，其余未逐条核对。</p>' if before or after else ""}
{f'<h2>读懂它需要的概念</h2><p class="tags">{" ".join(f"""<a class="chip c" href="{rel}c/{quote(p)}.html">{h(self.concepts[p]["name"])}</a>""" for p in pre if p in self.concepts)}</p>' if pre else ""}
{f'<h2>本篇术语</h2><ul>{"".join(f"<li><b>{h(x["t"])}</b>　{self.inline(x["d"], rel)}</li>" for x in c["terms"])}</ul>' if c.get("terms") else ""}
{sec("怎么学", c.get("learn"))}
</div>
{rvbox}
<p class="report"><a class="btn sm" href="{h(self.issue_url(n))}" rel="noopener">报告错误</a>　发现事实错误或说得过头的地方，请告诉我们（跳转到GitHub，会预填这个节点的信息）。</p>
<div class="pn">{f'<a href="{quote(prev["id"])}.html"><small>本分支上一个 · {fmt_date(prev["date"])}</small><b>{h(prev["title"])}</b></a>' if prev else "<span></span>"}{f'<a class="r" href="{quote(nxt["id"])}.html"><small>本分支下一个 · {fmt_date(nxt["date"])}</small><b>{h(nxt["title"])}</b></a>' if nxt else "<span></span>"}</div>
</div></article>'''
        desc = plain(" ".join(x for x in (c.get("problem"), c.get("idea")) if x) or n["full"] or n["title"], 150)
        self.page(f"n/{nid}.html", f"{n['title']}（{n['date'][:4]}）", desc, body, route=f"n/{quote(nid)}")

    # ——— 概念、思路 ———
    def concept(self, key):
        c, rel = self.concepts[key], "../"
        idea = c["area"] == "idea"
        ns = [self.nodes[i] for i in c.get("nodes") or []]
        show = sorted(ns, key=lambda n: n["date"] if idea else (n["tier"], n["date"]))[:80]
        needs = [k for k in c.get("needs") or [] if k in self.concepts]
        figs = "".join(self.fig(k, rel) for k in self.figs_of_c.get(key, []))
        body = f'''<article><div class="narrow" style="margin:0 auto">
<div class="article-head"><div class="eyebrow"><a href="{rel}glossary.html">知识索引</a> · {AREA[c["area"]]}{"" if idea else " · " + ["预备", "入门", "进阶"][c["level"]]}</div>
<h1>{h(c["name"])}</h1><div class="full">{h(c.get("en", ""))}</div>
{f'<p class="muted" style="font-size:13px">也叫：{"　".join(h(a) for a in c["aka"])}</p>' if c.get("aka") else ""}
<div class="acts"><a class="btn sm" href="{rel}index.html#/c/{quote(key)}">在交互版中打开（看它长在树上的哪里）</a></div></div>
<div class="prose">
<p class="lede"><b>{self.inline(c.get("short", ""), rel)}</b></p>
{f'<p class="tags">先要会：{" ".join(f"""<a class="chip c" href="{quote(k)}.html">{h(self.concepts[k]["name"])}</a>""" for k in needs)}</p>' if needs else ""}
{figs}{self.rich(c.get("body"), rel)}
{f'<div class="example"><h4>例子</h4>{self.rich(c["example"], rel)}</div>' if c.get("example") else ""}
{f'<h2>容易误解的地方</h2>{self.rich(c["pitfalls"], rel)}' if c.get("pitfalls") else ""}
{f'<h2>{"属于这个思路的工作" if idea else "用到它的工作"}</h2><p class="tags">{" ".join(self.nlink(n["id"], rel) for n in show)}</p>' if show else ""}
</div>
<div class="rv r0"><b>待核对</b>　词条由AI模型撰写，未对照来源独立核对。</div>
</div></article>'''
        self.page(f"c/{key}.html", f"{c['name']}{'（' + c['en'] + '）' if c.get('en') else ''}", plain(c.get("short") or c.get("body"), 150), body, route=f"c/{quote(key)}")

    # ——— 专题 ———
    def story(self, s):
        rel = "../"
        steps = []
        for i, st in enumerate(s["steps"], 1):
            n = self.nodes[st["node"]]
            steps.append(f'<li class="hue" style="--h:{self.track_by[n["track"]]["hue"]}"><div class="when">{n["date"][:4]}</div><div class="what"><h3>{h(st["h"])}</h3>'
                         f'<div class="who"><a href="{rel}n/{quote(n["id"])}.html">{h(n["title"])}</a>{" · " + h(n["full"]) if n["full"] else ""}<span class="rvb r{self.rev(n["id"])}">{REV[self.rev(n["id"])]}</span></div>{self.rich(st["text"], rel)}</div></li>')
        figs = "".join(self.fig(k, rel) for k in s.get("figs") or [])
        nxt = [x for x in self.stories if x["key"] in (s.get("next") or [])]
        body = f'''<article><div class="narrow" style="margin:0 auto">
<div class="article-head"><div class="eyebrow"><a href="{rel}start.html">开始学习</a> · 研究专题 · {len(s["steps"])}站</div>
<h1>{h(s["title"])}</h1><p class="lead">{h(s["question"])}</p>
<div class="acts"><a class="btn sm" href="{rel}index.html#/story/{quote(s["key"])}">在交互版中打开</a></div></div>
<div class="prose">{self.rich(s["intro"], rel)}</div>
<ol class="story">{"".join(steps)}</ol>
<div class="prose">{figs}<h2>现在走到哪了</h2>{self.rich(s["takeaway"], rel)}
<div class="note caveat"><h4>这条线简化了什么</h4>{self.rich(s["caveats"], rel)}</div>
{f'<h2>接着读</h2><p class="tags">{" ".join(f"""<a class="btn sm" href="{quote(x["key"])}.html">{h(x["title"])}</a>""" for x in nxt)}</p>' if nxt else ""}</div>
</div></article>'''
        self.page(f"s/{s['key']}.html", s["title"], plain(s["question"] + " " + s["intro"], 150), body, route=f"story/{quote(s['key'])}")

    # ——— 分支（演化树的列表版）———
    def track(self, t):
        rel, k = "../", t["key"]
        fk = self.tree.get("forks", {}).get(k, {})
        parts = []
        for th in self.threads[k]:
            ids = [i for i in self.per_track[k] if self.nodes[i]["th"] == th["key"]]
            rows = "".join(f'<li class="t{self.nodes[i]["tier"]}"><span class="d">{fmt_date(self.nodes[i]["date"])}</span><a href="{rel}n/{quote(i)}.html">{h(self.nodes[i]["title"])}</a>'
                           f'<span class="p">{h(plain(self.full.get(i, {}).get("problem", ""), 70))}</span></li>' for i in ids)
            parts.append(f'<section class="sec" id="{th["key"]}"><div class="sec-h"><h2>{h(th["name"])}</h2><span class="muted">{th["first"][:4]}–{th["last"][:4]} · {len(ids)}个节点</span></div>'
                         f'<p class="muted">{h(th["blurb"])}</p><ul class="plain">{rows}</ul></section>')
        body = f'''<div class="hue" style="--h:{t["hue"]}"><div class="mast"><div class="eyebrow"><a href="{rel}fields.html">领域地图</a> · {len(self.per_track[k])}个节点 · {len(self.threads[k])}条主题线</div>
<h1>{h(t["name"])}</h1><p class="lead"><b>{h(t["question"])}</b></p><p class="lead">{h(t["blurb"])}</p>
{f'<p class="lead" style="font-size:14.5px">{"从“" + h(self.track_by[fk["from"]]["name"]) + "”分出：" if fk.get("from") else "独立的根："}{h(fk["why"])}</p>' if fk.get("why") else ""}
<div class="acts" style="margin-top:14px"><a class="btn sm" href="{rel}index.html#/track/{k}">在交互版中打开这条分支的演化树</a></div></div>
<p class="muted" style="margin-top:16px">下面按主题线列出这条分支的全部节点，粗体是主干。这是演化树的列表版，内容相同。</p>
{"".join(parts)}</div>'''
        self.page(f"t/{k}.html", f"{t['name']}：全部节点", plain(t["question"] + " " + t["blurb"], 150), body, route=f"track/{k}")

    # ——— 汇总页 ———
    def hubs(self):
        rel = ""
        intro = (self.routes.get("intro") or {})
        steps = "".join(f'<li class="hue" style="--h:{self.track_by[self.nodes[s["node"]]["track"]]["hue"]}"><div class="when">{self.nodes[s["node"]]["date"][:4]}</div><div class="what"><h3><a href="n/{quote(s["node"])}.html">{h(self.nodes[s["node"]]["title"])}</a></h3>'
                        f'<div class="who">{h(s.get("topic", ""))}</div><p>{h(s["why"])}</p></div></li>' for s in intro.get("steps") or [] if s.get("node") in self.nodes)
        t1 = [i for i in self.sorted_ids if self.nodes[i]["tier"] == 1]
        body = f'''<div class="mast"><div class="eyebrow">开始学习</div><h1>从哪里读起</h1><p class="lead">三种读法：跟着入门路线按时间走一遍；挑一个问题读对应的专题；或者按完整的主干路线读{len(t1)}个节点。</p></div>
<section class="sec"><div class="sec-h"><h2>{h(intro.get("title", "入门路线"))}</h2></div><p class="lead" style="font-size:15px">{h(intro.get("blurb", ""))}</p><ol class="story">{steps}</ol></section>
<section class="sec"><div class="sec-h"><h2>研究专题</h2><span class="muted">围绕一个问题，按时间把相关工作串起来</span></div>
<ul class="plain">{"".join(f'<li class="t1"><a href="s/{quote(s["key"])}.html">{h(s["title"])}</a><span class="p">{h(s["question"])}</span></li>' for s in self.stories)}</ul></section>
<section class="sec"><div class="sec-h"><h2>完整主干路线</h2><span class="muted">{len(t1)}个节点，按时间</span></div>
<ul class="plain">{"".join(f'<li class="t1"><span class="d">{fmt_date(self.nodes[i]["date"])}</span><a href="n/{quote(i)}.html">{h(self.nodes[i]["title"])}</a><span class="p">{h(plain(self.full.get(i, {}).get("problem", ""), 70))}</span></li>' for i in t1)}</ul></section>'''
        self.page("start.html", "开始学习：入门路线、研究专题与主干路线", "14站入门路线、10个研究专题和69个主干节点的完整路线，从1958年的感知机读到今天的推理模型。", body, route="learn", kind="website")

        era_of = lambda n: next((e for e in self.eras if int(n["date"][:4]) <= e["to"]), self.eras[-1])
        secs = []
        for e in self.eras:
            ids = [i for i in self.sorted_ids if era_of(self.nodes[i]) is e and self.nodes[i]["tier"] <= 2]
            secs.append(f'<section class="sec" id="{e["id"]}"><div class="sec-h"><h2>{e["from"]}–{e["to"]}　{h(e["name"])}</h2><span class="muted">主干和重要节点 {len(ids)} 个</span></div>'
                        f'<p class="lead" style="font-size:15px">{h(e["tagline"])}</p><p class="muted">{h(e["context"])}</p>'
                        f'<ul class="plain">{"".join(f"""<li class="t{self.nodes[i]["tier"]}"><span class="d">{fmt_date(self.nodes[i]["date"])}</span><a href="n/{quote(i)}.html">{h(self.nodes[i]["title"])}</a><span class="p">{h(self.track_by[self.nodes[i]["track"]]["short"])}</span></li>""" for i in ids)}</ul></section>')
        self.page("timeline.html", "时间线：九个时代", "从1943年到今天，AI发展的九个时代：每个时代的条件、在攻克的问题，以及主干和重要的工作。",
                  f'<div class="mast"><div class="eyebrow">时间线</div><h1>九个时代</h1><p class="lead">每个时代有自己的算力、数据和资金条件，也有自己的核心问题。下面列出每个时代的主干（粗体）和重要节点；每条分支的全部节点见<a href="fields.html"><u>领域地图</u></a>。</p></div>' + "".join(secs), route="timeline", kind="website")

        gs = []
        for g in self.tree.get("groups", []):
            trs = "".join(f'<div class="trk hue" style="--h:{self.track_by[k]["hue"]}"><div class="trk-h"><a href="t/{k}.html"><h3>{h(self.track_by[k]["name"])}</h3></a><span class="m">{len(self.per_track[k])}个节点</span></div>'
                          f'<p class="q">{h(self.track_by[k]["question"])}</p><div class="ths">{"".join(f"""<a class="thc" href="t/{k}.html#{th["key"]}">{h(th["name"])}<small>{th["n"]}</small></a>""" for th in self.threads[k])}</div></div>' for k in g["tracks"])
            gs.append(f'<section class="grp"><div class="role">{h(g["role"])}</div><h2>{h(g["name"])}</h2><p>{h(g["blurb"])}</p>{trs}</section>')
        self.page("fields.html", "领域地图：6个大方向、16条分支", "AI研究的6个大方向、16条分支和每条分支下的主题线。这是演化树的列表版。",
                  f'<div class="mast"><div class="eyebrow">领域地图</div><h1>六个大方向，十六条分支</h1><p class="lead">这棵树是为了学习和查找而整理的一种组织方式：每条分支只画了一个来源，实际的研究之间有很多交叉。它不代表AI研究只有唯一的传承关系。</p></div>' + "".join(gs), route="map", kind="website")

        cs = list(self.concepts.values())
        blocks = []
        for a, name in AREA.items():
            lst = [c for c in cs if c["area"] == a]
            if lst:
                blocks.append(f'<section class="sec"><div class="sec-h"><h2>{name}</h2><span class="muted">{len(lst)}条</span></div><p class="tags">{" ".join(f"""<a class="chip c" href="c/{quote(c["key"])}.html">{h(c["name"])}</a>""" for c in lst)}</p></section>')
        self.page("glossary.html", "知识索引：基础概念与研究思路", f"{sum(c['area'] != 'idea' for c in cs)}个基础概念和{sum(c['area'] == 'idea' for c in cs)}个研究思路的索引，每一条都有讲解。",
                  '<div class="mast"><div class="eyebrow">知识索引</div><h1>概念与研究思路</h1><p class="lead">基础概念是读讲解要先会的知识；研究思路是一串论文共同在做的事，例如“在策略自蒸馏”“扩散语言模型”。</p></div>' + "".join(blocks), route="index", kind="website")

        r = self.n_rev
        total, t1n = len(self.nodes), sum(1 for n in self.nodes.values() if n["tier"] == 1)
        body = f'''<div class="narrow" style="margin:0 auto"><div class="article-head"><div class="eyebrow">关于内容</div><h1>这些内容是怎么来的，能信到什么程度</h1></div>
<div class="prose">
<h2>内容的来源</h2>
<p>站内{total}个节点的讲解、节点之间的关系、概念词条和研究专题，都由AI模型撰写。写作时要求模型对照论文原文或官方页面，并在每个节点留下一条出处。但那是写作模型自己的记录，没有经过独立核对，所以不能当作“已验证”。</p>
<h2>三种审核状态</h2>
<ul>
<li><b>人工复核</b>　真人核实过关键事实和引用。目前有 <b>{r["human"]}</b> 个节点。</li>
<li><b>来源已核对</b>　另一次独立的核对：由AI模型实际打开原始来源（论文、官方公告），逐项对照讲解里的作者、日期、数字和方法描述，改掉不一致的地方，并留下“核对了什么、打开了哪些来源、哪些仍未能核对”的记录。没有经过人工复核。目前有 <b>{r["source"]}</b> 个节点，其中主干节点 {r["t1"]} / {t1n}。核对中共修改了 {r["changed"]} 处。</li>
<li><b>待核对</b>　其余全部节点，以及全部概念词条。它们可能有事实错误，尤其是2024年以后的产品、事件和具体数字。</li>
</ul>
<p>每个节点页的标题下面和页面底部都标着它的状态；“来源已核对”的节点可以展开看核对记录。</p>
<h2>关系和“树”要怎么理解</h2>
<ul>
<li>演化树（大方向 › 分支 › 主题线 › 节点）是为了学习和查找整理出来的一种组织方式。每条分支、每条主题线只画了一个来源，实际的研究有很多交叉。它不代表AI研究只有唯一的父子关系。</li>
<li>节点之间的关系有四种：<b>改进</b>（后来的工作针对前面工作的某个问题做了改进，不代表问题已经解决）、<b>延续</b>（沿着同一思路往前推）、<b>使用</b>（当作部件来用）、<b>竞争</b>（同一问题的不同路线，不代表谁取代了谁）。</li>
<li>这些关系大多由AI模型根据论文内容整理，时间先后不等于因果。全站约{len(self.edges)}条关系中，对照过原始来源的有 {r["edges"]} 条，在页面上标为“已核对”；另有 {r["weak"]} 条核对时没找到明确依据，标为“待核对”；其余没有逐条核对。</li>
<li>节点页“局限与后续”里，如果写着“本站还没有记录针对它的后续工作”，只说明本站没有收录，不说明这个问题没有人解决。</li>
<li>交互版“工具”里的“两个节点之间的路径”给出的是图上的一条最短连接，不一定是学术上最重要或最准确的演进路线。</li>
</ul>
<h2>发现错误怎么办</h2>
<p>每个节点页底部有“报告错误”，会跳转到GitHub并预填节点信息。也可以直接到 <a class="ln" href="{REPO}/issues" rel="noopener">{REPO}/issues</a> 提出。引用站内内容之前，请以原始论文和官方材料为准。</p>
<h2>个人数据</h2>
<p>学习进度、收藏和笔记只保存在你当前这个浏览器里，不会上传，也不会在设备之间同步。清除浏览数据或换设备会丢失，可以在交互版“我的进度”里导出和导入。</p>
<p class="muted">源码、数据和内容规范都在 <a class="ln" href="{REPO}" rel="noopener">{REPO}</a>。站点的设计说明见 <a class="ln" href="design.html">design.html</a>。</p>
</div></div>'''
        self.page("about.html", "关于内容：来源、审核状态与纠错", "站内讲解由AI模型撰写。这里说明三种审核状态的含义、目前核对到什么程度、关系和演化树该怎么理解，以及怎么报告错误。", body, route="", kind="website")

    def sitemap(self):
        pri = lambda p: "1.0" if p in ("start.html", "timeline.html", "fields.html") else "0.9" if p.startswith("s/") else "0.6"
        def prio(p):
            if p.startswith("n/"):
                return {1: "0.9", 2: "0.7", 3: "0.4"}[self.nodes[p[2:-5]]["tier"]]
            return pri(p)
        day = f"{self.stamp[:4]}-{self.stamp[4:6]}-{self.stamp[6:8]}"
        urls = [("", "1.0")] + [(p, prio(p)) for p in self.written] + [("design.html", "0.3")]
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
            f"<url><loc>{SITE}{quote(p)}</loc><lastmod>{day}</lastmod><priority>{pr}</priority></url>\n" for p, pr in urls) + "</urlset>\n"
        (self.docs / "sitemap.xml").write_text(xml, encoding="utf-8")


def write_all(x):
    s = Site(x)
    for nid in s.sorted_ids:
        s.node(nid)
    for key in s.concepts:
        s.concept(key)
    for st in s.stories:
        s.story(st)
    for t in s.tracks:
        s.track(t)
    s.hubs()
    s.sitemap()
    keep = set(s.written)           # 清掉已经不存在的节点、概念留下的旧页面
    for d in ("n", "c", "s", "t"):
        for p in (s.docs / d).glob("*.html"):
            if f"{d}/{p.name}" not in keep:
                p.unlink()
    return len(s.written)
