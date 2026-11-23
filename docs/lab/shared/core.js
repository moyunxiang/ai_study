/* 设计原型共用的数据层：读 docs/data/ 里线上同一份数据，给出节点、关系、讲解正文、概念、专题、搜索和学习进度。
   不含任何版式，每套设计自己决定怎么摆。只在本机预览用。 */
window.Lab = (() => {
'use strict';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const enc = encodeURIComponent;
const KIND = {paper: '论文', model: '模型', system: '系统', hardware: '硬件', dataset: '数据集', event: '事件', concept: '思想'};
const REL = {solves: '改进', extends: '延续', uses: '使用', rivals: '竞争'};
const TIER = ['', '主干', '重要', '延伸'], REV = ['待核对', '来源已核对', '人工复核'], ST = ['未读', '在读', '已读'];
const AREA = {idea: '研究思路', math: '数学预备', prob: '概率统计与信息论', opt: '优化与训练', ml: '机器学习基础', nn: '神经网络组件', seq: '序列与语言模型',
  gen: '生成模型', rl: '强化学习', vis: '视觉', aud: '语音', emb: '具身与控制', sys: '系统与硬件', eval: '评测与实验方法'};
const LEVEL = ['预备', '入门', '进阶'];

let core, D = {nodes: [], edges: [], byId: {}, trackBy: {}, out: {}, inn: {}, order: {}, posIn: {}, concepts: {}, thBy: {}, storyBy: {}, years: {}};
const cache = {};
const DATA = new URL('../../data/', document.currentScript.src).href;      // 本机是 /data/，线上是 /ai_study/data/
const load = p => cache[p] ||= fetch(DATA + p).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }).catch(e => { delete cache[p]; throw e; });

const store = {
  get(k, d) { try { const v = localStorage.getItem('aimap.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aimap.' + k, JSON.stringify(v)); } catch {} },
};
let progress = store.get('progress', {}), marks = store.get('marks', {});
const status = id => progress[id] || 0;
function cycle(id) { const v = (status(id) + 1) % 3; if (v) progress[id] = v; else delete progress[id]; store.set('progress', progress); return v; }
function mark(id) { if (marks[id]) delete marks[id]; else marks[id] = 1; store.set('marks', marks); return !!marks[id]; }

async function boot() {
  core = await load('core.json');
  Object.assign(D, {tracks: core.tracks, eras: core.eras, groups: core.groups, forks: core.forks, threads: core.threads, stories: core.stories, routes: core.routes, figs: core.figs});
  D.tracks.forEach((t, i) => { D.trackBy[t.key] = t; t.i = i; D.order[t.key] = []; D.thBy[t.key] = {}; t.count = 0; (D.threads[t.key] ||= []).forEach(th => { th.ids = []; th.track = t.key; D.thBy[t.key][th.key] = th; }); });
  D.groups.forEach(g => g.tracks.forEach(k => D.trackBy[k].g = g));
  for (const a of core.N) {
    const n = {id: a[0], date: a[1], tier: a[2], kind: core.kinds[a[3]], title: a[4], track: D.tracks[a[5]].key, th: a[6], rev: a[7]};
    n.y = +n.date.slice(0, 4); n.m = +(n.date.slice(5, 7) || 0); n.t = n.y + (n.m ? (n.m - .5) / 12 : .5);
    D.byId[n.id] = n; D.out[n.id] = []; D.inn[n.id] = []; D.posIn[n.id] = D.order[n.track].length; D.order[n.track].push(n.id); D.nodes.push(n);
    D.trackBy[n.track].count++; (D.thBy[n.track][n.th] || {ids: []}).ids.push(n.id); (D.years[n.y] ||= []).push(n);
  }
  for (const a of core.E) { const e = {from: D.nodes[a[0]].id, to: D.nodes[a[1]].id, type: core.rels[a[2]], f: a[3]}; D.edges.push(e); D.out[e.from].push(e); D.inn[e.to].push(e); }
  for (const c of core.C) D.concepts[c[0]] = {key: c[0], name: c[1], en: c[2], area: c[3], level: c[4], track: c[5], n: c[6], needs: c[8] || []};
  D.stories.forEach(s => D.storyBy[s.key] = s);
  D.chrono = [...D.nodes].sort((a, b) => a.t - b.t || a.tier - b.tier);
  return D;
}

/* 摘要：英文原题、作者、问题、方法、影响 */
const briefP = {};
function applyBrief(o) { for (const id in o) { const n = D.byId[id]; if (n && !n.b) { n.b = 1; [n.full, n.who, n.problem, n.idea, n.impact] = o[id]; } } }
function brief(list) {
  const jobs = [];
  if (list.some(n => n.tier <= 2 && !n.b)) jobs.push(briefP.a ||= load('brief12.json').then(applyBrief));
  for (const k of new Set(list.filter(n => n.tier === 3 && !n.b).map(n => n.track))) jobs.push(briefP[k] ||= load(`brief3/${k}.json`).then(applyBrief));
  return Promise.all(jobs);
}
async function content(id) {
  const n = D.byId[id], o = await load(`content/${n.track}-${Math.floor(D.posIn[id] / core.chunk)}.json`);
  for (const k in o) { const x = D.byId[k]; if (x && !x.b) { x.b = 1; Object.assign(x, {full: o[k].full, who: o[k].who, problem: o[k].problem, idea: o[k].idea, impact: o[k].impact}); } }
  return o[id] || {};
}
async function concept(key) {
  const c = D.concepts[key];
  if (c && !c.loaded) { const o = await load(`cbody/${c.area === 'idea' ? 'idea-' + c.track : c.area}.json`); for (const k in o) if (D.concepts[k]) Object.assign(D.concepts[k], o[k], {loaded: true}); }
  return c;
}
const story = async key => (await load('stories.json'))[key];
let S, searchP;
const searcher = () => searchP ||= load('search.json').then(sd => (S = AIMapSearch.create(core, sd)));
const search = async (q, limit = 60) => (await searcher()).search(q, limit);
const hitHref = x => ({n: '#/n/' + enc(x.id), t: '#/n/' + enc(x.id), c: '#/c/' + x.id, tr: '#/t/' + x.id, s: '#/s/' + x.id, th: `#/t/${x.track}/${x.th}`}[x.k] || '#/');
const hitKind = x => ({n: '节点', t: '术语', c: x.area === 'idea' ? '思路' : '概念', tr: '分支', s: '专题', th: '主题线'}[x.k] || '');

/* 颜色：分支有自己的色相。h()给CSS变量，hsl()给画布 */
const hv = t => { const k = D.trackBy[t]; return `--h:${k.hue}${k.sat != null ? `;--s:${k.sat / 48}` : ''}`; };
const hsl = (t, s, l, a = 1) => { const k = D.trackBy[t]; return `hsl(${k.hue} ${k.sat != null ? Math.round(s * k.sat / 48) : s}% ${l}% / ${a})`; };
const fmt = d => d.length === 7 ? `${d.slice(0, 4)}.${d.slice(5)}` : d;
const eraOf = n => D.eras.find(e => n.y <= e.to) || D.eras[D.eras.length - 1];

/* 正文标记：空行分段、- 列表、**粗体**、`代码`、[[节点]]、[[c:概念]] */
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, ref, txt) => {
      ref = ref.trim();
      if (ref.startsWith('c:')) { const c = D.concepts[ref.slice(2)]; return c ? `<a class="lc" href="#/c/${c.key}">${txt || esc(c.name)}</a>` : (txt || esc(ref)); }
      const n = D.byId[ref];
      return n ? `<a class="ln" style="${hv(n.track)}" href="#/n/${enc(n.id)}" title="${n.date}">${txt || esc(n.title)}</a>` : (txt || esc(ref));
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
      if (m) { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para.length = 0; } list.push(m[1]); } else { flush(); para.push(line.trim()); }
    }
    flush();
    if (para.length) { const t = para.join('\n').trim(); html += /^`[^`]+`$/.test(t) ? `<p class="formula">${inline(t)}</p>` : `<p>${inline(para.join(' '))}</p>`; }
  }
  return html;
}
async function figs(keys) {
  const fs = (keys || []).map(k => D.figs.find(f => f.key === k)).filter(Boolean);
  if (!fs.length) return '';
  const svgs = await load('figs.json').catch(() => ({}));
  return fs.map(f => `<figure class="fig">${svgs[f.key] || ''}<figcaption><b>${esc(f.title)}</b>　${inline(f.caption)}</figcaption></figure>`).join('');
}

/* 一个节点的全部材料：n 节点，c 正文，before/after 排好序的前驱和后续，parts 是不带版式的HTML片段 */
const nlink = (id, cls = 'nl') => { const n = D.byId[id]; return n ? `<a class="${cls}" style="${hv(n.track)}" href="#/n/${enc(id)}">${esc(n.title)}</a>` : ''; };
const clink = k => { const c = D.concepts[k]; return c ? `<a class="cl" href="#/c/${k}">${esc(c.name)}</a>` : ''; };
const stBtn = id => `<button class="st s${status(id)}" data-st="${esc(id)}" title="点一下切换：未读 → 在读 → 已读">${ST[status(id)]}</button>`;
const mkBtn = id => `<button class="mk ${marks[id] ? 'on' : ''}" data-mk="${esc(id)}">${marks[id] ? '★ 已收藏' : '☆ 收藏'}</button>`;
async function node(id) {
  const n = D.byId[id]; if (!n) return null;
  const c = await content(id), t = D.trackBy[n.track], th = D.thBy[n.track][n.th], era = eraOf(n), rel = c.rel || {};
  const vr = e => e.f & 2 ? 0 : e.f & 4 ? 1 : 2, B = D.byId;
  const before = [...D.inn[id]].sort((a, b) => vr(a) - vr(b) || B[a.from].tier - B[b.from].tier || (B[a.from].date < B[b.from].date ? 1 : -1));
  const after = [...D.out[id]].sort((a, b) => vr(a) - vr(b) || B[a.to].tier - B[b.to].tier || (B[a.to].date < B[b.to].date ? -1 : 1));
  const ord = D.order[n.track], k = D.posIn[id], prev = B[ord[k - 1]], next = B[ord[k + 1]];
  const sec = (title, text, a) => text ? `<h2 id="${a}">${title}</h2>${rich(text)}` : '';
  const relItem = (e, other) => { const o = B[other]; return `<li class="r-${e.type}"><span class="ty">${REL[e.type]}</span><div>${nlink(other)}<span class="yr">${fmt(o.date)} · ${esc(D.trackBy[o.track].short)}</span>${e.f & 2 ? '<span class="vk">已核对</span>' : ''}${rel[other] ? `<div class="nt">${inline(rel[other])}</div>` : ''}</div></li>`; };
  const relList = (es, key, cap = 8) => es.length ? `<ul class="rels">${es.slice(0, cap).map(e => relItem(e, e[key])).join('')}</ul>${es.length > cap ? `<details class="more"><summary>其余${es.length - cap}条</summary><ul class="rels">${es.slice(cap).map(e => relItem(e, e[key])).join('')}</ul></details>` : ''}` : '';
  const pre = (c.prereq || []).filter(p => D.concepts[p]);
  const limits = (c.limits || []).map(l => `<li>${inline(l.text)}<div class="by">${l.open ? `<b>有依据表明仍未解决</b>　${esc(l.open)}` : l.by.length ? `后来针对它的工作：${l.by.map(i => nlink(i)).join('、')}` : '本站还没有记录针对它的后续工作'}</div></li>`).join('');
  const toc = [c.background && ['bg', '背景'], c.method && ['method', '方法'], c.results && ['results', '结果'], c.legacy && ['legacy', '后来的发展'], c.pitfalls && ['pitfalls', '容易误解的地方'], limits && ['limits', '局限与后续'], before.length && ['before', '它建立在什么之上'], after.length && ['after', '后来的相关工作']].filter(Boolean);
  const parts = {
    path: `${t.g ? esc(t.g.name) + ' › ' : ''}<a href="#/t/${t.key}">${esc(t.name)}</a>${th && n.th !== 'all' ? ` › <a href="#/t/${t.key}/${n.th}">${esc(th.name)}</a>` : ''}`,
    meta: [fmt(n.date), KIND[n.kind], TIER[n.tier], c.venue, n.who, REV[n.rev]].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join(''),
    links: (c.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(''),
    gist: n.problem ? `<div><h4>问题</h4><p>${inline(n.problem)}</p></div><div><h4>方法</h4><p>${inline(n.idea)}</p></div><div><h4>影响</h4><p>${inline(n.impact)}</p></div>` : '',
    prereq: pre.length ? `<p class="prereq"><span>读之前最好先会</span>${pre.slice(0, 5).map(clink).join('')}</p>` : '',
    body: sec('背景', c.background, 'bg') + sec('方法', c.method, 'method') + await figs(c.figs) + sec('结果', c.results, 'results') + sec('后来的发展', c.legacy, 'legacy') + sec('容易误解的地方', c.pitfalls, 'pitfalls')
      + (limits ? `<h2 id="limits">局限与后续</h2><ul class="limits">${limits}</ul>` : ''),
    before: relList(before, 'from'), after: relList(after, 'to'),
    terms: (c.terms || []).length ? `<ul class="terms">${c.terms.map(x => `<li><b>${esc(x.t)}</b>　${inline(x.d)}</li>`).join('')}</ul>` : '',
    learn: c.learn ? rich(c.learn) : '',
    trust: n.rev ? `${REV[n.rev]}：已由AI对照原始来源逐项核对${n.rev === 2 ? '，并经人工复核' : '，未经人工复核'}。` : '待核对：这篇讲解由AI模型撰写，尚未对照原始来源独立核对，可能有错。',
    mine: stBtn(id) + mkBtn(id),
  };
  /* 默认的拼法：各设计可以直接用，也可以只取其中几块 */
  parts.article = `<header class="a-head"><div class="a-path">${parts.path}</div><h1>${esc(n.title)}</h1>${n.full ? `<div class="a-full">${esc(n.full)}</div>` : ''}<div class="a-meta">${parts.meta}</div>${parts.links ? `<div class="a-src">${parts.links}</div>` : ''}</header>
    ${parts.gist ? `<div class="a-gist">${parts.gist}</div>` : ''}<div class="a-body">${parts.prereq}${parts.body}</div>`;
  parts.relations = (parts.before ? `<h2 id="before">它建立在什么之上<small>${before.length}</small></h2>${parts.before}` : '') + (parts.after ? `<h2 id="after">后来的相关工作<small>${after.length}</small></h2>${parts.after}` : '');
  parts.tail = (parts.terms ? `<h2>本篇术语</h2>${parts.terms}` : '') + (parts.learn ? `<h2>怎么学</h2>${parts.learn}` : '') + `<p class="a-trust">${parts.trust}</p><div class="a-mine">${parts.mine}</div>`;
  return {n, c, t, th, era, before, after, prev, next, toc, parts};
}
async function conceptHTML(key) {
  const c = await concept(key); if (!c) return null;
  const nodes = (c.nodes || []).filter(i => D.byId[i]);
  return {c, nodes, html: `<header class="a-head"><div class="a-path">${c.area === 'idea' ? '研究思路' : '概念'} › ${esc(AREA[c.area] || '')}</div><h1>${esc(c.name)}</h1>${c.en ? `<div class="a-full">${esc(c.en)}</div>` : ''}<div class="a-meta"><span>${LEVEL[c.level] || ''}</span><span>${nodes.length}个节点用到</span></div></header>
    ${c.short ? `<div class="a-gist one"><div><p>${inline(c.short)}</p></div></div>` : ''}<div class="a-body">${c.needs.length ? `<p class="prereq"><span>先会</span>${c.needs.map(clink).join('')}</p>` : ''}${rich(c.body)}${c.example ? `<h2>例子</h2>${rich(c.example)}` : ''}${c.pitfalls ? `<h2>容易误解的地方</h2>${rich(c.pitfalls)}` : ''}
    ${nodes.length ? `<h2>用到它的节点<small>${nodes.length}</small></h2><p class="nlist">${nodes.slice(0, 40).map(i => nlink(i)).join('')}</p>` : ''}</div>`};
}
/* 路线和专题统一成“一串站”：{key,title,question,steps:[{node,h,text}]} */
function routeList() {
  const r = D.routes.intro;
  return [{key: 'intro', title: '入门路线', question: r.title.replace(/^入门路线[:：]/, ''), n: r.steps.length, nodes: r.steps.map(s => s.node)}, ...D.stories.map(s => ({key: s.key, title: s.title, question: s.question, n: s.nodes.length, nodes: s.nodes}))];
}
async function route(key) {
  if (key === 'intro') { const r = D.routes.intro; return {key, title: '入门路线', question: r.title, intro: r.blurb, steps: r.steps.map(s => ({node: s.node, h: s.topic, text: s.why}))}; }
  const s = await story(key); return s && {key, title: s.title, question: s.question, intro: s.intro, steps: s.steps, takeaway: s.takeaway, caveats: s.caveats};
}
/* 点学习状态和收藏按钮：各设计只要在容器上挂一次 */
function bindState(el, after) {
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-st]'), m = e.target.closest('[data-mk]');
    if (b) { const v = cycle(b.dataset.st); document.querySelectorAll(`[data-st="${CSS.escape(b.dataset.st)}"]`).forEach(x => { x.className = 'st s' + v; x.textContent = ST[v]; }); after && after(b.dataset.st, v); }
    if (m) { const on = mark(m.dataset.mk); m.classList.toggle('on', on); m.textContent = on ? '★ 已收藏' : '☆ 收藏'; }
  });
}
/* 时间到0–1的刻度：一半按年份均匀走，一半按累计节点数走，所以节点多的年份占得宽。pow<1 时越往后越宽（环形图用） */
function scale(lo = 1943, hi = 2027, mix = .6, pow = 1) {
  const ys = []; let cum = 0; const total = D.nodes.filter(n => n.y >= lo).length;
  for (let y = lo; y <= hi; y++) { ys.push(cum / total); cum += (D.years[y] || []).length; }
  ys.push(1);
  return t => { t = Math.max(lo, Math.min(hi, t)); const i = Math.floor(t) - lo, f = t - Math.floor(t), d = ys[i] + ((ys[i + 1] ?? 1) - ys[i]) * f, l = (t - lo) / (hi - lo); return Math.pow((1 - mix) * l + mix * d, pow); };
}
const parseHash = () => { const [p, qs] = location.hash.replace(/^#\/?/, '').split('?'); return {seg: p.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } }), q: Object.fromEntries(new URLSearchParams(qs || ''))}; };
return {boot, D, load, brief, content, node, concept, conceptHTML, story, route, routeList, search, hitHref, hitKind, figs, inline, rich, esc, enc, fmt, eraOf, hv, hsl, nlink, clink, stBtn, mkBtn, bindState, status, scale, parseHash,
  marks: () => marks, progress: () => progress, KIND, REL, TIER, REV, ST, AREA, LEVEL};
})();
