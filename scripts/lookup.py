#!/usr/bin/env python3
"""核对出处的小工具（不依赖 WebSearch 额度，直接走公开接口）。

  python3 scripts/lookup.py arxiv 1706.03762 [2005.14165 ...]   arXiv 官方记录：标题、作者、首次提交日期、摘要
  python3 scripts/lookup.py title "Attention Is All You Need"    按标题找论文（OpenAlex，含发表日期、作者、被引数、arXiv/DOI）
  python3 scripts/lookup.py wiki "Dartmouth workshop" [zh]       维基百科条目摘要（事件、硬件、机构）
  python3 scripts/lookup.py url https://openai.com/index/...     抓取网页，输出 <title> 与正文前 4000 字
  python3 scripts/lookup.py news "Anthropic IPO"                  Google News：近期事件的报道标题、媒体、日期
  python3 scripts/lookup.py hn "Claude Code launch"              Hacker News：帖子标题、日期、原始公告链接
  python3 scripts/lookup.py s2 "world action model robot"        Semantic Scholar：按关键词找论文（日期、被引、arXiv id、TLDR）
  python3 scripts/lookup.py search "DreamZero world action model" 网页搜索（Brave），经常被限流，最后手段

arXiv 接口全局限速（约3秒一次，多个进程共用一把文件锁），遇到 429/503 会自动退避重试。
"""
import fcntl
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "Mozilla/5.0 (compatible; history-map-checker/1.0)"
LOCK = Path("/tmp/arxiv-throttle.lock")


def fetch(url, tries=4, timeout=25, headers=None):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(4 * (i + 1))
                continue
            raise
        except Exception as e:  # 超时、连接重置
            last = e
            time.sleep(2 * (i + 1))
    raise last


def throttle(seconds=3.2, lock=None):
    """跨进程限速：拿文件锁，读上次请求时间，睡够间隔再放行。"""
    lock = lock or LOCK
    lock.touch(exist_ok=True)
    with open(lock, "r+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            last = float(f.read().strip() or 0)
        except ValueError:
            last = 0
        wait = seconds - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        f.seek(0)
        f.truncate()
        f.write(str(time.time()))
        f.flush()
        fcntl.flock(f, fcntl.LOCK_UN)


def arxiv(ids):
    ids = [re.sub(r"^(https?://)?(export\.)?arxiv\.org/(abs|pdf)/", "", i).removesuffix(".pdf") for i in ids]
    throttle()
    xml = fetch("https://export.arxiv.org/api/query?max_results=50&id_list=" + ",".join(ids))
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = ET.fromstring(xml).findall("a:entry", ns)
    if not entries:
        print("没有找到记录")
    for e in entries:
        g = lambda t: re.sub(r"\s+", " ", (e.findtext(f"a:{t}", "", ns) or "")).strip()
        if not g("title"):
            print("没有找到记录（id 可能有误）")
            continue
        authors = [a.findtext("a:name", "", ns) for a in e.findall("a:author", ns)]
        print(f"id:        {g('id')}")
        print(f"title:     {g('title')}")
        print(f"published: {g('published')[:10]}   (v1 首次提交)   updated: {g('updated')[:10]}")
        print(f"authors:   {', '.join(authors[:12])}{' et al. (%d)' % len(authors) if len(authors) > 12 else ''}")
        print(f"abstract:  {g('summary')}")
        print()


def crossref(q):
    """Crossref：期刊、会议、bioRxiv 等带 DOI 的出版物。"""
    data = json.loads(fetch("https://api.crossref.org/works?rows=4&select=title,author,issued,container-title,DOI,type&query.title=" + urllib.parse.quote(q)))
    items = data.get("message", {}).get("items", [])
    if not items:
        print("Crossref 没有结果；可改用 hn / news / wiki / url")
    for w in items:
        au = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in w.get("author", [])]
        d = "-".join(f"{x:02d}" if i else str(x) for i, x in enumerate((w.get("issued", {}).get("date-parts") or [[None]])[0]) if x)
        print(f"title:     {(w.get('title') or [''])[0]}\ndate:      {d}   venue: {(w.get('container-title') or [''])[0]}   type: {w.get('type')}\nauthors:   {', '.join(au[:10])}{' et al. (%d)' % len(au) if len(au) > 10 else ''}\nlink:      https://doi.org/{w.get('DOI')}\n")


def arxiv_title(q):
    """OpenAlex 不可用时的后备：arXiv 标题检索。"""
    throttle()
    xml = fetch("https://export.arxiv.org/api/query?max_results=4&search_query=" + urllib.parse.quote('ti:"' + q.replace('"', "") + '"'))
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = ET.fromstring(xml).findall("a:entry", ns)
    if not entries:
        print("（arXiv 标题检索没有结果，改用 Crossref）")
        return crossref(q)
    for e in entries:
        g = lambda t: re.sub(r"\s+", " ", (e.findtext(f"a:{t}", "", ns) or "")).strip()
        authors = [a.findtext("a:name", "", ns) for a in e.findall("a:author", ns)]
        print(f"title:     {g('title')}\ndate:      {g('published')[:10]}   (arXiv v1)\nauthors:   {', '.join(authors[:10])}{' et al. (%d)' % len(authors) if len(authors) > 10 else ''}\nlink:      {g('id')}\nabstract:  {g('summary')[:1500]}\n")


def title(q):
    throttle(0.35, Path("/tmp/openalex-throttle.lock"))
    try:
        return _title_openalex(q)
    except urllib.error.HTTPError as e:
        if e.code in (429, 403, 503):
            print(f"（OpenAlex 返回 {e.code}，改用 arXiv 标题检索）")
            return arxiv_title(q)
        raise


def _title_openalex(q):
    sel = "title,publication_date,authorships,primary_location,ids,cited_by_count,type,abstract_inverted_index"
    data = json.loads(fetch("https://api.openalex.org/works?per-page=4&select=" + sel + "&search=" + urllib.parse.quote(q)))
    if not data.get("results"):
        print("OpenAlex 没有结果，可改用: lookup.py search \"...\"")
    for w in data.get("results", []):
        au = [a["author"]["display_name"] for a in w.get("authorships", [])]
        src = ((w.get("primary_location") or {}).get("source") or {}).get("display_name", "")
        land = (w.get("primary_location") or {}).get("landing_page_url", "")
        print(f"title:     {w.get('title')}")
        print(f"date:      {w.get('publication_date')}   venue: {src}   cited_by: {w.get('cited_by_count')}")
        print(f"authors:   {', '.join(au[:10])}{' et al. (%d)' % len(au) if len(au) > 10 else ''}")
        print(f"link:      {land or w.get('ids', {}).get('doi', '')}")
        inv = w.get("abstract_inverted_index") or {}
        if inv:
            words = sorted((i, tok) for tok, idx in inv.items() for i in idx)
            print(f"abstract:  {' '.join(t for _, t in words)[:1500]}")
        print()
    print("注意：OpenAlex 的 date 可能是正式发表日期而非 arXiv 首发日期；arXiv 论文请再用 `lookup.py arxiv <id>` 确认。")


def wiki(q, lang="en"):
    base = f"https://{lang}.wikipedia.org"
    s = json.loads(fetch(f"{base}/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=" + urllib.parse.quote(q)))
    hits = s.get("query", {}).get("search", [])
    if not hits:
        print("没有找到条目")
        return
    for h in hits[:2]:
        t = h["title"]
        ex = json.loads(fetch(f"{base}/w/api.php?action=query&prop=extracts&explaintext=1&exchars=2800&format=json&redirects=1&titles=" + urllib.parse.quote(t)))
        page = next(iter(ex["query"]["pages"].values()))
        print(f"== {t} ==   {base}/wiki/{urllib.parse.quote(t.replace(' ', '_'))}")
        print(page.get("extract", "").strip())
        print()


def strip_html(page):
    page = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)\b.*?</\1>", " ", page)
    page = re.sub(r"(?s)<[^>]+>", " ", page)
    return re.sub(r"\s+", " ", html.unescape(page)).strip()


def url(u):
    if "arxiv.org/abs/" in u or "arxiv.org/pdf/" in u:
        return arxiv([u])
    page = fetch(u, headers={"Accept": "text/html,*/*"})
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", page)
    print("title:", html.unescape(m.group(1)).strip() if m else "(无)")
    for prop in ("article:published_time", "og:description", "citation_publication_date", "citation_date", "datePublished"):
        mm = re.search(r'(?is)<meta[^>]+(?:property|name|itemprop)=["\']%s["\'][^>]+content=["\'](.*?)["\']' % re.escape(prop), page)
        if mm:
            print(f"{prop}: {html.unescape(mm.group(1))[:300]}")
    mm = re.search(r'"datePublished"\s*:\s*"([^"]+)"', page)
    if mm:
        print("datePublished(json-ld):", mm.group(1))
    print("text:", strip_html(page)[:4000])


BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def search(q):
    """Brave 搜索结果页（跨进程限速约2.5秒一次）。"""
    global LOCK
    LOCK = Path("/tmp/brave-throttle.lock")
    throttle(2.5)
    page = fetch("https://search.brave.com/search?q=" + urllib.parse.quote(q), headers={"User-Agent": BROWSER_UA, "Accept": "text/html"})
    n = 0
    for chunk in re.split(r'data-type="web"', page)[1:]:
        m = re.search(r'<a[^>]+href="(https?://[^"]+)"', chunk)
        if not m:
            continue
        t = re.search(r'(?is)class="title[^"]*"[^>]*>(.*?)</div>', chunk)
        d = re.search(r'(?is)class="[^"]*(?:snippet-description|snippet-content|description)[^"]*"[^>]*>(.*?)</div>', chunk)
        print(f"- {strip_html(t.group(1)) if t else '(无标题)'}\n  {html.unescape(m.group(1))}\n  {strip_html(d.group(1))[:260] if d else ''}")
        n += 1
        if n >= 10:
            break
    if not n:
        print("没有结果（可能被限流，等10秒重试；或改用 title / wiki / url）")


def news(q):
    """Google News RSS：近期事件的标题、媒体、发布日期（核对2025–2026年的事件很有用）。"""
    xml = fetch("https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=" + urllib.parse.quote(q), headers={"User-Agent": BROWSER_UA})
    items = ET.fromstring(xml).findall(".//item")
    if not items:
        print("没有结果")
    for it in items[:12]:
        print(f"- {it.findtext('title', '')}\n  {it.findtext('pubDate', '')[:16]}  {it.findtext('source', '')}\n  {it.findtext('link', '')}")


def hn(q):
    """Hacker News（Algolia）：按相关度返回帖子标题、日期、原文链接，适合找发布公告的原始URL和日期。"""
    data = json.loads(fetch("https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=10&query=" + urllib.parse.quote(q)))
    if not data.get("hits"):
        print("没有结果")
    for h in data.get("hits", []):
        print(f"- {h.get('title')}\n  {(h.get('created_at') or '')[:10]}  points={h.get('points')}\n  {h.get('url') or 'https://news.ycombinator.com/item?id=' + str(h.get('objectID'))}")


def s2(q):
    """Semantic Scholar：按标题/关键词找论文，返回日期、作者、被引数、arXiv id、TLDR。"""
    data = json.loads(fetch("https://api.semanticscholar.org/graph/v1/paper/search?limit=6&fields=title,year,publicationDate,authors,citationCount,externalIds,tldr,venue&query=" + urllib.parse.quote(q)))
    if not data.get("data"):
        print("没有结果")
    for w in data.get("data", []):
        au = [a["name"] for a in w.get("authors", [])]
        ext = w.get("externalIds") or {}
        print(f"- {w.get('title')}\n  {w.get('publicationDate') or w.get('year')}  {w.get('venue', '')}  cited_by={w.get('citationCount')}  arXiv={ext.get('ArXiv', '-')}  DOI={ext.get('DOI', '-')}\n  {', '.join(au[:8])}{' et al.' if len(au) > 8 else ''}\n  TLDR: {((w.get('tldr') or {}).get('text') or '')[:300]}")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd, args = sys.argv[1], sys.argv[2:]
    try:
        if cmd == "arxiv":
            arxiv(args)
        elif cmd == "title":
            title(" ".join(args))
        elif cmd == "wiki":
            wiki(args[0], args[1] if len(args) > 1 else "en")
        elif cmd == "url":
            url(args[0])
        elif cmd == "search":
            search(" ".join(args))
        elif cmd == "news":
            news(" ".join(args))
        elif cmd == "hn":
            hn(" ".join(args))
        elif cmd == "s2":
            s2(" ".join(args))
        else:
            print(__doc__)
            sys.exit(1)
    except Exception as e:
        print(f"查询失败：{type(e).__name__}: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
