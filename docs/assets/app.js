/* AI脉络 · 单页应用（无依赖）。数据由 scripts/build.py 生成到 docs/data/，搜索在 search.js。
   首屏只取 core.json（节点名、边、分支结构）；摘要、讲解正文、搜索用的别名、概念正文都按需再取。 */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const app = $('#app');
const SITE = 'https://moyunxiang.com/ai_study/', REPO = 'https://github.com/moyunxiang/ai_study';
const KIND = {paper: '论文', model: '模型', system: '系统', hardware: '硬件', dataset: '数据集', event: '事件', concept: '思想'};
const REL = {solves: '改进', extends: '延续', uses: '使用', rivals: '竞争'};
const REL_HELP = {solves: '后来的工作针对前面工作的某个问题做了改进，不代表问题已经解决', extends: '沿着同一个思路往前推了一步', uses: '把前面的工作当作部件来用', rivals: '同一个问题的不同路线，不代表谁取代了谁'};
const AREA = {idea: '研究思路', math: '数学预备', prob: '概率统计与信息论', opt: '优化与训练', ml: '机器学习基础', nn: '神经网络组件', seq: '序列与语言模型',
  gen: '生成模型', rl: '强化学习', vis: '视觉', aud: '语音', emb: '具身与控制', sys: '系统与硬件', eval: '评测与实验方法'};
const LEVEL = ['预备', '入门', '进阶'], TIER = ['', '主干', '重要', '延伸'], REV = ['待核对', '来源已核对', '人工复核'];
const NARROW = () => innerWidth < 700;

let G, core, byId = {}, trackBy = {}, out = {}, inn = {}, concepts = {}, order = {}, posIn = {};
let thBy = {}, yearCount = {}, yearPeak = 1, storyBy = {};

/* ——— 本地存储（进度、设置）：读写都可能失败，失败时静默退化 ——— */
const store = {
  get(k, d) { try { const v = localStorage.getItem('aimap.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aimap.' + k, JSON.stringify(v)); } catch {} },
};
let progress = store.get('progress', {}), notes = store.get('notes', {}), marks = store.get('marks', {});
function exportAll() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({progress, notes, marks})], {type: 'application/json'}));
  a.download = 'ai-study-progress.json'; a.click(); URL.revokeObjectURL(a.href);
}
async function importAll(file, then) {
  try {
    const o = JSON.parse(await file.text());
    if (!o || typeof o !== 'object') throw 0;
    if (o.progress) { progress = o.progress; notes = o.notes || {}; marks = o.marks || {}; } else progress = o;   // 兼容只含进度的旧文件
    store.set('progress', progress); store.set('notes', notes); store.set('marks', marks); then && then(true);
  } catch { then && then(false); }
}
const status = id => progress[id] || 0;
function cycleStatus(id) {
  const v = (status(id) + 1) % 3;
  if (v) progress[id] = v; else delete progress[id];
  store.set('progress', progress);
  return v;
}

/* ——— 数据 ——— */
const cache = {};
function load(p) {
  return cache[p] ||= fetch(`data/${p}${window.AIMAP_V ? '?v=' + window.AIMAP_V : ''}`).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); })
    .catch(e => { delete cache[p]; throw e; });
}
async function boot() {
  core = await load('core.json');
  G = {tracks: core.tracks, eras: core.eras, groups: core.groups || [], forks: core.forks || {}, threads: core.threads || {}, nodes: [], edges: [], stories: core.stories || [], routes: core.routes || {}, figs: core.figs || []};
  G.tracks.forEach((t, i) => { trackBy[t.key] = t; t.i = i; order[t.key] = []; });
  for (const a of core.N) {
    const n = {id: a[0], date: a[1], tier: a[2], kind: core.kinds[a[3]], title: a[4], track: G.tracks[a[5]].key, th: a[6], rev: a[7], has: true};
    n.y = +n.date.slice(0, 4); n.m = +(n.date.slice(5, 7) || 0);
    byId[n.id] = n; out[n.id] = []; inn[n.id] = []; posIn[n.id] = order[n.track].length; order[n.track].push(n.id); G.nodes.push(n);
  }
  for (const a of core.E) { const e = {from: G.nodes[a[0]].id, to: G.nodes[a[1]].id, type: core.rels[a[2]], f: a[3]}; G.edges.push(e); out[e.from].push(e); inn[e.to].push(e); }
  G.joins = (core.joins || []).filter(j => byId[j.from] && byId[j.to]);
  G.groups.forEach(g => g.tracks.forEach(k => { if (trackBy[k]) trackBy[k].g = g; }));
  G.tracks.forEach(t => { thBy[t.key] = {}; yearCount[t.key] = {}; (G.threads[t.key] ||= []).forEach(th => { th.ids = []; thBy[t.key][th.key] = th; }); });
  G.nodes.forEach(n => { const th = thBy[n.track][n.th]; if (th) th.ids.push(n.id); const c = yearCount[n.track], y = Math.max(1942, n.y); c[y] = (c[y] || 0) + 1; yearPeak = Math.max(yearPeak, c[y]); });
  for (const c of core.C) concepts[c[0]] = {key: c[0], name: c[1], en: c[2], area: c[3], level: c[4], track: c[5], n: c[6], origin: c[7], needs: c[8], fig: c[9], has: true};
  G.stories.forEach(s => storyBy[s.key] = s);
  window.addEventListener('hashchange', route);
  initSearch(); initChrome();
  route();
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => ensureSearch().catch(() => {}));      // 空闲时预取搜索用的别名
}
/* 列表里显示的摘要（英文原题、作者、问题/方法/影响三句）：主干和重要节点在一个文件里，延伸节点按分支分文件 */
const briefP = {};
function applyBrief(o) { for (const id in o) { const n = byId[id]; if (n && !n.b) { n.b = 1; [n.full, n.who, n.problem, n.idea, n.impact] = o[id]; } } }
function needBrief(list) {
  const jobs = [];
  if (list.some(n => n.tier <= 2 && !n.b)) jobs.push(briefP.a ||= load('brief12.json').then(applyBrief));
  for (const k of new Set(list.filter(n => n.tier === 3 && !n.b).map(n => n.track))) jobs.push(briefP[k] ||= load(`brief3/${k}.json`).then(applyBrief));
  return Promise.all(jobs);
}
const chunkOf = n => `content/${n.track}-${Math.floor(posIn[n.id] / core.chunk)}.json`;
async function nodeContent(id) {
  const n = byId[id], o = await load(chunkOf(n));
  for (const k in o) { const x = byId[k]; if (x && !x.b) { x.b = 1; x.full = o[k].full; x.who = o[k].who; x.problem = o[k].problem; x.idea = o[k].idea; x.impact = o[k].impact; } }
  return o[id] || {};
}
async function conceptBody(key) {
  const c = concepts[key];
  if (c && !c.loaded) { const o = await load(`cbody/${c.area === 'idea' ? 'idea-' + c.track : c.area}.json`); for (const k in o) if (concepts[k]) Object.assign(concepts[k], o[k], {loaded: true}); }
  return c;
}
let S = null, searchP = null;
function ensureSearch() {
  return searchP ||= load('search.json').then(sd => {
    S = AIMapSearch.create(core, sd);
    G.nodes.forEach((n, i) => { if (!n.b) { n.full = sd.full[i]; n.who = sd.who[i]; } n.aka = sd.aka[i]; });
    return S;
  }).catch(e => { searchP = null; S ||= AIMapSearch.create(core, null); throw e; });
}
const eraOf = n => G.eras.find(e => n.y <= e.to) || G.eras[G.eras.length - 1];
const hs = (t, extra = '') => `style="--h:${trackBy[t].hue}${trackBy[t].sat != null ? `;--s:${trackBy[t].sat / 48}` : ''}${extra ? ';' + extra : ''}"`;
const hue = t => hs(t);
const fmtDate = d => d.length === 7 ? `${d.slice(0, 4)}.${d.slice(5)}` : d;
const enc = encodeURIComponent;

/* ——— 正文标记：空行分段、- 列表、**粗体**、`代码`、[[节点]]、[[c:概念]] ——— */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, ref, txt) => {
      ref = ref.trim();
      if (ref.startsWith('c:')) {
        const c = concepts[ref.slice(2)];
        return c ? `<a class="lc" href="#/c/${c.key}" title="概念：${esc(c.en || c.name)}">${txt || esc(c.name)}</a>` : `<span class="dead">${txt || esc(ref)}</span>`;
      }
      const n = byId[ref];
      return n ? `<a class="ln hue" ${hue(n.track)} href="#/n/${n.id}" title="${n.date}">${txt || esc(n.title)}</a>` : `<span class="dead">${txt || esc(ref)}</span>`;
    });
}
function rich(text) {
  if (!text) return '';
  let html = '', list = [];
  const flush = () => { if (list.length) { html += '<ul>' + list.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'; list = []; } };
  for (const block of String(text).split(/\n{2,}/)) {
    const para = [];
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*[-•]\s+(.*)$/);
      if (m) { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para.length = 0; } list.push(m[1]); }
      else { flush(); para.push(line.trim()); }
    }
    flush();
    if (para.length) {
      const t = para.join('\n').trim();
      html += /^`[^`]+`$/.test(t) ? `<p class="formula">${inline(t)}</p>` : `<p>${inline(para.join(' '))}</p>`;
    }
  }
  return html;
}

/* ——— 通用片段 ——— */
const chip = id => { const n = byId[id]; return n ? `<a class="chip hue" ${hue(n.track)} href="#/n/${id}" title="${n.date} · ${esc(trackBy[n.track].short)}">${esc(n.title)}</a>` : ''; };
const cchip = k => { const c = concepts[k]; return c ? `<a class="chip c" href="#/c/${k}">${esc(c.name)}</a>` : ''; };
const ST = ['未读', '在读', '已读'];
const stBtn = (id, label) => `<button class="st s${status(id)}" data-st="${esc(id)}" aria-label="学习状态：${ST[status(id)]}。点击切换" title="学习状态：点一下切换 未读 → 在读 → 已读">${label ? `<span>${ST[status(id)]}</span>` : ''}</button>`;
const revBadge = n => `<span class="rvb r${n.rev}" title="${['讲解由AI撰写，尚未对照原始来源独立核对', '已由AI对照原始来源逐项核对，未经人工复核', '经真人复核'][n.rev]}">${REV[n.rev]}</span>`;
function row(n, opt = {}) {
  return `<li class="row t${n.tier} hue" ${hue(n.track)}>
    <div class="d">${fmtDate(n.date)}${opt.track ? `<br>${esc(trackBy[n.track].short)}` : ''}</div>
    <div class="b"><a class="t" href="#/n/${n.id}">${esc(n.title)}</a>${n.rev ? revBadge(n) : ''}
      ${n.full || n.who ? `<div class="f">${esc(n.full || '')}${n.who ? `${n.full ? ' · ' : ''}${esc(n.who.split('·')[0].trim())}` : ''}</div>` : ''}
      ${n.problem ? `<div class="p"><b>问题</b> ${inline(n.problem)}${opt.full && n.idea ? `<br><b>方法</b> ${inline(n.idea)}` : ''}</div>` : ''}${opt.extra || ''}</div>
    ${stBtn(n.id)}</li>`;
}
const foot = () => `<footer class="foot"><span>© ${new Date().getFullYear()} Yunxiang (Kevin) Mo</span><span>讲解由AI模型撰写，标注“来源已核对”的以外未逐条核对，引用前请以原文为准 · <a href="about.html">关于内容与纠错</a></span></footer>`;
const tierBar = (cur, base) => `<span class="seg" role="group" aria-label="显示哪些节点">${[[1, '主干', '缺了后面就讲不通的'], [2, '主干+重要', '再加上这个方向的人都知道的'], [3, '全部', '再加上用到再查的']].map(([v, l, tip]) => `<a class="btn sm ${cur === v ? 'on' : ''}" href="${base}${base.includes('?') ? '&' : '?'}tier=${v}" title="${tip}" ${cur === v ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</span>`;
function doneStat(ids) { const d = ids.filter(i => status(i) === 2).length; return {d, n: ids.length, pct: ids.length ? Math.round(d / ids.length * 100) : 0}; }
const loading = (what = '') => `<div class="page"><p class="loading" role="status">正在载入${what}…</p></div>`;
const failed = e => `<div class="page"><div class="empty" role="alert">这部分数据没有载入成功（${esc(e && e.message || e)}）。<br>检查一下网络，然后<button class="btn sm" onclick="location.reload()">重试</button></div></div>`;
const miss = (what, id) => `<div class="page narrow"><div class="empty">没有找到这个${what}：${esc(id)}。<br>可能是链接写错了，或者它已经被改名。<a class="btn sm" href="#/search?q=${enc(id)}">搜一下</a> <a class="btn sm" href="#/">回首页</a></div></div>`;
const figHTML = (f, svg) => `<figure class="fig">${svg || ''}<figcaption><b>${esc(f.title)}</b>　${inline(f.caption)}</figcaption></figure>`;
async function figsHTML(keys, cap = 2) {
  const fs = (keys || []).map(k => G.figs.find(f => f.key === k)).filter(Boolean);
  if (!fs.length) return '';
  const svgs = await load('figs.json').catch(() => ({}));
  const one = f => figHTML(f, svgs[f.key]);
  return fs.slice(0, cap).map(one).join('') + (fs.length > cap ? `<details class="fold in"><summary><b>另外${fs.length - cap}张相关的机制图</b></summary>${fs.slice(cap).map(one).join('')}</details>` : '');
}

/* ——— 路由 ——— */
let rt = 0;
const ALIAS = {path: 'learn', guide: 'learn', eras: 'timeline', concepts: 'index', chain: 'from', open: 'home', quiz: 'me'};
const NAVKEY = {home: '', learn: 'learn', story: 'learn', from: 'learn', timeline: 'timeline', era: 'timeline', year: 'timeline', map: 'map', tracks: 'map', track: 'map', index: 'index', c: 'index', search: 'search'};
async function route() {
  const my = ++rt, ok = () => my === rt;
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const seg = path.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  let view = seg[0] || 'home';
  view = ALIAS[view] || view;
  const views = {home, learn: viewLearn, story: viewStory, from: viewFrom, timeline: viewTimeline, era: viewEra, year: viewYear, map: viewMap, tracks: viewTracks, track: viewTrack,
    n: viewNode, index: viewIndex, c: viewConcept, search: viewSearch, me: viewMe, tools: viewTools, link: viewLink, stats: viewStats, orgs: viewOrgs};
  if (!views[view]) view = 'home';
  document.querySelectorAll('[data-k]').forEach(a => { const on = a.dataset.k === (NAVKEY[view] ?? '-'); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.body.classList.toggle('is-map', view === 'map' && !(q.view === 'list' || (q.view !== 'tree' && NARROW() && !q.focus && !q.at && !q.q && !q.c)));
  closeMenus();
  navKeys = {};
  try { await views[view](seg[1], q, seg[2], ok); }
  catch (e) { if (ok()) { console.error(e); app.innerHTML = failed(e); } }
  if (ok() && view !== 'map' && !q.keep) window.scrollTo(0, 0);
  if (ok()) app.focus({preventScroll: true});
}
app.addEventListener('click', e => {
  const b = e.target.closest('[data-st]'), mk = e.target.closest('[data-mark]'), jump = e.target.closest('[data-jump]'), cp = e.target.closest('[data-copy]');
  if (mk) { e.preventDefault(); const id = mk.dataset.mark; if (marks[id]) delete marks[id]; else marks[id] = 1; store.set('marks', marks); mk.classList.toggle('on', !!marks[id]); mk.textContent = marks[id] ? '★ 已收藏' : '☆ 收藏'; mk.setAttribute('aria-pressed', !!marks[id]); return; }
  if (b) {
    e.preventDefault(); const v = cycleStatus(b.dataset.st);
    document.querySelectorAll(`[data-st="${CSS.escape(b.dataset.st)}"]`).forEach(x => { x.className = 'st s' + v; x.setAttribute('aria-label', `学习状态：${ST[v]}。点击切换`); if (x.firstElementChild) x.firstElementChild.textContent = ST[v]; });
    document.querySelectorAll(`.nd[data-id="${CSS.escape(b.dataset.st)}"]`).forEach(x => x.classList.toggle('done', v === 2));
    return;
  }
  if (jump) { e.preventDefault(); const el = document.getElementById(jump.dataset.jump); if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return; }
  if (cp) { e.preventDefault(); const done = () => { const t = cp.textContent; cp.textContent = '已复制'; setTimeout(() => cp.textContent = t, 1400); }; (navigator.clipboard ? navigator.clipboard.writeText(cp.dataset.copy) : Promise.reject()).then(done, () => prompt('复制这个链接', cp.dataset.copy)); }
});

/* ——— 顶栏：更多菜单、主题、手机上的搜索入口 ——— */
function closeMenus() { const m = $('#menu'); if (m && !m.hidden) { m.hidden = true; $('#moreb').setAttribute('aria-expanded', 'false'); } }
function initChrome() {
  const mb = $('#moreb'), menu = $('#menu');
  mb.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; mb.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', e => { if (!e.target.closest('#more')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  const themeBtn = $('#theme');
  const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; themeBtn.textContent = '外观：' + ({light: '浅色', dark: '深色'}[t] || '跟随系统'); };
  applyTheme(store.get('theme', ''));
  themeBtn.onclick = e => { e.stopPropagation(); const t = {'': 'light', light: 'dark', dark: ''}[store.get('theme', '')]; store.set('theme', t); applyTheme(t); };
}

/* ——— 首页 ——— */
function home() {
  const t1 = G.nodes.filter(n => n.tier === 1), last = byId[store.get('last')];
  const intro = (G.routes.intro || {}).steps || [], goals = (G.routes.goals || []).filter(g => storyBy[g.story]);
  const ps = doneStat(intro.map(s => s.node));
  app.innerHTML = `<div class="page">
    <div class="mast home">
      <div class="eyebrow">1943 — ${G.eras[G.eras.length - 1].to} · AI研究发展地图</div>
      <h1>AI脉络</h1>
      <p class="lead">一张可以一层层点开的地图：每个阶段研究者在解决什么问题，重要的方法为什么出现、怎么工作，又引出了哪些后来的工作。写给会编程、学过大一数学、但不一定读过论文的人。</p>
    </div>
    <div class="entries">
      <a class="entry" href="#/learn"><span class="no">1</span><h2>从头了解AI的发展</h2><p>${intro.length}站入门路线，从1958年的感知机读到今天的推理模型。每一站先看三句话：问题、方法、影响。</p><span class="go">开始读 →</span></a>
      <a class="entry" href="#/map"><span class="no">2</span><h2>探索研究方向</h2><p>${G.groups.length}个大方向、${G.tracks.length}条分支画成一棵按时间生长的树，看它们在哪里分叉、在哪里汇合。</p><span class="go">打开领域地图 →</span></a>
      <form class="entry" id="hs" role="search"><span class="no">3</span><h2>搜索一个概念或研究</h2><p>论文、模型、算法、缩写都可以。找到之后可以读讲解，也可以要一条从零读到它的路线。</p>
        <span class="hsrow"><input class="inp" id="hq" type="search" placeholder="例如 Transformer、扩散模型、GRPO" aria-label="搜索" autocomplete="off"><button class="btn fill">搜索</button></span></form>
    </div>
    ${last ? `<p class="resume">上次读到：<a class="chip hue" ${hue(last.track)} href="#/n/${enc(last.id)}">${esc(last.title)}</a></p>` : ''}
    <section class="sec"><div class="sec-h"><h2>先看一眼：${intro.length}站走完八十年</h2><span class="muted">${ps.d ? `已读 ${ps.d} / ${ps.n} · ` : ''}<a class="u" href="#/learn">完整的入门路线 →</a></span></div>
      <ol class="strip">${intro.map(s => { const n = byId[s.node]; return n ? `<li class="hue" ${hue(n.track)}><a href="#/n/${enc(n.id)}"><span class="y">${n.y}</span><b>${esc(n.title)}</b><span class="tp">${esc(s.topic || '')}</span></a></li>` : ''; }).join('')}</ol></section>
    ${goals.length ? `<section class="sec"><div class="sec-h"><h2>带着一个问题读</h2><span class="muted">每个问题对应一篇专题，按时间把相关的工作串起来</span></div>
      <div class="qgrid">${goals.slice(0, 6).map(g => `<a href="#/story/${g.story}"><b>${esc(g.q)}</b><span>${storyBy[g.story].nodes.length}站 · 从${byId[storyBy[g.story].nodes[0]].y}年到${byId[storyBy[g.story].nodes.at(-1)].y}年</span></a>`).join('')}</div>
      ${goals.length > 6 ? `<div class="toolbar"><a class="btn sm" href="#/learn">全部${goals.length}个专题 →</a></div>` : ''}</section>` : ''}
    <section class="sec"><div class="sec-h"><h2>整张地图</h2><span class="muted">每条线是一条分支，起伏是每年的工作量，圆点是主干节点</span></div>
      <a class="treecard" href="#/map" id="minibox" aria-label="打开领域地图"></a>
      <div class="glist">${GROUP_ORDER.map(k => G.groups.find(g => g.key === k)).filter(Boolean).map(g => `<div><span class="role">${esc(g.role)}</span><b>${esc(g.name)}</b>${g.tracks.map(t => `<a class="chip hue" ${hue(t)} href="#/track/${t}">${esc(trackBy[t].short)}</a>`).join('')}</div>`).join('')}</div></section>
    <section class="sec"><div class="sec-h"><h2>九个时代</h2><span class="muted"><a class="u" href="#/timeline">打开时间线 →</a></span></div>
      <ol class="eras">${G.eras.map(e => `<li><a href="#/era/${e.id}"><span class="y">${e.from}–${String(e.to).slice(2)}</span><b>${esc(e.name)}</b><span class="tg">${esc(e.tagline)}</span></a></li>`).join('')}</ol></section>
    <p class="trust">讲解由AI模型撰写。其中${core.review.source + core.review.human}个节点另外对照原始来源核对过（${t1.length}个主干节点里的${core.review.t1}个），页面上有标注；其余${G.nodes.length - core.review.source - core.review.human}个尚未核对，可能有错。<a class="u" href="about.html">这些内容能信到什么程度</a></p>
    ${foot()}</div>`;
  document.title = 'AI脉络 · 一张可探索的AI研究发展地图';
  const mb = $('#minibox');
  mb.innerHTML = miniTree(mb.clientWidth - 34, NARROW() ? 13 : 17);
  $('#hs').onsubmit = ev => { ev.preventDefault(); const v = $('#hq').value.trim(); if (v) location.hash = `#/search?q=${enc(v)}`; else $('#hq').focus(); };
  suggest($('#hq'));
}

/* ——— 开始学习：入门路线、专题、完整主干 ——— */
const GROUP_ORDER = ['core', 'lang', 'percept', 'act', 'soil', 'society'];
async function viewLearn(_, q, __, ok) {
  const t1 = G.nodes.filter(n => n.tier === 1), intro = G.routes.intro || {steps: []}, steps = intro.steps.filter(s => byId[s.node]);
  await needBrief(t1); if (!ok()) return;
  const ps = doneStat(steps.map(s => s.node)), pt = doneStat(t1.map(n => n.id));
  const lv0 = Object.values(concepts).filter(c => c.level === 0 && c.area !== 'idea');
  const goals = (G.routes.goals || []).filter(g => storyBy[g.story]);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">开始学习</div><h1>从哪里读起</h1>
    <p class="lead">三种读法，选一种。<b>第一次来</b>，跟着入门路线按时间走一遍；<b>心里有个具体问题</b>，读对应的专题；<b>想系统地学</b>，读完整的主干路线。想学某一样具体的东西，在下面搜它，会给你一条从零读到它的路线。</p>
    <form class="toolbar" id="lf" role="search"><input class="inp" id="lq" type="search" placeholder="想学什么？输入论文、模型或概念的名字" aria-label="想学什么" autocomplete="off" style="max-width:420px"><button class="btn sm fill">给我一条从零读到它的路线</button></form>
    <div id="lhit" class="hits" aria-live="polite"></div></div>
    <nav class="jump" aria-label="本页内容"><a href="#" data-jump="intro">入门路线</a><a href="#" data-jump="stories">专题</a><a href="#" data-jump="trunk">完整主干</a><a href="#" data-jump="prep">预备概念</a></nav>
    <section class="sec" id="intro"><div class="sec-h"><h2>${esc(intro.title || '入门路线')}</h2><span class="muted">已读 ${ps.d} / ${ps.n}</span></div>
      <p class="lead s">${esc(intro.blurb || '')}</p>
      <div class="bar" style="max-width:520px"><i style="width:${ps.pct}%"></i></div>
      <ol class="story">${steps.map(s => { const n = byId[s.node]; return `<li class="hue" ${hue(n.track)}><div class="when">${n.y}</div><div class="what"><h3><a href="#/n/${enc(n.id)}">${esc(n.title)}</a></h3><div class="who">${esc(s.topic || '')} · ${esc(trackBy[n.track].short)}</div><p>${esc(s.why)}</p></div>${stBtn(n.id)}</li>`; }).join('')}</ol></section>
    ${goals.length ? `<section class="sec" id="stories"><div class="sec-h"><h2>带着一个问题读：研究专题</h2><span class="muted">${goals.length}篇</span></div>
      <p class="lead s">每篇专题围绕一个问题，按时间把已有的节点串成一条线：上一个工作留下了什么问题，下一个工作怎么回应。专题是事后整理的叙事，每篇末尾写了它简化了什么。</p>
      <div class="qgrid">${goals.map(g => { const s = storyBy[g.story]; return `<a href="#/story/${g.story}"><b>${esc(g.q)}</b><span>${esc(s.title)} · ${s.nodes.length}站</span></a>`; }).join('')}</div></section>` : '<span id="stories"></span>'}
    <section class="sec" id="trunk"><div class="sec-h"><h2>完整主干路线</h2><span class="muted">${t1.length}个节点 · 已读 ${pt.d}</span></div>
      <p class="lead s">主干是“缺了它后面就讲不通”的工作，按时间排好，分成九个时代。每个时代读之前可以先看那个时代的页面：当时有什么条件、大家在攻克什么。</p>
      ${G.eras.map((e, i) => { const trunk = t1.filter(n => eraOf(n) === e), d = trunk.filter(n => status(n.id) === 2).length; return trunk.length ? `<details class="fold" ${(q.era ? q.era === e.id : i === 0) ? 'open' : ''}><summary><b>${e.from}–${e.to}　${esc(e.name)}</b><span>${trunk.length}个${d ? ` · 已读${d}` : ''}</span></summary>
        <p class="muted" style="margin:8px 0 0">${esc(e.read)} <a class="u" href="#/era/${e.id}">这个时代的全貌 →</a></p><ul class="rows">${trunk.map(n => row(n, {track: true, full: true})).join('')}</ul></details>` : ''; }).join('')}</section>
    <section class="sec" id="prep"><div class="sec-h"><h2>预备概念</h2><span class="muted">${lv0.length}个</span></div>
      <p class="lead s">进入AI之前就该会的东西：向量、求导、概率。扫一遍，不熟的点进去看。之后每篇讲解会列出它需要的概念，读到哪补到哪。</p>
      <div class="cgrid">${lv0.map(c => `<a href="#/c/${c.key}"><span class="lv">${status('c:' + c.key) === 2 ? '✓' : '0'}</span><span>${esc(c.name)}<small>${AREA[c.area]}</small></span></a>`).join('')}</div></section>
    ${foot()}</div>`;
  document.title = '开始学习 · AI脉络';
  const lq = $('#lq'), hit = $('#lhit');
  suggest(lq, {href: fromHref, keep: x => x.k === 'n' || x.k === 'c', via: false, more: '查看全部搜索结果'});
  $('#lf').onsubmit = async ev => {
    ev.preventDefault(); const v = lq.value.trim(); if (!v) return lq.focus();
    hit.innerHTML = '<span class="muted">正在找…</span>';
    const s = await ensureSearch().catch(() => S), res = s.search(v, 12).filter(x => x.k === 'n' || x.k === 'c').slice(0, 6);
    hit.innerHTML = res.length ? `<span class="muted">选一个：</span>${res.map(x => `<a class="btn sm" href="${fromHref(x)}">${esc(x.t)}<small>${x.k === 'n' ? x.date.slice(0, 4) : x.area === 'idea' ? '思路' : '概念'}</small></a>`).join('')}<a class="btn sm" href="#/search?q=${enc(v)}">看全部结果</a>`
      : `<span class="muted">没有找到“${esc(v)}”。换个叫法、英文名或缩写试试，或者<a class="u" href="#/search?q=${enc(v)}">到搜索页看建议</a>。</span>`;
  };
  if (q.to) setTimeout(() => { const el = document.getElementById(q.to); if (el) el.scrollIntoView(); }, 0);
}
const fromHref = it => it.k === 'c' ? `#/from/c/${it.id}` : `#/from/${enc(it.id)}`;

/* ——— 研究专题 ——— */
async function viewStory(key, q, _, ok) {
  const idx = storyBy[key];
  if (!idx) { app.innerHTML = miss('专题', key); return; }
  app.innerHTML = loading('专题');
  const s = (await load('stories.json'))[key], ns = s.steps.map(st => byId[st.node]).filter(Boolean);
  const figs = await figsHTML(s.figs); if (!ok()) return;
  const ps = doneStat(ns.map(n => n.id)), next = (s.next || []).map(k => storyBy[k]).filter(Boolean);
  app.innerHTML = `<div class="page"><div class="narrow" style="margin:0 auto">
    <div class="article-head"><div class="eyebrow"><a href="#/learn">开始学习</a> › 研究专题 · ${s.steps.length}站 · ${ns[0].y}–${ns.at(-1).y}</div>
      <h1>${esc(s.title)}</h1><p class="lead">${esc(s.question)}</p>
      <div class="acts"><span class="muted" style="font-size:13px">已读 ${ps.d} / ${ps.n}</span><a class="btn sm" href="#/map?q=${enc(key)}&ids=${ns.map(n => enc(n.id)).join(',')}">在演化树上看这几站</a><button class="btn sm" data-copy="${SITE}s/${enc(key)}.html">复制分享链接</button></div></div>
    <div class="prose">${rich(s.intro)}</div>
    <ol class="story">${s.steps.map(st => { const n = byId[st.node]; return `<li class="hue" ${hue(n.track)}><div class="when">${n.y}</div><div class="what"><h3>${esc(st.h)}</h3>
      <div class="who"><a class="u" href="#/n/${enc(n.id)}">${esc(n.title)}</a> · ${esc(trackBy[n.track].short)} ${revBadge(n)}</div>${rich(st.text)}<a class="more" href="#/n/${enc(n.id)}">读这一站的完整讲解 →</a></div>${stBtn(n.id)}</li>`; }).join('')}</ol>
    <div class="prose">${figs}<h2>现在走到哪了</h2>${rich(s.takeaway)}
      <div class="note caveat"><h4>这条线简化了什么</h4>${rich(s.caveats)}</div>
      ${next.length ? `<h2>接着读</h2><div class="qgrid">${next.map(x => `<a href="#/story/${x.key}"><b>${esc(x.title)}</b><span>${esc(x.question)}</span></a>`).join('')}</div>` : ''}</div>
    </div>${foot()}</div>`;
  document.title = `${s.title} · AI脉络`;
}

/* ——— 从零读到某个节点 / 概念：一条主线 + 必要的旁支 ———
   主线：从目标往回，每一步挑“最该先读”的那个前驱（主干优先、延续和改进关系优先、同一分支优先），一直走到没有前驱为止。 */
function spine(id) {
  const path = [id], seen = new Set(path); let x = id;
  for (;;) {
    let best = null, bk = null;
    for (const e of inn[x]) {
      const p = byId[e.from];
      if (e.type === 'rivals' || seen.has(p.id) || p.date > byId[x].date) continue;
      const s = [0, 4, 2, .6][p.tier] + (e.type === 'uses' ? 1 : 2) + (p.track === byId[x].track ? 1 : 0) + (e.f & 1 ? .5 : 0) + (e.f & 2 ? .5 : 0);
      if (!best || s > bk || (s === bk && p.date > best.date)) { best = p; bk = s; }
    }
    if (!best) break;
    path.push(best.id); seen.add(best.id); x = best.id;
  }
  return path.reverse();
}
function sideOf(path, wide) {      // 旁支：目标直接建立其上、但不在主线上的主干和重要工作；完整版再加主线每一站的主干前驱
  const on = new Set(path), side = new Map();
  const add = (id, tierMax, cap) => inn[id].filter(e => e.type !== 'rivals' && !on.has(e.from) && byId[e.from].tier <= tierMax).sort((a, b) => byId[a.from].tier - byId[b.from].tier || (byId[a.from].date < byId[b.from].date ? 1 : -1)).slice(0, cap).forEach(e => { if (!side.has(e.from)) side.set(e.from, {id: e.from, for: id, e}); });
  add(path.at(-1), 2, 8);
  if (wide) for (const id of path.slice(0, -1)) add(id, 1, 3);
  return [...side.values()];
}
function needsClosure(keys) {      // 概念的前置概念，一直追到底。direct：直接需要的；deep：它们再往下需要的，按“预备 → 入门 → 进阶”排
  const seen = new Set(), walk = k => { const c = concepts[k]; if (!c || seen.has(k)) return; seen.add(k); (c.needs || []).forEach(walk); };
  keys.forEach(walk);
  const direct = keys.map(k => concepts[k]).filter(Boolean), ds = new Set(direct);
  return {direct, deep: [...seen].map(k => concepts[k]).filter(c => !ds.has(c)).sort((a, b) => a.level - b.level)};
}
async function viewFrom(a, q, b, ok) {
  const isC = a === 'c', key = isC ? b : a;
  let target, c = null, title, seedIds = [], pre = {direct: [], deep: []};
  if (isC) {
    c = concepts[key]; if (!c) { app.innerHTML = miss('概念', key); return; }
    app.innerHTML = loading('路线');
    await conceptBody(key); if (!ok()) return;
    title = c.name; pre = needsClosure(c.needs || []);
    if (byId[c.origin]) seedIds = [c.origin];
  } else {
    target = byId[key]; if (!target) { app.innerHTML = miss('节点', key); return; }
    app.innerHTML = loading('路线');
    const body = await nodeContent(key); if (!ok()) return;
    title = target.title; pre = needsClosure(body.prereq || []); seedIds = [key];
  }
  const wide = q.full === '1';
  const path = seedIds.length ? spine(seedIds[0]) : [], side = path.length ? sideOf(path, wide) : [];
  const members = isC ? (c.nodes || []).map(i => byId[i]).filter(Boolean).sort((x, y) => (c.area === 'idea' ? 0 : x.tier - y.tier) || (x.date < y.date ? -1 : 1)).filter(n => !path.includes(n.id)).slice(0, 12) : [];
  const all = [...path, ...side.map(s => s.id), ...members.map(n => n.id)].map(i => byId[i]);
  await needBrief(all); if (!ok()) return;
  const merged = wide ? [...new Set([...path, ...side.map(s => s.id)])].map(i => byId[i]).sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0) : path.map(i => byId[i]);
  const ps = doneStat(merged.map(n => n.id)), base = isC ? `#/from/c/${enc(key)}` : `#/from/${enc(key)}`;
  pre.deep = pre.deep.filter(x => x.key !== key);
  const cc = x => `<a class="chip c ${status('c:' + x.key) === 2 ? 'done' : ''}" href="#/c/${x.key}">${esc(x.name)}</a>`;
  const lv = [0, 1, 2].map(l => pre.deep.filter(x => x.level === l));
  let lastEra = null;
  const rowsHTML = merged.map(n => { const e = eraOf(n), head = e !== lastEra ? `<li class="era-h">${e.from}–${e.to}　${esc(e.name)}</li>` : ''; lastEra = e;
    return head + row(n, {track: true, full: true, extra: n.id === key ? '<div class="tgt">← 你要学的就是这个</div>' : (wide && !path.includes(n.id) ? '<div class="tgt side">旁支</div>' : '')}); }).join('');
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow"><a href="#/learn">开始学习</a> › 从零读到它</div><h1>从零读到：${esc(title)}</h1>
    <p class="lead">${isC ? `先补它需要的概念，再读它的出处和代表工作。` : `先补概念，再沿主线从最早的一站读到它。主线是从“${esc(title)}”往回、每一步挑最该先读的那个前驱连成的一条线，共${path.length}站。`}每一站只需要读页面顶上的三格，想深入再往下读。</p>
    ${merged.length ? `<div class="bar" style="max-width:520px;margin-top:16px"><i style="width:${ps.pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">已读 ${ps.d} / ${ps.n}</div>` : ''}
    <div class="toolbar">${path.length > 1 ? `<span class="seg"><a class="btn sm ${wide ? '' : 'on'}" href="${base}">只看主线</a><a class="btn sm ${wide ? 'on' : ''}" href="${base}?full=1" title="再加上主线每一站直接用到的主干工作">主线 + 旁支</a></span>` : ''}
      ${target ? `<a class="btn sm" href="#/n/${enc(key)}">直接读“${esc(title)}”</a><a class="btn sm" href="#/map?focus=${enc(key)}">在演化树上看它的前后关系</a>` : `<a class="btn sm" href="#/c/${enc(key)}">直接读“${esc(title)}”的词条</a>`}</div></div>
    ${pre.direct.length ? `<section class="sec"><div class="sec-h"><h2>第一步　先补这些概念</h2><span class="muted">${isC ? '它' : `读“${esc(title)}”`}直接需要的${pre.direct.length}个，会的可以跳过</span></div>
      <p class="tags" style="margin-top:10px">${pre.direct.map(cc).join(' ')}</p>
      ${pre.deep.length ? `<details class="fold in"><summary><b>这些概念本身还需要的基础（${pre.deep.length}个）</b></summary>${lv.map((l, i) => l.length ? `<div class="lvrow"><span class="lvn">${LEVEL[i]}</span><p class="tags">${l.map(cc).join(' ')}</p></div>` : '').join('')}</details>` : ''}</section>` : ''}
    ${merged.length ? `<section class="sec"><div class="sec-h"><h2>${pre.direct.length ? '第二步　' : ''}${isC ? `它的出处：${esc(byId[seedIds[0]].title)}，以及怎么走到那里的` : '沿主线读过来'}</h2><span class="muted">${merged.length}站</span></div><ul class="rows">${rowsHTML}</ul></section>` : ''}
    ${isC ? `<section class="sec"><div class="sec-h"><h2>${pre.direct.length || merged.length ? '然后　' : ''}读词条本身</h2></div><p class="lead s"><b>${inline(c.short || '')}</b></p><div class="toolbar"><a class="btn fill" href="#/c/${enc(key)}">读“${esc(c.name)}”的完整词条</a></div></section>` : ''}
    ${!wide && side.length ? `<section class="sec"><div class="sec-h"><h2>它还直接用到这些</h2><span class="muted">不在主线上，按需要读</span></div><ul class="rels">${side.map(s => `<li><span class="ty ${s.e.type}">${REL[s.e.type]}</span><div>${chip(s.id)}<span class="yr">${fmtDate(byId[s.id].date)} · ${TIER[byId[s.id].tier]}</span></div></li>`).join('')}</ul></section>` : ''}
    ${members.length ? `<section class="sec"><div class="sec-h"><h2>${c.area === 'idea' ? '属于这个思路的工作' : '用到它的代表工作'}</h2><span class="muted">${members.length}${(c.nodes || []).length > members.length + path.length ? ` / ${c.nodes.length}` : ''}个</span></div><ul class="rows">${members.map(n => row(n, {track: true})).join('')}</ul></section>` : ''}
    ${target && out[key].length ? `<section class="sec"><div class="sec-h"><h2>读完之后可以接着看</h2></div><p class="tags">${out[key].slice().sort((x, y) => byId[x.to].tier - byId[y.to].tier || (byId[x.to].date < byId[y.to].date ? -1 : 1)).slice(0, 10).map(e => chip(e.to)).join(' ')}</p></section>` : ''}
    <p class="trust">这条路线是按节点之间登记的关系自动排出来的，是一条可行的阅读顺序，不是唯一的，也不代表这些工作之间只有这一条传承线。</p>
    ${foot()}</div>`;
  document.title = `从零读到：${title} · AI脉络`;
}

/* ——— 时间线 ——— */
function viewTimeline() {
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">时间线</div><h1>九个时代</h1><p class="lead">每个时代有自己的算力、数据和资金条件，也有自己的核心问题。上一个时代留下的问题，往往是下一个时代的起点。点一个时代，看当时在攻克什么，以及那几年的工作。</p></div>
    <ul class="river">${G.eras.map(e => {
      const ns = G.nodes.filter(n => eraOf(n) === e), t1 = ns.filter(n => n.tier === 1);
      return `<li><a href="#/era/${e.id}"><div class="yr">${e.from}–${String(e.to).slice(2)}<small>${ns.length}个节点 · ${t1.length}个主干</small></div>
        <div class="body"><h3>${esc(e.name)}</h3><p>${esc(e.tagline)}</p><div class="tags">${t1.slice(0, 7).map(n => `<span class="tag">${esc(n.title)}</span>`).join('')}${t1.length > 7 ? `<span class="tag">…</span>` : ''}</div></div></a></li>`;
    }).join('')}</ul>
    <div class="toolbar"><a class="btn sm" href="#/stats">每年有多少工作（统计图）</a></div>${foot()}</div>`;
  document.title = '时间线 · AI脉络';
}
async function viewEra(id, q, _, ok) {
  const e = G.eras.find(x => x.id === id) || G.eras[0], i = G.eras.indexOf(e);
  const tier = +(q.tier || 2);
  const ns = G.nodes.filter(n => eraOf(n) === e), shown = ns.filter(n => n.tier <= tier);
  if (shown.some(n => !n.b)) { app.innerHTML = loading(); await needBrief(shown); if (!ok()) return; }
  const groups = G.tracks.map(t => [t, shown.filter(n => n.track === t.key)]).filter(g => g[1].length);
  app.innerHTML = `<div class="page">
    <div class="mast"><div class="eyebrow"><a href="#/timeline">时间线</a> › 时代 ${i + 1} / ${G.eras.length} · ${e.from}–${e.to}</div><h1>${esc(e.name)}</h1><p class="lead">${esc(e.tagline)}</p></div>
    <div class="two" style="margin-top:22px"><div class="note"><h4>当时的条件</h4><p>${esc(e.context)}</p></div><div class="note"><h4>怎么读这一段</h4><p>${esc(e.read)}</p></div></div>
    <section class="sec"><div class="sec-h"><h2>当时在攻克什么</h2></div>
      <ul class="qlist">${e.questions.map(x => `<li class="hue" ${hue(x.track)}><a class="k" href="#/track/${x.track}">${esc(trackBy[x.track].name)}</a><div>${esc(x.text)}</div></li>`).join('')}</ul></section>
    <section class="sec"><div class="two">
      <div class="note"><h4>当时的热点</h4><div class="tags" style="margin-top:6px">${e.hot.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
      <div class="note"><h4>逐渐退潮的</h4><div class="tags" style="margin-top:6px">${e.cooled.length ? e.cooled.map(t => `<span class="tag off">${esc(t)}</span>`).join('') : '<span class="muted">—</span>'}</div></div></div>
      <div class="note"><h4>留给下一个时代</h4><p>${esc(e.handoff)}</p></div></section>
    <section class="sec"><div class="sec-h"><h2>这个时代的工作</h2><span class="muted">显示 ${shown.length} / ${ns.length} 个</span></div>
      <div class="toolbar">${tierBar(tier, `#/era/${e.id}`)}<span class="sp"></span><a class="btn sm" href="#/map?era=${e.id}&view=tree">在演化树上看这一段</a></div>
      ${groups.map(([t, list]) => `<div class="divider hue" ${hue(t.key)}><b>${esc(t.name)}</b>${list.length} 个</div><ul class="rows">${list.map(n => row(n)).join('')}</ul>`).join('')}</section>
    <div class="pn">${i ? `<a href="#/era/${G.eras[i - 1].id}"><small>上一个时代</small><b>${esc(G.eras[i - 1].name)}</b></a>` : '<span></span>'}
      ${i < G.eras.length - 1 ? `<a class="r" href="#/era/${G.eras[i + 1].id}"><small>下一个时代</small><b>${esc(G.eras[i + 1].name)}</b></a>` : '<span></span>'}</div>
    ${foot()}</div>`;
  document.title = `${e.name} · AI脉络`;
}
async function viewYear(y, q, _, ok) {
  y = +y; const tier = +(q.tier || 2);
  const years = [...new Set(G.nodes.map(n => n.y))].sort((a, b) => a - b), i = years.indexOf(y);
  const all = G.nodes.filter(n => n.y === y), ns = all.filter(n => n.tier <= tier), e = all[0] ? eraOf(all[0]) : null;
  await needBrief(ns); if (!ok()) return;
  const groups = G.tracks.map(t => [t, ns.filter(n => n.track === t.key)]).filter(g => g[1].length);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow"><a href="#/timeline">时间线</a>${e ? ` › <a href="#/era/${e.id}">${esc(e.name)}</a>` : ''}</div><h1>${y}年</h1><p class="lead">这一年站内收了 ${all.length} 个节点。横着看一年，能看出各个方向当时分别走到了哪一步。</p>
    <div class="toolbar">${tierBar(tier, `#/year/${y}`)}<span class="sp"></span>${i > 0 ? `<a class="btn sm" href="#/year/${years[i - 1]}">← ${years[i - 1]}</a>` : ''}${i >= 0 && i < years.length - 1 ? `<a class="btn sm" href="#/year/${years[i + 1]}">${years[i + 1]} →</a>` : ''}</div></div>
    ${groups.length ? groups.map(([t, list]) => `<div class="divider hue" ${hue(t.key)}><b>${esc(t.name)}</b>${list.length} 个</div><ul class="rows">${list.map(n => row(n)).join('')}</ul>`).join('') : '<div class="empty">这一档里没有这一年的节点，切到“全部”看看。</div>'}${foot()}</div>`;
  document.title = `${y}年 · AI脉络`;
}

/* ——— 领域地图的列表版：大方向 → 分支 → 主题线 ——— */
function spark(k) {      // 一条分支每年有多少工作：2000年以前压到三成宽
  const W = 760, H = 30, a = 1950, z = G.eras[G.eras.length - 1].to, yc = yearCount[k];
  const x = y => y <= 2000 ? (y - a) / (2000 - a) * W * .3 : W * .3 + (y - 2000) / (z + 1 - 2000) * W * .7;
  let d = `M0 ${H}`;
  for (let y = a; y <= z; y++) {
    let c = yc[y] || 0;
    if (y === a) for (const yy in yc) if (+yy < a) c += yc[yy];
    const h = c ? 2 + (H - 4) * Math.sqrt(c / yearPeak) : 0;
    d += `L${x(y).toFixed(1)} ${(H - h).toFixed(1)}L${x(y + 1).toFixed(1)} ${(H - h).toFixed(1)}`;
  }
  return `<svg class="spark hue" ${hue(k)} viewBox="0 0 ${W} ${H + 12}" role="img" aria-label="${esc(trackBy[k].name)}每年的节点数，时间轴不等比例">
    ${[1950, 1980, 2000, 2012, 2017, 2022].map(y => `<line x1="${x(y)}" y1="0" x2="${x(y)}" y2="${H + 2}"/><text x="${x(y) + 3}" y="${H + 11}">${y}</text>`).join('')}
    <path d="${d}L${W} ${H}Z"/></svg>`;
}
const forkLine = k => {
  const f = G.forks[k] || {}, p = trackBy[f.from], at = byId[f.at];
  if (!f.why) return '';
  return `<p class="fk">${p ? `树上画成从 <b class="hue" ${hue(p.key)}>${esc(p.short)}</b> 分出${at ? `（${at.y}年，${chip(at.id)}）` : ''}：` : '<b>独立的根</b>：'}${esc(f.why)}</p>`;
};
const thChip = (k, th, on) => `<a class="thc hue${th.from ? ' sub' : ''}${on ? ' on' : ''}" ${hue(k)} href="#/track/${k}?th=${th.key}" title="${esc(th.blurb)}">${esc(th.name)}<small>${th.n}</small></a>`;
const TREE_NOTE = '这棵树是为了学习和查找整理出来的一种组织方式。每条分支只画了一个来源，实际的研究有很多交叉，它不代表AI研究只有唯一的传承关系。';
function tracksHTML() {
  const gs = GROUP_ORDER.map(k => G.groups.find(g => g.key === k)).filter(Boolean);
  return `${gs.map(g => `<section class="grp"><div class="role">${esc(g.role)}</div><h2>${esc(g.name)}</h2><p>${esc(g.blurb)}</p>
      ${g.tracks.map(k => { const t = trackBy[k], ids = order[k], s = doneStat(ids); return `<div class="trk hue" ${hue(k)}>
        <div class="trk-h"><a href="#/track/${k}"><h3>${esc(t.name)}</h3></a><span class="m">${ids.length}个节点 · ${byId[ids[0]].y}–${byId[ids[ids.length - 1]].y}${s.d ? ` · 已读${s.d}` : ''}</span></div>
        <p class="q">${esc(t.question)}</p>${forkLine(k)}${spark(k)}
        <div class="ths">${G.threads[k].map(th => thChip(k, th)).join('')}</div></div>`; }).join('')}</section>`).join('')}
    ${G.joins.length ? `<section class="grp"><div class="role">跨分支</div><h2>几次关键的借用</h2><p>分支之间一直在互相借东西。下面是其中影响较大的几次，树上用虚线标出。</p>
      <ul class="rels" style="margin-top:12px">${G.joins.map(j => `<li><span class="ty">${byId[j.to].y}</span><div>${chip(j.from)} → ${chip(j.to)}<div class="nt">${esc(j.label)}</div></div></li>`).join('')}</ul></section>` : ''}`;
}
function viewTracks() { location.replace('#/map?view=list'); }
async function viewTrack(key, q = {}, _, ok) {
  const t = trackBy[key]; if (!t) { app.innerHTML = miss('分支', key); return; }
  const k = t.key, ths = G.threads[k];
  const th = thBy[k][q.th] || null, by = q.by === 'stage' && !th ? 'stage' : 'thread';
  const tier = +(q.tier || (th ? 3 : 2));
  const ids = order[k], all = ids.map(i => byId[i]), ns = all.filter(n => n.tier <= tier && (!th || n.th === th.key));
  if (ns.some(n => !n.b)) { app.innerHTML = loading(); await needBrief(ns); if (!ok()) return; }
  const base = `#/track/${k}`, qs = o => { const x = Object.assign({th: th && th.key, by: by === 'stage' ? 'stage' : null}, o), a = Object.keys(x).filter(i => x[i]).map(i => `${i}=${x[i]}`); return base + (a.length ? '?' + a.join('&') : ''); };
  let list = '';
  if (by === 'stage') {
    let si = -1;
    for (const n of ns) {
      let j = t.stages.findIndex(s => n.y <= s.to);
      if (j < 0) j = t.stages.length - 1;
      if (j !== si) { if (si >= 0) list += '</ul>'; si = j; const s = t.stages[j]; list += `<div class="divider"><b>${esc(s.name)}</b>${s.from}–${s.to}</div><ul class="rows">`; }
      list += row(n, {full: true});
    }
    if (si >= 0) list += '</ul>';
  } else {
    for (const x of th ? [th] : ths) {
      const rows = ns.filter(n => n.th === x.key);
      list += `<div class="divider" id="th-${x.key}"><b>${esc(x.name)}</b>${x.first.slice(0, 4)}–${x.last.slice(0, 4)} · ${rows.length}${rows.length < x.n ? ' / ' + x.n : ''} 个${x.from ? ` · 从“${esc(thBy[k][x.from].name)}”分出` : ''}<div style="margin-top:2px">${esc(x.blurb)}</div></div>
        <ul class="rows">${rows.map(n => row(n, {full: true})).join('')}</ul>`;
    }
  }
  const narrow = NARROW();
  app.innerHTML = `<div class="page hue" ${hue(k)}>
    <div class="mast"><div class="eyebrow"><a href="#/map">领域地图</a>${t.g ? ` › ${esc(t.g.name)}` : ''} · ${ids.length}个节点 · ${ths.length}条主题线</div><h1>${esc(t.name)}</h1><p class="lead"><b>${esc(t.question)}</b></p><p class="lead">${esc(t.blurb)}</p>${forkLine(k)}</div>
    <section class="sec"><div class="sec-h"><h2>主题线</h2><span class="muted">一条主题线是沿着同一个问题接力的一串工作。点一条只看它</span></div>
      <div class="thcards">${ths.map(x => `<a class="hue${th === x ? ' on' : ''}" ${hue(k)} href="${th === x ? base : `${base}?th=${x.key}`}" ${th === x ? 'aria-current="true"' : ''}><h4>${esc(x.name)}</h4><p>${esc(x.blurb)}</p><small>${x.first.slice(0, 4)}–${x.last.slice(0, 4)} · ${x.n}个节点${x.from ? ` · 从“${esc(thBy[k][x.from].name)}”分出` : ''}</small></a>`).join('')}</div></section>
    <section class="sec"><div class="sec-h"><h2>这条分支的演化树</h2><span class="muted">一行是一条主题线，曲线表示它从哪条线分出来。时间轴不等比例</span></div>
      <div class="toolbar">${tierBar(tier, qs({}))}<span class="sp"></span><a class="btn sm" href="#/map?only=${k}&view=tree">在整张地图里看</a></div>
      ${narrow ? `<button class="btn" id="tshow">画出这条分支的树</button>` : ''}<div class="tscroll" id="ttree" ${narrow ? 'hidden' : ''}></div></section>
    <section class="sec"><div class="sec-h"><h2>这条分支的几个阶段</h2></div>
      <ul class="stages">${t.stages.map(s => `<li><span class="y">${s.from}–${s.to}</span><b>${esc(s.name)}</b><p>${esc(s.text)}</p></li>`).join('')}</ul></section>
    <section class="sec" id="list"><div class="sec-h"><h2>${th ? `主题线：${esc(th.name)}` : '节点列表'}</h2><span class="muted">显示 ${ns.length} 个</span></div>
      <div class="toolbar">${tierBar(tier, qs({}))}${th ? `<a class="btn sm" href="${base}">← 全部主题线</a>` : `<span class="seg"><a class="btn sm ${by === 'thread' ? 'on' : ''}" href="${qs({by: null})}">按主题线</a><a class="btn sm ${by === 'stage' ? 'on' : ''}" href="${qs({by: 'stage'})}">按阶段</a></span>`}</div>${list}</section>
    ${foot()}</div>`;
  document.title = `${t.name} · AI脉络`;
  const box = $('#ttree');
  const paint = () => {
    const lay = fit => treeLayout({dir: 'h', tracks: [k], open: [k], tier, fit, y0: all[0].y - 1, bands: t.stages});
    const avail = box.clientWidth - sideW() - 4;
    let L = lay(avail - 62 - 96);
    if (L.T > avail && L.z > .2) L = lay(avail - 62 - 96 - (L.T - avail));
    const D = treeDraw(L, {hl: th && th.key});
    box.innerHTML = `<div class="tcanvas plane" style="width:${D.W}px;height:${D.H}px">${D.html}</div>`;
    if (th) { const l = L.thLane[k][th.key]; if (l) box.scrollTo(Math.max(0, l.a - 80), Math.max(0, l.c - 60)); }
  };
  if (narrow) $('#tshow').onclick = ev => { ev.target.remove(); box.hidden = false; paint(); }; else paint();
  if (th && q.th) setTimeout(() => $('#list') && $('#list').scrollIntoView(), 0);
}

/* ——— 节点讲解 ——— */
function relItem(e, other, note) {
  const n = byId[other], mark = e.f & 2 ? '<span class="vk ok" title="这条关系对照过原始来源">已核对</span>' : e.f & 4 ? '<span class="vk" title="核对时没有找到明确依据">待核对</span>' : '';
  return `<li><span class="ty ${e.type}" title="${REL_HELP[e.type]}">${REL[e.type]}</span><div>${chip(other)}<span class="yr">${fmtDate(n.date)} · ${esc(trackBy[n.track].short)}</span>${mark}${note ? `<div class="nt">${inline(note)}</div>` : ''}</div></li>`;
}
const issueURL = n => `${REPO}/issues/new?title=${enc(`[纠错] ${n.title}（${n.id}）`)}&body=${enc(`节点：${n.id}\n页面：${SITE}n/${n.id}.html\n\n哪一句有问题：\n\n应该是什么（最好附上出处链接）：\n`)}`;
async function viewNode(id, q, _, ok) {
  const n = byId[id];
  if (!n) { app.innerHTML = miss('节点', id); return; }
  if (!n.b) app.innerHTML = loading('讲解');
  const c = await nodeContent(id); if (!ok()) return;
  const figs = await figsHTML(c.figs); if (!ok()) return;
  const t = trackBy[n.track], e = eraOf(n), th = thBy[t.key][n.th], rel = c.rel || {};
  const sec = (title, text, anchor) => text ? `<h2${anchor ? ` id="${anchor}"` : ''}>${title}</h2>${rich(text)}` : '';
  // 核对过的关系排在前面，其次是标了待核对的，再是没核对的；同一组里主干优先、按时间
  const vr = e => e.f & 2 ? 0 : e.f & 4 ? 1 : 2;
  const before = [...inn[id]].sort((a, b) => vr(a) - vr(b) || byId[a.from].tier - byId[b.from].tier || (byId[a.from].date < byId[b.from].date ? 1 : -1));
  const after = [...out[id]].sort((a, b) => vr(a) - vr(b) || byId[a.to].tier - byId[b.to].tier || (byId[a.to].date < byId[b.to].date ? -1 : 1));
  const ord = order[n.track], k = ord.indexOf(id), prev = byId[ord[k - 1]], next = byId[ord[k + 1]];
  const trunk = G.nodes.filter(x => x.tier === 1), tk = trunk.indexOf(n), nextTrunk = tk >= 0 ? trunk[tk + 1] : null;
  const pre = (c.prereq || []).filter(p => concepts[p]), top = pre.slice(0, 3), rest = pre.slice(3);
  const inStories = G.stories.filter(s => s.nodes.includes(id));
  const r = c.review;
  const relBlock = (title, anchor, es, key) => { if (!es.length) return ''; const head = es.slice(0, 8), tail = es.slice(8);
    return `<h2 id="${anchor}">${title}<small>${es.length}</small></h2><ul class="rels">${head.map(x => relItem(x, x[key], rel[x[key]])).join('')}</ul>${tail.length ? `<details class="fold in"><summary><b>其余 ${tail.length} 条</b></summary><ul class="rels">${tail.map(x => relItem(x, x[key], rel[x[key]])).join('')}</ul></details>` : ''}`; };
  const limits = (c.limits || []).map(l => `<li>${inline(l.text)}${l.stated ? '<span class="vk ok" title="核对时在原文里看到了这条局限">作者在原文中指出</span>' : ''}<div class="by">${l.open ? `<b>有依据表明仍未解决</b>　${esc(l.open)}` : l.by.length ? `后来针对它的工作 ${l.by.map(chip).join(' ')}` : '本站还没有记录针对它的后续工作（不代表没有人解决）'}</div></li>`).join('');
  app.innerHTML = `<article class="page hue" ${hue(n.track)}><div class="narrow" style="margin:0 auto">
    <div class="article-head">
      <div class="eyebrow">${t.g ? `${esc(t.g.name)} › ` : ''}<a href="#/track/${t.key}">${esc(t.name)}</a>${th && n.th !== 'all' ? ` › <a href="#/track/${t.key}?th=${n.th}">${esc(th.name)}</a>` : ''}</div>
      <h1>${esc(n.title)}</h1>
      ${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
      <div class="meta"><span>${fmtDate(n.date)}</span><span>${KIND[n.kind]}</span><span title="${['', '缺了它后面就讲不通', '这个方向的人都知道', '用到再查'][n.tier]}">${TIER[n.tier]}</span>${c.venue ? `<span>${esc(c.venue)}</span>` : ''}${n.who ? `<span>${esc(n.who)}</span>` : ''}<a href="#" data-jump="trustbox">${revBadge(n)}</a></div>
      ${(c.links || []).length ? `<div class="acts src"><span class="muted">原始资料</span>${c.links.map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
    </div>
    ${n.problem ? `<div class="gist"><div><h4>问题</h4><p>${inline(n.problem)}</p></div><div><h4>方法</h4><p>${inline(n.idea)}</p></div><div><h4>影响</h4><p>${inline(n.impact)}</p></div></div>` : `<div class="empty">这个节点的讲解还在整理中。</div>`}
    <nav class="jump" aria-label="本页内容">${c.background || c.method ? '<a href="#" data-jump="explain">讲解</a>' : ''}${limits ? '<a href="#" data-jump="limits">局限与后续</a>' : ''}${before.length ? '<a href="#" data-jump="before">前驱</a>' : ''}${after.length ? '<a href="#" data-jump="after">后续</a>' : ''}<a href="#" data-jump="where">树上的位置</a><a href="#/from/${enc(id)}">从零读到它 →</a></nav>
    <div class="prose">
      ${top.length ? `<p class="prereq"><span>读之前最好先会</span>${top.map(cchip).join(' ')}${rest.length ? `<a href="#" class="u" data-jump="concepts">另外${rest.length}个</a>` : ''}</p>` : ''}
      <span id="explain"></span>${sec('背景', c.background)}${sec('方法', c.method)}${figs}${sec('结果', c.results)}${sec('后来的发展', c.legacy)}${sec('容易误解的地方', c.pitfalls)}
      ${limits ? `<h2 id="limits">局限与后续</h2><ul class="limits">${limits}</ul>` : ''}
      ${relBlock('它建立在什么之上', 'before', before, 'from')}
      ${relBlock('后来的相关工作', 'after', after, 'to')}
      ${before.length || after.length ? `<p class="fine">关系由AI模型整理。“改进”指后来的工作针对它的某个问题做了改进，不代表问题已经解决；“竞争”指同一问题的不同路线，不代表谁取代了谁；时间先后不等于因果。标“已核对”的对照过原始来源，其余未逐条核对。</p>` : ''}
      <h2 id="where">它在演化树上的位置</h2>
      <p class="where">${t.g ? `${esc(t.g.name)} › ` : ''}<a class="u" href="#/track/${t.key}">${esc(t.name)}</a>${th && n.th !== 'all' ? ` › <a class="u" href="#/track/${t.key}?th=${n.th}">${esc(th.name)}</a>` : ''} · <a class="u" href="#/era/${e.id}">${esc(e.name)}</a>${(c.ideas || []).length ? `<br>所属研究思路：${c.ideas.map(cchip).join(' ')}` : ''}${inStories.length ? `<br>出现在专题：${inStories.map(s => `<a class="u" href="#/story/${s.key}">${esc(s.title)}</a>`).join('、')}` : ''}</p>
      <div class="toolbar"><button class="btn sm" id="showtree">在这里画出它和前驱、后续的关系</button><a class="btn sm" href="#/map?at=${enc(id)}&view=tree">在整张地图里定位</a><a class="btn sm" href="#/map?focus=${enc(id)}&view=tree">只看它的前后关系</a><a class="btn sm" href="#/from/${enc(id)}">从零读到它的路线</a></div>
      <div class="tscroll" id="ntree" hidden></div>
      ${pre.length ? `<h2 id="concepts">读懂它需要的概念</h2><p class="tags">${pre.map(cchip).join(' ')}</p>` : ''}
      ${(c.terms || []).length ? `<h2>本篇术语</h2><ul>${c.terms.map(x => `<li><b>${esc(x.t)}</b>　${inline(x.d)}</li>`).join('')}</ul>` : ''}
      ${sec('怎么学', c.learn)}
    </div>
    <div class="rv r${n.rev}" id="trustbox">${r ? `<b>${REV[n.rev]}</b>　${esc(r.date)} · ${n.rev === 2 ? '经人工复核' : '由AI模型打开原始来源逐项核对，未经人工复核'}${r.changed ? `，核对时修改了${r.changed}处` : ''}
        <details><summary>核对了什么</summary><ul>${r.checked.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${r.unverified.length ? `<p>仍未能核对：</p><ul>${r.unverified.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p>核对时打开的来源：</p><ul>${r.sources.map(s => `<li><a class="u" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>　${esc(s.what)}</li>`).join('')}</ul></details>`
      : `<b>待核对</b>　这篇讲解由AI模型撰写，尚未对照原始来源独立核对，可能有错。${c.check ? `写作时记录的出处：${String(c.check.source).split(/[\s;；]+/).filter(u => /^https?:/.test(u)).map(u => `<a class="u" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('、')}（${esc(c.check.confirmed)}）` : ''}`}
      <p><a class="btn sm" href="${esc(issueURL(n))}" target="_blank" rel="noopener">报告错误</a><a class="u" href="about.html" style="margin-left:10px">审核状态是什么意思</a></p></div>
    <section class="mine" aria-label="我的学习记录"><h2>我的学习记录</h2>
      <div class="toolbar">${stBtn(id, true)}<button class="btn sm ${marks[id] ? 'on' : ''}" data-mark="${esc(id)}" aria-pressed="${!!marks[id]}">${marks[id] ? '★ 已收藏' : '☆ 收藏'}</button><button class="btn sm" data-copy="${SITE}n/${enc(id)}.html">复制分享链接</button></div>
      <label class="muted" for="note" style="font-size:12.5px">笔记（只保存在这个浏览器里，不会上传，也不会同步到别的设备）</label>
      <textarea class="note-box" id="note" placeholder="读完写两句：它解决了什么？我哪里没懂？">${esc(notes[id] || '')}</textarea></section>
    <div class="pn">${prev ? `<a href="#/n/${enc(prev.id)}"><small>本分支上一个 · ${fmtDate(prev.date)}</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}
      ${next ? `<a class="r" href="#/n/${enc(next.id)}"><small>本分支下一个 · ${fmtDate(next.date)}</small><b>${esc(next.title)}</b></a>` : '<span></span>'}</div>
    ${nextTrunk ? `<div class="pn" style="margin-top:12px"><span></span><a class="r" href="#/n/${enc(nextTrunk.id)}"><small>主干下一站 · ${fmtDate(nextTrunk.date)} · ${esc(trackBy[nextTrunk.track].short)}</small><b>${esc(nextTrunk.title)}</b></a></div>` : ''}</div>
    ${foot()}</article>`;
  document.title = `${n.title} · AI脉络`;
  store.set('last', id);
  $('#showtree').onclick = ev => {
    ev.target.remove(); const box = $('#ntree'); box.hidden = false;
    const thIds = (th || {ids: []}).ids, near = [...before.map(x => x.from), ...after.map(x => x.to)];
    setTree(box, [...new Set([id, ...near.slice(0, 60), ...(thIds.length <= 30 ? thIds : thIds.filter(i => byId[i].tier <= 2 || Math.abs(byId[i].y - n.y) <= 1).slice(0, 30))])], [id], id);
  };
  const nb = $('#note');
  nb.oninput = () => { if (nb.value.trim()) notes[id] = nb.value; else delete notes[id]; store.set('notes', notes); };
  navKeys = {ArrowLeft: prev && '#/n/' + enc(prev.id), ArrowRight: next && '#/n/' + enc(next.id)};
}
let navKeys = {};
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (location.hash.startsWith('#/n/') && navKeys[e.key]) location.hash = navKeys[e.key];
});

/* ——— 知识索引：概念、研究思路、机制图、术语 ——— */
function viewIndex(_, q) {
  const all = Object.values(concepts), ideas = all.filter(c => c.area === 'idea'), base = all.filter(c => c.area !== 'idea');
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">知识索引</div><h1>概念与研究思路</h1>
    <p class="lead"><b>基础概念</b>（${base.length}个）是读讲解要先会的知识，方块里的数字是难度：0 进入AI之前就该会，1 入门必备，2 读前沿论文时需要。<b>研究思路</b>（${ideas.length}个）是大家讨论时挂在嘴边的做法和话题，例如“在策略自蒸馏”“扩散语言模型”：它不是某一篇论文，而是一串论文共同在做的事。</p>
    <form class="toolbar" id="cf" role="search"><input class="inp" id="cq" type="search" placeholder="在这一页里筛选，例如 注意力、蒸馏、diffusion" aria-label="筛选概念与思路" autocomplete="off" style="max-width:380px"></form></div>
    <nav class="jump" aria-label="本页内容"><a href="#" data-jump="x-base">基础概念</a>${G.figs.length ? '<a href="#" data-jump="x-figs">机制图</a>' : ''}<a href="#" data-jump="x-ideas">研究思路</a><a href="#" data-jump="x-terms">术语表</a></nav>
    <div id="cbox">
    <section class="sec" id="x-base"><div class="sec-h"><h2>基础概念</h2><span class="muted">按领域</span></div>
    ${Object.entries(AREA).filter(([a]) => a !== 'idea').map(([a, name]) => { const list = base.filter(c => c.area === a); return list.length ? `<div class="divider"><b>${name}</b>${list.length} 个</div>
      <div class="cgrid">${list.map(c => `<a href="#/c/${c.key}" data-f="${esc((c.name + ' ' + c.en + ' ' + c.key).toLowerCase())}"><span class="lv">${c.level}</span><span>${esc(c.name)}${c.fig ? '<i class="hasfig" title="有机制图">图</i>' : ''}<small>${esc(c.en)}</small></span></a>`).join('')}</div>` : ''; }).join('')}</section>
    ${G.figs.length ? `<section class="sec" id="x-figs"><div class="sec-h"><h2>机制图</h2><span class="muted">${G.figs.length}张，讲清一个机制是怎么运转的</span></div>
      <div class="cgrid">${G.figs.map(f => { const to = f.concepts[0] ? `#/c/${f.concepts[0]}` : `#/n/${enc(f.nodes[0])}`; return `<a href="${to}" data-f="${esc(f.title.toLowerCase())}"><span class="lv">图</span><span>${esc(f.title)}</span></a>`; }).join('')}</div></section>` : ''}
    <section class="sec" id="x-ideas"><div class="sec-h"><h2>研究思路</h2><span class="muted">按所在分支；方块里是属于它的节点数</span></div>
      ${G.tracks.map(t => { const l = ideas.filter(c => c.track === t.key); return l.length ? `<div class="divider"><b>${esc(t.name)}</b>${l.length} 个</div><div class="cgrid">${l.map(c => `<a href="#/c/${c.key}" class="hue" ${hue(t.key)} data-f="${esc((c.name + ' ' + c.en + ' ' + c.key).toLowerCase())}"><span class="lv">${c.n}</span><span>${esc(c.name)}<small>${esc(c.en || '')}</small></span></a>`).join('')}</div>` : ''; }).join('')}</section>
    </div>
    <section class="sec" id="x-terms"><div class="sec-h"><h2>术语表</h2><span class="muted">${core.nTerms}条，来自各篇讲解里的“本篇术语”</span></div><div id="terms"><button class="btn sm" id="tload">载入术语表</button></div></section>
    ${foot()}</div>`;
  document.title = '知识索引 · AI脉络';
  const cq = $('#cq');
  const filter = () => { const v = cq.value.trim().toLowerCase(); $('#cbox').querySelectorAll('a[data-f]').forEach(a => a.hidden = !!v && !a.dataset.f.includes(v)); $('#cbox').querySelectorAll('.divider').forEach(d => { const g = d.nextElementSibling; d.hidden = g.hidden = !!v && !g.querySelector('a:not([hidden])'); }); };
  cq.oninput = filter; $('#cf').onsubmit = ev => { ev.preventDefault(); if (cq.value.trim()) location.hash = `#/search?q=${enc(cq.value.trim())}`; };
  $('#tload').onclick = async ev => {
    ev.target.textContent = '正在载入…';
    try { const terms = await load('terms.json'); $('#terms').innerHTML = `<ul class="rows terms">${terms.map(t => `<li><b>${esc(t.t)}</b>　${inline(t.d)}<div class="f">${t.nodes.slice(0, 5).map(chip).join(' ')}</div></li>`).join('')}</ul>`; }
    catch { ev.target.textContent = '载入失败，点一下重试'; }
  };
}
async function viewConcept(key, q, _, ok) {
  const c0 = concepts[key];
  if (!c0) { app.innerHTML = miss('概念', key); return; }
  app.innerHTML = loading('词条');
  const c = await conceptBody(key); if (!ok()) return;
  const figs = await figsHTML(c.figs); if (!ok()) return;
  const idea = c.area === 'idea', neededBy = Object.values(concepts).filter(x => (x.needs || []).includes(key));
  const ns = (c.nodes || []).map(i => byId[i]).filter(Boolean), origin = byId[c.origin] || null;
  const show = ns.length <= 90 ? ns : [...ns].sort((a, b) => a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, 90);
  const ids = [...new Set([...(origin ? [origin.id] : []), ...show.map(n => n.id)])];
  app.innerHTML = `<article class="page"><div class="narrow" style="margin:0 auto"><div class="article-head"><div class="eyebrow"><a href="#/index">知识索引</a> › ${AREA[c.area]}${idea ? (trackBy[c.track] ? ` · <a href="#/track/${c.track}">${esc(trackBy[c.track].name)}</a>` : '') : ' · ' + LEVEL[c.level]}</div>
      <h1>${esc(c.name)}</h1><div class="full">${esc(c.en || '')}</div>
      ${(c.aka || []).length ? `<p class="muted" style="font-size:13px;margin:8px 0 0">也叫：${c.aka.map(esc).join('　')}</p>` : ''}</div>
    <div class="prose"><p class="lede"><b>${inline(c.short || '')}</b></p>
      ${(c.needs || []).length ? `<p class="prereq"><span>先要会</span>${c.needs.map(cchip).join(' ')}</p>` : ''}
      ${figs}${rich(c.body || '')}${c.example ? `<div class="example"><h4>例子</h4>${rich(c.example)}</div>` : ''}${c.pitfalls ? `<h2>容易误解的地方</h2>${rich(c.pitfalls)}` : ''}
      ${neededBy.length ? `<h2>学完它可以接着看</h2><p class="tags">${neededBy.map(x => cchip(x.key)).join(' ')}</p>` : ''}
      ${ns.length ? `<h2>${idea ? '属于这个思路的工作' : '用到它的工作'}<small>${ns.length}</small></h2>${origin ? `<p class="where">最早的出处：${chip(origin.id)}（${origin.y}）</p>` : ''}<p class="tags">${[...ns].sort((a, b) => idea ? (a.date < b.date ? -1 : 1) : a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, 40).map(n => chip(n.id)).join(' ')}</p>
        <div class="toolbar"><button class="btn sm" id="showtree">在这里画出它们在演化树上的位置</button><a class="btn sm" href="#/map?c=${key}&view=tree">在整张地图里看</a><a class="btn sm" href="#/from/c/${enc(key)}">从零学到它的路线</a></div><div class="tscroll" id="ctree" hidden style="max-height:60vh"></div>` : `<div class="toolbar"><a class="btn sm" href="#/from/c/${enc(key)}">从零学到它的路线</a></div>`}</div>
    <div class="rv r0"><b>待核对</b>　词条由AI模型撰写，未对照来源独立核对。<p><a class="btn sm" href="${REPO}/issues/new?title=${enc(`[纠错] 概念：${c.name}（${key}）`)}" target="_blank" rel="noopener">报告错误</a></p></div>
    <section class="mine"><h2>我的学习记录</h2><div class="toolbar">${stBtn('c:' + key, true)}<button class="btn sm" data-copy="${SITE}c/${enc(key)}.html">复制分享链接</button></div></section>
    </div>${foot()}</article>`;
  document.title = `${c.name} · AI脉络`;
  const sb = $('#showtree');
  if (sb) sb.onclick = () => { sb.remove(); const box = $('#ctree'); box.hidden = false; setTree(box, ids, origin ? [origin.id] : []); };
}

/* ——— 搜索 ——— */
const hrefOf = it => it.k === 'c' ? `#/c/${it.id}` : it.k === 'th' || it.k === 'tr' ? `#/track/${it.id}` : it.k === 's' ? `#/story/${it.id}` : `#/n/${enc(it.id)}`;
const kindLabel = it => it.k === 'n' ? `${it.date.slice(0, 4)} · ${trackBy[it.track].short}` : it.k === 'c' ? (it.area === 'idea' ? '研究思路' : '概念') : it.k === 'th' ? '主题线' : it.k === 'tr' ? '分支' : it.k === 's' ? '专题' : '术语';
/* 一个搜索词对应树上的哪些节点：名字或别名对得上的主题线、概念、思路的全部成员，加上标题直接命中的节点 */
async function memberIds(it, cap = 80) {
  let ids = [];
  if (it.k === 'th') ids = thBy[it.track][it.th].ids;
  else if (it.k === 'c') ids = (await conceptBody(it.id)).nodes || [];
  else if (it.k === 's') ids = storyBy[it.id].nodes;
  else if (it.k === 'n') ids = [it.id];
  return ids.length <= cap ? ids : ids.map(i => byId[i]).filter(Boolean).sort((a, b) => a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, cap).map(n => n.id);
}
async function topicSet(q, res) {
  res = res || (await ensureSearch()).search(q, 400);
  const set = new Set(), from = [];
  for (const it of res.filter(x => !x.partial && !x.fuzzy && x.sc >= 70 && (x.k === 'th' || x.k === 'c' || x.k === 's')).slice(0, 3)) { const ids = await memberIds(it); if (ids.length) { ids.forEach(i => set.add(i)); from.push(it); } }
  const ns = res.filter(x => x.k === 'n' && !x.fuzzy);
  ns.filter(x => !x.partial && x.sc >= 40).slice(0, 60).forEach(x => set.add(x.id));
  if (set.size < 3) ns.slice(0, 30).forEach(x => set.add(x.id));
  return {ids: [...set].filter(i => byId[i]), from};
}
/* 把一组节点画成一棵嵌在页面里的小树：按分支和主题线分行、按时间排列，连线是它们之间登记的关系。mark：要圈出来的节点 */
function setTree(box, ids, mark = [], only = null) {
  const set = new Set(ids.filter(i => byId[i]));
  if (!box || !set.size) { if (box) box.hidden = true; return; }
  let first = 9999; set.forEach(i => { first = Math.min(first, byId[i].y); });
  // only：只画和这个节点直接相连的线（节点页用，免得同一条线上的工作互相连成一团）
  const edges = only ? G.edges.filter(e => (e.from === only || e.to === only) && set.has(e.from) && set.has(e.to)) : set.size <= 90 ? G.edges.filter(e => set.has(e.from) && set.has(e.to)) : null;
  const lay = fit => treeLayout({dir: 'h', nodes: set, tier: 3, fit, y0: first - 1});
  const avail = box.clientWidth - sideW() - 4;
  let L = lay(avail - 62 - 96);
  if (L.T > avail && L.z > .2) L = lay(avail - 62 - 96 - (L.T - avail));
  const D = treeDraw(L, {edges});
  box.innerHTML = `<div class="tcanvas plane" style="width:${D.W}px;height:${D.H}px">${D.html}</div><p class="tnote">${edges ? LEGEND + ' · ' : ''}时间轴不等比例：节点多的年份画得更宽</p>`;
  let el = null;
  for (const id of mark) { const x = box.querySelector(`.nd[data-id="${CSS.escape(id)}"]`); if (x) { x.classList.add('sel'); el = el || x; } }
  if (el) box.scrollTo(Math.max(0, el.offsetLeft - box.clientWidth / 2), Math.max(0, el.offsetTop - 120));
}
const LEGEND = '<span class="legend"><span><i class="solves"></i>改进</span><span><i></i>延续</span><span><i class="uses"></i>使用</span><span><i class="rivals"></i>竞争</span></span>';
/* ——— 输入时的提示栏：顶栏、首页、开始学习、搜索页共用 ———
   o.href 点一条去哪；o.keep 留哪些种类；o.via 是否带“路线”快捷入口；o.enter 没选中任何一条时回车做什么（不给就交给表单）；o.more 底部那一行的文字 */
let sugN = 0;
function suggest(inp, o = {}) {
  if (!inp || inp._sug) return; inp._sug = 1;
  const uid = 'sg' + (++sugN), href = o.href || hrefOf, keep = o.keep || (x => x.k !== 't'), via = o.via !== false;
  let drop = o.drop;
  if (!drop) { drop = document.createElement('div'); drop.className = 'drop'; drop.hidden = true; inp.parentNode.classList.add('sugw'); inp.parentNode.appendChild(drop); }
  if (!drop.id) drop.id = uid;
  drop.setAttribute('role', 'listbox'); drop._inp = inp;
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-controls', drop.id); inp.setAttribute('aria-expanded', 'false');
  let sel = -1, items = [], seq = 0;
  const close = () => { seq++; drop.hidden = true; sel = -1; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); };
  drop._close = close;
  const place = () => {      // 自己建的提示栏贴在输入框正下方；太窄时放宽到一行能读的宽度
    if (o.drop) return; const par = inp.parentNode, w = Math.max(inp.offsetWidth, Math.min(340, par.clientWidth));
    drop.style.width = w + 'px'; drop.style.right = 'auto'; drop.style.left = Math.max(0, Math.min(inp.offsetLeft, par.clientWidth - w)) + 'px'; drop.style.top = inp.offsetTop + inp.offsetHeight + 6 + 'px';
  };
  const paint = async () => {
    const q = inp.value.trim(), my = ++seq;
    if (!q) return close();
    const s = S || await ensureSearch().catch(() => S);
    if (my !== seq || !s || !inp.isConnected) return;
    items = s.search(q, 14).filter(keep).slice(0, o.n || 7);
    drop.innerHTML = (items.length ? items.map((it, i) => `<div class="opt${i === sel ? ' sel' : ''}" role="option" id="${uid}o${i}" aria-selected="${i === sel}"><a class="m" href="${href(it)}" tabindex="-1"><div class="t">${esc(it.t)} <span class="k">${esc(kindLabel(it))}${it.partial ? ' · 部分匹配' : it.fuzzy ? ' · 相近的拼写' : ''}</span></div><div class="s">${esc(it.s)}</div></a>${via && (it.k === 'n' || it.k === 'c') ? `<a class="via" href="${fromHref(it)}" tabindex="-1" title="从零读到它的路线" aria-label="从零读到${esc(it.t)}的路线">路线</a>` : ''}</div>`).join('') : '<div class="more">没有直接匹配的名字，换个叫法、英文名或缩写试试</div>')
      + (o.more === false ? '' : `<a class="more" href="#/search?q=${enc(q)}" tabindex="-1">${o.more || '查看全部结果 ↵'}</a>`);
    const was = drop.hidden; place(); drop.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (was && !o.drop && NARROW()) inp.scrollIntoView({block: 'start'});      // 手机上把输入框顶到屏幕上方，给提示栏和键盘留地方
    if (sel >= 0) { inp.setAttribute('aria-activedescendant', uid + 'o' + sel); const el = drop.children[sel]; if (el && el.scrollIntoView) el.scrollIntoView({block: 'nearest'}); } else inp.removeAttribute('aria-activedescendant');
  };
  let composing = false;      // 拼音还没上屏时不提示，也不把确认候选词的回车当成提交
  inp.addEventListener('compositionstart', () => { composing = true; });
  inp.addEventListener('compositionend', () => { composing = false; sel = -1; paint(); });
  inp.addEventListener('input', () => { if (composing) return; sel = -1; paint(); });
  inp.addEventListener('focus', () => { ensureSearch().catch(() => {}); paint(); });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp && !drop.contains(document.activeElement)) close(); }, 200));
  drop.addEventListener('mousedown', e => e.preventDefault());      // 点提示栏时不让输入框失焦
  inp.addEventListener('keydown', e => {
    if (composing || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (drop.hidden && !inp.value.trim()) return; e.preventDefault(); sel = Math.max(-1, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); paint(); }
    else if (e.key === 'Enter') {
      const v = inp.value.trim();
      if (sel >= 0 && items[sel]) { e.preventDefault(); const to = href(items[sel]); close(); inp.blur(); location.hash = to; }
      else if (o.enter) { e.preventDefault(); if (v) { close(); inp.blur(); o.enter(v); } }
      else close();
    }
    else if (e.key === 'Escape') { if (!drop.hidden) { e.preventDefault(); close(); } else if (o.drop) inp.blur(); }
  });
  if (inp.form) inp.form.addEventListener('submit', close);
}
function initSearch() {
  const inp = $('#q');
  suggest(inp, {drop: $('#drop'), n: 8, enter: v => { location.hash = `#/search?q=${enc(v)}`; }});
  document.addEventListener('click', e => { for (const d of document.querySelectorAll('.drop:not([hidden])')) if (d._close && d._inp !== e.target && (!d.contains(e.target) || e.target.closest('a'))) d._close(); });
  window.addEventListener('hashchange', () => { for (const d of document.querySelectorAll('.drop:not([hidden])')) d._close && d._close(); });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); const x = $('#sq') || (inp.offsetParent ? inp : null);
    if (x) { x.focus(); x.select(); } else location.hash = '#/search';
  });
}
let fullText = null;
async function loadFullText(onProgress) {
  if (fullText) return fullText;
  const files = G.tracks.flatMap(t => Array.from({length: Math.ceil(order[t.key].length / core.chunk)}, (_, i) => `content/${t.key}-${i}.json`));
  let done = 0; const ft = {};
  await Promise.all(files.map(f => load(f).then(obj => {
    for (const [id, c] of Object.entries(obj)) ft[id] = [c.problem, c.idea, c.impact, c.background, c.method, c.results, c.legacy, c.pitfalls, c.learn, (c.limits || []).map(l => l.text).join('\n'), (c.terms || []).map(t => t.t + ' ' + t.d).join('\n')].join('\n').toLowerCase();
    onProgress && onProgress(++done, files.length);
  })));
  return fullText = ft;
}
async function viewSearch(_, q, __, ok) {
  const query = (q.q || '').trim();
  const form = `<form class="sform" id="sf" role="search"><input class="inp big" id="sq" type="search" value="${esc(query)}" placeholder="论文、模型、算法、作者、概念、缩写…" aria-label="搜索" autocomplete="off" spellcheck="false"><button class="btn fill">搜索</button></form>`;
  const wire = () => { const f = $('#sf'); if (f) f.onsubmit = ev => { ev.preventDefault(); const v = $('#sq').value.trim(); if (v) location.hash = `#/search?q=${enc(v)}`; }; suggest($('#sq'), {n: 8}); };
  if (!query) {
    app.innerHTML = `<div class="page narrow"><div class="mast"><div class="eyebrow">搜索</div><h1>想找什么</h1>${form}
      <p class="lead s">可以搜论文和模型的名字、英文原题、缩写（RAG、GRPO、DLM）、别名、作者、机构，也可以直接搜一个概念或研究思路（自回归、测试时训练）。中英文的常见叫法互通。</p>
      <div class="toolbar"><span class="muted">试试</span>${['Transformer', '扩散模型', 'GRPO', 'attention is all you need', '世界模型', 'Hinton', 'KV cache'].map(x => `<a class="btn sm" href="#/search?q=${enc(x)}">${esc(x)}</a>`).join('')}</div></div>${foot()}</div>`;
    document.title = '搜索 · AI脉络'; wire(); if (!NARROW()) $('#sq').focus(); return;
  }
  app.innerHTML = loading('搜索结果');
  const s = await ensureSearch(); if (!ok()) return;
  let res = s.search(query, 400);
  const strict = res.filter(x => !x.partial && !x.fuzzy);
  const ft = q.full === '1' || (!strict.length && q.full !== '0');      // 名字里完全找不到时，自动到讲解正文里找
  let inText = [];
  if (ft) {
    app.innerHTML = `<div class="page"><p class="loading" role="status" id="ftp">名字里没有找到，正在讲解正文里找…</p></div>`;
    const txt = await loadFullText((d, n) => { const el = $('#ftp'); if (el) el.textContent = `正在讲解正文里找…（${d} / ${n}）`; }).catch(() => null);
    if (!ok()) return;
    if (txt) {
      const words = s.queryTerms(query), have = new Set(strict.filter(x => x.k === 'n').map(x => x.id));
      const hit = (t, w) => t.includes(w) || (s.synOf[w] || []).some(a => t.includes(a));
      for (const n of G.nodes) if (!have.has(n.id) && txt[n.id] && words.every(w => hit(txt[n.id], w))) inText.push({k: 'n', id: n.id, t: n.title, date: n.date, track: n.track, tier: n.tier, sc: 5, deep: true});
      inText.sort((a, b) => a.tier - b.tier || (a.date < b.date ? 1 : -1));
      const deep = new Set(inText.map(x => x.id));
      res = res.filter(x => !((x.partial || x.fuzzy) && x.k === 'n' && deep.has(x.id)));
    }
  }
  const fuzzy = res.filter(x => x.fuzzy), good = res.filter(x => !x.fuzzy);
  const nodesAll = good.filter(x => x.k === 'n'), others = good.filter(x => x.k !== 'n' && x.k !== 't' && !x.partial), termHits = good.filter(x => x.k === 't' && !x.partial).slice(0, 6);
  let best = good.filter(x => !x.partial && x.sc >= 92 && x.k !== 't').slice(0, 3);      // 名字或别名完全对上的；可能不止一个（同名、同缩写）
  if (!best.length && good[0] && !good[0].partial && good[0].sc >= 60 && good[0].k !== 't') best = [good[0]];
  const bestKeys = new Set(best.map(x => x.k + x.id));
  let ns = nodesAll.filter(x => !bestKeys.has('n' + x.id));
  const tracksHit = G.tracks.filter(t => [...nodesAll, ...inText].some(x => x.track === t.key));
  const flt = l => l.filter(x => (!q.track || x.track === q.track) && (!q.tier || x.tier <= +q.tier));
  const byDate = l => q.sort === 'date' ? [...l].sort((a, b) => a.date < b.date ? -1 : 1) : l;
  const exact = byDate(flt(ns.filter(x => !x.partial))), part = byDate(flt(ns.filter(x => x.partial))), deepHits = byDate(flt(inText));
  const need = [...best.filter(x => x.k === 'n'), ...exact.slice(0, 20), ...part.slice(0, 8), ...deepHits.slice(0, 12)].map(x => byId[x.id]);      // 只取会直接显示出来的那些行的摘要
  await needBrief(need); await Promise.all(best.filter(x => x.k === 'c').map(x => conceptBody(x.id))); if (!ok()) return;
  const link = o => { const p = new URLSearchParams({...q, ...o}); for (const [k, v] of [...p]) if (!v) p.delete(k); return '#/search?' + p; };
  const rows = (title, list, note, cap = 20) => list.length ? `<section class="sec"><div class="sec-h"><h2>${title}</h2><span class="muted">${list.length} 个${note ? ' · ' + note : ''}</span></div>
    <ul class="rows">${list.slice(0, cap).map(it => row(byId[it.id], {track: true})).join('')}</ul>${list.length > cap ? `<details class="fold in"><summary><b>再显示 ${Math.min(list.length, 200) - cap} 个</b></summary><ul class="rows">${list.slice(cap, 200).map(it => `<li class="row t${it.tier} hue" ${hue(it.track)}><div class="d">${fmtDate(it.date)}<br>${esc(trackBy[it.track].short)}</div><div class="b"><a class="t" href="#/n/${enc(it.id)}">${esc(it.t)}</a></div>${stBtn(it.id)}</li>`).join('')}</ul></details>` : ''}</section>` : '';
  const bestCard = it => {
    if (it.k === 'n') { const n = byId[it.id]; return `<div class="bestc hue" ${hue(n.track)}><div class="kd">${KIND[n.kind]} · ${fmtDate(n.date)} · ${esc(trackBy[n.track].name)} · ${TIER[n.tier]} ${revBadge(n)}</div><h3><a href="#/n/${enc(n.id)}">${esc(n.title)}</a></h3>${n.full ? `<div class="f">${esc(n.full)}</div>` : ''}
      ${n.problem ? `<p><b>问题</b>　${inline(n.problem)}</p><p><b>方法</b>　${inline(n.idea)}</p>` : ''}
      <div class="toolbar"><a class="btn fill sm" href="#/n/${enc(n.id)}">读讲解</a><a class="btn sm" href="#/from/${enc(n.id)}">从零读到它</a><a class="btn sm" href="#/map?focus=${enc(n.id)}&view=tree">看它的前后关系</a></div></div>`; }
    if (it.k === 'c') { const c = concepts[it.id]; return `<div class="bestc"><div class="kd">${c.area === 'idea' ? `研究思路 · ${c.n}个相关节点` : `概念 · ${AREA[c.area]} · ${LEVEL[c.level]}`}</div><h3><a href="#/c/${c.key}">${esc(c.name)}</a></h3><div class="f">${esc(c.en || '')}</div><p>${inline(c.short || '')}</p>
      <div class="toolbar"><a class="btn fill sm" href="#/c/${c.key}">读词条</a><a class="btn sm" href="#/from/c/${c.key}">从零学到它</a><a class="btn sm" href="#/map?c=${c.key}&view=tree">看它在树上的位置</a></div></div>`; }
    if (it.k === 's') { const st = storyBy[it.id]; return `<div class="bestc"><div class="kd">研究专题 · ${st.nodes.length}站</div><h3><a href="#/story/${st.key}">${esc(st.title)}</a></h3><p>${esc(st.question)}</p><div class="toolbar"><a class="btn fill sm" href="#/story/${st.key}">读专题</a></div></div>`; }
    if (it.k === 'tr') { const t = trackBy[it.id]; return `<div class="bestc hue" ${hue(t.key)}><div class="kd">分支 · ${order[t.key].length}个节点 · ${G.threads[t.key].length}条主题线</div><h3><a href="#/track/${t.key}">${esc(t.name)}</a></h3><p>${esc(t.question)}</p><div class="toolbar"><a class="btn fill sm" href="#/track/${t.key}">进入这条分支</a><a class="btn sm" href="#/map?only=${t.key}&view=tree">在演化树上展开</a></div></div>`; }
    const th = thBy[it.track][it.th]; return `<div class="bestc hue" ${hue(it.track)}><div class="kd">主题线 · ${esc(trackBy[it.track].name)} · ${th.n}个节点</div><h3><a href="${hrefOf(it)}">${esc(th.name)}</a></h3><p>${esc(th.blurb)}</p><div class="toolbar"><a class="btn fill sm" href="${hrefOf(it)}">按时间读这条线</a></div></div>`;
  };
  const total = best.length + exact.length + others.filter(x => !bestKeys.has(x.k + x.id)).length + deepHits.length;
  const otherList = others.filter(x => !bestKeys.has(x.k + x.id));
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">搜索</div>${form}
    <p class="lead s" role="status">${total ? `“${esc(query)}”：${best.length ? `${best.length}个最接近的，` : ''}另有${exact.length + deepHits.length}个节点、${otherList.length}条概念、思路或主题线${part.length ? `；${part.length}个只匹配了部分关键词` : ''}` : fuzzy.length ? `没有叫“${esc(query)}”的条目。` : `没有找到“${esc(query)}”。`}</p></div>
    ${fuzzy.length ? `<section class="sec"><div class="sec-h"><h2>你是不是想找</h2><span class="muted">拼写相近</span></div><div class="toolbar">${fuzzy.slice(0, 10).map(x => `<a class="btn sm" href="${hrefOf(x)}">${esc(x.t)}<small>${esc(kindLabel(x))}</small></a>`).join('')}</div></section>` : ''}
    ${best.length ? `<section class="sec"><div class="sec-h"><h2>${best.length > 1 ? `“${esc(query)}”可能指` : '最接近的结果'}</h2></div><div class="bests">${best.map(bestCard).join('')}</div></section>` : ''}
    ${otherList.length ? `<section class="sec"><div class="sec-h"><h2>概念、研究思路与主题线</h2><span class="muted">${otherList.length} 条</span></div><div class="cgrid">${otherList.slice(0, 18).map(it => `<a href="${hrefOf(it)}"><span class="lv w">${it.k === 'th' ? '线' : it.k === 'tr' ? '分支' : it.k === 's' ? '专题' : it.area === 'idea' ? '思路' : '概念'}</span><span>${esc(it.t)}<small>${esc(it.s.replace(/^[^·]+· /, '').slice(0, 40))}</small></span></a>`).join('')}</div></section>` : ''}
    ${nodesAll.length + inText.length > 8 ? `<details class="fold filt" ${q.track || q.tier || q.sort ? 'open' : ''}><summary><b>筛选和排序</b></summary>
      <div class="toolbar"><label>显示</label><span class="seg">${[['', '全部'], ['1', '主干'], ['2', '主干+重要']].map(([v, l]) => `<a class="btn sm ${(q.tier || '') === v ? 'on' : ''}" href="${link({tier: v})}">${l}</a>`).join('')}</span>
      <label>排序</label><span class="seg"><a class="btn sm ${q.sort === 'date' ? '' : 'on'}" href="${link({sort: ''})}">相关度</a><a class="btn sm ${q.sort === 'date' ? 'on' : ''}" href="${link({sort: 'date'})}">时间</a></span></div>
      ${tracksHit.length > 1 ? `<div class="toolbar"><label>分支</label><a class="btn sm ${q.track ? '' : 'on'}" href="${link({track: ''})}">全部</a>${tracksHit.map(t => `<a class="btn sm ${q.track === t.key ? 'on' : ''}" href="${link({track: t.key})}">${esc(t.short)}</a>`).join('')}</div>` : ''}</details>` : ''}
    ${rows('节点', exact)}${rows('讲解正文里提到', deepHits, '名字里没有这个词，正文里有', 12)}${rows('只匹配了部分关键词', part, '没有同时包含所有词的结果时作为补充', 8)}
    ${termHits.length ? `<section class="sec"><div class="sec-h"><h2>术语</h2></div><p class="tags">${termHits.map(x => `<a class="chip c" href="#/n/${enc(x.id)}">${esc(x.t)}<small style="margin-left:4px;opacity:.7">${esc(x.s.replace('术语 · ', ''))}</small></a>`).join(' ')}</p></section>` : ''}
    ${total ? `<section class="sec"><div class="toolbar"><button class="btn sm" id="showtree">把这些结果画到演化树上</button>${ft ? '' : `<a class="btn sm" href="${link({full: '1'})}">在讲解正文里再找一遍（较慢）</a>`}</div><div class="tscroll" id="stree" hidden></div></section>` : ''}
    ${!total || total < 3 ? `<section class="sec"><div class="note"><h4>没找到想要的？</h4><p>换个叫法试试：英文原名或缩写、作者的姓、机构名。站内收了${G.nodes.length}个节点，太新或太细的工作可能还没有。${ft ? '' : `<a class="u" href="${link({full: '1'})}">在讲解正文里再找一遍</a>，或者`}<a class="u" href="${REPO}/issues/new?title=${enc('[建议收录] ' + query)}&body=${enc('想找但没找到的内容：' + query + '\n\n它是什么（论文、模型、概念…），有链接的话请贴上：\n')}" target="_blank" rel="noopener">告诉我们该收录它</a>。</p></div></section>` : ''}
    ${foot()}</div>`;
  document.title = `${query} · 搜索 · AI脉络`;
  wire();
  const tq = $('#q'); if (tq) tq.value = query;
  const sb = $('#showtree');
  if (sb) sb.onclick = async () => { sb.textContent = '正在画…'; const topic = await topicSet(query, res); if (!ok()) return; sb.remove(); const box = $('#stree'); box.hidden = false; setTree(box, topic.ids); };
}

/* ——— 我的进度 ——— */
async function viewMe(_, q, __, ok) {
  const reading = G.nodes.filter(n => status(n.id) === 1), marked = G.nodes.filter(n => marks[n.id]), noted = G.nodes.filter(n => notes[n.id]), done = G.nodes.filter(n => status(n.id) === 2);
  await needBrief([...reading, ...marked]); if (!ok()) return;
  const t1 = doneStat(G.nodes.filter(n => n.tier === 1).map(n => n.id)), intro = doneStat(((G.routes.intro || {}).steps || []).map(s => s.node).filter(i => byId[i]));
  const cdone = Object.keys(concepts).filter(k => status('c:' + k) === 2).length;
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">我的进度</div><h1>学习记录</h1>
    <div class="stats"><span><b>${intro.d}/${intro.n}</b>入门路线</span><span><b>${t1.d}/${t1.n}</b>主干</span><span><b>${done.length}</b>已读节点</span><span><b>${cdone}</b>已掌握概念</span><span><b>${noted.length}</b>笔记</span></div>
    <div class="note" style="max-width:760px"><h4>这些记录只在这个浏览器里</h4><p>进度、收藏和笔记保存在你当前浏览器的本地存储里，不会上传到任何服务器，也<b>不会</b>在手机和电脑之间同步。清除浏览数据、换浏览器或换设备都会丢失。想保留或搬到别的设备，用下面的导出和导入。</p>
      <div class="toolbar"><button class="btn sm" id="exp">导出为文件</button><button class="btn sm" id="imp">从文件导入</button><input type="file" id="impf" accept="application/json" hidden><span id="impmsg" class="muted" role="status"></span></div></div></div>
    <section class="sec"><div class="sec-h"><h2>各分支</h2><span class="muted">主干 + 重要节点里已读的</span></div><div class="grid">${G.tracks.map(t => { const s = doneStat(order[t.key].filter(i => byId[i].tier <= 2)); return `<a class="card hue" ${hue(t.key)} href="#/track/${t.key}"><h3>${esc(t.short)}</h3><div class="bar"><i style="width:${s.pct}%"></i></div><div class="n">${s.d} / ${s.n}</div></a>`; }).join('')}</div></section>
    ${reading.length ? `<section class="sec"><div class="sec-h"><h2>在读</h2><span class="muted">${reading.length}</span></div><ul class="rows">${reading.map(n => row(n, {track: true})).join('')}</ul></section>` : ''}
    ${marked.length ? `<section class="sec"><div class="sec-h"><h2>收藏</h2><span class="muted">${marked.length}</span></div><ul class="rows">${marked.map(n => row(n, {track: true})).join('')}</ul></section>` : ''}
    ${noted.length ? `<section class="sec"><div class="sec-h"><h2>笔记</h2><span class="muted">${noted.length}</span></div><ul class="limits">${noted.map(n => `<li>${chip(n.id)}<div style="margin-top:6px;white-space:pre-wrap">${esc(notes[n.id])}</div></li>`).join('')}</ul></section>` : ''}
    ${done.length ? `<section class="sec"><div class="sec-h"><h2>已读</h2><span class="muted">${done.length}</span></div><p class="tags">${done.slice(-120).reverse().map(n => chip(n.id)).join(' ')}</p></section>` : ''}
    ${!reading.length && !marked.length && !noted.length && !done.length ? '<div class="empty">还没有记录。读一个节点时，在页面底部“我的学习记录”里标记状态、收藏或写笔记；列表里每一行右边的圆点也可以点。<br><a class="btn sm" href="#/learn" style="margin-top:10px">去开始学习</a></div>' : ''}${foot()}</div>`;
  document.title = '我的进度 · AI脉络';
  $('#exp').onclick = exportAll; $('#imp').onclick = () => $('#impf').click();
  $('#impf').onchange = ev => importAll(ev.target.files[0], good => { if (good) viewMe(_, q, __, ok); else $('#impmsg').textContent = '这个文件读不出来，请选之前导出的 .json 文件。'; });
}

/* ——— 工具（次级入口）——— */
function viewTools() {
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">工具</div><h1>更多探索方式</h1><p class="lead">不在主导航里的几个功能。它们给出的是按站内数据自动算出来的结果，适合用来找线索，不要当成结论。</p></div>
    <div class="grid" style="margin-top:22px">
      <a class="card" href="#/link"><h3>两个节点之间的路径</h3><p>任选两个工作，找出图上连接它们的最短一条路径。它只是一条可能的连接，不一定是学术上最重要或最准确的演进路线。</p></a>
      <a class="card" href="#/stats"><h3>每年有多少工作</h3><p>按年份和分支统计站内收录的节点数，以及被引用关系最多的节点。反映的是本站的收录情况，不是领域的真实产出。</p></a>
      <a class="card" href="#/orgs"><h3>按机构看</h3><p>按讲解里登记的机构粗略统计，同一机构的不同写法没有完全合并。</p></a>
      <a class="card" href="#/me"><h3>我的进度</h3><p>已读、在读、收藏和笔记。只保存在这个浏览器里，可以导出。</p></a>
      <a class="card" href="about.html"><h3>关于内容与纠错</h3><p>内容是怎么来的、三种审核状态是什么意思、目前核对到什么程度、怎么报告错误。</p></a>
      <a class="card" href="design.html"><h3>设计说明</h3><p>站点的结构、数据格式和各个页面的设计，给想了解或评审这个网站的人。</p></a>
    </div>
    <div class="toolbar" style="margin-top:22px"><button class="btn sm" id="rand">随便看一个节点</button></div>${foot()}</div>`;
  document.title = '工具 · AI脉络';
  $('#rand').onclick = () => { const pool = G.nodes.filter(n => n.tier <= 2); location.hash = '#/n/' + enc(pool[Math.floor(Math.random() * pool.length)].id); };
}

/* ——— 两个节点之间的路径：沿着登记的关系，从早的走到晚的 ——— */
function linkPath(a, b) {
  // 先找有向路径（a 更早）；找不到就把边当无向的，找最短的联系
  const bfs = directed => {
    const prev = {[a]: null}; let fr = [a];
    while (fr.length && !(b in prev)) {
      const nx = [];
      for (const x of fr) {
        const es = directed ? out[x].map(e => [e.to, e]) : [...out[x].map(e => [e.to, e]), ...inn[x].map(e => [e.from, e])];
        for (const [y, e] of es) if (!(y in prev)) { prev[y] = [x, e]; nx.push(y); }
      }
      fr = nx;
    }
    if (!(b in prev)) return null;
    const steps = []; let cur = b;
    while (prev[cur]) { steps.unshift({id: cur, e: prev[cur][1], prev: prev[cur][0]}); cur = prev[cur][0]; }
    return steps;
  };
  return bfs(true) || bfs(false);
}
async function viewLink(a, q, b, ok) {
  const pick = id => byId[id] ? id : '';
  a = pick(a); b = pick(b);
  if (a && b && byId[a].date > byId[b].date) [a, b] = [b, a];
  const steps = a && b && a !== b ? linkPath(a, b) : null;
  if (steps) { await needBrief([byId[a], ...steps.map(s => byId[s.id])]); const cs = await Promise.all(steps.map(s => nodeContent(s.id).catch(() => ({})))); if (!ok()) return; steps.forEach((s, i) => s.note = (cs[i].rel || {})[s.prev] || ''); }
  const opts = G.nodes.filter(n => n.tier <= 2).map(n => `<option value="${esc(n.title)}">`).join('');
  const nameOf = id => id ? byId[id].title : '';
  const directed = steps && steps.every(s => s.e.to === s.id);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow"><a href="#/tools">工具</a> › 两个节点之间的路径</div><h1>${a && b ? `${esc(nameOf(a))} → ${esc(nameOf(b))}` : '两个工作之间隔着什么'}</h1>
    <p class="lead">选两个节点，找出站内登记的关系里连接它们的最短一条路径。</p>
    <div class="note caveat" style="max-width:760px"><h4>怎么理解这个结果</h4><p>这是图上的一条最短连接，由程序自动找出。它只说明“有这样一条关系链”，<b>不一定是学术上最重要或最准确的演进路线</b>；两个工作之间通常还有别的联系。想按顺序学某个东西，用“<a class="u" href="#/learn">从零读到它</a>”更合适。</p></div>
    <form class="toolbar" id="lf"><input class="inp" id="la" list="lopts" placeholder="起点，如 感知机" value="${esc(nameOf(a))}" aria-label="起点"><span aria-hidden="true">→</span><input class="inp" id="lb" list="lopts" placeholder="终点，如 Transformer" value="${esc(nameOf(b))}" aria-label="终点"><button class="btn sm fill">找路径</button><datalist id="lopts">${opts}</datalist></form>
    <div class="toolbar"><span class="muted">试试</span>${[['perceptron', 'transformer'], ['backprop', 'alphafold-2'], ['world-models', 'dreamzero'], ['alexnet', 'sora']].filter(([x, y]) => byId[x] && byId[y]).map(([x, y]) => `<a class="btn sm" href="#/link/${x}/${y}">${esc(byId[x].title)} → ${esc(byId[y].title)}</a>`).join('')}</div></div>
    ${a && b ? (steps ? `<section class="sec"><div class="sec-h"><h2>${steps.length} 步</h2><span class="muted">${directed ? '每一步都是较晚的工作与较早的工作之间登记的关系' : '两者之间没有一条顺着时间的关系链，这是经由共同相关工作的最短联系'}</span></div>
      <ul class="rows">${row(byId[a], {track: true, full: true})}${steps.map(s => `<li class="hop"><span class="ty ${s.e.type}">${s.e.to === s.id ? '' : '← '}${REL[s.e.type]}</span><span>${inline(s.note || '')}</span></li>${row(byId[s.id], {track: true, full: true})}`).join('')}</ul></section>`
      : `<div class="empty">站内登记的关系里没有找到连接这两个节点的路径。</div>`) : ''}
    ${foot()}</div>`;
  document.title = '两个节点之间的路径 · AI脉络';
  $('#lf').onsubmit = ev => {
    ev.preventDefault();
    const find = v => { v = v.trim().toLowerCase(); if (!v) return ''; const hit = G.nodes.find(n => n.title.toLowerCase() === v || n.id === v) || G.nodes.find(n => n.title.toLowerCase().includes(v)); return hit ? hit.id : ''; };
    const x = find($('#la').value), y = find($('#lb').value);
    if (x && y) location.hash = `#/link/${enc(x)}/${enc(y)}`;
    else ($('#la').value.trim() && !x ? $('#la') : $('#lb')).focus();
  };
}

/* ——— 统计、机构 ——— */
function viewStats() {
  const y0 = 1943, y1 = Math.max(...G.nodes.map(n => n.y)), cols = [];
  for (let y = y0; y <= y1; y++) cols.push(G.tracks.map(t => (yearCount[t.key][y] || 0)));
  const max = Math.max(...cols.map(c => c.reduce((a, b) => a + b, 0))), W = 1100, H = 300, bw = W / cols.length;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const col = t => `hsl(${t.hue} ${t.sat != null ? t.sat : dark ? 55 : 48}% ${dark ? 62 : 46}%)`;
  let bars = '';
  cols.forEach((c, i) => { let y = H; c.forEach((v, k) => { if (!v) return; const h = v / max * (H - 10); y -= h; bars += `<a href="#/year/${y0 + i}"><rect x="${(i * bw + 0.5).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${col(G.tracks[k])}"><title>${y0 + i}年 · ${G.tracks[k].name} ${v}</title></rect></a>`; }); });
  const ticks = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(y => `<text x="${((y - y0 + 0.5) * bw).toFixed(1)}" y="${H + 16}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${y}</text>`).join('');
  const top = (adj, n) => G.nodes.map(x => [x, adj[x.id].length]).sort((a, b) => b[1] - a[1]).slice(0, n);
  const et = {}; G.edges.forEach(e => et[e.type] = (et[e.type] || 0) + 1);
  const kinds = {}; G.nodes.forEach(n => kinds[n.kind] = (kinds[n.kind] || 0) + 1);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow"><a href="#/tools">工具</a> › 统计</div><h1>站内收录情况</h1>
    <p class="lead s">这些数字描述的是本站收了什么，不是整个领域的真实产出：越近的年份收得越细。</p>
    <div class="stats"><span><b>${G.nodes.length}</b>节点</span><span><b>${G.edges.length}</b>关系</span>${Object.entries(REL).map(([k, l]) => `<span><b>${et[k] || 0}</b>${l}</span>`).join('')}</div>
    <div class="stats">${Object.entries(KIND).map(([k, l]) => `<span><b>${kinds[k] || 0}</b>${l}</span>`).join('')}</div>
    <div class="stats"><span><b>${core.review.source}</b>来源已核对</span><span><b>${core.review.human}</b>人工复核</span><span><b>${G.nodes.length - core.review.source - core.review.human}</b>待核对</span><span><b>${core.review.edges}</b>条关系已核对</span></div></div>
    <section class="sec"><div class="sec-h"><h2>每年收录了多少工作</h2><span class="muted">按分支上色，点一根柱子看那一年</span></div>
      <svg viewBox="0 0 ${W} ${H + 22}" style="width:100%;height:auto;margin-top:10px" role="img" aria-label="1943年至今每年收录的节点数，按分支堆叠">${bars}${ticks}</svg>
      <div class="tags" style="margin-top:8px">${G.tracks.map(t => `<a class="chip hue" ${hue(t.key)} href="#/track/${t.key}">${esc(t.short)} ${order[t.key].length}</a>`).join('')}</div></section>
    <section class="sec"><div class="two"><div><div class="sec-h"><h2>后续关系最多</h2></div><ul class="rels">${top(out, 30).map(([n, c]) => `<li><span class="ty extends">${c}</span><div>${chip(n.id)}<span class="yr">${fmtDate(n.date)}</span></div></li>`).join('')}</ul></div>
      <div><div class="sec-h"><h2>前驱关系最多</h2></div><ul class="rels">${top(inn, 30).map(([n, c]) => `<li><span class="ty uses">${c}</span><div>${chip(n.id)}<span class="yr">${fmtDate(n.date)}</span></div></li>`).join('')}</ul></div></div></section>${foot()}</div>`;
  document.title = '统计 · AI脉络';
}
async function viewOrgs(_, q, __, ok) {
  app.innerHTML = loading();
  await ensureSearch(); if (!ok()) return;
  const cnt = {};
  for (const n of G.nodes) {
    const org = (n.who || '').split('·')[1]; if (!org) continue;
    for (let o of org.split(/[\/、,，;；&]| and /)) { o = o.trim().replace(/[。.]$/, ''); if (o.length >= 2 && o.length <= 40) (cnt[o] ||= []).push(n); }
  }
  const list = Object.entries(cnt).filter(e => e[1].length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 150);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow"><a href="#/tools">工具</a> › 机构</div><h1>按机构看</h1><p class="lead">按讲解里登记的机构粗略统计，同一机构的不同写法没有完全合并，数字只供参考。点开看它名下的节点。</p></div>
    <section class="sec"><div class="cgrid">${list.map(([o, ns]) => `<a href="#/search?q=${enc(o)}&sort=date"><span class="lv w">${ns.length}</span><span>${esc(o)}<small>${ns[0].date.slice(0, 4)}–${ns[ns.length - 1].date.slice(0, 4)} · 主干 ${ns.filter(n => n.tier === 1).length}</small></span></a>`).join('')}</div></section>${foot()}</div>`;
  document.title = '机构 · AI脉络';
}
/* ——— 演化树：大方向 → 分支 → 主题线 → 节点 ———
   布局在抽象坐标里算：t 是时间轴上的位置，c 是横断方向的位置。横向（时间从左到右）和竖向（根在下、往上长）只在最后映射成像素时不同。 */
const TREE0 = 1943, MAXW = 190;
const sideW = () => NARROW() ? 100 : 168;      // 行名列的宽度：手机上收窄，把地方留给树
let treeState = Object.assign({tier: 2, dir: '', zoom: 0, open: [], joins: true}, store.get('tree', {}));
const deg = id => inn[id].length + out[id].length;
const _lm = {}, _tw = {}; let _mc, _ff;
function landmarks(k) {      // 收起的分支上标出的节点：主干节点，不足3个时用连接最多的“重要”节点补足
  if (_lm[k]) return _lm[k];
  const ns = order[k].map(i => byId[i]), a = ns.filter(n => n.tier === 1);
  const b = ns.filter(n => n.tier === 2).sort((x, y) => deg(y.id) - deg(x.id)).slice(0, Math.max(0, 3 - a.length));
  return _lm[k] = new Set([...a, ...b].map(n => n.id));
}
function textW(s, bold) {
  const key = (bold ? 'b' : 'n') + s;
  if (_tw[key]) return _tw[key];
  if (!_mc) { _mc = document.createElement('canvas').getContext('2d'); _ff = getComputedStyle(document.body).fontFamily; }
  _mc.font = `${bold ? '700 12.5px' : '12px'} ${_ff}`;
  return _tw[key] = Math.ceil(_mc.measureText(s).width);
}
function lineage(id, depth) {
  // 往前（它建立在什么之上）和往后（谁接着做）各走 depth 层；tree 只保留把每一层连到下一层的边，避免枢纽节点糊成一团
  const set = new Set([id]), tree = new Set();
  const walk = (adj, key) => {
    const lvl = {[id]: 0}; let fr = [id];
    for (let d = 0; d < depth && fr.length; d++) {
      const nx = [];
      for (const x of fr) for (const e of adj[x]) {
        const y = e[key];
        if (lvl[y] === undefined && !set.has(y)) { lvl[y] = d + 1; set.add(y); nx.push(y); }
        if (lvl[y] === d + 1) tree.add(e);
      }
      fr = nx;
    }
  };
  walk(inn, 'from'); walk(out, 'to');
  return {set, tree};
}

/* o: {dir, zoom(0=适应), fit, tier, open[], tracks[]（只画这些分支）, nodes:Set（只画这些节点，来龙去脉模式）, y0, bands（代替时代的分段）, mini} */
function treeLayout(o) {
  const Hz = o.dir !== 'v', flt = o.nodes || null, open = new Set(o.open || []), mini = !!o.mini;
  const maxY = G.eras[G.eras.length - 1].to, y0 = Math.max(TREE0 - 1, o.y0 || 0);
  const yr = n => Math.min(maxY, Math.max(y0, n.y));
  const lanes = [], laneOf = {}, thLane = {};
  const core = G.groups.findIndex(g => g.key === 'core');
  G.groups.forEach((g, gi) => {
    let ks = g.tracks.filter(k => (!o.tracks || o.tracks.includes(k)) && (!flt || order[k].some(id => flt.has(id))));
    if (!ks.length) return;
    if (gi < core) ks = ks.slice().reverse();          // 树干之前的大方向倒着排，让更早的分支贴着树干
    if (!mini && !o.tracks) lanes.push({type: 'group', g});
    for (const k of ks) {
      if (!flt && !open.has(k)) {
        const lm = landmarks(k);
        lanes.push(laneOf[k] = {type: 'track', k, nodes: mini ? [] : order[k].map(i => byId[i]).filter(n => lm.has(n.id))});
        continue;
      }
      if (!flt) lanes.push(laneOf[k] = {type: 'head', k, nodes: []});
      thLane[k] = {};
      for (const th of G.threads[k] || []) {
        const ns = th.ids.map(i => byId[i]).filter(n => flt ? flt.has(n.id) : n.tier <= o.tier);
        if (flt && !ns.length) continue;
        lanes.push(thLane[k][th.key] = {type: 'thread', k, th, nodes: ns});
      }
    }
  });

  // 非线性时间轴：一年的长度随“这一年最挤的那一行有几个节点”增长，空年份压得很短
  const cnt = {}, sum = {};          // cnt：这一年最挤的那一行有几个；sum：这一年总共画几个
  if (mini) G.nodes.forEach(n => { sum[yr(n)] = (sum[yr(n)] || 0) + .12; });
  for (const l of lanes) {
    const c = {};
    for (const n of l.nodes || []) { c[yr(n)] = (c[yr(n)] || 0) + 1; sum[yr(n)] = (sum[yr(n)] || 0) + 1; }
    for (const y in c) cnt[y] = Math.max(cnt[y] || 0, c[y]);
  }
  const base = y => Hz ? (sum[y] ? Math.min(200, 6 + 30 * Math.pow(sum[y], .7)) : 4) : (cnt[y] ? 8 + 23 * Math.min(cnt[y], 14) : 6);
  let total = 0;
  for (let y = y0; y <= maxY; y++) total += base(y);
  const z = o.zoom || (Hz ? Math.max(mini ? 0 : .2, Math.min(1, (o.fit || 1200) / total)) : 1);
  const off = {}, ext = {};
  let T = mini ? 6 : 28;
  for (let y = y0; y <= maxY; y++) { off[y] = T; ext[y] = base(y) * z; T += ext[y]; }
  T += mini ? 12 : 34;
  const tD = d => { const yy = +d.slice(0, 4), y = Math.min(maxY, Math.max(y0, yy)), m = +(d.slice(5, 7) || 0); return off[y] + ext[y] * (yy < y0 ? .5 : ((m ? m - 1 : 5.5) + .5) / 12); };
  const tOf = n => tD(n.date);
  const tY = y => { const f = Math.floor(y), yy = Math.min(maxY, Math.max(y0, f)); return off[yy] + ext[yy] * Math.min(1, Math.max(0, y - yy)); };
  const inv = t => { for (let y = y0; y <= maxY; y++) if (t < off[y] + ext[y]) return y + Math.max(0, (t - off[y]) / ext[y]); return maxY + .99; };

  // 行内装箱：标签沿时间方向占一段区间，放不下就换到下一子行，保证不重叠
  const U = Hz ? 25 : 126, pos = {}, blocks = [];
  let C = mini ? 4 : 8, blk = null;
  for (const l of lanes) {
    if (blk && l.type !== 'thread') { blk.c1 = C; blk = null; }
    l.c = C;
    if (l.type === 'group') { l.size = Hz ? 20 : 0; C += l.size + (Hz ? 0 : 18); continue; }
    if (mini) { l.size = o.lane || 15; l.rail = l.size / 2; C += l.size; continue; }
    if (l.type === 'head') { l.size = Hz ? 24 : 30; l.rail = l.size / 2; blocks.push(blk = {k: l.k, c0: C}); C += l.size; continue; }
    const pad = Hz ? (l.type === 'track' ? 6 : 4) : 6, rows = [];
    const items = l.nodes.map(n => ({n, t: tOf(n), len: Hz ? Math.min(MAXW, 24 + textW(n.title, n.tier === 1)) : (n.tier === 1 ? 26 : 22)}))
      .sort((a, b) => Hz ? a.n.tier - b.n.tier || a.t - b.t : a.t - b.t);
    if (!Hz) items.forEach((it, i) => { if (i) it.t = Math.max(it.t, items[i - 1].t + (items[i - 1].len + it.len) / 2 + 2); });      // 竖向：一列里按时间往上叠，不分子列
    for (const it of items) {
      const a = Hz ? it.t - 9 : it.t - it.len / 2, b = a + it.len + (Hz ? 5 : 2);
      let s = 0;
      for (; ; s++) { const r = rows[s] ||= []; if (!r.some(v => a < v[1] && b > v[0])) { r.push([a, b]); break; } }
      it.sub = s;
      pos[it.n.id] = {t: it.t, c: l.c + pad + s * U + (Hz ? U / 2 : 9), it, l};
    }
    l.items = items; l.pad = pad;
    l.size = Math.max(1, rows.length) * U + pad * 2;
    l.rail = pad + (Hz ? U / 2 : 9);
    C += l.size;
  }
  if (blk) blk.c1 = C;
  C += mini ? 4 : 18;
  for (const id in pos) T = Math.max(T, Hz ? pos[id].t - 9 + pos[id].it.len + 16 : pos[id].t + 40);      // 最靠后的标签不能被截掉
  if (!Hz) {                                          // 竖向：大方向标签要横跨它下面的所有列
    const gs = lanes.filter(l => l.type === 'group');
    gs.forEach((l, i) => { l.c1 = (gs[i + 1] ? gs[i + 1].c - 18 : C - 18); });
  }

  // 轨道、分叉、密度带
  const rails = [], forks = [], bands = [], roots = [], fw = Math.max(14, Math.min(46, 70 * z));
  if (!flt) {
    for (const l of lanes) {
      if (l.type === 'group') continue;
      const ids = l.type === 'thread' ? l.th.ids : order[l.k];
      if (!ids.length) continue;
      const last = byId[ids[ids.length - 1]], fk = G.forks[l.k] || {};
      l.a = tD(byId[ids[0]].date); l.s = l.a;
      if (l.type !== 'thread' && fk.from && byId[fk.at]) l.s = Math.max(l.a, tD(byId[fk.at].date));
      l.active = last.y >= maxY - 2; l.endY = last.y;
      l.b = l.active ? T - 10 : tOf(last) + 10;
      rails.push(l);
    }
    for (const l of rails) {
      if (l.type === 'thread') {
        const p = (l.th.from && thLane[l.k][l.th.from]) || laneOf[l.k];
        if (!p || p.a == null) continue;
        const via = byId[l.th.via];
        let t = via ? Math.min(tD(via.date), l.a) : l.a;
        t = Math.max(t, Math.min(l.a, p.a + fw));
        l.lead = t;
        forks.push({k: l.k, p, l, t, thin: true});
      } else {
        const fk = G.forks[l.k] || {}, p = fk.from && laneOf[fk.from];
        if (p && p.a != null) forks.push({k: l.k, p, l, t: Math.max(l.s, p.a + fw)});
        else if (!fk.from && !o.tracks) roots.push(l);
      }
    }
    for (const l of lanes) {
      if (l.type !== 'track') continue;
      const yc = yearCount[l.k], amp = mini ? l.size / 2 - 1.5 : 11, up = [], dn = [];
      for (let y = y0; y <= maxY; y++) {
        const c = yc[y] || 0, prev = yc[y - 1] || 0, next = yc[y + 1] || 0;
        if (!c && !prev && !next) continue;
        const h = c ? 1.2 + amp * Math.sqrt(c / yearPeak) : 0, t = off[y] + ext[y] / 2, cc = l.c + l.rail;
        up.push([t, cc - h]); dn.unshift([t, cc + h]);
      }
      if (up.length > 1) bands.push({k: l.k, up, dn});
    }
  }

  // 时间轴上的分段（时代，或某条分支自己的阶段）和年份刻度
  const src = o.bands || G.eras, stripes = !o.bands;
  const spans = src.map(e => ({e, a: e.from <= Math.max(y0, TREE0) ? off[y0] : tY(e.from), b: e.to >= maxY ? off[maxY] + ext[maxY] : tY(e.to + 1)})).filter(s => s.b > s.a);
  if (!stripes) spans.forEach((s, i) => { s.b = spans[i + 1] ? Math.max(s.a + 1, spans[i + 1].a) : off[maxY] + ext[maxY]; });
  const ticks = [];
  let lastT = -99;
  for (let y = y0; y <= maxY; y++) {
    if (off[y] - lastT >= (Hz ? 40 : 28) && (ext[y] >= (Hz ? 30 : 20) || y % 5 === 0 || y === y0)) { ticks.push({y, t: off[y], label: y < TREE0 ? '更早' : y}); lastT = off[y]; }
  }
  return {Hz, mini, T, C, U, z, fw, lanes, laneOf, thLane, pos, rails, forks, roots, bands, blocks, spans, stripes, ticks, tD, tOf, tY, inv, flt, embed: !!o.tracks};
}

/* 把布局画成一段HTML。o: {joins, edges:Set（来龙去脉模式下常显的边）, hl（高亮的主题线key）, side} */
function treeDraw(L, o = {}) {
  const Hz = L.Hz, mini = L.mini;
  const SIDE = mini ? (o.side ?? 60) : Hz ? sideW() : 58, TOP = mini ? 0 : Hz ? 44 : 76;
  const X = (t, c) => Hz ? SIDE + t : SIDE + c, Y = (t, c) => Hz ? TOP + c : TOP + L.T - t;
  const P = (t, c) => X(t, c).toFixed(1) + ' ' + Y(t, c).toFixed(1);
  const W = Math.ceil(SIDE + (Hz ? L.T : L.C)), H = Math.ceil(TOP + (Hz ? L.C : L.T));
  const rect = (t0, t1, c0, c1, cls, extra = '') => `<rect class="${cls}" x="${Math.min(X(t0, c0), X(t1, c1)).toFixed(1)}" y="${Math.min(Y(t0, c0), Y(t1, c1)).toFixed(1)}" width="${Math.abs(X(t1, c1) - X(t0, c0)).toFixed(1)}" height="${Math.abs(Y(t1, c1) - Y(t0, c0)).toFixed(1)}" ${extra}/>`;
  const hv = k => `style="--h:${trackBy[k].hue}"`;
  const curve = (t1, c1, t2, c2) => { const d = Math.max(16, Math.abs(t2 - t1) / 2); return `M${P(t1, c1)}C${P(t1 + d, c1)} ${P(t2 - d, c2)} ${P(t2, c2)}`; };
  let s = '';
  if (L.stripes) L.spans.forEach((sp, i) => { s += rect(sp.a, sp.b, 0, L.C, 'tera' + (i % 2 ? ' alt' : '')); });
  else L.spans.forEach(sp => { s += `<path class="tstage" d="M${P(sp.a, 0)}L${P(sp.a, L.C)}"/>`; });
  if (!L.embed) for (const b of L.blocks) s += rect(0, L.T, b.c0, b.c1, 'tblock hue', hv(b.k));
  for (const l of L.lanes) {
    if (l.type === 'group' && Hz) s += `<path class="tgl" d="M${P(0, l.c + 4)}L${P(L.T, l.c + 4)}"/>`;
    if (l.type === 'thread' && o.hl === l.th.key) s += rect(0, L.T, l.c, l.c + l.size, 'thl hue', hv(l.k));
  }
  for (const b of L.bands) s += `<path class="tband hue" ${hv(b.k)} d="M${b.up.map(p => P(p[0], p[1])).join('L')}L${b.dn.map(p => P(p[0], p[1])).join('L')}Z"/>`;
  if (L.roots.length > 1) {
    const cs = L.roots.map(l => l.c + l.rail), t0 = mini ? 3 : 10;
    s += `<path class="troot" d="M${P(t0, Math.min(...cs))}L${P(t0, Math.max(...cs))}"/>`;
    for (const l of L.roots) if (l.a > t0 + 2) s += `<path class="troot thin" d="M${P(t0, l.c + l.rail)}L${P(l.a, l.c + l.rail)}"/>`;
  }
  for (const f of L.forks) {
    const cp = f.p.c + f.p.rail, cc = f.l.c + f.l.rail, w = L.fw, m = f.t - w / 2, g = cc > cp ? 1 : -1, r = Math.min(Math.abs(cc - cp) / 2, w / 2);
    s += `<path class="tfork${f.thin ? ' thin' : ''} hue" ${hv(f.k)} d="M${P(f.t - w, cp)}Q${P(m, cp)} ${P(m, cp + g * r)}L${P(m, cc - g * r)}Q${P(m, cc)} ${P(f.t, cc)}"/>`;
  }
  for (const l of L.rails) {
    const c = l.c + l.rail, cls = `trail ${l.type}${trackBy[l.k].g && trackBy[l.k].g.key === 'core' ? ' core' : ''} hue`;
    const a = l.type === 'head' ? l.a - L.fw - 8 : (l.lead ?? l.a), s0 = Math.max(a, l.s);
    if (s0 > a + 1) s += `<path class="${cls} pre" ${hv(l.k)} d="M${P(a, c)}L${P(s0, c)}"/>`;
    s += `<path class="${cls}" ${hv(l.k)} d="M${P(s0, c)}L${P(l.b, c)}"/>`;
    if (l.active) s += `<path class="tarrow hue" ${hv(l.k)} d="M${P(l.b + 8, c)}L${P(l.b, c - 4)}L${P(l.b, c + 4)}Z"/>`;
    else if (!mini) s += `<path class="${cls}" ${hv(l.k)} d="M${P(l.b, c - 5)}L${P(l.b, c + 5)}"/><text class="tend" x="${(X(l.b, c) + (Hz ? 6 : 7)).toFixed(1)}" y="${(Y(l.b, c) + (Hz ? 4 : -4)).toFixed(1)}">止于${l.endY}</text>`;
  }
  if (L.flt) for (const l of L.lanes) {      // 过滤后的树：每条主题线画一根细枝，从它最早的节点连到最晚的节点
    if (l.type !== 'thread' || l.nodes.length < 2) continue;
    const ts = l.nodes.map(n => L.pos[n.id].t), c = l.c + l.rail;
    s += `<path class="trail thread hue" ${hv(l.k)} d="M${P(Math.min(...ts) - 10, c)}L${P(Math.max(...ts), c)}"/>`;
  }
  const anchor = id => {
    const n = byId[id]; if (!n) return null;
    if (L.pos[id]) return L.pos[id];
    const l = (L.thLane[n.track] && L.thLane[n.track][n.th]) || L.laneOf[n.track];
    return l && l.rail != null ? {t: L.tOf(n), c: l.c + l.rail, off: true} : null;
  };
  if (o.joins) for (const j of G.joins) {
    if ([j.from, j.to].some(id => (L.laneOf[byId[id].track] || {}).type !== 'track')) continue;      // 只在两端都收起时画，展开的分支里不添乱
    const A = anchor(j.from), B = anchor(j.to);
    if (!A || !B) continue;
    s += `<path class="tjoin" d="${curve(A.t, A.c, B.t, B.c)}"><title>${esc(byId[j.from].title)} → ${esc(byId[j.to].title)}：${esc(j.label)}</title></path>`;
    for (const q of [A, B]) if (q.off) s += `<circle class="tjd" cx="${X(q.t, q.c).toFixed(1)}" cy="${Y(q.t, q.c).toFixed(1)}" r="2.6"/>`;
  }
  if (o.edges) for (const e of o.edges) {
    const A = L.pos[e.from], B = L.pos[e.to];
    if (A && B) s += `<path class="e ${e.type}" d="${curve(A.t, A.c, B.t, B.c)}"/>`;
  }
  if (mini) {
    for (const l of L.lanes) {
      if (l.type !== 'track') continue;
      for (const id of order[l.k]) { const n = byId[id]; if (n.tier === 1) s += `<circle class="tdot hue" ${hv(l.k)} cx="${X(L.tOf(n), 0).toFixed(1)}" cy="${Y(0, l.c + l.rail).toFixed(1)}" r="2.6"><title>${esc(n.title)} · ${n.date}</title></circle>`; }
      s += `<text class="tmn hue" ${hv(l.k)} x="${SIDE - 8}" y="${(l.c + l.rail + 4).toFixed(1)}" text-anchor="end">${esc(trackBy[l.k].short)}</text>`;
    }
    for (const k of L.ticks) if (k.y % 10 === 0 || k.y >= 2010) s += `<text class="tmy" x="${X(k.t, 0).toFixed(1)}" y="${H + 11}">${k.label}</text>`;
    return {W, H: H + 14, svg: `<svg class="tmini" viewBox="0 0 ${W} ${H + 14}" width="${W}" height="${H + 14}" role="img" aria-label="AI各条分支从1943年到今天的总览：每条线是一条分支，圆点是主干节点">${s}</svg>`};
  }

  // 行名
  const lab = l => {
    const t = trackBy[l.k];
    if (l.type === 'group') return `<span class="tl g" title="${esc(l.g.blurb)}">${esc(l.g.name)}</span>`;
    if (l.type === 'thread') return `<a class="tl th${o.hl === l.th.key ? ' on' : ''}" href="#/track/${l.k}?th=${l.th.key}" title="${esc(l.th.blurb)}">${L.flt ? `<i class="hue" ${hv(l.k)}>${esc(t.short)}</i>` : ''}${esc(l.th.name)}<small>${L.flt ? l.nodes.length : l.th.n}</small></a>`;
    const isOpen = l.type === 'head';
    if (L.embed) return `<span class="tl k hue" ${hv(l.k)}><b>${esc(t.short)}</b><small>主干</small></span>`;
    return `<button class="tl k hue${isOpen ? ' open' : ''}" ${hv(l.k)} data-open="${l.k}" aria-expanded="${isOpen}" title="${esc(t.name)}：${esc(t.question)}${isOpen ? '' : '\n点一下展开成主题线'}"><i>${isOpen ? '−' : '+'}</i><b>${esc(t.short)}</b><small>${order[l.k].length}</small></button>${isOpen ? `<a class="tgo" href="#/track/${l.k}">详情</a>` : ''}`;
  };
  let top = '', side = '';
  if (Hz) {
    top = `<div class="tcorner" style="width:${SIDE}px;height:${TOP}px"><span title="时间轴不等比例：节点多的年份画得更宽，早期的年份被压短">${L.stripes ? '时代 / 年份' : '阶段 / 年份'} →<br>不等比例</span></div>`
      + L.spans.map(sp => `<a class="tsp" ${sp.e.id ? `href="#/era/${sp.e.id}"` : ''} style="left:${(SIDE + sp.a).toFixed(1)}px;width:${Math.max(0, sp.b - sp.a - 1).toFixed(1)}px" title="${esc(sp.e.name)} ${sp.e.from}–${sp.e.to}">${esc(sp.e.name)}</a>`).join('')
      + L.ticks.map(k => `<a class="tyr" href="#/year/${k.y}" style="left:${(SIDE + k.t).toFixed(1)}px">${k.label}</a>`).join('');
    side = `<div class="tbs-bg" style="width:${SIDE}px;height:${L.C}px"></div>`
      + L.lanes.map(l => `<div class="tlw ${l.type}" style="top:${l.c}px;width:${SIDE}px;height:${l.type === 'group' ? l.size : 2 * l.rail}px">${lab(l)}</div>`).join('');
  } else {
    const row = {group: 2, track: 26, head: 26, thread: 50};
    top = `<div class="tcorner" style="width:${SIDE}px;height:${TOP}px"><span title="时间轴不等比例">↑ 时间<br>不等比例</span></div>`
      + L.lanes.map(l => {
        const b = L.blocks.find(x => x.k === l.k && l.type === 'head');
        const w = l.type === 'group' ? l.c1 - l.c - 18 : b ? b.c1 - b.c0 : l.size;
        return `<div class="tlw v ${l.type}" style="left:${SIDE + (l.type === 'group' ? l.c + 18 : l.c)}px;top:${row[l.type]}px;width:${Math.max(0, w)}px">${lab(l)}</div>`;
      }).join('');
    side = `<div class="tbs-bg" style="width:${SIDE}px;height:${L.T}px"></div>`
      + L.spans.map(sp => `<a class="tsp v" ${sp.e.id ? `href="#/era/${sp.e.id}"` : ''} style="top:${(L.T - sp.b).toFixed(1)}px;height:${Math.max(0, sp.b - sp.a - 1).toFixed(1)}px" title="${esc(sp.e.name)} ${sp.e.from}–${sp.e.to}"><span>${esc(sp.e.name)}</span></a>`).join('')
      + L.ticks.map(k => `<a class="tyr v" href="#/year/${k.y}" style="top:${(L.T - k.t).toFixed(1)}px">${k.label}</a>`).join('');
  }
  const nodes = Object.values(L.pos).map(p => {
    const n = p.it.n, h = n.tier === 1 ? 24 : 20;
    const left = Hz ? X(p.t, 0) - 9 : SIDE + p.l.c + p.l.pad + p.it.sub * L.U, tp = (Hz ? TOP + p.c : Y(p.t, 0)) - h / 2, w = Hz ? p.it.len : L.U - 6;
    return `<a class="nd t${n.tier} hue${status(n.id) === 2 ? ' done' : ''}" ${hs(n.track, `left:${left.toFixed(1)}px;top:${tp.toFixed(1)}px;width:${w}px`)} href="#/n/${encodeURIComponent(n.id)}" data-id="${esc(n.id)}" title="${esc(n.title)} · ${n.date}" aria-label="${esc(n.title)}，${n.date}，${TIER[n.tier]}"><span>${esc(n.title)}</span></a>`;
  }).join('');
  const html = `<div class="tbt${Hz ? '' : ' v'}" style="width:${W}px;height:${TOP}px">${top}</div><div class="tbs${Hz ? '' : ' v'}">${side}</div>
    <svg class="tsvg" width="${W}" height="${H}" aria-hidden="true">${s}</svg><svg class="tsvg over" width="${W}" height="${H}" aria-hidden="true"></svg>${nodes}`;
  return {W, H, html, X, Y, P, SIDE, TOP, curve};
}
function miniTree(width, lane) {
  const side = 96, L = treeLayout({dir: 'h', mini: true, fit: Math.max(200, width - side), lane});
  return treeDraw(L, {side, joins: false}).svg;
}

/* 领域地图里点一个节点后，右侧（手机上是底部）出现的面板 */
function nodePanel(id, o = {}) {
  const n = byId[id], t = trackBy[n.track], th = thBy[n.track] && thBy[n.track][n.th];
  const before = inn[id].slice().sort((a, b) => byId[a.from].date < byId[b.from].date ? 1 : -1), after = out[id].slice().sort((a, b) => byId[a.to].tier - byId[b.to].tier || (byId[a.to].date < byId[b.to].date ? -1 : 1));
  const li = (e, x) => `<li><span class="ty ${e.type}" title="${REL_HELP[e.type]}">${REL[e.type]}</span><div><button class="chip hue" ${hue(byId[x].track)} data-go="${esc(x)}" title="在树上选中它">${esc(byId[x].title)}</button><span class="yr">${byId[x].y}</span></div></li>`;
  const block = (title, es, key, open) => es.length ? `<details ${open ? 'open' : ''}><summary>${title} · ${es.length}</summary><ul class="rels">${es.slice(0, 14).map(e => li(e, e[key])).join('')}</ul>${es.length > 14 ? `<p class="fine">还有${es.length - 14}个，在讲解页里看全部。</p>` : ''}</details>` : '';
  return `<div class="ph"><span class="eyebrow">${esc(t.short)}${th && th.key !== 'all' ? ' › ' + esc(th.name) : ''}</span><button class="x" aria-label="关闭面板">×</button></div>
    ${o.back ? `<button class="btn sm back" data-back>← 回到刚才看的位置</button>` : ''}
    <h3 tabindex="-1">${esc(n.title)}</h3>${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
    <div class="meta">${fmtDate(n.date)} · ${KIND[n.kind]} · ${TIER[n.tier]} ${revBadge(n)}</div>
    <dl>${n.problem ? `<dt>问题</dt><dd>${inline(n.problem)}</dd><dt>方法</dt><dd>${inline(n.idea)}</dd><dt>影响</dt><dd>${inline(n.impact)}</dd>` : '<dd class="muted">正在载入摘要…</dd>'}</dl>
    <div class="acts"><a class="btn fill" href="#/n/${enc(id)}">读完整讲解</a>${o.focus === id ? '' : `<a class="btn" href="#/map?focus=${enc(id)}&view=tree">只看它的前后关系</a>`}<a class="btn" href="#/from/${enc(id)}">从零读到它</a></div>
    ${block('它建立在什么之上', before, 'from', !NARROW())}${block('后来的相关工作', after, 'to', !NARROW() && before.length < 6)}
    ${before.length || after.length ? '<p class="fine">点一个名字，在树上选中它。关系由AI整理，“改进”不等于已经解决，时间先后不等于因果。</p>' : ''}`;
}

function viewMap(_, q, __, ok) {
  const st = treeState;
  const focus = byId[q.focus] ? q.focus : null, at = byId[q.at] ? q.at : null;
  const idsQ = (q.ids || '').split(',').filter(i => byId[i]);
  const special = focus || at || q.c || idsQ.length || (q.q && !idsQ.length) || q.era || q.only;
  const mode = q.view === 'list' ? 'list' : q.view === 'tree' || special ? 'tree' : NARROW() ? 'list' : 'tree';
  const toggle = `<span class="seg" role="group" aria-label="显示方式"><a class="btn sm ${mode === 'tree' ? 'on' : ''}" href="#/map?view=tree" ${mode === 'tree' ? 'aria-current="true"' : ''}>树</a><a class="btn sm ${mode === 'list' ? 'on' : ''}" href="#/map?view=list" ${mode === 'list' ? 'aria-current="true"' : ''}>列表</a></span>`;
  document.title = '领域地图 · AI脉络';
  if (mode === 'list') {
    const nTh = G.tracks.reduce((a, t) => a + G.threads[t.key].length, 0);
    app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">领域地图</div><h1>六个大方向，${G.tracks.length}条分支</h1>
      <p class="lead">中间是所有方向共用的学习方法，是<b>树干</b>；语言、感知、决策是三根<b>大枝</b>；数据、系统和算力是<b>土壤</b>；资金、舆论和监管是<b>环境</b>。每条分支下面再分成若干条<b>主题线</b>（共${nTh}条），一条主题线是沿着同一个问题接力的一串工作。点分支或主题线的名字进去读。</p>
      <p class="lead s">${TREE_NOTE}</p>
      <div class="toolbar">${toggle}<span class="muted">列表和树是同一份内容的两种看法${NARROW() ? '；树在大屏幕上更好用' : ''}</span></div></div>
      ${tracksHTML()}${foot()}</div>`;
    return;
  }
  let depth = +(q.depth || 0), tree = null, flt = null;
  if (q.dir === 'h' || q.dir === 'v') st.dir = q.dir;
  if (q.tier) st.tier = Math.min(3, Math.max(1, +q.tier || 2));
  if (q.open != null) st.open = q.open.split(',').filter(k => trackBy[k]);
  if (trackBy[q.only]) st.open = [q.only];
  if (at) { const n = byId[at]; if (!st.open.includes(n.track)) st.open = [...st.open, n.track]; if (n.tier > st.tier) st.tier = n.tier; }
  st.open = st.open.filter(k => trackBy[k]);
  if (focus) {
    if (!depth) depth = lineage(focus, 2).set.size > 160 ? 1 : 2;      // 没指定层数时：连接太多的枢纽节点默认只看一层
    const lin = lineage(focus, depth); flt = lin.set; tree = lin.tree;
  }
  app.innerHTML = `<div class="mapwrap"><div class="mapbar" id="tbar" role="toolbar" aria-label="地图的显示选项"></div><div class="maphint" id="thint" hidden></div>
    <div class="mapbody"><div class="scroller" id="scroller" tabindex="0" aria-label="演化树。可以滚动；用Tab移到节点上，回车选中，方向键在相邻节点间移动"><div class="tcanvas plane" id="tcanvas"></div></div><aside class="panel" id="panel" aria-label="选中节点的摘要" hidden></aside></div></div>`;
  const wrap = $('.mapwrap'), sc = $('#scroller'), cv = $('#tcanvas'), panel = $('#panel'), bar = $('#tbar'), hint = $('#thint');
  const dir = () => st.dir || 'h';
  let L = null, D = null, selected = null, ndEls = {}, topic = null, origin = null;
  const btn = (attr, v, label, on, title = '') => `<button class="btn sm ${on ? 'on' : ''}" data-${attr}="${v}" aria-pressed="${!!on}" ${title ? `title="${title}"` : ''}>${label}</button>`;
  const drawBar = () => {
    const d = dir(), n = Object.keys(L.pos).length;
    const view = `<label>方向</label><span class="seg">${btn('dir', 'h', '横向', d === 'h', '时间从左到右')}${btn('dir', 'v', '竖向', d === 'v', '根在下，往上长')}</span>
      <label>缩放</label><span class="seg">${[[0, '适应'], [1, '1×'], [2, '2×']].map(([v, l]) => btn('zoom', v, l, st.zoom === v)).join('')}</span>`;
    bar.innerHTML = focus
      ? `<span class="chip hue" ${hue(byId[focus].track)}>${esc(byId[focus].title)} 的前后关系</span><label>往前往后各</label><span class="seg">${[1, 2, 3].map(x => `<a class="btn sm ${depth === x ? 'on' : ''}" href="#/map?focus=${enc(focus)}&depth=${x}&view=tree">${x}层</a>`).join('')}</span>
         ${view}<a class="btn sm" href="#/map?at=${enc(focus)}&view=tree">← 回到整张地图</a><span class="sp"></span>${LEGEND}<span class="muted">${n}个节点</span>`
      : topic ? `<span class="chip c">${esc(topic.label)}</span>${view}<a class="btn sm" href="${topic.back}">← 回到它的页面</a><a class="btn sm" href="#/map?view=tree">整张地图</a><span class="sp"></span>${LEGEND}<span class="muted">${n}个节点 · 一行是一条主题线</span>`
      : `${toggle}<label>展开后显示</label><span class="seg">${[[1, '主干', '只显示缺了就讲不通的节点'], [2, '主干+重要', '再加上这个方向的人都知道的工作'], [3, '全部', '全部节点，会很密']].map(([v, l, tip]) => btn('tier', v, l, st.tier === v, tip)).join('')}</span>
         ${btn('all', 1, '全部展开', false, '把16条分支都展开成主题线')}${st.open.length ? btn('all', 0, '全部收起', false) : ''}
         ${btn('joins', 1, '跨分支借用', st.joins, '虚线：一条分支的成果被另一条分支拿去用')}${view}
         <button class="btn sm" data-hint="1">怎么看</button><span class="sp"></span><span class="muted">${st.open.length ? `${n}个节点` : '点左边的分支名展开'}</span>`;
  };
  const showHint = force => {
    if (!force && store.get('mapHint', 0)) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.innerHTML = `<ol><li><b>一行是一条分支</b>，时间从左到右。点左边的<b>分支名</b>，这一行展开成它的几条主题线。</li><li><b>点一个节点</b>，会标出它的前驱和后续，旁边出现它的摘要。</li>
      <li><b>时间轴不等比例</b>：节点多的年份画得宽，早期的年份被压短，看年份请以刻度为准。</li><li>${TREE_NOTE}</li></ol><button class="btn sm fill" data-hint="0">知道了</button>`;
  };
  const snap = lane => {          // 重画前记下：视口中心对应的年份，以及被点的那一行在屏幕上的位置
    if (!L) return null;
    const Hz = L.Hz, span = Hz ? sc.clientWidth - D.SIDE : sc.clientHeight - D.TOP;
    const tc = Hz ? sc.scrollLeft + span / 2 : L.T - (sc.scrollTop + span / 2);
    const l = lane && (L.laneOf[lane] || null);
    return {Hz, year: L.inv(tc), lane, cOff: l ? l.c - (Hz ? sc.scrollTop : sc.scrollLeft) : null, cross: Hz ? sc.scrollTop : sc.scrollLeft};
  };
  const draw = keep => {
    const Hz = dir() === 'h';
    const lay = fit => treeLayout({dir: dir(), zoom: st.zoom, tier: st.tier, open: st.open, nodes: flt, fit, y0: topic ? topic.y0 : 0});
    const avail = sc.clientWidth - sideW() - 4;
    L = lay(avail - 62 - 96);
    if (Hz && !st.zoom && L.T > avail && L.z > .2) L = lay(avail - 62 - 96 - (L.T - avail));
    D = treeDraw(L, {joins: st.joins && !focus && !topic, edges: tree});
    cv.style.cssText = `width:${D.W}px;height:${D.H}px`;
    cv.innerHTML = D.html;
    cv.classList.remove('focus');
    ndEls = {};
    cv.querySelectorAll('.nd').forEach(el => ndEls[el.dataset.id] = el);
    drawBar();
    const span = Hz ? sc.clientWidth - D.SIDE : sc.clientHeight - D.TOP;
    if (keep && keep.Hz === Hz) {
      const t = L.tY(keep.year), l = keep.lane && L.laneOf[keep.lane];
      const cross = l && keep.cOff != null ? l.c - keep.cOff : keep.cross;
      if (Hz) sc.scrollTo(t - span / 2, cross); else sc.scrollTo(cross, L.T - t - span / 2);
    } else if (Hz) sc.scrollTo(0, 0);
    else { const tr = L.laneOf.dl; sc.scrollTo(tr ? Math.max(0, tr.c - sc.clientWidth / 2 + 60) : 0, D.H); }
    if (selected && ndEls[selected]) select(selected, true); else { selected = null; panel.hidden = true; }
    store.set('tree', st);
  };
  const reveal = (t, c) => {
    const x = D.X(t, c), y = D.Y(t, c);
    sc.scrollTo({left: Math.max(0, x - D.SIDE - (sc.clientWidth - D.SIDE) / 3), top: Math.max(0, y - D.TOP - (sc.clientHeight - D.TOP) / 2.6)});
  };
  const inView = id => { const el = ndEls[id]; if (!el) return false; const a = el.getBoundingClientRect(), b = sc.getBoundingClientRect(); return a.left >= b.left + D.SIDE && a.right <= b.right && a.top >= b.top + D.TOP && a.bottom <= b.bottom; };
  const over = () => cv.querySelector('.tsvg.over');
  const clearHL = () => { cv.classList.remove('focus'); cv.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); if (over()) over().innerHTML = ''; };
  const highlight = id => {
    clearHL();
    const A = L.pos[id]; if (!A) return;
    cv.classList.add('focus');
    ndEls[id].classList.add('hl');
    let s = '';
    for (const e of [...inn[id], ...out[id]]) {
      const o = e.from === id ? e.to : e.from, B = L.pos[o];
      if (!B) continue;
      ndEls[o].classList.add('hl');
      const [p, r] = e.from === id ? [A, B] : [B, A];
      s += `<path class="e hl ${e.type}" d="${D.curve(p.t, p.c, r.t, r.c)}"/>`;
    }
    over().innerHTML = s;
  };
  function select(id, quiet) {
    if (id && !selected && !quiet) origin = {x: sc.scrollLeft, y: sc.scrollTop};
    selected = id;
    cv.querySelectorAll('.nd.sel').forEach(x => { x.classList.remove('sel'); x.removeAttribute('aria-current'); });
    if (!id) { panel.hidden = true; clearHL(); origin = null; return; }
    if (ndEls[id]) { ndEls[id].classList.add('sel'); ndEls[id].setAttribute('aria-current', 'true'); }
    if (focus && id === focus) clearHL(); else highlight(id);      // 前后关系模式下它的连线本来就画着，不再整片加粗
    const n = byId[id];
    panel.className = 'panel hue'; panel.style.cssText = hs(n.track).slice(7, -1);
    const fill = () => { panel.innerHTML = nodePanel(id, {back: !!origin, focus}); };
    if (!quiet || !panel.innerHTML) { fill(); panel.scrollTop = 0; if (!n.b) needBrief([n]).then(() => { if (selected === id && document.body.contains(panel)) fill(); }).catch(() => {}); }
    panel.hidden = false;
  }
  function jumpTo(id) {          // 从面板里点一个相关节点：在树上选中它，不在画面里就滚过去；树上没画它就先展开它所在的分支
    const n = byId[id]; if (!n) return;
    if (!L.pos[id]) {
      if (flt) { location.hash = `#/map?focus=${enc(id)}&view=tree`; return; }
      if (!st.open.includes(n.track)) st.open = [...st.open, n.track];
      if (n.tier > st.tier) st.tier = n.tier;
      draw(snap());
    }
    const keepOrigin = origin || {x: sc.scrollLeft, y: sc.scrollTop};
    select(id); origin = keepOrigin; panel.innerHTML = nodePanel(id, {back: true, focus});
    if (L.pos[id] && !inView(id)) reveal(L.pos[id].t, L.pos[id].c);
    if (ndEls[id]) ndEls[id].focus({preventScroll: true});
  }
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-open],button[data-dir],button[data-zoom],button[data-tier],button[data-all],button[data-joins],button[data-hint],button[data-go],button[data-back]');
    if (b) {
      const d = b.dataset; let lane = null;
      if (d.go) return jumpTo(d.go);
      if ('back' in d) { const o = origin; select(null); if (o) sc.scrollTo({left: o.x, top: o.y}); return; }
      if (d.hint != null) { if (+d.hint) showHint(true); else { store.set('mapHint', 1); hint.hidden = true; } return; }
      if (d.open) { lane = d.open; st.open = st.open.includes(lane) ? st.open.filter(k => k !== lane) : [...st.open, lane]; }
      else if (d.dir) st.dir = d.dir;
      else if (d.zoom != null) st.zoom = +d.zoom;
      else if (d.tier) st.tier = +d.tier;
      else if (d.all != null) st.open = +d.all ? G.tracks.map(t => t.key) : [];
      else if (d.joins) st.joins = !st.joins;
      draw(d.dir ? null : snap(lane));
      if (d.open) { const nb = cv.querySelector(`button[data-open="${d.open}"]`); if (nb) nb.focus({preventScroll: true}); }
      return;
    }
    if (e.target.closest('.panel')) { if (e.target.closest('.x')) { const id = selected; select(null); if (ndEls[id]) ndEls[id].focus({preventScroll: true}); } return; }
    const el = e.target.closest('.nd');
    if (el) { e.preventDefault(); select(el.dataset.id === selected ? null : el.dataset.id); }
    else if (!e.target.closest('a,button') && e.target.closest('#tcanvas')) select(null);
  });
  cv.addEventListener('mouseover', e => { const el = e.target.closest('.nd'); if (el && !selected) highlight(el.dataset.id); });
  cv.addEventListener('mouseout', e => { if (e.target.closest('.nd') && !selected) clearHL(); });
  cv.addEventListener('focusin', e => { const el = e.target.closest('.nd'); if (el && !selected) highlight(el.dataset.id); });
  cv.addEventListener('focusout', e => { if (e.target.closest('.nd') && !selected) clearHL(); });
  // 键盘：方向键在同一行的前后节点、相邻行最近的节点之间移动
  cv.addEventListener('keydown', e => {
    const el = e.target.closest('.nd'); if (!el || !/^Arrow/.test(e.key)) return;
    const p = L.pos[el.dataset.id]; if (!p) return;
    const along = (e.key === 'ArrowRight' || e.key === 'ArrowLeft') === L.Hz, fwd = L.Hz ? (e.key === 'ArrowRight' || e.key === 'ArrowDown') : (e.key === 'ArrowUp' || e.key === 'ArrowRight');
    let best = null, bd = Infinity;
    for (const id in L.pos) {
      const o = L.pos[id]; if (o === p) continue;
      let d;
      if (along) { if (o.l !== p.l || (fwd ? o.t <= p.t : o.t >= p.t)) continue; d = Math.abs(o.t - p.t) + Math.abs(o.c - p.c) * 3; }
      else { if (o.l === p.l || (fwd ? o.l.c <= p.l.c : o.l.c >= p.l.c)) continue; d = Math.abs(o.l.c - p.l.c) * 4 + Math.abs(o.t - p.t); }
      if (d < bd) { bd = d; best = id; }
    }
    if (best) { e.preventDefault(); ndEls[best].focus(); if (selected) select(best); }
  });
  const finish = () => {
    draw();
    if (!focus && !topic && !at) showHint(false);
    const era = G.eras.find(e => e.id === q.era), sp = era && L.spans.find(s => s.e === era);
    if (focus) { select(focus, false); origin = null; const p = L.pos[focus]; if (p) reveal(p.t, p.c); }
    else if (at && L.pos[at]) { select(at); origin = null; reveal(L.pos[at].t, L.pos[at].c); }
    else if (topic && topic.mark && ndEls[topic.mark]) ndEls[topic.mark].classList.add('sel');
    else if (sp) { if (L.Hz) sc.scrollTo(Math.max(0, sp.a - 16), 0); else sc.scrollTo(sc.scrollLeft, Math.max(0, L.T - sp.b - 20)); }
    else if (trackBy[q.only] && L.laneOf[q.only]) { const l = L.laneOf[q.only]; if (L.Hz) sc.scrollTo(Math.max(0, l.a - 60), Math.max(0, l.c - 30)); else sc.scrollTo(Math.max(0, l.c - 40), Math.max(0, L.T - l.a - sc.clientHeight + 160)); }
    let rz; const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (document.body.contains(cv)) draw(snap()); else removeEventListener('resize', onResize); }, 180); };
    addEventListener('resize', onResize);
  };
  // 话题模式：只画某个概念/思路的节点、某个专题的几站，或某个搜索词对应的节点
  const cq = !focus && concepts[q.c] ? concepts[q.c] : null, sq = !focus && !cq ? (q.q || '').trim() : '';
  const setTopic = (ids, label, back, mark) => {
    if (!ids.length) return;
    flt = new Set(ids);
    tree = ids.length <= 220 ? G.edges.filter(e => flt.has(e.from) && flt.has(e.to)) : null;
    topic = {label: label + ' 在树上', back, y0: Math.min(...ids.map(i => byId[i].y)) - 1, mark};
  };
  if (idsQ.length) { const s = storyBy[q.q]; setTopic(idsQ, s ? s.title : '选中的节点', s ? `#/story/${s.key}` : '#/map', null); finish(); }
  else if (cq) conceptBody(cq.key).then(async c => { const ids = [...new Set([...(byId[c.origin] ? [c.origin] : []), ...await memberIds({k: 'c', id: c.key}, 300)])]; if (!ok()) return; setTopic(ids, c.name, `#/c/${c.key}`, byId[c.origin] ? c.origin : null); finish(); }).catch(() => ok() && finish());
  else if (sq) topicSet(sq).then(t => { if (!ok()) return; setTopic(t.ids, `“${sq}”`, `#/search?q=${enc(sq)}`, null); finish(); }).catch(() => ok() && finish());
  else finish();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const x = $('#panel:not([hidden]) .x'); if (x) x.click(); } });

boot().catch(err => { console.error(err); app.innerHTML = `<div class="page"><div class="empty" role="alert">数据没有载入成功：${esc(err.message)}<br>检查一下网络后<button class="btn sm" onclick="location.reload()">重试</button>。本地预览请用 <code>python3 -m http.server -d docs</code>，不要直接双击打开文件。<br>不运行脚本也能读的版本：<a class="u" href="start.html">开始学习</a> · <a class="u" href="timeline.html">时间线</a> · <a class="u" href="fields.html">领域地图</a></div></div>`; });
})();
