/* AI脉络 · 单页应用（无依赖）。数据由 scripts/build.py 生成到 docs/data/。 */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const app = $('#app');
const KIND = {paper: '论文', model: '模型', system: '系统', hardware: '硬件', dataset: '数据集', event: '事件', concept: '思想'};
const REL = {solves: '解决', extends: '延续', uses: '使用', rivals: '竞争'};
const AREA = {math: '数学预备', prob: '概率统计与信息论', opt: '优化与训练', ml: '机器学习基础', nn: '神经网络组件', seq: '序列与语言模型',
  gen: '生成模型', rl: '强化学习', vis: '视觉', aud: '语音', emb: '具身与控制', sys: '系统与硬件', eval: '评测与实验方法'};
const LEVEL = ['预备', '入门', '进阶'];

let G, byId = {}, trackBy = {}, out = {}, inn = {}, concepts = {}, terms = [], order = {};
const contentCache = {};

/* ——— 本地存储（进度、图谱设置）：读写都可能失败，失败时静默退化 ——— */
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
const foot = () => `<footer class="foot"><span>© ${new Date().getFullYear()} Yunxiang (Kevin) Mo</span><span>${G.nodes.length} 个节点 · ${G.edges.length} 条连接 · 讲解由AI模型整理并对照原文核对，仍可能有错，请以原文为准</span></footer>`;
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
    open: viewOpen, chain: viewChain, year: viewYear, stats: viewStats, me: viewMe, orgs: viewOrgs, link: viewLink, quiz: viewQuiz};
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
      <div class="eyebrow">1943 — ${G.eras[G.eras.length - 1].to} · 一张按时间排列的分支图</div>
      <h1>AI脉络</h1>
      <p class="lead">每个阶段大家在攻克什么，谁解决了它，又留下了什么给后来的人。${G.tracks.length}条分支、${G.nodes.length}个节点——论文、模型、芯片、数据集和关键事件——每一个都有讲解，彼此用“解决 / 延续 / 使用 / 竞争”连起来。只需要基本的编程和大一数学就能从头读起。</p>
      <div class="stats"><span><b>${G.nodes.length}</b>节点</span><span><b>${G.edges.length}</b>连接</span><span><b>${t1.length}</b>主干必读</span><span><b>${Object.keys(concepts).length}</b>基础概念</span><span><b>${written}</b>已有讲解</span></div>
      <div class="acts" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn fill" href="#/path">从头开始学</a><a class="btn" href="#/map">打开图谱</a><a class="btn" href="#/concepts">先补基础概念</a><a class="btn" href="#/open">看开放问题</a><a class="btn" href="#/link">查两个工作的联系</a><a class="btn" href="#/quiz">自测</a>
        ${byId[store.get('last')] ? `<a class="btn" href="#/n/${store.get('last')}">继续上次：${esc(byId[store.get('last')].title)}</a>` : ''}
        <button class="btn" id="rand">随便看一个</button></div>
      ${ps.d ? `<div class="bar" style="max-width:420px;margin-top:16px"><i style="width:${ps.pct}%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">主干已读 ${ps.d} / ${ps.n}</div>` : ''}
    </div>
    <section class="sec"><div class="sec-h"><h2>九个时代</h2><span class="muted">按时间顺序读，每个时代先看“当时在攻克什么”</span></div>
      <ul class="river">${G.eras.map(e => {
        const ns = G.nodes.filter(n => eraOf(n) === e);
        return `<li><a href="#/era/${e.id}"><div class="yr">${e.from}–${String(e.to).slice(2)}<small>${ns.length} 个节点 · ${ns.filter(n => n.tier === 1).length} 个主干</small></div>
          <div class="body"><h3>${esc(e.name)}</h3><p>${esc(e.tagline)}</p><div class="tags">${e.hot.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></a></li>`;
      }).join('')}</ul></section>
    <section class="sec"><div class="sec-h"><h2>十六条分支</h2><span class="muted">每条分支沿着一个问题往下走</span></div>
      <div class="grid">${G.tracks.map(t => `<a class="card hue" ${hue(t.key)} href="#/track/${t.key}"><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p><div class="n">${order[t.key].length} 个节点</div></a>`).join('')}</div></section>
    ${foot()}</div>`;
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
      <div class="toolbar">${tierBar(tier, `#/era/${e.id}`)}<span class="sp"></span><a class="btn sm" href="#/map?era=${e.id}">在图谱中看</a></div>
      ${groups.map(([t, list]) => `<div class="divider hue" ${hue(t.key)}><b>${esc(t.name)}</b>${list.length} 个</div><ul class="rows">${list.map(n => row(n)).join('')}</ul>`).join('')}</section>
    <div class="pn">${i ? `<a href="#/era/${G.eras[i - 1].id}"><small>上一个时代</small><b>${esc(G.eras[i - 1].name)}</b></a>` : '<span></span>'}
      ${i < G.eras.length - 1 ? `<a class="r" href="#/era/${G.eras[i + 1].id}"><small>下一个时代</small><b>${esc(G.eras[i + 1].name)}</b></a>` : '<span></span>'}</div>
    ${foot()}</div>`;
}

/* ——— 分支 ——— */
function viewTracks() {
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">分支</div><h1>十六条分支</h1><p class="lead">每条分支沿着一个问题一路往下。分支之间有大量交叉连接，在图谱里能看到。</p></div>
    <div class="grid" style="margin-top:26px">${G.tracks.map(t => { const s = doneStat(order[t.key]); return `<a class="card hue" ${hue(t.key)} href="#/track/${t.key}"><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p><div class="n">${s.n} 个节点${s.d ? ` · 已读 ${s.d}` : ''}</div></a>`; }).join('')}</div>${foot()}</div>`;
}
function viewTrack(key, q) {
  const t = trackBy[key] || G.tracks[0];
  const tier = +(q.tier || 2);
  const ns = order[t.key].map(i => byId[i]).filter(n => n.tier <= tier);
  let html = '', si = -1;
  for (const n of ns) {
    let k = t.stages.findIndex(s => n.y <= s.to);
    if (k < 0) k = t.stages.length - 1;
    if (k !== si) { if (si >= 0) html += '</ul>'; si = k; const s = t.stages[k]; html += `<div class="divider"><b>${esc(s.name)}</b>${s.from}–${s.to}</div><ul class="rows">`; }
    html += row(n, {full: true});
  }
  if (si >= 0) html += '</ul>';
  app.innerHTML = `<div class="page hue" ${hue(t.key)}>
    <div class="mast"><div class="eyebrow">分支 · ${order[t.key].length} 个节点</div><h1>${esc(t.name)}</h1><p class="lead"><b>${esc(t.question)}</b></p><p class="lead">${esc(t.blurb)}</p></div>
    <section class="sec"><div class="sec-h"><h2>这条线的几个阶段</h2></div>
      <ul class="stages">${t.stages.map(s => `<li><span class="y">${s.from}–${s.to}</span><b>${esc(s.name)}</b><p>${esc(s.text)}</p></li>`).join('')}</ul></section>
    <section class="sec"><div class="sec-h"><h2>按时间顺序</h2></div>
      <div class="toolbar">${tierBar(tier, `#/track/${t.key}`)}<span class="sp"></span><a class="btn sm" href="#/map?only=${t.key}">在图谱中看</a></div>${html}</section>
    ${foot()}</div>`;
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
  app.innerHTML = `<div class="page narrow hue" ${hue(n.track)}>
    <div class="article-head">
      <div class="eyebrow"><a href="#/track/${t.key}">${esc(t.name)}</a> · <a href="#/era/${e.id}">${esc(e.name)}</a></div>
      <h1>${esc(n.title)}</h1>
      ${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
      <div class="meta"><span>${fmtDate(n.date)}</span><span>${KIND[n.kind]}</span><span>${['', '主干必读', '重要', '延伸'][n.tier]}</span>${c.venue ? `<span>${esc(c.venue)}</span>` : ''}${n.who ? `<span>${esc(n.who)}</span>` : ''}</div>
      <div class="acts">${stBtn(id)}<span class="muted" style="font-size:12.5px">标记学习状态</span>
        <a class="btn sm" href="#/map?focus=${encodeURIComponent(id)}">在图谱中看它的来龙去脉</a>
        <a class="btn sm" href="#/chain/${encodeURIComponent(id)}">从零读懂它的学习链</a>
        <a class="btn sm" href="#/link/${encodeURIComponent(id)}">它和另一个工作的联系</a>
        <button class="btn sm ${marks[id] ? 'on' : ''}" data-mark="${esc(id)}">${marks[id] ? '★ 已收藏' : '☆ 收藏'}</button>
        ${(c.links || []).map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
    </div>
    ${n.has ? `<div class="gist"><div><h4>当时卡在哪</h4><p>${inline(n.problem)}</p></div><div><h4>它怎么解决</h4><p>${inline(n.idea)}</p></div><div><h4>改变了什么</h4><p>${inline(n.impact)}</p></div></div>` : `<div class="empty">这个节点的讲解还在整理中。下面是它在图上的连接。</div>`}
    <div class="prose">
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
    ${c.check ? `<div class="check">核对出处：<a href="${esc(c.check.source)}" target="_blank" rel="noopener">${esc(c.check.source)}</a>　${esc(c.check.confirmed)}</div>` : ''}
    <div class="pn">${prev ? `<a href="#/n/${prev.id}"><small>本分支上一个 · ${fmtDate(prev.date)}</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}
      ${next ? `<a class="r" href="#/n/${next.id}"><small>本分支下一个 · ${fmtDate(next.date)}</small><b>${esc(next.title)}</b></a>` : '<span></span>'}</div>
    ${nextTrunk ? `<div class="pn" style="margin-top:12px"><span></span><a class="r" href="#/n/${nextTrunk.id}"><small>主干下一站 · ${fmtDate(nextTrunk.date)} · ${esc(trackBy[nextTrunk.track].short)}</small><b>${esc(nextTrunk.title)}</b></a></div>` : ''}
    ${foot()}</div>`;
  document.title = `${n.title} · AI脉络`;
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
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">基础概念 · ${all.length} 条</div><h1>先补这些</h1>
    <p class="lead">节点讲解里用到的概念都在这里。方块里的数字是难度：0 进入AI之前就该会的，1 入门必备，2 读前沿论文时需要。不必一次看完，读到哪补到哪。</p></div>
    ${Object.entries(AREA).map(([a, name]) => { const list = all.filter(c => c.area === a); return list.length ? `<section class="sec"><div class="sec-h"><h2>${name}</h2><span class="muted">${list.length} 条</span></div>
      <div class="cgrid">${list.map(c => `<a href="#/c/${c.key}" class="${c.has ? '' : 'todo-c'}"><span class="lv">${c.level}</span><span>${esc(c.name)}<small>${esc(c.en)}</small></span></a>`).join('')}</div></section>` : ''; }).join('')}
    ${terms.length ? `<section class="sec"><div class="sec-h"><h2>术语表</h2><span class="muted">${terms.length} 条，来自各篇讲解</span></div><ul class="rows">${terms.map(t => `<li class="row" style="grid-template-columns:1fr"><div><b>${esc(t.t)}</b>　${inline(t.d)}<div class="f">${t.nodes.slice(0, 6).map(chip).join(' ')}</div></div></li>`).join('')}</ul></section>` : ''}
    ${foot()}</div>`;
}
function viewConcept(key) {
  const c = concepts[key];
  if (!c) { app.innerHTML = `<div class="page"><div class="empty">没有这个概念：${esc(key)}</div></div>`; return; }
  const neededBy = Object.values(concepts).filter(x => (x.needs || []).includes(key));
  app.innerHTML = `<div class="page narrow"><div class="article-head"><div class="eyebrow"><a href="#/concepts">基础概念</a> · ${AREA[c.area]} · ${LEVEL[c.level]}</div>
      <h1>${esc(c.name)}</h1><div class="full">${esc(c.en)}</div>
      <div class="acts">${stBtn('c:' + key)}<span class="muted" style="font-size:12.5px">标记学习状态</span></div></div>
    ${c.has ? `<div class="prose"><p style="font-size:18px;margin-top:22px"><b>${inline(c.short)}</b></p>
      ${(c.needs || []).length ? `<p class="tags">先要会：${c.needs.map(cchip).join(' ')}</p>` : ''}
      ${rich(c.body)}${c.example ? `<div class="example"><h4>例子</h4>${rich(c.example)}</div>` : ''}${c.pitfalls ? `<h2>常见误解</h2>${rich(c.pitfalls)}` : ''}</div>` : `<div class="empty">这个词条还在整理中。</div>`}
    <div class="prose">${neededBy.length ? `<h2>学完它可以接着看</h2><p class="tags">${neededBy.map(x => cchip(x.key)).join(' ')}</p>` : ''}
      ${(c.nodes || []).length ? `<h2>用到它的工作</h2><p class="tags">${c.nodes.map(i => byId[i]).filter(Boolean).sort((a, b) => a.tier - b.tier || (a.date < b.date ? -1 : 1)).slice(0, 60).map(n => chip(n.id)).join(' ')}</p>` : ''}</div>
    ${foot()}</div>`;
  document.title = `${c.name} · AI脉络`;
}

/* ——— 学习路线 ——— */
function viewPath() {
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
    <section class="sec"><div class="sec-h"><h2>0　预备</h2><span class="muted">进入AI之前就该会的 ${lv0.length} 个概念</span></div>
      <p style="color:var(--ink-2);margin:4px 0 0">扫一遍，不熟的点进去看。之后每篇讲解开头都会列出它需要的概念，读到哪补到哪。</p>
      <div class="cgrid">${lv0.map(c => `<a href="#/c/${c.key}" class="${c.has ? '' : 'todo-c'}"><span class="lv">${status('c:' + c.key) === 2 ? '✓' : '0'}</span><span>${esc(c.name)}<small>${AREA[c.area]}</small></span></a>`).join('')}</div></section>
    ${blocks.join('')}${foot()}</div>`;
  $('#exp').onclick = exportAll;
  $('#imp').onclick = () => $('#impf').click();
  $('#impf').onchange = ev => importAll(ev.target.files[0], viewPath);
}

/* ——— 搜索 ——— */
let index;
function buildIndex() {
  if (index) return index;
  index = [];
  for (const n of G.nodes) index.push({k: 'n', id: n.id, t: n.title, s: [n.full, n.who].filter(Boolean).join(' · ') || trackBy[n.track].name,
    hay: [n.title, n.id, n.full, n.who, n.date].join('\n').toLowerCase(), hay2: [n.problem, n.idea, n.impact, trackBy[n.track].name].join('\n').toLowerCase(), w: 4 - n.tier, n});
  for (const c of Object.values(concepts)) index.push({k: 'c', id: c.key, t: c.name, s: '概念 · ' + c.en, hay: [c.name, c.en, c.key].join('\n').toLowerCase(), hay2: (c.short || '').toLowerCase(), w: 2.5});
  for (const t of terms) index.push({k: 't', id: t.nodes[0], t: t.t, s: '术语 · ' + t.d, hay: t.t.toLowerCase(), hay2: t.d.toLowerCase(), w: 1});
  return index;
}
function search(q, limit = 200) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const res = [];
  for (const it of buildIndex()) {
    let score = 0, ok = true;
    for (const w of words) {
      const t = it.t.toLowerCase();
      if (t === w) score += 100; else if (t.startsWith(w)) score += 60; else if (t.includes(w)) score += 40;
      else if (it.hay.includes(w)) score += 20; else if (it.hay2.includes(w)) score += 6; else { ok = false; break; }
    }
    if (ok) res.push([score + it.w, it]);
  }
  return res.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}
const hrefOf = it => it.k === 'c' ? `#/c/${it.id}` : `#/n/${it.id}`;
function initSearch() {
  const inp = $('#q'), drop = $('#drop');
  let sel = -1, items = [];
  const close = () => { drop.hidden = true; sel = -1; };
  const paint = () => {
    const q = inp.value.trim();
    if (!q) return close();
    items = search(q, 9);
    drop.innerHTML = (items.length ? items.map((it, i) => `<a href="${hrefOf(it)}" class="${i === sel ? 'sel' : ''}"><div class="t">${esc(it.t)}${it.k === 'n' ? ` <span class="muted" style="font-weight:400;font-size:12px">${it.n.date.slice(0, 4)} · ${esc(trackBy[it.n.track].short)}</span>` : ''}</div><div class="s">${esc(it.s)}</div></a>`).join('') : '<div class="more">没有匹配</div>')
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
  const ft = q.full === '1';
  if (ft && query) {
    app.innerHTML = '<p class="loading">正在载入全部讲解正文…</p>';
    const txt = await loadFullText(), words = query.toLowerCase().split(/\s+/).filter(Boolean), have = new Set(res.filter(x => x.k === 'n').map(x => x.id));
    for (const n of G.nodes) if (!have.has(n.id) && txt[n.id] && words.every(w => txt[n.id].includes(w))) res.push(buildIndex().find(x => x.k === 'n' && x.id === n.id));
  }
  let ns = res.filter(x => x.k === 'n'); const cs = res.filter(x => x.k !== 'n');
  const tracksHit = G.tracks.filter(t => ns.some(x => x.n.track === t.key));
  if (q.track) ns = ns.filter(x => x.n.track === q.track);
  if (q.tier) ns = ns.filter(x => x.n.tier <= +q.tier);
  if (q.kind) ns = ns.filter(x => x.n.kind === q.kind);
  if (q.sort === 'date') ns = [...ns].sort((a, b) => a.n.date < b.n.date ? -1 : 1);
  const link = o => { const p = new URLSearchParams({...q, ...o}); for (const [k, v] of [...p]) if (!v) p.delete(k); return '#/search?' + p; };
  $('#q').value = query;
  app.innerHTML = `<div class="page"><div class="mast"><div class="eyebrow">搜索</div><h1>${esc(query) || '搜索'}</h1><p class="lead">${res.length ? `${ns.length} 个节点，${cs.length} 个概念或术语` : '没有匹配。可以试试英文原名、作者姓氏、机构名，或打开“搜索讲解全文”。'}</p>
    <div class="toolbar"><label>范围</label><a class="btn sm ${ft ? '' : 'on'}" href="${link({full: ''})}">标题与摘要</a><a class="btn sm ${ft ? 'on' : ''}" href="${link({full: '1'})}">搜索讲解全文</a>
      <label>档位</label>${[['', '全部'], ['1', '主干'], ['2', '主干+重要']].map(([v, l]) => `<a class="btn sm ${(q.tier || '') === v ? 'on' : ''}" href="${link({tier: v})}">${l}</a>`).join('')}
      <label>排序</label><a class="btn sm ${q.sort === 'date' ? '' : 'on'}" href="${link({sort: ''})}">相关度</a><a class="btn sm ${q.sort === 'date' ? 'on' : ''}" href="${link({sort: 'date'})}">时间</a></div>
    ${tracksHit.length > 1 ? `<div class="toolbar"><label>分支</label><a class="btn sm ${q.track ? '' : 'on'}" href="${link({track: ''})}">全部</a>${tracksHit.map(t => `<a class="btn sm ${q.track === t.key ? 'on' : ''}" href="${link({track: t.key})}">${esc(t.short)}</a>`).join('')}</div>` : ''}
    <div class="toolbar"><label>类型</label><a class="btn sm ${q.kind ? '' : 'on'}" href="${link({kind: ''})}">全部</a>${Object.entries(KIND).map(([k, l]) => `<a class="btn sm ${q.kind === k ? 'on' : ''}" href="${link({kind: k})}">${l}</a>`).join('')}</div></div>
    ${cs.length ? `<section class="sec"><div class="sec-h"><h2>概念与术语</h2></div><div class="cgrid">${cs.slice(0, 40).map(it => `<a href="${hrefOf(it)}"><span class="lv">${it.k === 'c' ? concepts[it.id].level : '术'}</span><span>${esc(it.t)}<small>${esc(it.s.slice(0, 46))}</small></span></a>`).join('')}</div></section>` : ''}
    ${ns.length ? `<section class="sec"><div class="sec-h"><h2>节点</h2><span class="muted">${ns.length > 200 ? '只显示前200条' : ''}</span></div><ul class="rows">${ns.slice(0, 200).map(it => row(it.n, {track: true})).join('')}</ul></section>` : ''}${foot()}</div>`;
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
    <div class="toolbar"><a class="btn sm ${full ? '' : 'on'}" href="#/chain/${encodeURIComponent(id)}">精简</a><a class="btn sm ${full ? 'on' : ''}" href="#/chain/${encodeURIComponent(id)}?full=1">完整</a><span class="sp"></span><a class="btn sm" href="#/map?focus=${encodeURIComponent(id)}&depth=9">在图谱中看</a></div></div>
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
      <div class="toolbar"><a class="btn sm" href="#/map?focus=${encodeURIComponent(b)}&depth=3">在图谱中看终点的来龙去脉</a><a class="btn sm" href="#/chain/${encodeURIComponent(b)}">终点的完整学习链</a></div></section>`
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

/* ——— 图谱：横向是分支，纵向是时间 ——— */
const LANE_W = 150, GUT = 58, ROW = 24, PADY = 10;
let mapState = Object.assign({tier: 2, edges: 'trunk', off: [], zoom: 1}, store.get('map', {}));
function lineage(id, depth) {
  const set = new Set([id]);
  const walk = (adj, key) => { let fr = [id]; for (let d = 0; d < depth && fr.length; d++) { const nx = []; for (const x of fr) for (const e of adj[x]) if (!set.has(e[key])) { set.add(e[key]); nx.push(e[key]); } fr = nx; } };
  walk(inn, 'from'); walk(out, 'to');
  return set;
}
function viewMap(_, q) {
  const focus = byId[q.focus] ? q.focus : null, depth = +(q.depth || 2);
  const era = G.eras.find(e => e.id === q.era);
  const st = mapState;
  if (q.tier) st.tier = +q.tier;
  const only = trackBy[q.only] ? q.only : null;
  let nodes, lanes;
  if (focus) {
    const set = lineage(focus, depth);
    nodes = G.nodes.filter(n => set.has(n.id));
    lanes = G.tracks.filter(t => nodes.some(n => n.track === t.key));
  } else {
    lanes = G.tracks.filter(t => only ? t.key === only : !st.off.includes(t.key));
    const lk = new Set(lanes.map(t => t.key));
    nodes = G.nodes.filter(n => lk.has(n.track) && n.tier <= (only ? Math.max(st.tier, 2) : st.tier) && (!era || eraOf(n) === era));
  }
  const laneX = {};
  lanes.forEach((t, i) => laneX[t.key] = GUT + i * LANE_W);
  const W = GUT + lanes.length * LANE_W;

  // 按年分桶：一年的高度 = 该年最挤的那条分支的节点数
  const years = [...new Set(nodes.map(n => n.y))].sort((a, b) => a - b);
  const pos = {}, deco = [], eraTop = {};
  let y = 0, lastEra = null, lastYear = null;
  for (const yr of years) {
    const inYear = nodes.filter(n => n.y === yr);
    const er = eraOf(inYear[0]);
    if (er !== lastEra) { eraTop[er.id] = y; deco.push(`<div class="eraband" style="top:${y}px"><a href="#/era/${er.id}">${esc(er.name)}<small>${er.from}–${er.to}</small></a></div>`); y += 30; lastEra = er; }
    else if (lastYear != null && yr - lastYear > 1) { deco.push(`<div class="gap" style="top:${y}px"><span>···</span></div>`); y += 14; }
    lastYear = yr;
    deco.push(`<div class="yrow" style="top:${y}px"><a class="ylab" href="#/year/${yr}">${yr}</a></div>`);
    let max = 1;
    for (const t of lanes) {
      const col = inYear.filter(n => n.track === t.key).sort((a, b) => a.m - b.m);
      let cy = y + PADY;
      for (const n of col) { pos[n.id] = {x: laneX[t.key] + 6, y: cy, h: n.tier === 1 ? 24 : 20}; cy += n.tier === 1 ? ROW + 4 : ROW; }
      max = Math.max(max, cy - y - PADY);
    }
    y += max + PADY * 2;
  }
  const H = y + 40;

  // 边：较早 → 较晚
  const vis = new Set(nodes.map(n => n.id));
  let edges = G.edges.filter(e => vis.has(e.from) && vis.has(e.to));
  if (!focus && st.edges === 'trunk') edges = edges.filter(e => byId[e.from].tier === 1 && byId[e.to].tier === 1);
  if (!focus && st.edges === 'none') edges = [];
  const NW = LANE_W - 14;
  const path = e => {
    const a = pos[e.from], b = pos[e.to];
    const x1 = a.x + NW / 2, x2 = b.x + NW / 2;
    if (b.y > a.y + a.h) { const y1 = a.y + a.h, y2 = b.y, d = Math.min(70, (y2 - y1) / 2); return `M${x1} ${y1}C${x1} ${y1 + d} ${x2} ${y2 - d} ${x2} ${y2}`; }
    const s1 = x2 >= x1 ? a.x + NW : a.x, s2 = x2 >= x1 ? b.x : b.x + NW;
    return `M${s1} ${a.y + a.h / 2}L${s2} ${b.y + b.h / 2}`;
  };
  const base = focus ? `#/map?focus=${encodeURIComponent(focus)}` : only ? `#/map?only=${only}` : era ? `#/map?era=${era.id}` : '#/map';
  app.innerHTML = `<div class="mapwrap">
    <div class="mapbar">
      ${focus ? `<span class="chip hue" ${hue(byId[focus].track)}>${esc(byId[focus].title)} 的来龙去脉</span><label>往前往后各</label>${[1, 2, 3, 9].map(d => `<a class="btn sm ${depth === d ? 'on' : ''}" href="#/map?focus=${encodeURIComponent(focus)}&depth=${d}">${d === 9 ? '全部' : d + ' 层'}</a>`).join('')}<a class="btn sm" href="#/map">← 回到全图</a>`
        : `${tierBar(st.tier, base)}<label>连接</label>${[['trunk', '主干'], ['all', '全部'], ['none', '不画']].map(([v, l]) => `<button class="btn sm ${st.edges === v ? 'on' : ''}" data-edges="${v}">${l}</button>`).join('')}
           ${only || era ? `<a class="btn sm" href="#/map">← 回到全图</a>` : `<button class="btn sm" id="pick">分支 ${lanes.length}/${G.tracks.length}</button>`}`}
      ${Object.keys(eraTop).length > 1 ? `<label>跳到</label>${G.eras.filter(e => eraTop[e.id] != null).map(e => `<button class="btn sm" data-jump="${eraTop[e.id]}" title="${esc(e.name)}">${e.from}</button>`).join('')}` : ''}
      <label>缩放</label>${[0.5, 0.75, 1].map(z => `<button class="btn sm ${st.zoom === z ? 'on' : ''}" data-zoom="${z}">${z * 100}%</button>`).join('')}
      <span class="sp"></span>
      <span class="legend"><span><i class="solves"></i>解决</span><span><i></i>延续</span><span><i class="uses"></i>使用</span><span><i class="rivals"></i>竞争</span></span>
      <span class="muted">${nodes.length} 个节点 · ${edges.length} 条连接</span>
    </div>
    <div class="lanes-pick" id="lanes" hidden>${G.tracks.map(t => `<button class="hue ${st.off.includes(t.key) ? 'off' : ''}" ${hue(t.key)} data-lane="${t.key}">${esc(t.short)}</button>`).join('')}</div>
    <div class="mapbody">
      <div class="scroller" id="scroller"><div class="canvas" style="width:${W}px;zoom:${st.zoom}">
        <div class="lanehead"><span class="g" style="width:${GUT}px"></span>${lanes.map(t => `<a class="hue" ${hs(t.key, `width:${LANE_W}px`)} href="#/track/${t.key}" title="${esc(t.name)}">${esc(t.short)}</a>`).join('')}</div>
        <div class="plane" id="plane" style="height:${H}px">
          ${lanes.map(t => `<div class="lane-bg" style="left:${laneX[t.key]}px;width:${LANE_W}px"></div>`).join('')}
          ${deco.join('')}
          <svg width="${W}" height="${H}">${edges.map((e, i) => `<path class="e ${e.type}" data-i="${i}" d="${path(e)}"/>`).join('')}</svg>
          ${nodes.map(n => { const p = pos[n.id]; return `<a class="nd t${n.tier} hue${status(n.id) === 2 ? ' done' : ''}${n.id === focus ? ' sel' : ''}" ${hs(n.track, `left:${p.x}px;top:${p.y}px;width:${NW}px`)} data-id="${esc(n.id)}" title="${esc(n.title)} · ${n.date}"><span>${esc(n.title)}</span></a>`; }).join('')}
        </div></div></div>
      <aside class="panel" id="panel" hidden></aside>
    </div></div>`;
  document.title = '图谱 · AI脉络';

  const plane = $('#plane'), panel = $('#panel');
  const edgeEls = [...plane.querySelectorAll('.e')], ndEls = {};
  plane.querySelectorAll('.nd').forEach(el => ndEls[el.dataset.id] = el);
  const byNode = {};
  edges.forEach((e, i) => { (byNode[e.from] ||= []).push(i); (byNode[e.to] ||= []).push(i); });
  let selected = null;
  const clearHL = () => { plane.classList.remove('focus'); plane.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); };
  const highlight = id => {
    clearHL();
    plane.classList.add('focus');
    ndEls[id]?.classList.add('hl');
    // 连接不一定都画出来了（“主干”模式），高亮时按完整的边表找邻居
    for (const e of [...inn[id], ...out[id]]) ndEls[e.from === id ? e.to : e.from]?.classList.add('hl');
    for (const i of byNode[id] || []) edgeEls[i].classList.add('hl');
  };
  const select = id => {
    selected = id;
    plane.querySelectorAll('.nd.sel').forEach(x => x.classList.remove('sel'));
    if (!id) { panel.hidden = true; clearHL(); return; }
    ndEls[id]?.classList.add('sel');
    highlight(id);
    const n = byId[id];
    const before = inn[id].slice().sort((a, b) => byId[a.from].date < byId[b.from].date ? -1 : 1), after = out[id].slice().sort((a, b) => byId[a.to].date < byId[b.to].date ? -1 : 1);
    const li = (e, o) => `<li><span class="ty ${e.type}">${REL[e.type]}</span><div>${chip(o)}${e.note ? `<div class="nt">${inline(e.note)}</div>` : ''}</div></li>`;
    panel.className = 'panel hue'; panel.style.cssText = hs(n.track).slice(7, -1);
    panel.innerHTML = `<button class="x" aria-label="关闭">×</button><div class="eyebrow">${esc(trackBy[n.track].name)}</div>
      <h3>${esc(n.title)}</h3>${n.full ? `<div class="full">${esc(n.full)}</div>` : ''}
      <div class="meta">${fmtDate(n.date)} · ${KIND[n.kind]} · ${['', '主干必读', '重要', '延伸'][n.tier]}${n.who ? ` · ${esc(n.who.split('·')[0].trim())}` : ''}</div>
      ${n.has ? `<dl><dt>当时卡在哪</dt><dd>${inline(n.problem)}</dd><dt>它怎么解决</dt><dd>${inline(n.idea)}</dd><dt>改变了什么</dt><dd>${inline(n.impact)}</dd></dl>` : '<p class="muted">讲解整理中</p>'}
      <div class="acts"><a class="btn fill" href="#/n/${encodeURIComponent(id)}">读完整讲解</a><a class="btn" href="#/map?focus=${encodeURIComponent(id)}">只看来龙去脉</a>${stBtn(id)}</div>
      ${before.length ? `<h4>它建立在什么之上 · ${before.length}</h4><ul class="rels">${before.map(e => li(e, e.from)).join('')}</ul>` : ''}
      ${after.length ? `<h4>后来谁接着做 · ${after.length}</h4><ul class="rels">${after.map(e => li(e, e.to)).join('')}</ul>` : ''}`;
    panel.hidden = false;
  };
  plane.addEventListener('click', e => { const el = e.target.closest('.nd'); if (el) { e.preventDefault(); select(el.dataset.id === selected ? null : el.dataset.id); } else if (!e.target.closest('a')) select(null); });
  plane.addEventListener('mouseover', e => { const el = e.target.closest('.nd'); if (el && !selected) highlight(el.dataset.id); });
  plane.addEventListener('mouseout', e => { if (e.target.closest('.nd') && !selected) clearHL(); });
  panel.addEventListener('click', e => { if (e.target.closest('.x')) select(null); });
  const redraw = () => { store.set('map', st); viewMap(_, q); };
  app.querySelectorAll('[data-edges]').forEach(b => b.onclick = () => { st.edges = b.dataset.edges; redraw(); });
  app.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { st.zoom = +b.dataset.zoom; redraw(); });
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => $('#scroller').scrollTo({top: +b.dataset.jump * st.zoom, behavior: 'smooth'}));
  const pick = $('#pick'), lanesEl = $('#lanes');
  if (pick) pick.onclick = () => { lanesEl.hidden = !lanesEl.hidden; };
  lanesEl.addEventListener('click', e => {
    const b = e.target.closest('[data-lane]'); if (!b) return;
    const k = b.dataset.lane; st.off = st.off.includes(k) ? st.off.filter(x => x !== k) : [...st.off, k];
    if (st.off.length >= G.tracks.length) st.off = [];
    redraw(); $('#lanes').hidden = false;
  });
  if (q.tier) { store.set('map', st); }
  if (focus) { select(focus); const p = pos[focus]; const sc = $('#scroller'); sc.scrollTo({top: Math.max(0, p.y * st.zoom - 200), left: p.x * st.zoom > sc.clientWidth - 200 ? p.x * st.zoom - sc.clientWidth / 2 : 0}); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const x = $('#panel .x'); if (x) x.click(); } });

const themeBtn = $('#theme');
const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; themeBtn.textContent = {light: '☀', dark: '☾'}[t] || '◐'; themeBtn.title = '主题：' + ({light: '浅色', dark: '深色'}[t] || '跟随系统'); };
applyTheme(store.get('theme', ''));
themeBtn.onclick = () => { const t = {'': 'light', light: 'dark', dark: ''}[store.get('theme', '')]; store.set('theme', t); applyTheme(t); };
boot().catch(err => { app.innerHTML = `<div class="page"><div class="empty">数据载入失败：${esc(err.message)}<br>本地预览请用 <code>python3 -m http.server -d docs</code>，不要直接双击打开文件。</div></div>`; });
})();
