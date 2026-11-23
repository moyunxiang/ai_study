/* 分栏：像文件管理器的分栏视图。每点一层，右边多出一栏；最右边永远是讲解。五种看法（方向、年代、路线、概念、我的）共用这一套栏。
   地址就是当前选中的路径，所以前进后退、分享链接都能回到同一个位置。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc, fmt, inline, rich} = L, $ = (s, el = document) => el.querySelector(s);
const root = $('#root');
let tierMax = +(localStorage.getItem('lab.col.tier') || 2);
const MODES = [['t', '方向'], ['e', '年代'], ['s', '路线'], ['idx', '概念'], ['me', '我的']];
root.innerHTML = `<header class="tbar"><a class="brand" href="#/">AI脉络</a>
  <nav class="seg" id="modes">${MODES.map(([k, n]) => `<a href="#/${k}" data-m="${k}">${n}</a>`).join('')}</nav>
  <span class="seg sm" id="tier">${[[1, '主干'], [2, '+重要'], [3, '全部']].map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</span>
  <input id="q" type="search" placeholder="搜索" autocomplete="off"></header>
  <div class="path" id="path"></div><div class="cols" id="cols"></div>`;
const cols = $('#cols'), pathEl = $('#path'), q = $('#q');
L.bindState(root);
const drawTier = () => document.querySelectorAll('#tier button').forEach(b => b.classList.toggle('on', +b.dataset.v === tierMax));
$('#tier').onclick = e => { const b = e.target.closest('button'); if (b) { tierMax = +b.dataset.v; localStorage.setItem('lab.col.tier', tierMax); drawTier(); route(); } };
q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) { location.hash = '#/q/' + enc(q.value.trim()); q.blur(); } });

/* 一栏里的一行 */
const item = (href, on, main, opt = {}) => `<li><a href="${href}" class="${on ? 'on' : ''} ${opt.cls || ''}"${opt.style ? ` style="${opt.style}"` : ''}>${opt.dot ? '<i class="dot"></i>' : ''}${opt.no ? `<i class="no">${opt.no}</i>` : ''}<span>${main}${opt.sub ? `<small>${opt.sub}</small>` : ''}</span>${opt.r != null ? `<em>${opt.r}</em>` : ''}${opt.leaf ? '' : '<b>›</b>'}</a></li>`;
const col = (id, title, items, w) => `<section class="col ${w || ''}" data-col="${id}"><h6>${title}</h6><ul>${items.join('') || '<li class="none">没有内容</li>'}</ul></section>`;
const nodeItem = (n, on, suffix = '', opt = {}) => item(`#/n/${enc(n.id)}${suffix}`, on, esc(n.title), {cls: `hue t${n.tier}${L.status(n.id) === 2 ? ' done' : ''}`, style: L.hv(n.track), dot: 1, r: opt.r ?? n.y, leaf: 1, ...opt});
const card = (kicker, title, body) => `<div class="card"><p class="kick">${kicker}</p><h1>${title}</h1>${body}</div>`;

/* 把地址解析成：模式 + 各栏 + 右边讲解区 */
async function build() {
  const {seg, q: qs} = L.parseHash();
  let [v, a, b] = seg, ctx = qs.in || '', C = [], pane = '', path = [], mode = 't', leaf = null;
  if (v === 'n' && D.byId[a]) { leaf = {k: 'n', id: a}; const n = D.byId[a], c = ctx.split(':');
    if (c[0] === 'e') { v = 'e'; a = L.eraOf(n).id; b = String(n.y); }
    else if (c[0] === 's') { v = 's'; a = c[1]; } else if (c[0] === 'c') { v = 'c'; a = c[1]; } else if (c[0] === 'me') { v = 'me'; a = c[1]; } else if (c[0] === 'q') { v = 'q'; a = decodeURIComponent(c.slice(1).join(':')); }
    else { v = 't'; a = n.track; b = n.th; } }
  if (v === 'c' && D.concepts[a] && !leaf) leaf = {k: 'c', id: a};
  const sel = leaf && leaf.k === 'n' ? leaf.id : null;

  if (v === 'e') { mode = 'e';
    const era = D.eras.find(e => e.id === a), y = +b || 0;
    C.push(col('eras', '年代', D.eras.map(e => item('#/e/' + e.id, e === era, esc(e.name), {sub: `${e.from}–${e.to}`})), 'w2'));
    path.push(['#/e', '年代']);
    if (era) { path.push(['#/e/' + era.id, era.name]);
      const ys = []; for (let i = era === D.eras[0] ? 1900 : era.from; i <= era.to; i++) if ((D.years[i] || []).some(n => n.tier <= tierMax)) ys.push(i);
      C.push(col('years', '年份', ys.map(i => item(`#/e/${era.id}/${i}`, i === y, i, {r: D.years[i].filter(n => n.tier <= tierMax).length}))));
      pane = card(`${era.from}–${era.to}`, esc(era.name), `<p class="lead">${esc(era.tagline)}</p><p>${esc(era.context)}</p><h3>这个年代各方向在问什么</h3><dl>${era.questions.map(x => `<dt class="hue" style="${L.hv(x.track)}">${esc(D.trackBy[x.track].short)}</dt><dd>${esc(x.text)}</dd>`).join('')}</dl>`);
      if (y) { path.push([`#/e/${era.id}/${y}`, y]); const ns = D.years[y].filter(n => n.tier <= tierMax || n.id === sel).sort((p, r) => p.t - r.t);
        C.push(col('nodes', `${y}年 · ${ns.length}个`, ns.map(n => nodeItem(n, n.id === sel, '?in=e', {r: D.trackBy[n.track].short})), 'w3'));
        pane = card(y + '年', `这一年有${ns.length}个节点`, '<p>从左边选一个开始读。圆点的颜色是它所在的分支。</p>'); } }
    else pane = card('按年代看', '九个年代', `<p class="lead">从1943年到今天，按当时在争论什么分成九段。先选年代，再选年份，最后选节点。</p>`);
  } else if (v === 's') { mode = 's';
    const list = L.routeList(), r = a ? await L.route(a) : null;
    C.push(col('routes', '路线与专题', list.map(x => item('#/s/' + x.key, r && x.key === a, esc(x.title), {r: x.n})), 'w3'));
    path.push(['#/s', '路线']);
    if (r) { path.push(['#/s/' + a, r.title]);
      C.push(col('steps', `${r.steps.length}站`, r.steps.map((s, i) => { const n = D.byId[s.node]; return n ? nodeItem(n, n.id === sel, `?in=s:${a}`, {no: i + 1, sub: esc(s.h), dot: 0}) : ''; }), 'w3'));
      const st = sel && r.steps.find(s => s.node === sel);
      pane = st ? `<div class="stepnote"><b>这一站：${esc(st.h)}</b>${rich(st.text)}</div>` : card(a === 'intro' ? '入门路线' : '研究专题', esc(r.title), `<p class="lead">${esc(r.question)}</p><div class="a-body">${rich(r.intro)}</div>${r.takeaway ? `<h3>读完应该带走什么</h3><div class="a-body">${rich(r.takeaway)}</div>` : ''}${r.caveats ? `<h3>这条线的局限</h3><div class="a-body">${rich(r.caveats)}</div>` : ''}`);
    } else pane = card('按路线读', '一条入门路线，十个研究专题', `<p class="lead">不知道从哪看起，就从入门路线开始：14站，每一站讲清楚它回应了什么问题。</p>`);
  } else if (v === 'idx' || v === 'c') { mode = 'idx';
    const c = v === 'c' ? D.concepts[a] : null, area = c ? c.area : a;
    C.push(col('areas', '领域', Object.entries(L.AREA).map(([k, n]) => item('#/idx/' + k, k === area, esc(n), {r: Object.values(D.concepts).filter(x => x.area === k).length})), 'w2'));
    path.push(['#/idx', '概念']);
    if (L.AREA[area]) { path.push(['#/idx/' + area, L.AREA[area]]);
      const cs = Object.values(D.concepts).filter(x => x.area === area).sort((p, r) => p.level - r.level || r.n - p.n);
      C.push(col('concepts', `${cs.length}个`, cs.map(x => item('#/c/' + x.key, c === x, esc(x.name), {r: x.n, sub: L.LEVEL[x.level]}))));
      pane = card('概念', esc(L.AREA[area]), `<p class="lead">${cs.length}个${area === 'idea' ? '研究思路' : '概念'}，按难度从预备到进阶排列；右边的数字是用到它的节点数。</p>`);
      if (c) { path.push(['#/c/' + c.key, c.name]); const x = await L.conceptHTML(c.key);
        if (x.nodes.length) C.push(col('nodes', `用到它的节点 · ${x.nodes.length}`, x.nodes.map(i => D.byId[i]).sort((p, r) => p.t - r.t).map(n => nodeItem(n, n.id === sel, `?in=c:${c.key}`)), 'w3'));
        pane = `<article class="art">${x.html}</article>`; } }
    else pane = card('按概念查', '读懂讲解需要的概念', '<p class="lead">每篇讲解开头会列出“读之前最好先会”的概念。这里按领域把它们排在一起，也可以反过来查哪些节点用到了某个概念。</p>');
  } else if (v === 'me') { mode = 'me';
    const p = L.progress(), m = L.marks(), lists = {doing: ['在读', Object.keys(p).filter(i => p[i] === 1)], fav: ['收藏', Object.keys(m)], read: ['已读', Object.keys(p).filter(i => p[i] === 2)]};
    C.push(col('lists', '我的', Object.entries(lists).map(([k, [n, ids]]) => item('#/me/' + k, k === a, n, {r: ids.filter(i => D.byId[i]).length})), 'w2'));
    path.push(['#/me', '我的']);
    if (lists[a]) { path.push(['#/me/' + a, lists[a][0]]); C.push(col('nodes', lists[a][0], lists[a][1].filter(i => D.byId[i]).map(i => nodeItem(D.byId[i], i === sel, `?in=me:${a}`)), 'w3')); }
    pane = card('我的进度', `已读${lists.read[1].length}个`, '<p class="lead">在任何一篇讲解的末尾都可以标“在读”“已读”或收藏。记录只存在这个浏览器里。</p>');
  } else if (v === 'q') { mode = 'q';
    const res = (await L.search(a, 80)).filter(x => x.k !== 't'); path.push(['#/q/' + enc(a), `搜索“${a}”`]);
    C.push(col('hits', `“${esc(a)}” · ${res.length}条`, res.map(x => x.k === 'n' ? nodeItem(D.byId[x.id], x.id === sel, `?in=q:${enc(a)}`) : item(L.hitHref(x), false, esc(x.t), {sub: L.hitKind(x)})), 'w4'));
    pane = card('搜索', `“${esc(a)}”`, `<p class="lead">${res.length ? '从左边选一条。' : '没有找到。换个说法，或者用英文原名试试。'}</p>`);
  } else { mode = 't';
    const g = v === 'g' ? D.groups.find(x => x.key === a) : D.trackBy[a] ? D.trackBy[a].g : null, t = v === 't' ? D.trackBy[a] : null, th = t && b ? D.thBy[t.key][b] : null;
    C.push(col('groups', '大方向', D.groups.map(x => item('#/g/' + x.key, x === g, esc(x.name), {r: x.tracks.reduce((s, k) => s + D.trackBy[k].count, 0)})), 'w2'));
    path.push(['#/t', '方向']);
    pane = card('整棵树', 'AI研究的来龙去脉', `<p class="lead">${D.nodes.length}个节点分在六个大方向、十六条分支里。从左往右一栏一栏选：大方向 › 分支 › 主题线 › 节点，最右边是讲解。</p><p>上面可以换成按年代、按路线、按概念来看，栏的用法都一样。方向键也能用：↑↓在一栏里移动，←→换栏。</p><p><a class="go" href="#/s/intro">第一次来？从入门路线开始 →</a></p>`);
    if (g) { path.push(['#/g/' + g.key, g.name]);
      C.push(col('tracks', '分支', g.tracks.map(k => { const x = D.trackBy[k]; return item('#/t/' + k, x === t, esc(x.name), {cls: 'hue', style: L.hv(k), dot: 1, r: x.count}); }), 'w3'));
      pane = card(esc(g.role || '大方向'), esc(g.name), `<p class="lead">${esc(g.blurb)}</p>`); }
    if (t) { path.push(['#/t/' + t.key, t.name]); const f = D.forks[t.key] || {};
      C.push(col('threads', '主题线', D.threads[t.key].map(x => item(`#/t/${t.key}/${x.key}`, x === th, esc(x.name), {r: x.ids.length, sub: `${x.first.slice(0, 4)}–${x.last.slice(0, 4)}`}))));
      pane = card('分支', esc(t.name), `<p class="lead">${esc(t.question)}</p><p>${esc(t.blurb)}</p>${f.why ? `<p class="fine">${f.from ? `从“${esc(D.trackBy[f.from].name)}”分出来。` : '树的一条根。'}${esc(f.why)}</p>` : ''}<h3>发展阶段</h3><dl>${t.stages.map(s => `<dt>${s.from}–${s.to}</dt><dd><b>${esc(s.name)}</b>　${esc(s.text)}</dd>`).join('')}</dl>`); }
    if (th) { path.push([`#/t/${t.key}/${th.key}`, th.name]); const ns = th.ids.map(i => D.byId[i]).filter(n => n.tier <= tierMax || n.id === sel);
      C.push(col('nodes', `${ns.length}/${th.ids.length}个节点`, ns.map(n => nodeItem(n, n.id === sel)), 'w3'));
      pane = card('主题线', esc(th.name), `<p class="lead">${esc(th.blurb)}</p>${th.from && D.thBy[t.key][th.from] ? `<p class="fine">从“${esc(D.thBy[t.key][th.from].name)}”分出来${th.via && D.byId[th.via] ? `，分叉点是${L.nlink(th.via)}` : ''}。</p>` : ''}<p>${th.ids.length}个节点，${fmt(th.first)}到${fmt(th.last)}。${ns.length < th.ids.length ? `现在列出的是其中${ns.length}个，右上角可以改成“全部”。` : ''}</p>`); }
  }
  if (sel) { const x = await L.node(sel), n = x.n; path.push(['#/n/' + enc(sel), n.title]);
    pane = `<article class="art hue" style="${L.hv(n.track)}">${pane.startsWith('<div class="stepnote"') ? pane : ''}${x.parts.article}<div class="a-rel">${x.parts.relations}</div><div class="a-body">${x.parts.tail}</div></article>`; }
  return {mode, C, pane, path, leaf};
}
let rt = 0;
async function route() {
  const my = ++rt; let r;
  try { r = await build(); } catch (e) { console.error(e); r = {mode: 't', C: [], pane: `<div class="card"><h1>没有载入成功</h1><p>${esc(e.message)}</p></div>`, path: [], leaf: null}; }
  if (my !== rt) return;
  const keep = {}; cols.querySelectorAll('.col').forEach(c => keep[c.dataset.col] = $('ul', c).scrollTop);
  const samePane = cols.dataset.leaf === JSON.stringify(r.leaf) + location.hash;
  cols.innerHTML = r.C.join('') + `<main class="pane" id="pane" tabindex="-1">${r.pane}</main>`;
  cols.dataset.leaf = JSON.stringify(r.leaf) + location.hash;
  cols.querySelectorAll('.col').forEach(c => { const ul = $('ul', c); ul.scrollTop = keep[c.dataset.col] || 0; const on = $('a.on', c); if (on) { const a = on.getBoundingClientRect(), u = ul.getBoundingClientRect(); if (a.top < u.top || a.bottom > u.bottom) on.scrollIntoView({block: 'center'}); } });
  const last = [...cols.querySelectorAll('.col')].filter(c => $('a.on', c)).pop(); cols.querySelectorAll('.col').forEach(c => c.classList.toggle('deep', c === last));
  document.body.classList.toggle('leaf', !!r.leaf);
  cols.scrollLeft = cols.scrollWidth;
  document.querySelectorAll('#modes a').forEach(a => a.classList.toggle('on', a.dataset.m === r.mode));
  pathEl.innerHTML = (r.path.length > 1 ? `<a class="back" href="${r.path[r.path.length - 2][0]}">‹ 返回</a>` : '') + r.path.map(([h, n], i) => i === r.path.length - 1 ? `<b>${esc(n)}</b>` : `<a href="${h}">${esc(n)}</a>`).join('<i>›</i>');
  document.title = (r.path.length ? r.path[r.path.length - 1][1] + ' · ' : '') + 'AI脉络';
  if (!samePane) $('#pane').scrollTop = 0;
}
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); q.focus(); return; }
  if (!/^Arrow/.test(e.key)) return;
  const cs = [...cols.querySelectorAll('.col')], k = cs.findIndex(c => c.classList.contains('deep')), c = cs[k < 0 ? 0 : k];
  if (!c) return; e.preventDefault();
  const as = [...c.querySelectorAll('a')], i = as.findIndex(a => a.classList.contains('on'));
  let to;
  if (e.key === 'ArrowDown') to = as[Math.min(as.length - 1, i + 1)];
  if (e.key === 'ArrowUp') to = as[Math.max(0, i - 1)];
  if (e.key === 'ArrowRight') to = k < 0 ? as[0] : cs[k + 1] && $('a', cs[k + 1]);
  if (e.key === 'ArrowLeft') to = k > 0 ? $('a.on', cs[k - 1]) : null;
  if (to) location.hash = to.getAttribute('href');
});
drawTier(); addEventListener('hashchange', route); route();
})();
