/* AI脉络 · 单页应用（无依赖）。数据由 scripts/build.py 生成到 docs/data/。 */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const app = $('#app');
const KIND = {paper: '论文', model: '模型', system: '系统', hardware: '硬件', dataset: '数据集', event: '事件', concept: '思想'};
const REL = {solves: '解决', extends: '延续', uses: '使用', rivals: '竞争'};
const AREA = {idea: '研究思路与话题', math: '数学预备', prob: '概率统计与信息论', opt: '优化与训练', ml: '机器学习基础', nn: '神经网络组件', seq: '序列与语言模型',
  gen: '生成模型', rl: '强化学习', vis: '视觉', aud: '语音', emb: '具身与控制', sys: '系统与硬件', eval: '评测与实验方法'};
const LEVEL = ['预备', '入门', '进阶'];

let G, byId = {}, trackBy = {}, out = {}, inn = {}, concepts = {}, terms = [], order = {};
let thBy = {}, yearCount = {}, yearPeak = 1;
const contentCache = {};

/* ——— 本地存储（进度、全景树设置）：读写都可能失败，失败时静默退化 ——— */
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
    if (!o || typeof o !== 'object') return;
    if (o.progress) { progress = o.progress; notes = o.notes || {}; marks = o.marks || {}; } else progress = o;   // 兼容只含进度的旧文件
    store.set('progress', progress); store.set('notes', notes); store.set('marks', marks); then && then();
  } catch {}
}
const status = id => progress[id] || 0;
function cycleStatus(id) {
  const v = (status(id) + 1) % 3;
  if (v) progress[id] = v; else delete progress[id];
  store.set('progress', progress);
  return v;
}

/* ——— 数据 ——— */
async function getJSON(p) {
  const r = await fetch(p + (window.AIMAP_V ? '?v=' + window.AIMAP_V : ''));
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
}
async function boot() {
  let c;
  [G, c] = await Promise.all([getJSON('data/graph.json'), getJSON('data/concepts.json')]);
  G.tracks.forEach((t, i) => { trackBy[t.key] = t; t.i = i; order[t.key] = []; });
  G.nodes.forEach(n => { byId[n.id] = n; out[n.id] = []; inn[n.id] = []; n.y = +n.date.slice(0, 4); n.m = +(n.date.slice(5, 7) || 0); order[n.track].push(n.id); });
  G.edges.forEach(e => { if (byId[e.from] && byId[e.to]) { out[e.from].push(e); inn[e.to].push(e); } });
  G.groups ||= []; G.threads ||= {}; G.forks ||= {}; G.joins = (G.joins || []).filter(j => byId[j.from] && byId[j.to]);
  G.groups.forEach(g => g.tracks.forEach(k => { if (trackBy[k]) trackBy[k].g = g; }));
  G.tracks.forEach(t => { thBy[t.key] = {}; yearCount[t.key] = {}; (G.threads[t.key] ||= []).forEach(th => { th.ids = []; thBy[t.key][th.key] = th; }); });
  G.nodes.forEach(n => { const th = thBy[n.track][n.th]; if (th) th.ids.push(n.id); const c = yearCount[n.track], y = Math.max(1942, n.y); c[y] = (c[y] || 0) + 1; yearPeak = Math.max(yearPeak, c[y]); });
  c.concepts.forEach(x => concepts[x.key] = x);
  terms = c.terms;
  window.addEventListener('hashchange', route);
  initSearch();
  route();
}
function loadContent(track) {
  return contentCache[track] ||= getJSON(`data/content/${track}.json`).catch(() => ({}));
}
const eraOf = n => G.eras.find(e => n.y <= e.to) || G.eras[G.eras.length - 1];
const hs = (t, extra = '') => `style="--h:${trackBy[t].hue}${trackBy[t].sat != null ? `;--s:${trackBy[t].sat / 48}` : ''}${extra ? ';' + extra : ''}"`;
const hue = t => hs(t);
const fmtDate = d => d.length === 7 ? `${d.slice(0, 4)}.${d.slice(5)}` : d;

/* ——— 正文标记：空行分段、- 列表、**粗体**、`代码`、[[节点]]、[[c:概念]] ——— */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, ref, txt) => {
      ref = ref.trim();
      if (ref.startsWith('c:')) {
        const c = concepts[ref.slice(2)];
        return c ? `<a class="lc" href="#/c/${c.key}" title="${esc(c.short || c.en)}">${txt || esc(c.name)}</a>` : `<span class="dead">${txt || esc(ref)}</span>`;
      }
      const n = byId[ref];
      return n ? `<a class="ln hue" ${hue(n.track)} href="#/n/${n.id}" title="${esc(n.full || n.title)} · ${n.date}">${txt || esc(n.title)}</a>` : `<span class="dead">${txt || esc(ref)}</span>`;
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
const chip = id => { const n = byId[id]; return n ? `<a class="chip hue" ${hue(n.track)} href="#/n/${id}" title="${esc(n.full || '')} · ${n.date}">${esc(n.title)}</a>` : ''; };
const cchip = k => { const c = concepts[k]; return c ? `<a class="chip c" href="#/c/${k}">${esc(c.name)}</a>` : ''; };
const stBtn = id => `<button class="st s${status(id)}" data-st="${id}" title="学习状态：点一下切换 未读 → 在读 → 已读" aria-label="学习状态"></button>`;
function row(n, opt = {}) {
  const body = n.has
    ? `<div class="p">${n.problem ? `<b>卡点</b> ${inline(n.problem)}` : ''}${opt.full && n.idea ? `<br><b>解法</b> ${inline(n.idea)}` : ''}</div>`
    : `<div class="todo">讲解整理中</div>`;
  return `<li class="row t${n.tier} hue" ${hue(n.track)}>
    <div class="d">${fmtDate(n.date)}${opt.track ? `<br>${esc(trackBy[n.track].short)}` : ''}</div>
    <div class="b"><a class="t" href="#/n/${n.id}">${esc(n.title)}</a>
      <div class="f">${esc(n.full || '')}${n.who ? `${n.full ? ' · ' : ''}${esc(n.who.split('·')[0].trim())}` : ''}</div>${body}</div>
    ${stBtn(n.id)}</li>`;
}
const foot = () => `<footer class="foot"><span>© ${new Date().getFullYear()} Yunxiang (Kevin) Mo</span><span>${G.nodes.length} 个节点 · ${G.edges.length} 条连接 · 讲解由AI模型整理并对照原文核对，仍可能有错，请以原文为准 · <a href="design.html" style="text-decoration:underline;text-underline-offset:2px">设计说明</a></span></footer>`;
const tierBar = (cur, base) => `<label>显示</label>${[[1, '只看主干'], [2, '主干 + 重要'], [3, '全部']].map(([v, l]) => `<a class="btn sm ${cur === v ? 'on' : ''}" href="${base}${base.includes('?') ? '&' : '?'}tier=${v}">${l}</a>`).join('')}`;
function doneStat(ids) { const d = ids.filter(i => status(i) === 2).length; return {d, n: ids.length, pct: ids.length ? Math.round(d / ids.length * 100) : 0}; }

/* ——— 路由 ——— */
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const view = seg[0] || 'home';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.k === ({eras: 'era', tracks: 'track', n: '', concepts: 'c', chain: 'path', link: 'path', quiz: 'me', year: 'era', stats: 'me', orgs: 'me'}[view] ?? view)));
  document.body.classList.toggle('is-map', view === 'map');
  const views = {home, map: viewMap, eras: viewEras, era: viewEra, tracks: viewTracks, track: viewTrack, n: viewNode, concepts: viewConcepts, c: viewConcept, path: viewPath, search: viewSearch,
    open: viewOpen, chain: viewChain, year: viewYear, stats: viewStats, me: viewMe, orgs: viewOrgs, link: viewLink, quiz: viewQuiz, guide: viewGuide};
  (views[view] || home)(seg[1], q, seg[2]);
  if (view !== 'map') window.scrollTo(0, 0);
}
app.addEventListener('click', e => {
  const b = e.target.closest('[data-st]');
  const mk = e.target.closest('[data-mark]');
  if (mk) { e.preventDefault(); const id = mk.dataset.mark; if (marks[id]) delete marks[id]; else marks[id] = 1; store.set('marks', marks); mk.classList.toggle('on', !!marks[id]); mk.textContent = marks[id] ? '★ 已收藏' : '☆ 收藏'; return; }
  if (b) { e.preventDefault(); const v = cycleStatus(b.dataset.st); b.className = 'st s' + v; document.querySelectorAll(`.nd[data-id="${CSS.escape(b.dataset.st)}"]`).forEach(x => x.classList.toggle('done', v === 2)); }
});

/* ——— 首页 ——— */
function home() {
  const t1 = G.nodes.filter(n => n.tier === 1), written = G.nodes.filter(n => n.has).length;
  const ps = doneStat(t1.map(n => n.id));
  app.innerHTML = `<div class="page">
    <div class="mast">
      <div class="eyebrow">1943 — ${G.eras[G.eras.length - 1].to} · 一棵按时间生长的树</div>
      <h1>AI脉络</h1>
      <p class="lead">每个阶段大家在攻克什么，谁解决了它，又留下了什么给后来的人。${G.tracks.length}条分支、${G.nodes.length}个节点——论文、模型、芯片、数据集和关键事件——每一个都有讲解，彼此用“解决 / 延续 / 使用 / 竞争”连起来。只需要基本的编程和大一数学就能从头读起。</p>
      <div class="stats"><span><b>${G.nodes.length}</b>节点</span><span><b>${G.edges.length}</b>连接</span><span><b>${t1.length}</b>主干必读</span><span><b>${Object.keys(concepts).length}</b>概念与思路</span><span><b>${written}</b>已有讲解</span></div>
      <div class="acts" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn fill" href="#/path">开始学习</a><a class="btn" href="#/guide">怎么用这个网站</a>
        ${byId[store.get('last')] ? `<a class="btn" href="#/n/${store.get('last')}">继续上次：${esc(byId[store.get('last')].title)}</a>` : ''}</div>
      ${ps.d ? `<div class="bar" style="max-width:420px;margin-top:16px"><i style="width:${ps.pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">主干已读 ${ps.d} / ${ps.n}</div>` : ''}
    </div>
    <section class="sec"><div class="sec-h"><h2>从这里开始</h2><span class="muted">第一次来，照这三步走就行</span></div>
      <div class="steps">
        <a href="#/path?to=prep"><b>1</b><h3>先扫一遍预备概念</h3><p>向量、求导、概率这些进入AI之前要会的东西，十分钟过一遍，不熟的点进去看。</p><span>去路线页的“预备”一节 →</span></a>
        <a href="#/path"><b>2</b><h3>沿主干按时间读</h3><p>${t1.length}个缺了就讲不通的工作，从1943年排到今天。每篇先看顶上三格：当时卡在哪、怎么解决、改变了什么。</p><span>打开主干路线 →</span></a>
        <a href="#/guide"><b>3</b><h3>再按兴趣展开</h3><p>想深入某个方向就去那条分支；想知道某个工作的来龙去脉就在全景树里聚焦它；想找什么直接搜。</p><span>看完整使用指南 →</span></a>
      </div></section>
    <section class="sec"><div class="sec-h"><h2>整棵树</h2><span class="muted">六个大方向、${G.tracks.length}条分支，谁从谁长出来</span></div>
      <a class="treecard" href="#/map" id="minibox"></a>
      <div class="grid">${GROUP_ORDER.map(k => G.groups.find(g => g.key === k)).filter(Boolean).map(g => `<div class="card"><div class="eyebrow">${esc(g.role)}</div><h3 style="margin-top:2px">${esc(g.name)}</h3><p>${esc(g.blurb)}</p>
        <p class="tags" style="margin-top:8px">${g.tracks.map(t => `<a class="chip hue" ${hue(t)} href="#/track/${t}">${esc(trackBy[t].short)} ${order[t].length}</a>`).join(' ')}</p></div>`).join('')}</div>
      <div class="toolbar"><a class="btn sm" href="#/tracks">看每条分支下的主题线 →</a></div></section>
    <section class="sec"><div class="sec-h"><h2>只想搞懂一样东西</h2><span class="muted">选一个终点，给你一条从零到它的最短阅读链</span></div>
      <div class="grid">${GOALS.filter(g => byId[g[0]]).slice(0, 8).map(([gid, label]) => `<a class="card hue" ${hue(byId[gid].track)} href="#/chain/${gid}"><h3>${esc(label)}</h3><p>终点：${esc(byId[gid].title)}（${byId[gid].date.slice(0, 4)}）</p></a>`).join('')}</div>
      <div class="toolbar"><a class="btn sm" href="#/path">全部目标与主干路线 →</a></div></section>
    <section class="sec"><div class="sec-h"><h2>九个时代</h2><span class="muted">按时间顺序读，每个时代先看“当时在攻克什么”</span></div>
      <ul class="river">${G.eras.map(e => {
        const ns = G.nodes.filter(n => eraOf(n) === e);
        return `<li><a href="#/era/${e.id}"><div class="yr">${e.from}–${String(e.to).slice(2)}<small>${ns.length} 个节点 · ${ns.filter(n => n.tier === 1).length} 个主干</small></div>
          <div class="body"><h3>${esc(e.name)}</h3><p>${esc(e.tagline)}</p><div class="tags">${e.hot.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></a></li>`;
      }).join('')}</ul></section>
    <section class="sec"><div class="sec-h"><h2>工具</h2><span class="muted">读的过程中会用到</span></div>
      <div class="grid tools">
        <a class="card" href="#/map"><h3>全景树</h3><p>整个领域画成一棵树：先看16条分支谁从谁长出来，点一条展开成主题线，再点节点看讲解和它的来龙去脉。</p></a>
        <a class="card" href="#/link"><h3>演进路径</h3><p>任选两个工作，找出连接它们的最短一条线，例如从感知机到Transformer中间隔着什么。</p></a>
        <a class="card" href="#/concepts"><h3>概念与思路</h3><p>${Object.values(concepts).filter(c => c.area !== 'idea').length}个基础概念和${Object.values(concepts).filter(c => c.area === 'idea').length}个研究思路，每一条都能看到它长在树上的哪里。</p></a>
        <a class="card" href="#/open"><h3>开放问题</h3><p>近几年的工作留下、还没有后续工作解决的问题，适合找研究方向。</p></a>
        <a class="card" href="#/quiz"><h3>自测卡片</h3><p>合上书讲一遍：先自己回忆，再翻面对照，没答上的下次优先出现。</p></a>
        <a class="card" href="#/me"><h3>我的进度</h3><p>已读、在读、收藏和笔记，只存在这台设备的浏览器里，可以导出。</p></a>
      </div>
      <div class="toolbar"><button class="btn sm" id="rand">随便看一个</button></div></section>
    ${foot()}</div>`;
  const mb = $('#minibox');
  mb.innerHTML = miniTree(mb.clientWidth - 34, 17) + `<div class="cap"><span>每条线是一条分支，粗细的起伏是每年的工作量，圆点是主干节点，曲线是它从哪条分支长出来。</span><b>打开全景树 →</b></div>`;
  $('#rand').onclick = () => { const pool = G.nodes.filter(n => n.has && n.tier <= 2); const pick = (pool.length ? pool : G.nodes)[Math.floor(Math.random() * (pool.length || G.nodes.length))]; location.hash = '#/n/' + pick.id; };
}

/* ——— 时代 ——— */
function viewEras() {
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">时代</div><h1>九个时代</h1><p class="lead">每个时代有自己的算力、数据和资金条件，也有自己的核心矛盾。上一个时代留下的问题，就是下一个时代的起点。</p></div>
    ${G.eras.map(e => `<section class="sec"><div class="sec-h"><h2><a href="#/era/${e.id}">${e.from}–${e.to}　${esc(e.name)}</a></h2></div>
      <p style="margin:6px 0 10px;color:var(--ink-2)">${esc(e.tagline)}</p>
      <div class="note"><h4>留给下一个时代</h4><p>${esc(e.handoff)}</p></div></section>`).join('')}${foot()}</div>`;
}
function viewEra(id, q) {
  const e = G.eras.find(x => x.id === id) || G.eras[0], i = G.eras.indexOf(e);
  const tier = +(q.tier || 2);
  const ns = G.nodes.filter(n => eraOf(n) === e);
  const groups = G.tracks.map(t => [t, ns.filter(n => n.track === t.key && n.tier <= tier)]).filter(g => g[1].length);
  app.innerHTML = `<div class="page">
    <div class="mast"><div class="eyebrow">时代 ${i + 1} / ${G.eras.length} · ${e.from}–${e.to}</div><h1>${esc(e.name)}</h1><p class="lead">${esc(e.tagline)}</p></div>
    <div class="two" style="margin-top:22px"><div class="note"><h4>当时的条件</h4><p>${esc(e.context)}</p></div><div class="note"><h4>怎么读这一段</h4><p>${esc(e.read)}</p></div></div>
    <section class="sec"><div class="sec-h"><h2>当时在攻克什么</h2></div>
      <ul class="qlist">${e.questions.map(x => `<li class="hue" ${hue(x.track)}><a class="k" href="#/track/${x.track}">${esc(trackBy[x.track].name)}</a><div>${esc(x.text)}</div></li>`).join('')}</ul></section>
    <section class="sec"><div class="two">
      <div class="note"><h4>热点</h4><div class="tags" style="margin-top:6px">${e.hot.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
      <div class="note"><h4>退潮</h4><div class="tags" style="margin-top:6px">${e.cooled.length ? e.cooled.map(t => `<span class="tag off">${esc(t)}</span>`).join('') : '<span class="muted">—</span>'}</div></div></div>
      <div class="note"><h4>留给下一个时代</h4><p>${esc(e.handoff)}</p></div></section>
    <section class="sec"><div class="sec-h"><h2>这个时代的工作</h2><span class="muted">${ns.length} 个节点</span></div>
      <div class="toolbar">${tierBar(tier, `#/era/${e.id}`)}<span class="sp"></span><a class="btn sm" href="#/map?era=${e.id}">在全景树中看</a></div>
      ${groups.map(([t, list]) => `<div class="divider hue" ${hue(t.key)}><b>${esc(t.name)}</b>${list.length} 个</div><ul class="rows">${list.map(n => row(n)).join('')}</ul>`).join('')}</section>
    <div class="pn">${i ? `<a href="#/era/${G.eras[i - 1].id}"><small>上一个时代</small><b>${esc(G.eras[i - 1].name)}</b></a>` : '<span></span>'}
      ${i < G.eras.length - 1 ? `<a class="r" href="#/era/${G.eras[i + 1].id}"><small>下一个时代</small><b>${esc(G.eras[i + 1].name)}</b></a>` : '<span></span>'}</div>
    ${foot()}</div>`;
}

/* ——— 分支：大方向 → 分支 → 主题线 ——— */
const GROUP_ORDER = ['core', 'lang', 'percept', 'act', 'soil', 'society'];
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
  return `<svg class="spark hue" ${hue(k)} viewBox="0 0 ${W} ${H + 12}" role="img" aria-label="每年的节点数">
    ${[1950, 1980, 2000, 2012, 2017, 2022].map(y => `<line x1="${x(y)}" y1="0" x2="${x(y)}" y2="${H + 2}"/><text x="${x(y) + 3}" y="${H + 11}">${y}</text>`).join('')}
    <path d="${d}L${W} ${H}Z"/></svg>`;
}
const forkLine = k => {
  const f = G.forks[k] || {}, p = trackBy[f.from], at = byId[f.at];
  if (!f.why) return '';
  return `<p class="fk">${p ? `从 <b class="hue" ${hue(p.key)}>${esc(p.short)}</b> 分叉${at ? `（${at.date.slice(0, 4)}年，${chip(at.id)}）` : ''}：` : '<b>独立的根</b>：'}${esc(f.why)}</p>`;
};
const thChip = (k, th, on) => `<a class="thc hue${th.from ? ' sub' : ''}${on ? ' on' : ''}" ${hue(k)} href="#/track/${k}?th=${th.key}" title="${esc(th.blurb)}${th.from ? `\n从“${esc(thBy[k][th.from].name)}”分出` : ''}">${esc(th.name)}<small>${th.n}</small></a>`;
function viewTracks() {
  const gs = GROUP_ORDER.map(k => G.groups.find(g => g.key === k)).filter(Boolean);
  const nTh = G.tracks.reduce((a, t) => a + G.threads[t.key].length, 0);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">分支</div><h1>一棵树，六个大方向</h1>
    <p class="lead">${G.tracks.length}条分支不是并列的。中间是所有方向共用的学习方法，是<b>树干</b>；语言、感知、决策是从树干和各自的根上长出来的三根<b>大枝</b>；数据、系统和算力是<b>土壤</b>；资金、舆论和监管是<b>环境</b>。每条分支下面再分成若干条<b>主题线</b>（共${nTh}条），一条主题线就是沿着同一个问题接力的一串工作。</p></div>
    <a class="treecard" href="#/map" id="minibox"></a>
    ${gs.map(g => `<section class="grp"><div class="role">${esc(g.role)}</div><h2>${esc(g.name)}</h2><p>${esc(g.blurb)}</p>
      ${g.tracks.map(k => { const t = trackBy[k], ids = order[k], s = doneStat(ids); return `<div class="trk hue" ${hue(k)}>
        <div class="trk-h"><a href="#/track/${k}"><h3>${esc(t.name)}</h3></a><span class="m">${ids.length} 个节点 · ${byId[ids[0]].y}–${byId[ids[ids.length - 1]].y}${s.d ? ` · 已读 ${s.d}` : ''}</span>
          <span style="flex:1"></span><a class="btn sm" href="#/track/${k}">分支页</a><a class="btn sm" href="#/map?only=${k}">在全景树中展开</a></div>
        <p class="q">${esc(t.question)}</p>${forkLine(k)}${spark(k)}
        <div class="ths">${G.threads[k].map(th => thChip(k, th)).join('')}</div></div>`; }).join('')}</section>`).join('')}
    ${G.joins.length ? `<section class="grp"><div class="role">跨分支</div><h2>关键的汇流</h2><p>树上只给每条分支画了一个来源。实际上分支之间一直在互相借东西，下面是改变了走向的几次；全景树里用虚线标出。</p>
      <ul class="rels" style="margin-top:12px">${G.joins.map(j => `<li><span class="ty">${byId[j.to].date.slice(0, 4)}</span><div>${chip(j.from)} → ${chip(j.to)}<div class="nt">${esc(j.label)}</div></div></li>`).join('')}</ul></section>` : ''}
    ${foot()}</div>`;
  document.title = '分支 · AI脉络';
  const box = $('#minibox');
  box.innerHTML = miniTree(box.clientWidth - 34, 17) + `<div class="cap"><span>每条线是一条分支，粗细的起伏是每年的工作量，圆点是主干节点，曲线是它从哪条分支长出来。</span><b>打开全景树 →</b></div>`;
}
function viewTrack(key, q = {}) {
  const t = trackBy[key] || G.tracks[0], k = t.key, ths = G.threads[k];
  const th = thBy[k][q.th] || null, by = q.by === 'stage' && !th ? 'stage' : 'thread';
  const tier = +(q.tier || (th ? 3 : 2));
  const ids = order[k], all = ids.map(i => byId[i]), ns = all.filter(n => n.tier <= tier && (!th || n.th === th.key));
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
  app.innerHTML = `<div class="page hue" ${hue(k)}>
    <div class="mast"><div class="eyebrow"><a href="#/tracks">分支</a>${t.g ? ` › ${esc(t.g.name)}` : ''} · ${ids.length} 个节点 · ${ths.length} 条主题线</div><h1>${esc(t.name)}</h1><p class="lead"><b>${esc(t.question)}</b></p><p class="lead">${esc(t.blurb)}</p>${forkLine(k)}</div>
    <section class="sec"><div class="sec-h"><h2>这条分支的树</h2><span class="muted">每一行是一条主题线，曲线表示它从哪条线分出来；点节点读讲解</span></div>
      <div class="toolbar">${tierBar(tier, qs({}))}<span class="sp"></span><a class="btn sm" href="#/map?only=${k}">在全景树中看</a></div>
      <div class="tscroll" id="ttree"></div></section>
    <section class="sec"><div class="sec-h"><h2>主题线</h2><span class="muted">点一条只看它</span></div>
      <div class="thcards">${ths.map(x => `<a class="hue${th === x ? ' on' : ''}" ${hue(k)} href="${th === x ? base : `${base}?th=${x.key}`}"><h4>${esc(x.name)}</h4><p>${esc(x.blurb)}</p><small>${x.first.slice(0, 4)}–${x.last.slice(0, 4)} · ${x.n} 个节点${x.from ? ` · 从“${esc(thBy[k][x.from].name)}”分出` : ''}</small></a>`).join('')}</div></section>
    <section class="sec"><div class="sec-h"><h2>这条线的几个阶段</h2></div>
      <ul class="stages">${t.stages.map(s => `<li><span class="y">${s.from}–${s.to}</span><b>${esc(s.name)}</b><p>${esc(s.text)}</p></li>`).join('')}</ul></section>
    <section class="sec" id="list"><div class="sec-h"><h2>${th ? `主题线：${esc(th.name)}` : '全部节点'}</h2><span class="muted">${ns.length} 个</span></div>
      <div class="toolbar">${tierBar(tier, qs({}))}${th ? `<a class="btn sm" href="${base}">← 全部主题线</a>` : `<label style="margin-left:8px">排列</label><a class="btn sm ${by === 'thread' ? 'on' : ''}" href="${qs({by: null})}">按主题线</a><a class="btn sm ${by === 'stage' ? 'on' : ''}" href="${qs({by: 'stage'})}">按阶段</a>`}</div>${list}</section>
    ${foot()}</div>`;
  document.title = `${t.name} · AI脉络`;
  const box = $('#ttree');
  const lay = fit => treeLayout({dir: 'h', tracks: [k], open: [k], tier, fit, y0: all[0].y - 1, bands: t.stages});
  const avail = box.clientWidth - 168 - 4;
  let L = lay(avail - 62 - 96);
  if (L.T > avail && L.z > .2) L = lay(avail - 62 - 96 - (L.T - avail));
  const D = treeDraw(L, {hl: th && th.key});
  box.innerHTML = `<div class="tcanvas plane" style="width:${D.W}px;height:${D.H}px">${D.html}</div>`;
  if (th) { const l = L.thLane[k][th.key]; if (l) box.scrollTo(Math.max(0, l.a - 80), Math.max(0, l.c - 60)); }
}

/* ——— 节点讲解 ——— */
function relItem(e, other) {
  const n = byId[other];
  return `<li><span class="ty ${e.type}">${REL[e.type]}</span><div>${chip(other)}<span class="yr">${fmtDate(n.date)} · ${esc(trackBy[n.track].short)}</span>${e.note ? `<div class="nt">${inline(e.note)}</div>` : ''}</div></li>`;
}
async function viewNode(id) {
  const n = byId[id];
  if (!n) { app.innerHTML = `<div class="page"><div class="empty">没有这个节点：${esc(id)}</div></div>`; return; }
  const t = trackBy[n.track], e = eraOf(n);
  const c = (await loadContent(n.track))[id] || {};
  if (location.hash.replace(/^#\/n\//, '').split('?')[0] !== encodeURIComponent(id) && decodeURIComponent(location.hash.replace(/^#\/n\//, '').split('?')[0]) !== id) return;
  const sec = (title, text) => text ? `<h2>${title}</h2>${rich(text)}` : '';
  const before = [...inn[id]].sort((a, b) => byId[a.from].date < byId[b.from].date ? -1 : 1);
  const after = [...out[id]].sort((a, b) => (a.type === 'solves' ? 0 : 1) - (b.type === 'solves' ? 0 : 1) || (byId[a.to].date < byId[b.to].date ? -1 : 1));
  const ord = order[n.track], k = ord.indexOf(id), prev = byId[ord[k - 1]], next = byId[ord[k + 1]];
  const trunk = G.nodes.filter(x => x.tier === 1), tk = trunk.indexOf(n), nextTrunk = tk >= 0 ? trunk[tk + 1] : trunk.find(x => x.date > n.date);
  const mine = Object.values(concepts).filter(x => x.area === 'idea' && (x.nodes || []).includes(id));
  const thIds = (thBy[t.key][n.th] || {ids: []}).ids, near = [...before.map(x => x.from), ...after.map(x => x.to)];
  const treeIds = [...new Set([id, ...near.slice(0, 60), ...(thIds.length <= 40 ? thIds : thIds.filter(i => byId[i].tier <= 2 || Math.abs(byId[i].y - n.y) <= 1).slice(0, 40))])];
  app.innerHTML = `<div class="page hue" ${hue(n.track)}><div class="narrow" style="margin:0 auto">
    <div class="article-head">
      <div class="eyebrow">${t.g ? `${esc(t.g.name)} › ` : ''}<a href="#/track/${t.key}">${esc(t.name)}</a>${thBy[t.key][n.th] && n.th !== 'all' ? ` › <a href="#/track/${t.key}?th=${n.th}">${esc(thBy[t.key][n.th].name)}</a>` : ''} · <a href="#/era/${e.id}">${esc(e.name)}</a></div>
      <h1>${esc(n.title)}</h1>
      ${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
      <div class="meta"><span>${fmtDate(n.date)}</span><span>${KIND[n.kind]}</span><span>${['', '主干必读', '重要', '延伸'][n.tier]}</span>${c.venue ? `<span>${esc(c.venue)}</span>` : ''}${n.who ? `<span>${esc(n.who)}</span>` : ''}</div>
      <div class="acts">${stBtn(id)}<span class="muted" style="font-size:12.5px">标记学习状态</span>
        <a class="btn sm" href="#/map?at=${encodeURIComponent(id)}">在全景树上的位置</a>
        <a class="btn sm" href="#/map?focus=${encodeURIComponent(id)}">只看它的来龙去脉</a>
        <a class="btn sm" href="#/chain/${encodeURIComponent(id)}">从零读懂它的学习链</a>
        <a class="btn sm" href="#/link/${encodeURIComponent(id)}">它和另一个工作的联系</a>
        <button class="btn sm ${marks[id] ? 'on' : ''}" data-mark="${esc(id)}">${marks[id] ? '★ 已收藏' : '☆ 收藏'}</button>
        ${(c.links || []).map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
    </div>
    ${n.has ? `<div class="gist"><div><h4>当时卡在哪</h4><p>${inline(n.problem)}</p></div><div><h4>它怎么解决</h4><p>${inline(n.idea)}</p></div><div><h4>改变了什么</h4><p>${inline(n.impact)}</p></div></div>` : `<div class="empty">这个节点的讲解还在整理中。下面是它在图上的连接。</div>`}
    </div>
    <section class="sec ntree"><div class="sec-h"><h2>它长在树上的哪里</h2><span class="muted">它所在的主题线“${esc((thBy[t.key][n.th] || {}).name || t.short)}”、它直接建立其上的工作和直接接着它做的工作。连线是继承关系</span></div>
      <div class="toolbar"><a class="btn sm" href="#/map?at=${encodeURIComponent(id)}">在全景树里打开</a><a class="btn sm" href="#/map?focus=${encodeURIComponent(id)}">只看它的来龙去脉</a>${mine.length ? `<span class="muted" style="margin-left:6px">所属思路：</span>${mine.map(x => cchip(x.key)).join(' ')}` : ''}</div>
      <div class="tscroll" id="ntree"></div></section>
    <div class="narrow" style="margin:0 auto"><div class="prose">
      ${(c.prereq || []).length ? `<h2>先要会的概念</h2><p class="tags">${c.prereq.map(cchip).join(' ')}</p>` : ''}
      ${sec('背景', c.background)}${sec('方法', c.method)}${sec('结果', c.results)}${sec('后续', c.legacy)}${sec('常见误解', c.pitfalls)}
      ${(c.terms || []).length ? `<h2>本篇术语</h2><ul>${c.terms.map(x => `<li><b>${esc(x.t)}</b>　${inline(x.d)}</li>`).join('')}</ul>` : ''}
      ${(c.limits || []).length ? `<h2>它留下的问题</h2><ul class="limits">${c.limits.map(l => `<li>${inline(l.text)}<div class="by">${(l.solved_by || []).length ? `后来的解决者 ${l.solved_by.map(chip).join(' ')}` : '尚无对应节点——可能仍是开放问题'}</div></li>`).join('')}</ul>` : ''}
      ${before.length ? `<h2>它建立在什么之上</h2><ul class="rels">${before.map(x => relItem(x, x.from)).join('')}</ul>` : ''}
      ${after.length ? `<h2>后来谁接着做</h2><ul class="rels">${after.map(x => relItem(x, x.to)).join('')}</ul>` : ''}
      ${sec('怎么学', c.learn)}
      ${(() => { const same = G.nodes.filter(x => x.y === n.y && x.track !== n.track && x.tier <= 2).sort((a, b) => a.tier - b.tier).slice(0, 10); return same.length ? `<h2>同一年，别的分支在做什么</h2><p class="tags">${same.map(x => chip(x.id)).join(' ')} <a class="btn sm" href="#/year/${n.y}">${n.y}年全貌</a></p>` : ''; })()}
      <h2>我的笔记</h2><textarea class="note-box" id="note" placeholder="读完写两句：它解决了什么？我哪里没懂？（只保存在这台设备的浏览器里，可在“我的”页导出）">${esc(notes[id] || '')}</textarea>
    </div>
    </div>
    <div class="narrow" style="margin:0 auto">${c.check ? `<div class="check">核对出处：<a href="${esc(c.check.source)}" target="_blank" rel="noopener">${esc(c.check.source)}</a>　${esc(c.check.confirmed)}</div>` : ''}
    <div class="pn">${prev ? `<a href="#/n/${prev.id}"><small>本分支上一个 · ${fmtDate(prev.date)}</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}
      ${next ? `<a class="r" href="#/n/${next.id}"><small>本分支下一个 · ${fmtDate(next.date)}</small><b>${esc(next.title)}</b></a>` : '<span></span>'}</div>
    ${nextTrunk ? `<div class="pn" style="margin-top:12px"><span></span><a class="r" href="#/n/${nextTrunk.id}"><small>主干下一站 · ${fmtDate(nextTrunk.date)} · ${esc(trackBy[nextTrunk.track].short)}</small><b>${esc(nextTrunk.title)}</b></a></div>` : ''}</div>
    ${foot()}</div>`;
  document.title = `${n.title} · AI脉络`;
  setTree($('#ntree'), treeIds, [id], id);
  store.set('last', id);
  const nb = $('#note');
  nb.oninput = () => { if (nb.value.trim()) notes[id] = nb.value; else delete notes[id]; store.set('notes', notes); };
  navKeys = {ArrowLeft: prev && '#/n/' + prev.id, ArrowRight: next && '#/n/' + next.id};
}
let navKeys = {};
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (location.hash.startsWith('#/n/') && navKeys[e.key]) location.hash = navKeys[e.key];
});

/* ——— 概念 ——— */
function viewConcepts() {
  const all = Object.values(concepts);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">概念与思路 · ${all.length} 条</div><h1>概念与思路</h1>
    <p class="lead">两类东西都在这里，每一条点进去都能看到它长在树上的哪些节点上。<b>基础概念</b>是读讲解要先会的知识，方块里的数字是难度：0 进入AI之前就该会的，1 入门必备，2 读前沿论文时需要。<b>研究思路</b>是大家讨论时挂在嘴边的做法和话题，例如“在策略自蒸馏”“扩散语言模型”，它不是某一篇论文，而是一串论文共同在做的事。</p></div>
    ${(() => { const ideas = all.filter(c => c.area === 'idea'); return ideas.length ? `<section class="sec"><div class="sec-h"><h2>研究思路与话题</h2><span class="muted">${ideas.length} 条，按所在分支排列</span></div>
      ${G.tracks.map(t => { const l = ideas.filter(c => c.track === t.key); return l.length ? `<div class="divider"><b>${esc(t.name)}</b></div><div class="cgrid">${l.map(c => `<a href="#/c/${c.key}" class="hue" ${hue(t.key)}><span class="lv">${(c.nodes || []).length}</span><span>${esc(c.name)}<small>${esc(c.en || '')}</small></span></a>`).join('')}</div>` : ''; }).join('')}</section>` : ''; })()}
    ${Object.entries(AREA).filter(([a]) => a !== 'idea').map(([a, name]) => { const list = all.filter(c => c.area === a); return list.length ? `<section class="sec"><div class="sec-h"><h2>${name}</h2><span class="muted">${list.length} 条</span></div>
      <div class="cgrid">${list.map(c => `<a href="#/c/${c.key}" class="${c.has ? '' : 'todo-c'}"><span class="lv">${c.level}</span><span>${esc(c.name)}<small>${esc(c.en)}</small></span></a>`).join('')}</div></section>` : ''; }).join('')}
    ${terms.length ? `<section class="sec"><div class="sec-h"><h2>术语表</h2><span class="muted">${terms.length} 条，来自各篇讲解</span></div><ul class="rows">${terms.map(t => `<li class="row" style="grid-template-columns:1fr"><div><b>${esc(t.t)}</b>　${inline(t.d)}<div class="f">${t.nodes.slice(0, 6).map(chip).join(' ')}</div></div></li>`).join('')}</ul></section>` : ''}
    ${foot()}</div>`;
}
function viewConcept(key) {
  const c = concepts[key];
  if (!c) { app.innerHTML = `<div class="page"><div class="empty">没有这个概念：${esc(key)}</div></div>`; return; }
  const idea = c.area === 'idea', neededBy = Object.values(concepts).filter(x => (x.needs || []).includes(key));
  const ns = (c.nodes || []).map(i => byId[i]).filter(Boolean), origin = byId[c.origin] || null;
  const show = ns.length <= 90 ? ns : [...ns].sort((a, b) => a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, 90);
  const ids = [...new Set([...(origin ? [origin.id] : []), ...show.map(n => n.id)])];
  app.innerHTML = `<div class="page"><div class="narrow" style="margin:0 auto"><div class="article-head"><div class="eyebrow"><a href="#/concepts">概念与思路</a> · ${AREA[c.area]}${idea ? (trackBy[c.track] ? ` · <a href="#/track/${c.track}">${esc(trackBy[c.track].name)}</a>` : '') : ' · ' + LEVEL[c.level]}</div>
      <h1>${esc(c.name)}</h1><div class="full">${esc(c.en || '')}</div>
      ${(c.aka || []).length ? `<p class="tags muted" style="font-size:13px">也叫：${c.aka.map(esc).join('　')}</p>` : ''}
      <div class="acts">${stBtn('c:' + key)}<span class="muted" style="font-size:12.5px">标记学习状态</span></div></div>
    ${c.has ? `<div class="prose"><p style="font-size:18px;margin-top:22px"><b>${inline(c.short)}</b></p>
      ${(c.needs || []).length ? `<p class="tags">先要会：${c.needs.map(cchip).join(' ')}</p>` : ''}</div>` : `<div class="empty">这个词条还在整理中。</div>`}</div>
    ${ids.length ? `<section class="sec ntree"><div class="sec-h"><h2>它长在树上的哪里</h2><span class="muted">${origin ? `从 ${esc(origin.title)}（${origin.date.slice(0, 4)}）开始 · ` : ''}${ns.length} 个节点${idea ? '属于这个思路' : '用到它'}${ns.length > show.length ? `，这里画出最重要的 ${show.length} 个` : ''}。一行是一条主题线${ids.length <= 90 ? '，连线是继承关系' : ''}</span></div>
      <div class="toolbar"><a class="btn sm" href="#/map?c=${key}">在全景树里打开</a>${origin ? `<a class="btn sm" href="#/n/${encodeURIComponent(origin.id)}">读它的出处：${esc(origin.title)}</a>` : ''}</div>
      <div class="tscroll" id="ctree" style="max-height:60vh"></div></section>` : ''}
    <div class="narrow" style="margin:0 auto"><div class="prose">${c.has ? `${rich(c.body || '')}${c.example ? `<div class="example"><h4>例子</h4>${rich(c.example)}</div>` : ''}${c.pitfalls ? `<h2>常见误解</h2>${rich(c.pitfalls)}` : ''}` : ''}
      ${neededBy.length ? `<h2>学完它可以接着看</h2><p class="tags">${neededBy.map(x => cchip(x.key)).join(' ')}</p>` : ''}
      ${ns.length ? `<h2>${idea ? '属于这个思路的工作' : '用到它的工作'}</h2><p class="tags">${[...ns].sort((a, b) => idea ? (a.date < b.date ? -1 : 1) : a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, 60).map(n => chip(n.id)).join(' ')}</p>` : ''}</div></div>
    ${foot()}</div>`;
  document.title = `${c.name} · AI脉络`;
  setTree($('#ctree'), ids, origin ? [origin.id] : []);
}
function viewGuide() {
  store.set('seenGuide', 1);
  const t1n = G.nodes.filter(n => n.tier === 1).length, t2n = G.nodes.filter(n => n.tier === 2).length, t3n = G.nodes.filter(n => n.tier === 3).length;
  const ex = byId.transformer ? 'transformer' : G.nodes.find(n => n.tier === 1).id;
  app.innerHTML = `<div class="page narrow"><div class="mast"><div class="eyebrow">使用指南 · 读完约3分钟</div><h1>怎么用这个网站</h1>
    <p class="lead">这个网站把AI的发展画成一棵按时间生长的树。树上每个点是一个工作（论文、模型、芯片、数据集或事件），每条线说明后来的工作和前面的工作是什么关系。你不需要把${G.nodes.length}个点都读完：先读${t1n}个主干，其余按需要查。</p></div>
    <div class="prose guide">
      <h2>一、三种读法，选一种开始</h2>
      <div class="steps col">
        <a href="#/path"><b>A</b><h3>按时间从头读（推荐）</h3><p>打开“路线”，先扫一遍预备概念，再按时代顺序读主干节点。每个时代读之前先看那个时代的页面：当时有什么条件、大家在攻克什么。</p><span>去路线 →</span></a>
        <a href="#/path"><b>B</b><h3>只想搞懂一样东西</h3><p>比如只想读懂Transformer或Stable Diffusion。在“路线”页的“按目标学”里选一个终点，网站会排出一条从零到它的阅读链，每一站只用到前面讲过的东西。</p><span>选目标 →</span></a>
        <a href="#/tracks"><b>C</b><h3>只关心一个方向</h3><p>比如只看机器人或只看硬件。打开“分支”，选一条，再选它下面的一条主题线，从上往下读。默认显示主干和重要两档，想更全再切到“全部”。</p><span>去分支 →</span></a>
      </div>

      <h2>怎么看这棵树</h2>
      <p>整个领域分四层：<b>大方向</b>（6个）› <b>分支</b>（${G.tracks.length}条）› <b>主题线</b>（${G.tracks.reduce((a, t) => a + G.threads[t.key].length, 0)}条）› <b>节点</b>（${G.nodes.length}个）。打开<a class="ln" href="#/map">全景树</a>：</p>
      <ul>
        <li><b>先看总览</b>　一行是一条分支，时间从左到右。中间最粗的是树干（学习方法），上面是语言和社会环境，下面是感知、决策和土壤（数据、系统、算力）。行上只标主干节点；线旁边起伏的色带是这条分支每年的工作量，能看出它什么时候热起来。</li>
        <li><b>看分叉</b>　一条分支从另一条上弯出来，表示它是从那里长出来的，比如LLM在2017年从NLP分出、智能体在2020年从LLM分出。点线部分是它接上来之前的前史。写着“止于某年”的线已经没有新工作。</li>
        <li><b>点分支名展开</b>　这一行变成它的若干条主题线，每条从母线分出来，上面是这条线的节点。可以同时展开几条分支；顶上的“展开后显示”控制画到哪一档。</li>
        <li><b>点节点</b>　右边出现它的三句话讲解，同时画出它和图上其他节点的连接。点“只看来龙去脉”会只留下它的前因后果。</li>
        <li><b>虚线是汇流</b>　一条分支的成果被另一条拿去用的关键时刻，例如Transformer进入视觉。鼠标停在虚线上能看到说明。</li>
        <li>顶上可以切<b>横向 / 竖向</b>（竖向是根在下、往上长）和缩放。手机上默认竖向。</li>
      </ul>

      <h2>二、一个节点页怎么读</h2>
      <p>以 <a class="ln" href="#/n/${ex}">${esc(byId[ex].title)}</a> 为例，从上到下是：</p>
      <ul>
        <li><b>顶上三格</b>　当时卡在哪、它怎么解决、改变了什么。赶时间只读这三格也能知道这个工作是干什么的。</li>
        <li><b>先要会的概念</b>　读懂这篇需要的基础概念，不会的先点进去看。正文里带虚线的词也是概念，带颜色下划线的是别的节点。</li>
        <li><b>背景、方法、结果、后续</b>　完整讲解。</li>
        <li><b>它留下的问题</b>　这个工作没解决的事，以及后来是哪个工作解决的。沿着这里往下点，就是这个方向的发展线。</li>
        <li><b>它建立在什么之上 / 后来谁接着做</b>　它和其他工作的全部连接，每条都有一句说明。</li>
        <li><b>怎么学</b>　读原文或动手的建议。页面最底下列出了讲解核对过的出处。</li>
      </ul>
      <p>读完点标题下面的圆点记录状态：点一下是“在读”，再点一下是“已读”。键盘 ← → 可以翻到本分支的上一个、下一个。</p>

      <h2>三、图例</h2>
      <h3>节点分三档</h3>
      <ul>
        <li><b>主干</b>（${t1n}个）　缺了它后面就讲不通，必读。</li>
        <li><b>重要</b>（${t2n}个）　这个方向的人都知道，建议读。</li>
        <li><b>延伸</b>（${t3n}个）　用到再查，不需要通读。</li>
      </ul>
      <h3>连线有四种</h3>
      <ul class="rels">
        <li><span class="ty solves">解决</span><div>后来的工作解决了前面工作留下的某个具体问题。这是最值得顺着读的一种线。</div></li>
        <li><span class="ty extends">延续</span><div>沿用前面的思路往前推了一步，比如同一系列的下一代。</div></li>
        <li><span class="ty uses">使用</span><div>把前面的工作当作一个部件或工具来用。</div></li>
        <li><span class="ty rivals">竞争</span><div>针对同一个问题的不同路线。</div></li>
      </ul>
      <p>线的方向永远是从早到晚。节点类型有七种：论文、模型、系统、硬件、数据集、事件、思想。</p>

      <h2>四、每个页面是干什么的</h2>
      <ul>
        <li><a class="ln" href="#/path">路线</a>　主干阅读顺序、按目标的阅读链、预备概念。<b>不知道从哪开始就来这里。</b></li>
        <li><a class="ln" href="#/eras">时代</a>　九个时代，每个时代当时的条件、各方向在攻克什么、什么热了什么退潮了。</li>
        <li><a class="ln" href="#/tracks">分支</a>　六个大方向、${G.tracks.length}条分支和每条下面的主题线，以及每条分支从哪里长出来。想知道“这个领域由哪些部分组成”看这里。</li>
        <li><a class="ln" href="#/map">全景树</a>　整棵树画在一张图上，先看总览，再点分支展开成主题线。想知道“谁从谁长出来、什么时候发生的”看这里。</li>
        <li><a class="ln" href="#/concepts">概念</a>　${Object.values(concepts).filter(c => c.area !== 'idea').length}个基础概念（分预备、入门、进阶三级）和${Object.values(concepts).filter(c => c.area === 'idea').length}个研究思路（“在策略自蒸馏”“扩散语言模型”这类不是某一篇论文、而是一串论文共同在做的事）。每一条都画出了它在树上的位置：从哪个节点开始，后来长到了哪些主题线上。</li>
        <li><a class="ln" href="#/open">开放问题</a>　还没有后续工作解决的遗留问题，可以按分支和年份筛。</li>
        <li><a class="ln" href="#/me">我的</a>　学习进度、收藏、笔记、导出导入；里面还有自测卡片和统计。</li>
        <li><b>搜索</b>　右上角，按 <code>/</code> 聚焦。可以搜论文和模型的名字、英文原题、缩写（DLM、OPSD、RAG）、别名、作者、机构，也可以直接搜一个概念或思路（自回归、测试时训练、swarm）。中英文的常见叫法互通，多个词之间用空格。结果页最上面会把命中的东西画成一棵树，告诉你它长在哪几条主题线上；标题里找到的太少时会自动连讲解全文一起找。</li>
      </ul>

      <h2>五、几个建议</h2>
      <ul>
        <li>主干每篇大约5到10分钟。每天读两三篇，一个月左右能读完主干，对整个领域就有完整的时间线了。</li>
        <li>遇到看不懂的词先点概念词条，不要硬读。概念词条本身也列了它需要的前置概念。</li>
        <li>读完一个时代，用“我的”里的自测卡片过一遍，或者在节点页底部写两句笔记。</li>
        <li>想知道两个工作之间隔着什么，用<a class="ln" href="#/link">演进路径</a>。</li>
      </ul>

      <h2>六、需要知道的两件事</h2>
      <ul>
        <li><b>进度只存在这台设备的浏览器里。</b>换设备或清除浏览数据会丢，可以在“我的”页导出和导入。</li>
        <li><b>讲解由AI模型撰写。</b>写作时要求对照论文原文或官方页面核对，每个节点底部列了出处，但仍可能有错，尤其是最近一两年的事件。引用前请以原文为准。</li>
      </ul>
      <div class="toolbar" style="margin-top:28px"><a class="btn fill" href="#/path">开始学习</a><a class="btn" href="#/">回首页</a></div>
    </div>${foot()}</div>`;
  document.title = '使用指南 · AI脉络';
}

/* ——— 学习路线 ——— */
function viewPath(_, q = {}) {
  const seen = new Set();
  const lv0 = Object.values(concepts).filter(c => c.level === 0);
  lv0.forEach(c => seen.add(c.key));
  const t1 = G.nodes.filter(n => n.tier === 1), ps = doneStat(t1.map(n => n.id));
  const blocks = G.eras.map((e, i) => {
    const trunk = t1.filter(n => eraOf(n) === e);
    const t2 = G.nodes.filter(n => eraOf(n) === e && n.tier === 2).length;
    return `<section class="sec"><div class="sec-h"><h2>${i + 1}　${esc(e.name)}</h2><span class="muted">${e.from}–${e.to} · 主干 ${trunk.length} 篇</span></div>
      <p style="color:var(--ink-2);margin:4px 0 0">${esc(e.read)}</p>
      <ul class="rows">${trunk.map(n => row(n, {track: true, full: true})).join('')}</ul>
      <div class="toolbar"><a class="btn sm" href="#/era/${e.id}">这个时代的全貌与另外 ${t2} 篇重要工作 →</a></div></section>`;
  });
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">学习路线</div><h1>从头读到今天</h1>
    <p class="lead">一条最短的主干：${t1.length}个缺了就讲不通的节点，按时间排好。每个时代先读主干，再按兴趣去那个时代的页面里读“重要”一档。右侧圆点点一下标记在读，再点一下标记已读，进度只存在这台设备的浏览器里。</p>
    <div class="bar" style="max-width:520px;margin-top:16px"><i style="width:${ps.pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">主干已读 ${ps.d} / ${ps.n}</div>
    <div class="toolbar"><button class="btn sm" id="exp">导出进度</button><button class="btn sm" id="imp">导入进度</button><input type="file" id="impf" accept="application/json" hidden></div></div>
    <section class="sec"><div class="sec-h"><h2>按目标学</h2><span class="muted">只想搞懂某一样东西？给你一条从零到它的最短链</span></div>
      <div class="grid">${GOALS.filter(g => byId[g[0]]).map(([gid, label]) => `<a class="card hue" ${hue(byId[gid].track)} href="#/chain/${gid}"><h3>${esc(label)}</h3><p>终点：${esc(byId[gid].title)}（${byId[gid].date.slice(0, 4)}）</p><div class="n">${chainOf(gid, false).length} 站</div></a>`).join('')}</div></section>
    <section class="sec" id="prep"><div class="sec-h"><h2>0　预备</h2><span class="muted">进入AI之前就该会的 ${lv0.length} 个概念</span></div>
      <p style="color:var(--ink-2);margin:4px 0 0">扫一遍，不熟的点进去看。之后每篇讲解开头都会列出它需要的概念，读到哪补到哪。</p>
      <div class="cgrid">${lv0.map(c => `<a href="#/c/${c.key}" class="${c.has ? '' : 'todo-c'}"><span class="lv">${status('c:' + c.key) === 2 ? '✓' : '0'}</span><span>${esc(c.name)}<small>${AREA[c.area]}</small></span></a>`).join('')}</div></section>
    ${blocks.join('')}${foot()}</div>`;
  $('#exp').onclick = exportAll;
  $('#imp').onclick = () => $('#impf').click();
  $('#impf').onchange = ev => importAll(ev.target.files[0], viewPath);
  if (q.to === 'prep') setTimeout(() => $('#prep') && $('#prep').scrollIntoView(), 0);
}

/* ——— 搜索 ——— */
let index;
// 同义词组：搜其中任何一个，等于同时搜这一组（可以是多词短语）。只放“同一个东西的不同叫法”
const SYN = [
  ['rl', '强化学习', 'reinforcement learning'], ['marl', '多智能体强化学习', 'multi-agent rl', 'multi-agent reinforcement learning'], ['llm', '大语言模型', '大模型', 'large language model'],
  ['vlm', '视觉语言模型', 'vision-language model', 'vision language model'], ['vla', '视觉-语言-动作', 'vision-language-action'], ['ssl', '自监督', 'self-supervised'],
  ['kd', '蒸馏', 'distillation', 'distill'], ['swarm', '群体智能', '智能体群'], ['agent', '智能体', 'agents'], ['multi-agent', '多智能体', 'multiagent'], ['diffusion', '扩散'],
  ['autoregressive', '自回归', 'auto-regressive'], ['gnn', '图神经网络', 'graph neural network'], ['cv', '计算机视觉', 'computer vision'], ['nlp', '自然语言处理', 'natural language processing'],
  ['tts', '语音合成', 'text-to-speech', 'text to speech'], ['asr', '语音识别', 'speech recognition'], ['rag', '检索增强', 'retrieval-augmented', 'retrieval augmented'],
  ['cot', '思维链', 'chain-of-thought', 'chain of thought'], ['moe', '混合专家', 'mixture of experts', 'mixture-of-experts'], ['peft', '参数高效微调', 'parameter-efficient'],
  ['world model', '世界模型', 'world models'], ['icl', '上下文学习', 'in-context learning'], ['ttt', '测试时训练', 'test-time training', 'test time training'], ['tta', '测试时适应', 'test-time adaptation'],
  ['sae', '稀疏自编码器', 'sparse autoencoder'], ['interpretability', '可解释性', 'interp'], ['finetune', '微调', 'fine-tuning', 'fine-tune', 'finetuning'], ['quantization', '量化'],
  ['benchmark', '基准', '评测'], ['robot', '机器人', 'robotics'], ['reasoning', '推理'], ['alignment', '对齐'], ['embedding', '嵌入', '向量表示'], ['attention', '注意力'],
  ['pretraining', '预训练', 'pre-training', 'pretrain'], ['multimodal', '多模态', 'multi-modal'], ['video', '视频'], ['image', '图像'], ['speech', '语音'], ['tokenizer', '分词器', 'tokenization'],
  ['memory', '记忆'], ['tool use', '工具调用', 'tool calling', 'function calling'], ['planning', '规划'], ['imitation learning', '模仿学习', 'imitation'], ['offline rl', '离线强化学习', '离线rl'],
  ['self-play', '自我对弈', '自博弈'], ['gan', '生成对抗网络', '生成对抗'], ['vae', '变分自编码器'], ['flow matching', '流匹配'], ['3d', '三维'], ['detection', '检测'], ['segmentation', '分割'],
  ['safety', '安全'], ['jailbreak', '越狱'], ['hallucination', '幻觉'], ['compression', '压缩'], ['pruning', '剪枝'], ['scaling law', '规模定律', 'scaling laws'], ['on-policy', '在策略', '同策略'],
  ['off-policy', '离策略', '异策略'], ['self-distillation', '自蒸馏'], ['continual learning', '持续学习', 'lifelong learning', '终身学习'], ['meta-learning', '元学习', 'meta learning'],
  ['contrastive', '对比学习'], ['few-shot', '少样本'], ['zero-shot', '零样本'], ['transfer learning', '迁移学习'], ['curriculum', '课程学习'], ['prompt', '提示'], ['context engineering', '上下文工程'],
  ['humanoid', '人形机器人', '人形'], ['autonomous driving', '自动驾驶', 'self-driving'], ['protein', '蛋白质'], ['theorem proving', '定理证明'], ['code', '代码', 'coding'], ['long context', '长上下文'],
  ['inference', '推理服务'], ['kv cache', 'kv缓存'], ['gpu', '显卡'], ['dataset', '数据集'], ['evaluation', '评测'], ['optimizer', '优化器'], ['normalization', '归一化'], ['regularization', '正则化'],
  ['generalization', '泛化'], ['adversarial', '对抗'], ['backdoor', '后门'], ['privacy', '隐私'], ['governance', '治理'], ['open source', '开源', 'open-source'], ['synthetic data', '合成数据']
].map(g => g.map(x => x.toLowerCase()));
const synOf = {};
SYN.forEach(g => g.forEach(w => { synOf[w] = synOf[w] ? [...new Set([...synOf[w], ...g])] : g; }));
const synPhrases = Object.keys(synOf).filter(w => w.includes(' ')).sort((a, b) => b.length - a.length);
// 英文原题各词的首字母连起来，用来按缩写找：搜“dlm”能命中“… Diffusion Language Models”
const initials = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => w[0]).join('');
const low = a => (a || []).map(x => x.toLowerCase());
function buildIndex() {
  if (index) return index;
  index = [];
  for (const n of G.nodes) index.push({k: 'n', id: n.id, t: n.title, s: [n.full, n.who].filter(Boolean).join(' · ') || trackBy[n.track].name, aka: low(n.aka),
    hay: [n.title, n.id, n.full, n.who, n.date, ...(n.aka || [])].join('\n').toLowerCase(), hay2: [n.problem, n.idea, n.impact, trackBy[n.track].name, trackBy[n.track].short, n.track].join('\n').toLowerCase(), ac: initials(n.full), w: 4 - n.tier, n});
  for (const tr of G.tracks) for (const th of G.threads[tr.key]) index.push({k: 'th', id: `${tr.key}?th=${th.key}`, t: th.name, s: `主题线 · ${tr.name} · ${th.n}个节点`, tr: tr.key, th,
    hay: [th.name, th.key, ...(th.aka || [])].join('\n').toLowerCase(), hay2: [th.blurb, tr.name, tr.short, tr.key].join('\n').toLowerCase(), aka: low(th.aka), w: 3.5});
  for (const c of Object.values(concepts)) index.push({k: 'c', id: c.key, t: c.name, s: (c.area === 'idea' ? '思路 · ' : '概念 · ') + (c.en || c.short || ''), aka: [...low(c.aka), (c.en || '').toLowerCase()],
    hay: [c.name, c.en, c.key, ...(c.aka || [])].join('\n').toLowerCase(), hay2: (c.short || '').toLowerCase(), ac: initials(c.en), w: c.area === 'idea' ? 3.2 : 2.5});
  for (const t of terms) index.push({k: 't', id: t.nodes[0], t: t.t, s: '术语 · ' + t.d, hay: t.t.toLowerCase(), hay2: t.d.toLowerCase(), w: 1});
  for (const it of index) { it.tl = it.t.toLowerCase(); it.tk = new Set(it.tl.match(/[a-z0-9]+/g) || []); }      // 标题里的英文词，整词命中排在子串命中前面
  return index;
}
function queryTerms(q) {      // 拆成词；同义词表里的多词短语算一个词
  let s = ' ' + q.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
  const out = [];
  for (const p of synPhrases) if (s.includes(' ' + p + ' ')) { out.push(p); s = s.replace(' ' + p + ' ', ' '); }
  return [...out, ...s.trim().split(' ').filter(Boolean)];
}
// 短的英文词（≤4个字母）在英文原题、作者、id里必须从词头开始匹配，否则“marl”会命中作者 Hammarling
const inHay = (hay, w) => /^[a-z0-9]{1,4}$/.test(w) ? new RegExp('(^|[^a-z0-9])' + w).test(hay) : hay.includes(w);
function scoreWord(it, w, lit) {
  if (it.tl === w) return 100;
  if (it.aka && it.aka.includes(w)) return 80;
  if (it.tk.has(w)) return 70;
  if (it.tl.startsWith(w)) return 60;
  if (it.tl.includes(w)) return 40;
  if (inHay(it.hay, w)) return 20;
  if (lit && it.ac && /^[a-z0-9]{3,8}$/.test(w) && it.ac.includes(w)) return 14;      // 按首字母缩写找，只对用户原样输入的词做
  return inHay(it.hay2, w) ? 6 : 0;
}
function scoreTerm(it, w) {
  let s = scoreWord(it, w, true);
  if (synOf[w]) for (const a of synOf[w]) if (a !== w) s = Math.max(s, scoreWord(it, a) * .8);
  if (w.includes(' ')) s = Math.max(s, .9 * Math.min(...w.split(' ').map(x => scoreTerm(it, x))));      // 短语没有原样出现时，退回到每个词都出现
  return s + (s && it.id === w ? 30 : 0);
}
/* 返回按相关度排好的结果。每项带 sc（每个词的平均得分）和 partial（只匹配了一部分词）。
   全部词都匹配的结果太少时，补上只匹配一部分的：少见的词权重大，所以“swarm rl”会先给出含 swarm 的。 */
function search(q, limit = 200) {
  const ws = queryTerms(q);
  if (!ws.length) return [];
  const N = buildIndex().length, whole = q.toLowerCase().replace(/\s+/g, ' ').trim();
  const run = ws => {
    const full = [], part = [], df = ws.map(() => 0);
    for (const it of index) {
      let sc = ws.map(w => scoreTerm(it, w));
      if (ws.length > 1 && (it.tl === whole || (it.aka && it.aka.includes(whole)))) sc = sc.map(() => 100);      // 整个查询就是它的名字或别名
      const hit = sc.filter(Boolean).length;
      sc.forEach((x, i) => { if (x) df[i]++; });
      if (hit === ws.length) { const sum = sc.reduce((a, b) => a + b, 0); full.push([sum + it.w, it, sum / ws.length]); }
      else if (hit) part.push([sc, it]);
    }
    // 只匹配一部分词的：必须包含最少见的那个词（“swarm rl”里是 swarm），按“词越少见越重要”排
    const rare = df.reduce((m, d, i) => d && (m < 0 || d < df[m]) ? i : m, -1), idf = df.map(d => Math.log(1 + N / (1 + d)));
    const loose = rare < 0 ? [] : part.filter(([sc]) => sc[rare] >= 6).map(([sc, it]) => [sc.reduce((a, x, i) => a + x * idf[i], 0) + it.w, it, Math.max(...sc) / 2]);
    return {full, loose};
  };
  let {full, loose} = run(ws);
  if (!full.length && ws.length === 1 && /^[一-鿿]{4,}$/.test(ws[0])) {      // 一整串中文没命中：试着从中间切成两个词
    const f = new Map(), l = new Map(), keep = (m, r, k) => { if (!m.has(r[1]) || m.get(r[1])[0] < r[0] * k) m.set(r[1], [r[0] * k, r[1], r[2] * k]); };
    for (let i = 2; i <= ws[0].length - 2; i++) { const r = run([ws[0].slice(0, i), ws[0].slice(i)]); r.full.forEach(x => keep(f, x, .5)); r.loose.filter(x => x[2] >= 20).forEach(x => keep(l, x, 1)); }
    full = [...f.values()]; loose = [...l.values()].filter(x => !f.has(x[1]));
  }
  const wrap = (it, sc, partial) => Object.assign(Object.create(it), {sc, partial});
  const res = full.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => wrap(x[1], x[2], false));
  if (res.length < 8) for (const x of loose.sort((a, b) => b[0] - a[0]).slice(0, 40)) res.push(wrap(x[1], x[2], true));
  return res;
}
/* 一个搜索词对应树上的哪些节点：名字或别名对得上的主题线、概念、思路的全部成员，加上标题直接命中的节点 */
function memberIds(it, cap = 80) {
  const ids = it.k === 'th' ? it.th.ids : it.k === 'c' ? (concepts[it.id].nodes || []) : it.k === 'n' ? [it.id] : [];
  return ids.length <= cap ? ids : ids.map(i => byId[i]).filter(Boolean).sort((a, b) => a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, cap).map(n => n.id);
}
function topicSet(q, res) {
  res = res || search(q, 400);
  const set = new Set(), from = [];
  for (const it of res.filter(x => !x.partial && x.sc >= 70 && (x.k === 'th' || x.k === 'c')).slice(0, 3)) { const ids = memberIds(it); if (ids.length) { ids.forEach(i => set.add(i)); from.push(it); } }
  const ns = res.filter(x => x.k === 'n');
  ns.filter(x => !x.partial && x.sc >= 40).slice(0, 60).forEach(x => set.add(x.id));
  if (set.size < 3) ns.slice(0, 30).forEach(x => set.add(x.id));
  return {ids: [...set].filter(i => byId[i]), from};
}
/* 把一组节点画成一棵嵌在页面里的小树：按分支和主题线分行、按时间排列，连线是它们之间的继承关系。mark：要圈出来的节点 */
function setTree(box, ids, mark = [], only = null) {
  const set = new Set(ids.filter(i => byId[i]));
  if (!box || !set.size) { if (box) box.hidden = true; return; }
  let first = 9999; set.forEach(i => { first = Math.min(first, byId[i].y); });
  // only：只画和这个节点直接相连的线（节点页用，免得同一条线上的工作互相连成一团）
  const edges = only ? G.edges.filter(e => (e.from === only || e.to === only) && set.has(e.from) && set.has(e.to)) : set.size <= 90 ? G.edges.filter(e => set.has(e.from) && set.has(e.to)) : null;
  const lay = fit => treeLayout({dir: 'h', nodes: set, tier: 3, fit, y0: first - 1});
  const avail = box.clientWidth - 168 - 4;
  let L = lay(avail - 62 - 96);
  if (L.T > avail && L.z > .2) L = lay(avail - 62 - 96 - (L.T - avail));
  const D = treeDraw(L, {edges});
  box.innerHTML = `<div class="tcanvas plane" style="width:${D.W}px;height:${D.H}px">${D.html}</div>`;
  let el = null;
  for (const id of mark) { const x = box.querySelector(`.nd[data-id="${CSS.escape(id)}"]`); if (x) { x.classList.add('sel'); el = el || x; } }
  if (el) box.scrollTo(Math.max(0, el.offsetLeft - box.clientWidth / 2), Math.max(0, el.offsetTop - 120));
}
const hrefOf = it => it.k === 'c' ? `#/c/${it.id}` : it.k === 'th' ? `#/track/${it.id}` : `#/n/${it.id}`;
function initSearch() {
  const inp = $('#q'), drop = $('#drop');
  let sel = -1, items = [];
  const close = () => { drop.hidden = true; sel = -1; };
  const paint = () => {
    const q = inp.value.trim();
    if (!q) return close();
    items = search(q, 9);
    drop.innerHTML = (items.length ? items.map((it, i) => `<a href="${hrefOf(it)}" class="${i === sel ? 'sel' : ''}"><div class="t">${esc(it.t)}${it.k === 'n' ? ` <span class="muted" style="font-weight:400;font-size:12px">${it.n.date.slice(0, 4)} · ${esc(trackBy[it.n.track].short)}${it.partial ? ' · 部分匹配' : ''}</span>` : ''}</div><div class="s">${esc(it.s)}</div></a>`).join('') : '<div class="more">没有匹配</div>')
      + `<a class="more" href="#/search?q=${encodeURIComponent(q)}">查看全部结果 ↵</a>`;
    drop.hidden = false;
  };
  inp.addEventListener('input', () => { sel = -1; paint(); });
  inp.addEventListener('focus', paint);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); paint(); }
    else if (e.key === 'Enter') { location.hash = sel >= 0 ? hrefOf(items[sel]) : `#/search?q=${encodeURIComponent(inp.value.trim())}`; close(); inp.blur(); }
    else if (e.key === 'Escape') { close(); inp.blur(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search') || e.target.closest('#drop a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); inp.focus(); inp.select(); } });
}
let fullText = null;
async function loadFullText() {
  if (fullText) return fullText;
  const all = await Promise.all(G.tracks.map(t => loadContent(t.key)));
  fullText = {};
  all.forEach(obj => { for (const [id, c] of Object.entries(obj)) fullText[id] = [c.background, c.method, c.results, c.legacy, c.pitfalls, c.learn, (c.limits || []).map(l => l.text).join('\n'), (c.terms || []).map(t => t.t + ' ' + t.d).join('\n')].join('\n').toLowerCase(); });
  return fullText;
}
async function viewSearch(_, q) {
  const query = (q.q || '').trim();
  let res = search(query, 400);
  const strict = res.filter(x => x.k === 'n' && !x.partial).length;
  const ft = q.full === '1' || (query && q.full !== '0' && strict < 6);      // 标题里找到的太少时，自动连讲解全文一起找
  let inText = [];
  if (ft && query) {
    app.innerHTML = '<p class="loading">正在载入全部讲解正文…</p>';
    const txt = await loadFullText(), words = queryTerms(query), have = new Set(res.filter(x => x.k === 'n' && !x.partial).map(x => x.id));
    const hit = (t, w) => t.includes(w) || (synOf[w] || []).some(a => t.includes(a));
    for (const n of G.nodes) if (!have.has(n.id) && txt[n.id] && words.every(w => hit(txt[n.id], w))) inText.push(Object.assign(Object.create(buildIndex().find(x => x.k === 'n' && x.id === n.id)), {sc: 5, partial: false, deep: true}));
    inText.sort((a, b) => a.n.tier - b.n.tier || (a.n.date < b.n.date ? 1 : -1));
    const deep = new Set(inText.map(x => x.id));
    res = [...res.filter(x => !(x.partial && deep.has(x.id))), ...inText];
    if (decodeURIComponent(location.hash).indexOf(query) < 0) return;
  }
  const all = res.filter(x => x.k === 'n'), cs = res.filter(x => x.k !== 'n' && !x.partial);
  const tracksHit = G.tracks.filter(t => all.some(x => x.n.track === t.key));
  let ns = all;
  if (q.track) ns = ns.filter(x => x.n.track === q.track);
  if (q.tier) ns = ns.filter(x => x.n.tier <= +q.tier);
  if (q.kind) ns = ns.filter(x => x.n.kind === q.kind);
  const byDate = l => q.sort === 'date' ? [...l].sort((a, b) => a.n.date < b.n.date ? -1 : 1) : l;
  const exact = byDate(ns.filter(x => !x.partial && !x.deep)), deepHits = byDate(ns.filter(x => x.deep)), part = byDate(ns.filter(x => x.partial));
  const link = o => { const p = new URLSearchParams({...q, ...o}); for (const [k, v] of [...p]) if (!v) p.delete(k); return '#/search?' + p; };
  const topic = query ? topicSet(query, res) : {ids: [], from: []};
  const rows = (title, list, note) => list.length ? `<section class="sec"><div class="sec-h"><h2>${title}</h2><span class="muted">${list.length} 个${list.length > 200 ? '，只显示前200个' : ''}${note ? ' · ' + note : ''}</span></div><ul class="rows">${list.slice(0, 200).map(it => row(it.n, {track: true})).join('')}</ul></section>` : '';
  const kindOf = it => it.k === 'th' ? '线' : it.k === 'c' ? (concepts[it.id].area === 'idea' ? '思' : concepts[it.id].level) : '术';
  $('#q').value = query;
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">搜索</div><h1>${esc(query) || '搜索'}</h1>
    <p class="lead">${res.length ? `${exact.length + deepHits.length} 个节点${part.length ? `，另有 ${part.length} 个只匹配了部分关键词` : ''}；${cs.length} 条主题线、概念、思路或术语` : '没有匹配。可以试试英文原名或缩写、作者姓氏、机构名。库里收了约三千个节点，太新或太细的工作可能还没收录。'}</p>
    <div class="toolbar"><label>档位</label>${[['', '全部'], ['1', '主干'], ['2', '主干+重要']].map(([v, l]) => `<a class="btn sm ${(q.tier || '') === v ? 'on' : ''}" href="${link({tier: v})}">${l}</a>`).join('')}
      <label>排序</label><a class="btn sm ${q.sort === 'date' ? '' : 'on'}" href="${link({sort: ''})}">相关度</a><a class="btn sm ${q.sort === 'date' ? 'on' : ''}" href="${link({sort: 'date'})}">时间</a>
      <label>范围</label><a class="btn sm ${ft ? '' : 'on'}" href="${link({full: '0'})}">只搜标题与摘要</a><a class="btn sm ${ft ? 'on' : ''}" href="${link({full: '1'})}">连讲解全文一起搜</a></div>
    ${tracksHit.length > 1 ? `<div class="toolbar"><label>分支</label><a class="btn sm ${q.track ? '' : 'on'}" href="${link({track: ''})}">全部</a>${tracksHit.map(t => `<a class="btn sm ${q.track === t.key ? 'on' : ''}" href="${link({track: t.key})}">${esc(t.short)}</a>`).join('')}</div>` : ''}
    <div class="toolbar"><label>类型</label><a class="btn sm ${q.kind ? '' : 'on'}" href="${link({kind: ''})}">全部</a>${Object.entries(KIND).map(([k, l]) => `<a class="btn sm ${q.kind === k ? 'on' : ''}" href="${link({kind: k})}">${l}</a>`).join('')}</div></div>
    ${cs.length ? `<section class="sec"><div class="sec-h"><h2>主题线、概念、思路与术语</h2></div><div class="cgrid">${cs.slice(0, 40).map(it => `<a href="${hrefOf(it)}"><span class="lv">${kindOf(it)}</span><span>${esc(it.t)}<small>${esc(it.s.slice(0, 46))}</small></span></a>`).join('')}</div></section>` : ''}
    ${topic.ids.length ? `<section class="sec"><div class="sec-h"><h2>它在树上的位置</h2><span class="muted">${topic.ids.length} 个节点${topic.from.length ? `：${topic.from.map(x => `“${esc(x.t)}”`).join('、')}的成员，加上标题直接命中的` : ''}。一行是一条主题线，连线是继承关系</span></div>
      <div class="toolbar"><a class="btn sm" href="#/map?q=${encodeURIComponent(query)}">在全景树里打开</a></div><div class="tscroll" id="stree"></div></section>` : ''}
    ${rows('节点', exact)}${rows('讲解正文里提到', deepHits, '标题里没有这个词，正文里有')}${rows('只匹配了部分关键词', part, '没有同时包含所有词的结果时作为补充')}${foot()}</div>`;
  setTree($('#stree'), topic.ids);
}

/* ——— 学习链：从零读懂某个节点需要先读哪些 ——— */
const GOALS = [['transformer', '读懂Transformer'], ['chatgpt', 'ChatGPT是怎么来的'], ['deepseek-r1', '推理模型与RLVR'], ['claude-code', '编码智能体'], ['mcp', '工具调用与MCP'], ['ldm', 'Stable Diffusion'], ['sora', '视频生成'],
  ['gpt-4o', '全模态模型'], ['sam', '视觉基础模型'], ['pi0', 'VLA机器人模型'], ['dreamzero', '世界动作模型WAM'], ['genie-3', '可交互世界模型'], ['alphago', 'AlphaGo'], ['alphafold-2', 'AlphaFold 2'], ['h100', '算力：从摩尔定律到H100'], ['lora', '大模型的低成本微调'], ['monosemanticity', '机制可解释性'], ['swe-bench', '怎样评测智能体']];
function chainOf(id, full) {
  // 沿“建立在什么之上”的边往回走。精简版：只收主干（tier 1）祖先 + 直接parent；完整版：再加两层以内的重要（tier 2）祖先
  const depth = {[id]: 0}; let fr = [id];
  for (let d = 1; fr.length && d < 40; d++) {
    const nx = [];
    for (const x of fr) for (const e of inn[x]) {
      if (e.type === 'rivals' || depth[e.from] != null) continue;
      const p = byId[e.from];
      if (d === 1 || p.tier === 1 || (full && p.tier === 2 && d <= 3)) { depth[e.from] = d; nx.push(e.from); }
    }
    fr = nx;
  }
  return Object.keys(depth).map(i => byId[i]).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
async function viewChain(id, q) {
  const n = byId[id];
  if (!n) { app.innerHTML = `<div class="page"><div class="empty">没有这个节点：${esc(id)}</div></div>`; return; }
  const full = q.full === '1', list = chainOf(id, full), ps = doneStat(list.map(x => x.id));
  const c = (await loadContent(n.track))[id] || {};
  const pre = new Set(c.prereq || []);
  app.innerHTML = `<div class="page hue" ${hue(n.track)}><div class="mast"><div class="eyebrow">学习链 · ${list.length} 站</div><h1>从零读懂：${esc(n.title)}</h1>
    <p class="lead">沿着“它建立在什么之上”一路往回找到源头，再按时间顺序排好。从第一站读到最后一站，每一站都只用到前面讲过的东西。精简版只保留主干和它的直接前驱；完整版再加上两层以内的重要工作。</p>
    <div class="bar" style="max-width:520px;margin-top:16px"><i style="width:${ps.pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">已读 ${ps.d} / ${ps.n}</div>
    <div class="toolbar"><a class="btn sm ${full ? '' : 'on'}" href="#/chain/${encodeURIComponent(id)}">精简</a><a class="btn sm ${full ? 'on' : ''}" href="#/chain/${encodeURIComponent(id)}?full=1">完整</a><span class="sp"></span><a class="btn sm" href="#/map?focus=${encodeURIComponent(id)}&depth=9">在全景树中看</a></div></div>
    ${pre.size ? `<section class="sec"><div class="sec-h"><h2>先补概念</h2><span class="muted">终点那篇直接用到的</span></div><p class="tags">${[...pre].map(cchip).join(' ')}</p></section>` : ''}
    <section class="sec"><ul class="rows">${list.map(x => row(x, {track: true, full: true})).join('')}</ul></section>${foot()}</div>`;
  document.title = `学习链：${n.title} · AI脉络`;
}

/* ——— 两个节点之间的演进路径：沿着“解决/延续/使用”的边，从早的走到晚的 ——— */
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
    while (prev[cur]) { steps.unshift({id: cur, e: prev[cur][1]}); cur = prev[cur][0]; }
    return steps;
  };
  return bfs(true) || bfs(false);
}
function viewLink(a, q, b) {
  const pick = id => byId[id] ? id : '';
  a = pick(a); b = pick(b);
  if (a && b && byId[a].date > byId[b].date) [a, b] = [b, a];
  const steps = a && b && a !== b ? linkPath(a, b) : null;
  const opts = G.nodes.filter(n => n.tier <= 2).map(n => `<option value="${esc(n.title)}">`).join('');
  const nameOf = id => id ? byId[id].title : '';
  const directed = steps && steps.every((s, i) => s.e.to === s.id);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">演进路径</div><h1>${a && b ? `${esc(nameOf(a))} → ${esc(nameOf(b))}` : '两个工作是怎么连起来的'}</h1>
    <p class="lead">选两个节点，找出图上连接它们的最短一条线：每一步是谁解决了谁的问题、谁沿用了谁的方法。适合回答“从感知机到Transformer中间隔着什么”这类问题。</p>
    <form class="toolbar" id="lf"><input class="inp" id="la" list="lopts" placeholder="起点，如 感知机" value="${esc(nameOf(a))}"><span>→</span><input class="inp" id="lb" list="lopts" placeholder="终点，如 Transformer" value="${esc(nameOf(b))}"><button class="btn sm fill">找路径</button><datalist id="lopts">${opts}</datalist></form>
    <div class="toolbar"><label>试试</label>${[['perceptron', 'transformer'], ['shannon-ngram', 'gpt-3'], ['backprop', 'alphafold2'], ['world-models', 'dreamzero'], ['alexnet', 'sora']].filter(([x, y]) => byId[x] && byId[y]).map(([x, y]) => `<a class="btn sm" href="#/link/${x}/${y}">${esc(byId[x].title)} → ${esc(byId[y].title)}</a>`).join('')}</div></div>
    ${a && b ? (steps ? `<section class="sec"><div class="sec-h"><h2>${steps.length} 步</h2><span class="muted">${directed ? '每一步都是后来的工作接着前面的做' : '两者没有一条顺着时间的直接传承线，这是经由共同相关工作的最短联系'}</span></div>
      <ul class="rows">${row(byId[a], {track: true, full: true})}${steps.map(s => `<li class="hop"><span class="ty ${s.e.type}">${s.e.to === s.id ? '' : '← '}${REL[s.e.type]}</span><span>${inline(s.e.note || '')}</span></li>${row(byId[s.id], {track: true, full: true})}`).join('')}</ul>
      <div class="toolbar"><a class="btn sm" href="#/map?focus=${encodeURIComponent(b)}&depth=3">在全景树中看终点的来龙去脉</a><a class="btn sm" href="#/chain/${encodeURIComponent(b)}">终点的完整学习链</a></div></section>`
      : `<div class="empty">图上没有找到连接这两个节点的路径。</div>`) : ''}
    ${foot()}</div>`;
  document.title = '演进路径 · AI脉络';
  $('#lf').onsubmit = ev => {
    ev.preventDefault();
    const find = v => { v = v.trim().toLowerCase(); if (!v) return ''; const hit = G.nodes.find(n => n.title.toLowerCase() === v || n.id === v) || G.nodes.find(n => n.title.toLowerCase().includes(v) || (n.full || '').toLowerCase().includes(v)); return hit ? hit.id : ''; };
    const x = find($('#la').value), y = find($('#lb').value);
    if (x && y) location.hash = `#/link/${encodeURIComponent(x)}/${encodeURIComponent(y)}`;
    else ($('#la').value.trim() && !x ? $('#la') : $('#lb')).focus();
  };
}

/* ——— 自测卡片：先自己回忆，再翻面对照 ——— */
let quiz = null;
function viewQuiz(_, q) {
  const mode = q.mode || 'read', weak = store.get('weak', {});
  const pools = {
    read: () => G.nodes.filter(n => n.has && status(n.id) === 2),
    trunk: () => G.nodes.filter(n => n.has && n.tier === 1),
    weak: () => G.nodes.filter(n => n.has && weak[n.id]),
    concept: () => Object.values(concepts).filter(c => c.has),
  };
  const label = {read: '我读过的节点', trunk: '主干必读', weak: '上次没答上的', concept: '基础概念'};
  if (!quiz || quiz.mode !== mode || q.new) {
    const pool = (pools[mode] || pools.read)().slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    quiz = {mode, cards: pool.slice(0, 12), i: 0, ok: 0, shown: false};
  }
  const head = `<div class="mast"><div class="eyebrow">自测</div><h1>合上书，讲一遍</h1>
    <p class="lead">读过不等于记住。每张卡片先在心里回答，再翻面对照；没答上的会记下来，下次优先出现。一轮12张。</p>
    <div class="toolbar"><label>范围</label>${Object.keys(pools).map(k => `<a class="btn sm ${mode === k ? 'on' : ''}" href="#/quiz?mode=${k}&new=1">${label[k]}（${pools[k]().length}）</a>`).join('')}</div></div>`;
  if (!quiz.cards.length) { app.innerHTML = `<div class="page narrow">${head}<div class="empty">${mode === 'read' ? '还没有标记为已读的节点。读完一个节点后点它的圆点两下标记已读，或者先用“主干必读”范围。' : mode === 'weak' ? '没有记录在案的薄弱卡片。' : '这个范围里还没有内容。'}</div>${foot()}</div>`; return; }
  if (quiz.i >= quiz.cards.length) {
    app.innerHTML = `<div class="page narrow">${head}<div class="quiz-card"><h2>这一轮结束</h2><p>答上 ${quiz.ok} / ${quiz.cards.length}。</p><div class="toolbar"><a class="btn fill" href="#/quiz?mode=${mode}&new=1">再来一轮</a>${Object.keys(store.get('weak', {})).length ? `<a class="btn" href="#/quiz?mode=weak&new=1">只练没答上的</a>` : ''}</div></div>${foot()}</div>`;
    return;
  }
  const c = quiz.cards[quiz.i], isC = mode === 'concept';
  const front = isC ? `<div class="eyebrow">${esc(AREA[c.area] || '')} · ${LEVEL[c.level]}</div><h2>${esc(c.name)}</h2><p class="muted">${esc(c.en)}</p><p>用一两句话说清它是什么、为什么需要它。</p>`
    : `<div class="eyebrow hue" ${hue(c.track)}>${esc(trackBy[c.track].short)} · ${fmtDate(c.date)}</div><h2>${esc(c.title)}</h2><p class="muted">${esc(c.full || '')}</p><p>当时卡在哪？它怎么解决的？后来改变了什么？</p>`;
  const back = isC ? `<div class="ans"><p>${inline(c.short)}</p><a class="btn sm" href="#/c/${c.key}">看完整词条</a></div>`
    : `<div class="ans"><p><b>卡点</b>　${inline(c.problem)}</p><p><b>解法</b>　${inline(c.idea)}</p><p><b>影响</b>　${inline(c.impact)}</p><a class="btn sm" href="#/n/${c.id}">看完整讲解</a></div>`;
  app.innerHTML = `<div class="page narrow">${head}<div class="quiz-card"><div class="muted" style="font-size:12.5px">${quiz.i + 1} / ${quiz.cards.length}</div>${front}
    ${quiz.shown ? `${back}<div class="toolbar"><button class="btn fill" id="qok">答上了</button><button class="btn" id="qno">没答上</button></div>` : `<div class="toolbar"><button class="btn fill" id="qshow">翻面对照（空格）</button></div>`}</div>${foot()}</div>`;
  document.title = '自测 · AI脉络';
  const key = isC ? 'c:' + c.key : c.id;
  const next = ok => { const w = store.get('weak', {}); if (ok) delete w[key]; else w[key] = 1; store.set('weak', w); quiz.ok += ok ? 1 : 0; quiz.i++; quiz.shown = false; viewQuiz(_, {mode}); };
  if (quiz.shown) { $('#qok').onclick = () => next(true); $('#qno').onclick = () => next(false); }
  else $('#qshow').onclick = () => { quiz.shown = true; viewQuiz(_, {mode}); };
}
document.addEventListener('keydown', e => {
  if (!location.hash.startsWith('#/quiz') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const b = e.key === ' ' ? $('#qshow') || $('#qok') : e.key === 'x' ? $('#qno') : null;
  if (b) { e.preventDefault(); b.click(); }
});

/* ——— 开放问题：还没有人解决的遗留问题 ——— */
let openCache;
async function viewOpen(_, q) {
  openCache ||= await getJSON('data/open.json').catch(() => []);
  const since = +(q.since || 2023), track = q.track || '';
  const items = openCache.map(o => ({...o, n: byId[o.id]})).filter(o => o.n && o.n.y >= since && (!track || o.n.track === track)).sort((a, b) => a.n.date < b.n.date ? 1 : -1);
  const link = o => { const p = new URLSearchParams({since, track, ...o}); for (const [k, v] of [...p]) if (!v) p.delete(k); return '#/open?' + p; };
  const groups = G.tracks.map(t => [t, items.filter(o => o.n.track === t.key)]).filter(g => g[1].length);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">开放问题</div><h1>还没人解决的问题</h1>
    <p class="lead">每篇讲解都列了它“留下的问题”。其中在图上找不到后续解决者的，汇总在这里——越新的工作，这一栏越接近当下的研究前沿。它们是选题的线索，不是定论：有些可能已有人解决，只是还没收进这张图。</p>
    <div class="toolbar"><label>从哪年起</label>${[2025, 2023, 2020, 2012, 1943].map(y => `<a class="btn sm ${since === y ? 'on' : ''}" href="${link({since: y})}">${y === 1943 ? '全部' : y + '+'}</a>`).join('')}</div>
    <div class="toolbar"><label>分支</label><a class="btn sm ${track ? '' : 'on'}" href="${link({track: ''})}">全部</a>${G.tracks.map(t => `<a class="btn sm ${track === t.key ? 'on' : ''}" href="${link({track: t.key})}">${esc(t.short)}</a>`).join('')}</div>
    <div class="stats"><span><b>${items.length}</b>条开放问题</span><span><b>${new Set(items.map(o => o.id)).size}</b>个节点</span></div></div>
    ${groups.length ? groups.map(([t, list]) => `<section class="sec hue" ${hue(t.key)}><div class="sec-h"><h2>${esc(t.name)}</h2><span class="muted">${list.length} 条</span></div><ul class="limits">${list.slice(0, 120).map(o => `<li>${inline(o.t)}<div class="by">${chip(o.id)} ${fmtDate(o.n.date)}</div></li>`).join('')}</ul></section>`).join('') : '<div class="empty">这个范围里还没有整理出开放问题。</div>'}${foot()}</div>`;
}

/* ——— 某一年 ——— */
function viewYear(y, q) {
  y = +y; const tier = +(q.tier || 3);
  const years = [...new Set(G.nodes.map(n => n.y))].sort((a, b) => a - b), i = years.indexOf(y);
  const ns = G.nodes.filter(n => n.y === y && n.tier <= tier), e = ns[0] ? eraOf(ns[0]) : null;
  const groups = G.tracks.map(t => [t, ns.filter(n => n.track === t.key)]).filter(g => g[1].length);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">${e ? `<a href="#/era/${e.id}">${esc(e.name)}</a>` : ''}</div><h1>${y}年</h1><p class="lead">这一年图上有 ${G.nodes.filter(n => n.y === y).length} 个节点，分布在 ${groups.length} 条分支。横着看一年，能看出各个方向当时分别走到了哪一步。</p>
    <div class="toolbar">${tierBar(tier, `#/year/${y}`)}<span class="sp"></span>${i > 0 ? `<a class="btn sm" href="#/year/${years[i - 1]}">← ${years[i - 1]}</a>` : ''}${i >= 0 && i < years.length - 1 ? `<a class="btn sm" href="#/year/${years[i + 1]}">${years[i + 1]} →</a>` : ''}</div></div>
    ${groups.map(([t, list]) => `<div class="divider hue" ${hue(t.key)}><b>${esc(t.name)}</b>${list.length} 个</div><ul class="rows">${list.map(n => row(n)).join('')}</ul>`).join('')}${foot()}</div>`;
}

/* ——— 统计 ——— */
function viewStats() {
  const y0 = 1943, y1 = Math.max(...G.nodes.map(n => n.y)), cols = [];
  for (let y = y0; y <= y1; y++) cols.push(G.tracks.map(t => G.nodes.filter(n => n.y === y && n.track === t.key).length));
  const max = Math.max(...cols.map(c => c.reduce((a, b) => a + b, 0))), W = 1100, H = 300, bw = W / cols.length;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const col = t => `hsl(${t.hue} ${t.sat != null ? t.sat : dark ? 55 : 48}% ${dark ? 62 : 46}%)`;
  let bars = '';
  cols.forEach((c, i) => { let y = H; c.forEach((v, k) => { if (!v) return; const h = v / max * (H - 10); y -= h; bars += `<a href="#/year/${y0 + i}"><rect x="${(i * bw + 0.5).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${col(G.tracks[k])}"><title>${y0 + i}年 · ${G.tracks[k].name} ${v}</title></rect></a>`; }); });
  const ticks = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(y => `<text x="${((y - y0 + 0.5) * bw).toFixed(1)}" y="${H + 16}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${y}</text>`).join('');
  const top = (adj, n) => G.nodes.map(x => [x, adj[x.id].length]).sort((a, b) => b[1] - a[1]).slice(0, n);
  const et = {}; G.edges.forEach(e => et[e.type] = (et[e.type] || 0) + 1);
  const kinds = {}; G.nodes.forEach(n => kinds[n.kind] = (kinds[n.kind] || 0) + 1);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">统计</div><h1>这张图本身</h1>
    <div class="stats"><span><b>${G.nodes.length}</b>节点</span><span><b>${G.edges.length}</b>连接</span>${Object.entries(REL).map(([k, l]) => `<span><b>${et[k] || 0}</b>${l}</span>`).join('')}</div>
    <div class="stats">${Object.entries(KIND).map(([k, l]) => `<span><b>${kinds[k] || 0}</b>${l}</span>`).join('')}</div></div>
    <section class="sec"><div class="sec-h"><h2>每年有多少工作</h2><span class="muted">按分支上色，点一根柱子看那一年</span></div>
      <svg viewBox="0 0 ${W} ${H + 22}" style="width:100%;height:auto;margin-top:10px">${bars}${ticks}</svg>
      <div class="tags" style="margin-top:8px">${G.tracks.map(t => `<a class="chip hue" ${hue(t.key)} href="#/track/${t.key}">${esc(t.short)} ${order[t.key].length}</a>`).join('')}</div></section>
    <section class="sec"><div class="two"><div><div class="sec-h"><h2>被后人用得最多</h2></div><ul class="rels">${top(out, 30).map(([n, c]) => `<li><span class="ty extends">${c}</span><div>${chip(n.id)}<span class="yr">${fmtDate(n.date)}</span></div></li>`).join('')}</ul></div>
      <div><div class="sec-h"><h2>站在最多人肩上</h2></div><ul class="rels">${top(inn, 30).map(([n, c]) => `<li><span class="ty uses">${c}</span><div>${chip(n.id)}<span class="yr">${fmtDate(n.date)}</span></div></li>`).join('')}</ul></div></div></section>
    <section class="sec"><a class="btn" href="#/orgs">按机构看 →</a></section>${foot()}</div>`;
}
function viewOrgs() {
  const cnt = {};
  for (const n of G.nodes) {
    const org = (n.who || '').split('·')[1]; if (!org) continue;
    for (let o of org.split(/[\/、,，;；&]| and /)) { o = o.trim().replace(/[。.]$/, ''); if (o.length >= 2 && o.length <= 40) (cnt[o] ||= []).push(n); }
  }
  const list = Object.entries(cnt).filter(e => e[1].length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 150);
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">机构</div><h1>谁做了这些工作</h1><p class="lead">按讲解里登记的机构粗略统计（同一机构的不同写法没有完全合并）。点开看它名下的节点。</p></div>
    <section class="sec"><div class="cgrid">${list.map(([o, ns]) => `<a href="#/search?q=${encodeURIComponent(o)}&sort=date"><span class="lv" style="width:auto;padding:0 6px">${ns.length}</span><span>${esc(o)}<small>${ns[0].date.slice(0, 4)}–${ns[ns.length - 1].date.slice(0, 4)} · 主干 ${ns.filter(n => n.tier === 1).length}</small></span></a>`).join('')}</div></section>${foot()}</div>`;
}

/* ——— 我的：进度、在读、收藏、笔记 ——— */
function viewMe() {
  const reading = G.nodes.filter(n => status(n.id) === 1), marked = G.nodes.filter(n => marks[n.id]), noted = G.nodes.filter(n => notes[n.id]);
  const all = doneStat(G.nodes.map(n => n.id)), t1 = doneStat(G.nodes.filter(n => n.tier === 1).map(n => n.id));
  const cdone = Object.keys(concepts).filter(k => status('c:' + k) === 2).length;
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">我的</div><h1>学习进度</h1>
    <div class="stats"><span><b>${t1.d}/${t1.n}</b>主干</span><span><b>${all.d}</b>已读节点</span><span><b>${cdone}/${Object.keys(concepts).length}</b>概念</span><span><b>${noted.length}</b>笔记</span></div>
    <p class="lead" style="font-size:14px">进度、收藏和笔记只保存在这台设备的浏览器里，换设备或清除浏览数据会丢。定期导出一份。</p>
    <div class="toolbar"><button class="btn sm" id="exp">导出</button><button class="btn sm" id="imp">导入</button><input type="file" id="impf" accept="application/json" hidden><a class="btn sm" href="#/stats">图谱统计</a><a class="btn sm" href="#/quiz">自测卡片</a><a class="btn sm" href="#/link">演进路径</a></div></div>
    <section class="sec"><div class="sec-h"><h2>各分支</h2><span class="muted">主干 + 重要</span></div><div class="grid">${G.tracks.map(t => { const s = doneStat(order[t.key].filter(i => byId[i].tier <= 2)); return `<a class="card hue" ${hue(t.key)} href="#/track/${t.key}"><h3>${esc(t.short)}</h3><div class="bar"><i style="width:${s.pct}%"></i></div><div class="n">${s.d} / ${s.n}</div></a>`; }).join('')}</div></section>
    ${reading.length ? `<section class="sec"><div class="sec-h"><h2>在读</h2><span class="muted">${reading.length}</span></div><ul class="rows">${reading.map(n => row(n, {track: true})).join('')}</ul></section>` : ''}
    ${marked.length ? `<section class="sec"><div class="sec-h"><h2>收藏</h2><span class="muted">${marked.length}</span></div><ul class="rows">${marked.map(n => row(n, {track: true})).join('')}</ul></section>` : ''}
    ${noted.length ? `<section class="sec"><div class="sec-h"><h2>笔记</h2><span class="muted">${noted.length}</span></div><ul class="limits">${noted.map(n => `<li>${chip(n.id)}<div style="margin-top:6px;white-space:pre-wrap">${esc(notes[n.id])}</div></li>`).join('')}</ul></section>` : ''}
    ${!reading.length && !marked.length && !noted.length ? '<div class="empty">还没有记录。读节点时点右侧圆点标记状态，或点“收藏”。</div>' : ''}${foot()}</div>`;
  $('#exp').onclick = exportAll; $('#imp').onclick = () => $('#impf').click(); $('#impf').onchange = ev => importAll(ev.target.files[0], viewMe);
}

/* ——— 演化树：大方向 → 分支 → 主题线 → 节点 ———
   布局在抽象坐标里算：t 是时间轴上的位置，c 是横断方向的位置。横向（时间从左到右）和竖向（根在下、往上长）只在最后映射成像素时不同。 */
const TREE0 = 1943, MAXW = 190;
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
  const SIDE = mini ? (o.side ?? 60) : Hz ? 168 : 58, TOP = mini ? 0 : Hz ? 44 : 76;
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
    return {W, H: H + 14, svg: `<svg class="tmini" viewBox="0 0 ${W} ${H + 14}" width="${W}" height="${H + 14}" role="img" aria-label="AI发展的总览树">${s}</svg>`};
  }

  // 行名
  const lab = l => {
    const t = trackBy[l.k];
    if (l.type === 'group') return `<span class="tl g" title="${esc(l.g.blurb)}">${esc(l.g.name)}</span>`;
    if (l.type === 'thread') return `<a class="tl th${o.hl === l.th.key ? ' on' : ''}" href="#/track/${l.k}?th=${l.th.key}" title="${esc(l.th.blurb)}">${L.flt ? `<i class="hue" ${hv(l.k)}>${esc(t.short)}</i>` : ''}${esc(l.th.name)}<small>${L.flt ? l.nodes.length : l.th.n}</small></a>`;
    const isOpen = l.type === 'head';
    if (L.embed) return `<span class="tl k hue" ${hv(l.k)}><b>${esc(t.short)}</b><small>主干</small></span>`;
    return `<button class="tl k hue${isOpen ? ' open' : ''}" ${hv(l.k)} data-open="${l.k}" title="${esc(t.name)}：${esc(t.question)}${isOpen ? '' : '\n点一下展开成主题线'}"><i>${isOpen ? '−' : '+'}</i><b>${esc(t.short)}</b><small>${order[l.k].length}</small></button>${isOpen ? `<a class="tgo" href="#/track/${l.k}">分支页</a>` : ''}`;
  };
  let top = '', side = '';
  if (Hz) {
    top = `<div class="tcorner" style="width:${SIDE}px;height:${TOP}px"><span>${L.stripes ? '时代 / 年份' : '阶段 / 年份'} →</span></div>`
      + L.spans.map(sp => `<a class="tsp" ${sp.e.id ? `href="#/era/${sp.e.id}"` : ''} style="left:${(SIDE + sp.a).toFixed(1)}px;width:${Math.max(0, sp.b - sp.a - 1).toFixed(1)}px" title="${esc(sp.e.name)} ${sp.e.from}–${sp.e.to}">${esc(sp.e.name)}</a>`).join('')
      + L.ticks.map(k => `<a class="tyr" href="#/year/${k.y}" style="left:${(SIDE + k.t).toFixed(1)}px">${k.label}</a>`).join('');
    side = `<div class="tbs-bg" style="width:${SIDE}px;height:${L.C}px"></div>`
      + L.lanes.map(l => `<div class="tlw ${l.type}" style="top:${l.c}px;width:${SIDE}px;height:${l.type === 'group' ? l.size : 2 * l.rail}px">${lab(l)}</div>`).join('');
  } else {
    const row = {group: 2, track: 26, head: 26, thread: 50};
    top = `<div class="tcorner" style="width:${SIDE}px;height:${TOP}px"><span>↑ 时间</span></div>`
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
    return `<a class="nd t${n.tier} hue${status(n.id) === 2 ? ' done' : ''}" ${hs(n.track, `left:${left.toFixed(1)}px;top:${tp.toFixed(1)}px;width:${w}px`)} href="#/n/${encodeURIComponent(n.id)}" data-id="${esc(n.id)}" title="${esc(n.title)} · ${n.date}"><span>${esc(n.title)}</span></a>`;
  }).join('');
  const html = `<div class="tbt${Hz ? '' : ' v'}" style="width:${W}px;height:${TOP}px">${top}</div><div class="tbs${Hz ? '' : ' v'}">${side}</div>
    <svg class="tsvg" width="${W}" height="${H}">${s}</svg><svg class="tsvg over" width="${W}" height="${H}"></svg>${nodes}`;
  return {W, H, html, X, Y, P, SIDE, TOP, curve};
}
function miniTree(width, lane) {
  const side = 96, L = treeLayout({dir: 'h', mini: true, fit: Math.max(200, width - side), lane});
  return treeDraw(L, {side, joins: false}).svg;
}
function nodePanel(id) {
  const n = byId[id], t = trackBy[n.track], th = thBy[n.track] && thBy[n.track][n.th];
  const before = inn[id].slice().sort((a, b) => byId[a.from].date < byId[b.from].date ? -1 : 1), after = out[id].slice().sort((a, b) => byId[a.to].date < byId[b.to].date ? -1 : 1);
  const li = (e, o) => `<li><span class="ty ${e.type}">${REL[e.type]}</span><div>${chip(o)}${e.note ? `<div class="nt">${inline(e.note)}</div>` : ''}</div></li>`;
  return `<button class="x" aria-label="关闭">×</button><div class="eyebrow">${t.g ? esc(t.g.name) + ' › ' : ''}${esc(t.short)}${th && th.key !== 'all' ? ' › ' + esc(th.name) : ''}</div>
    <h3>${esc(n.title)}</h3>${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
    <div class="meta">${fmtDate(n.date)} · ${KIND[n.kind]} · ${['', '主干必读', '重要', '延伸'][n.tier]}${n.who ? ` · ${esc(n.who.split('·')[0].trim())}` : ''}</div>
    ${n.has ? `<dl><dt>当时卡在哪</dt><dd>${inline(n.problem)}</dd><dt>它怎么解决</dt><dd>${inline(n.idea)}</dd><dt>改变了什么</dt><dd>${inline(n.impact)}</dd></dl>` : '<p class="muted">讲解整理中</p>'}
    <div class="acts"><a class="btn fill" href="#/n/${encodeURIComponent(id)}">读完整讲解</a><a class="btn" href="#/map?focus=${encodeURIComponent(id)}">只看来龙去脉</a>${stBtn(id)}</div>
    ${before.length ? `<h4>它建立在什么之上 · ${before.length}</h4><ul class="rels">${before.map(e => li(e, e.from)).join('')}</ul>` : ''}
    ${after.length ? `<h4>后来谁接着做 · ${after.length}</h4><ul class="rels">${after.map(e => li(e, e.to)).join('')}</ul>` : ''}`;
}

function viewMap(_, q) {
  const st = treeState;
  const focus = byId[q.focus] ? q.focus : null, at = byId[q.at] ? q.at : null;
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
  // 话题模式：只画某个概念/思路的节点，或某个搜索词对应的节点
  let topic = null;
  const cq = !focus && concepts[q.c] ? concepts[q.c] : null, sq = !focus && !cq ? (q.q || '').trim() : '';
  if (cq || sq) {
    const ids = cq ? [...new Set([...(byId[cq.origin] ? [cq.origin] : []), ...memberIds({k: 'c', id: cq.key}, 300)])] : topicSet(sq).ids;
    if (ids.length) {
      flt = new Set(ids);
      tree = ids.length <= 220 ? G.edges.filter(e => flt.has(e.from) && flt.has(e.to)) : null;
      topic = {label: cq ? cq.name : `“${sq}”`, back: cq ? `#/c/${cq.key}` : `#/search?q=${encodeURIComponent(sq)}`, y0: Math.min(...ids.map(i => byId[i].y)) - 1, mark: cq && byId[cq.origin] ? cq.origin : null};
    }
  }
  app.innerHTML = `<div class="mapwrap"><div class="mapbar" id="tbar"></div>
    <div class="mapbody"><div class="scroller" id="scroller"><div class="tcanvas plane" id="tcanvas"></div></div><aside class="panel" id="panel" hidden></aside></div></div>`;
  document.title = '全景树 · AI脉络';
  const wrap = $('.mapwrap'), sc = $('#scroller'), cv = $('#tcanvas'), panel = $('#panel'), bar = $('#tbar');
  const dir = () => st.dir || (innerWidth < 760 ? 'v' : 'h');
  let L = null, D = null, selected = null, ndEls = {};
  const btn = (attr, v, label, on, title = '') => `<button class="btn sm ${on ? 'on' : ''}" data-${attr}="${v}" ${title ? `title="${title}"` : ''}>${label}</button>`;
  const drawBar = () => {
    const d = dir(), n = Object.keys(L.pos).length;
    const common = `<label>方向</label>${btn('dir', 'h', '横向', d === 'h', '时间从左到右')}${btn('dir', 'v', '竖向', d === 'v', '根在下，往上长')}
      <label>缩放</label>${[[0, '适应'], [1, '1×'], [2, '2×']].map(([v, l]) => btn('zoom', v, l, st.zoom === v)).join('')}`;
    bar.innerHTML = focus
      ? `<span class="chip hue" ${hue(byId[focus].track)}>${esc(byId[focus].title)} 的来龙去脉</span><label>往前往后各</label>${[1, 2, 3, 9].map(x => `<a class="btn sm ${depth === x ? 'on' : ''}" href="#/map?focus=${encodeURIComponent(focus)}&depth=${x}">${x === 9 ? '全部' : x + ' 层'}</a>`).join('')}
         ${common}<a class="btn sm" href="#/map">← 回到全景树</a><span class="sp"></span>
         <span class="legend"><span><i class="solves"></i>解决</span><span><i></i>延续</span><span><i class="uses"></i>使用</span><span><i class="rivals"></i>竞争</span></span><span class="muted">${n} 个节点</span>`
      : topic ? `<span class="chip c">${esc(topic.label)} 在树上</span>${common}<a class="btn sm" href="${topic.back}">← 回到它的页面</a><a class="btn sm" href="#/map">← 回到全景树</a><span class="sp"></span>
         <span class="legend"><span><i class="solves"></i>解决</span><span><i></i>延续</span><span><i class="uses"></i>使用</span><span><i class="rivals"></i>竞争</span></span><span class="muted">${n} 个节点 · 一行是一条主题线</span>`
      : `${common}<label>展开后显示</label>${[[1, '主干'], [2, '+ 重要'], [3, '全部']].map(([v, l]) => btn('tier', v, l, st.tier === v)).join('')}
         ${btn('all', 1, '全部展开', false)}${st.open.length ? btn('all', 0, '全部收起', false) : ''}
         ${btn('joins', 1, '跨分支汇流', st.joins, '虚线：一条分支的成果被另一条分支拿去用的关键时刻，鼠标停在线上看说明')}
         <span class="sp"></span><span class="muted">${st.open.length ? `${n} 个节点` : '点左边的分支名，展开成它的主题线'}</span>`;
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
    const avail = sc.clientWidth - 168 - 4;
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
    selected = id;
    cv.querySelectorAll('.nd.sel').forEach(x => x.classList.remove('sel'));
    if (!id) { panel.hidden = true; clearHL(); return; }
    ndEls[id] && ndEls[id].classList.add('sel');
    if (focus && id === focus) clearHL(); else highlight(id);      // 来龙去脉模式下它的连线本来就画着，不再整片加粗
    const n = byId[id];
    panel.className = 'panel hue'; panel.style.cssText = hs(n.track).slice(7, -1);
    if (!quiet) { panel.innerHTML = nodePanel(id); panel.scrollTop = 0; }
    panel.hidden = false;
  }
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-open],button[data-dir],button[data-zoom],button[data-tier],button[data-all],button[data-joins]');
    if (b) {
      const d = b.dataset; let lane = null;
      if (d.open) { lane = d.open; st.open = st.open.includes(lane) ? st.open.filter(k => k !== lane) : [...st.open, lane]; }
      else if (d.dir) st.dir = d.dir;
      else if (d.zoom != null) st.zoom = +d.zoom;
      else if (d.tier) st.tier = +d.tier;
      else if (d.all != null) st.open = +d.all ? G.tracks.map(t => t.key) : [];
      else if (d.joins) st.joins = !st.joins;
      draw(d.dir ? null : snap(lane));
      return;
    }
    if (e.target.closest('.panel')) { if (e.target.closest('.x')) select(null); return; }
    const el = e.target.closest('.nd');
    if (el) { e.preventDefault(); select(el.dataset.id === selected ? null : el.dataset.id); }
    else if (!e.target.closest('a,button') && e.target.closest('#tcanvas')) select(null);
  });
  cv.addEventListener('mouseover', e => { const el = e.target.closest('.nd'); if (el && !selected) highlight(el.dataset.id); });
  cv.addEventListener('mouseout', e => { if (e.target.closest('.nd') && !selected) clearHL(); });
  draw();
  const era = G.eras.find(e => e.id === q.era), sp = era && L.spans.find(s => s.e === era);
  if (focus) { select(focus); const p = L.pos[focus]; if (p) reveal(p.t, p.c); }
  else if (at && L.pos[at]) { select(at); reveal(L.pos[at].t, L.pos[at].c); }
  else if (topic && topic.mark && ndEls[topic.mark]) ndEls[topic.mark].classList.add('sel');
  else if (sp) { if (L.Hz) sc.scrollTo(Math.max(0, sp.a - 16), 0); else sc.scrollTo(sc.scrollLeft, Math.max(0, L.T - sp.b - 20)); }
  else if (trackBy[q.only] && L.laneOf[q.only]) { const l = L.laneOf[q.only]; if (L.Hz) sc.scrollTo(Math.max(0, l.a - 60), Math.max(0, l.c - 30)); else sc.scrollTo(Math.max(0, l.c - 40), Math.max(0, L.T - l.a - sc.clientHeight + 160)); }
  let rz; const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (document.body.contains(cv)) draw(snap()); else removeEventListener('resize', onResize); }, 180); };
  addEventListener('resize', onResize);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const x = $('#panel .x'); if (x) x.click(); } });

const themeBtn = $('#theme');
const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; themeBtn.textContent = {light: '☀', dark: '☾'}[t] || '◐'; themeBtn.title = '主题：' + ({light: '浅色', dark: '深色'}[t] || '跟随系统'); };
applyTheme(store.get('theme', ''));
themeBtn.onclick = () => { const t = {'': 'light', light: 'dark', dark: ''}[store.get('theme', '')]; store.set('theme', t); applyTheme(t); };
boot().catch(err => { app.innerHTML = `<div class="page"><div class="empty">数据载入失败：${esc(err.message)}<br>本地预览请用 <code>python3 -m http.server -d docs</code>，不要直接双击打开文件。</div></div>`; });
})();
