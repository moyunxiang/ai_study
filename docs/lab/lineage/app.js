/* 谱系：每一屏是一张从左到右的谱系图，方框是节点（或分支、主题线），线是“谁建立在谁之上”。
   看一个节点时，它在正中，左边两代是它的来源，右边两代是它引出的工作；点任何一个方框，就以它为中心重画。
   分支页画的是主题线从哪条线分出来，首页画的是十六条分支的分叉关系，路线是一串带编号的方框。
   不用画布，方框是普通的链接，线是SVG。左边一栏是目录，图在上，讲解在图的下面。明暗跟随系统。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc} = L, $ = s => document.querySelector(s), root = $('#root'), N = i => D.byId[i];
root.innerHTML = `<aside class="side"><a class="brand" href="#/">AI脉络<small>谱系</small></a>
    <div class="find"><input id="q" type="search" placeholder="搜索节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div>
    <nav id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav><div id="list"></div></aside>
  <main class="main"><section class="band"><header class="bh" id="bh"></header><div class="gwrap" id="gwrap"><div class="graph" id="graph"></div></div></section><section class="read" id="read"></section></main>`;
const list = $('#list'), read = $('#read'), graph = $('#graph'), gwrap = $('#gwrap'), st = {panel: 'home'};
L.bindState(root); L.finder($('#q'), $('#hits'), '全部结果 ↵');

/* ——— 每种页面画哪张图：{title, lead, heads, cols:[[方框…]…], links:[[从,到,样式]…], center, fixed} ——— */
const nc = (n, x) => ({k: n.id, href: '#/n/' + enc(n.id), title: n.title, sub: `${n.y} · ${D.trackBy[n.track].short}`, t: n.track, tier: n.tier, ...x});
const tc = (t, x) => ({k: 't:' + t.key, href: '#/t/' + t.key, title: t.name, sub: `${t.g.name.split(' · ').pop()} · ${t.count}个节点`, t: t.key, tier: 1, ...x});
function ego(id) {      // 一个节点：左两代来源，右两代后续
  const s = N(id), {before, after} = L.nearby(id, 7), used = new Set([id, ...before.map(n => n.id), ...after.map(n => n.id)]);
  const far = (base, k, es) => { const sc = new Map(); for (const b of base) for (const e of es[b.id]) { const o = e[k]; if (!used.has(o)) sc.set(o, (sc.get(o) || 0) + 4 - N(o).tier); }
    const top = [...sc].sort((a, b) => b[1] - a[1] || N(a[0]).t - N(b[0]).t).slice(0, 8).map(([i]) => N(i)); top.forEach(n => used.add(n.id)); return top; };
  const cols = [far(before, 'from', D.inn), before, [s], after, far(after, 'to', D.out)], at = new Map(), links = []; cols.forEach((c, i) => c.forEach(n => at.set(n.id, i)));
  for (const [a, i] of at) for (const e of D.out[a]) if (at.get(e.to) === i + 1) links.push([a, e.to, i === 2 || i === 1 ? 'main' : '']);
  const nb = D.inn[id].length, na = D.out[id].length;
  return {title: `「${s.title}」的来龙去脉`, lead: `左边是它建立在什么之上，右边是它引出的工作。这里只画最重要的几条：前驱共${nb}条、后续共${na}条，完整的列在讲解末尾。点任何一个方框，就以它为中心重画。`,
    heads: ['更早的来源', '它建立在这些之上', '本篇', '直接引出的工作', '再往后'], cols: cols.map(c => c.map(n => nc(n, n.id === id ? {cls: 'me'} : {}))), links, center: id};
}
function dag(nodes, title, lead) {      // 一组节点：挑最重要的二十几个，按“谁在谁后面”分成几列，每个节点连到它最近的一两个前驱
  const pick = [...nodes].sort((a, b) => a.tier - b.tier || D.out[b.id].length - D.out[a.id].length).slice(0, 24).sort((a, b) => a.t - b.t), set = new Set(pick.map(n => n.id)), dep = {}, col = {}, cols = [], links = [];
  for (const n of pick) { let d = 0; for (const e of D.inn[n.id]) if (dep[e.from] != null) d = Math.max(d, dep[e.from] + 1); dep[n.id] = d; }
  const K = Math.max(1, Math.min(5, Math.ceil(pick.length / 5)));
  [...pick].sort((a, b) => dep[a.id] - dep[b.id] || a.t - b.t).forEach((n, i) => { col[n.id] = Math.floor(i * K / pick.length); (cols[col[n.id]] ||= []).push(nc(n)); });
  for (const n of pick) D.inn[n.id].filter(e => set.has(e.from) && col[e.from] < col[n.id]).sort((a, b) => col[b.from] - col[a.from] || N(b.from).t - N(a.from).t).slice(0, 2).forEach(e => links.push([e.from, n.id, col[n.id] - col[e.from] > 1 ? 'far' : '']));
  return {title, lead: (lead ? lead + ' ' : '') + (nodes.length > pick.length ? `共${nodes.length}个节点，图上是其中最重要的${pick.length}个；` : '') + '越靠右越晚出现在这条线上，线连到它最近的前驱。', cols: [...cols].map(c => c || []), links};
}
function chain(m) {      // 路线：按编号一列一列往下排
  const ns = m.path.map(N), per = Math.max(3, Math.ceil(ns.length / 4)), cols = [], links = [];
  ns.forEach((n, i) => { (cols[Math.floor(i / per)] ||= []).push(nc(n, {no: i + 1, sub: m.route.steps[i] ? m.route.steps[i].h : ''})); if (i) links.push([ns[i - 1].id, n.id, 'main']); });
  return {title: m.title, lead: `${m.lead || ''} 按编号顺序读，共${ns.length}站。`, cols, links, fixed: true};
}
function tree(key) {      // 一条分支：它从哪条分支分出来，它的主题线又是谁从谁分出来
  const t = D.trackBy[key], ths = D.threads[key].filter(x => x.ids.length), dep = x => { let d = 0, p = x; while (p && p.from && D.thBy[key][p.from] && d < 9) { p = D.thBy[key][p.from]; d++; } return d; };
  const fk = D.forks[key] || {}, pre = [], links = [], cols = [];
  if (fk.from) { pre.push([tc(D.trackBy[fk.from])]); if (N(fk.at)) { pre.push([nc(N(fk.at))]); links.push(['t:' + fk.from, fk.at, 'main'], [fk.at, 't:' + key, 'main']); } else links.push(['t:' + fk.from, 't:' + key, 'main']); }
  for (const x of [...ths].sort((a, b) => a.first < b.first ? -1 : 1)) { const d = dep(x); (cols[d] ||= []).push({k: 'th:' + x.key, href: `#/t/${key}/${x.key}`, title: x.name, sub: `${x.via && N(x.via) ? `从「${N(x.via).title}」分出 · ` : `${x.first.slice(0, 4)}–${x.last.slice(0, 4)} · `}${x.ids.length}个节点`, t: key, tier: 2});
    links.push([x.from && D.thBy[key][x.from] ? 'th:' + x.from : 't:' + key, 'th:' + x.key, '']); }
  return {title: `「${t.name}」的主题线是怎么分出来的`, lead: `${fk.why ? fk.why + ' ' : ''}每个方框是一条主题线，小字写着它是从哪个节点分出来的。点一条主题线看它里面的节点。`, cols: [...pre, [tc(t, {cls: 'me'})], ...[...cols].map(c => c || [])], links, center: 't:' + key};
}
function tracks() {      // 首页：十六条分支谁从谁分出来
  const dep = k => { let d = 0, p = k; while ((D.forks[p] || {}).from && d < 9) { p = D.forks[p].from; d++; } return d; }, cols = [[{k: 'root', href: '#/', title: 'AI研究', sub: '1943年到今天', tier: 1, cls: 'me'}]], links = [];
  for (const g of D.groups) for (const k of g.tracks) { const d = dep(k) + 1, f = D.forks[k] || {}; (cols[d] ||= []).push(tc(D.trackBy[k], f.from && N(f.at) ? {sub: `从「${N(f.at).title}」分出 · ${D.trackBy[k].count}个节点`} : {})); links.push(f.from ? ['t:' + f.from, 't:' + k, 'main'] : ['root', 't:' + k, '']); }
  return {title: '十六条分支是怎么分出来的', lead: '最左一列是从一开始就有的七条分支，往右是后来从它们身上分出去的，小字写着分叉处的那个节点。点一条分支看它里面的主题线。', cols, links};
}

/* ——— 排版：一列一列摆方框，按相邻列的连线重心给每列排序以减少交叉，再用曲线连起来 ——— */
const GY = 12, HEAD = 30;
function render(sp) {
  const cols = sp.cols.map((c, i) => ({items: c, head: (sp.heads || [])[i] || ''})).filter(c => c.items.length), pos = new Map(), nb = {};
  const mob = innerWidth < 700, n = cols.length, GX = mob ? 40 : n >= 5 ? 50 : 84, CH = 54, CW = mob ? 164 : Math.max(156, Math.min(204, Math.floor((gwrap.clientWidth - 70 - (n - 1) * GX) / n)));
  const index = () => cols.forEach((c, i) => c.items.forEach((it, j) => pos.set(it.k, [i, j, c.items.length])));
  for (const [a, b] of sp.links) { (nb[a] ||= []).push(b); (nb[b] ||= []).push(a); }
  index();
  if (!sp.fixed) for (const order of [cols.map((_, i) => i), cols.map((_, i) => i).reverse(), cols.map((_, i) => i)]) for (const i of order) {
    const c = cols[i], bc = it => { const ys = (nb[it.k] || []).map(k => pos.get(k)).filter(p => p && p[0] !== i).map(p => (p[1] + .5) / p[2]); return ys.length ? ys.reduce((a, b) => a + b) / ys.length : null; };
    c.items = c.items.map((it, j) => [bc(it) ?? (j + .5) / c.items.length, j, it]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]); index(); }
  const H = Math.max(...cols.map(c => c.items.length * (CH + GY) - GY)), W = cols.length * (CW + GX) - GX, xy = {};
  cols.forEach((c, i) => { const h = c.items.length * (CH + GY) - GY; c.items.forEach((it, j) => xy[it.k] = [i * (CW + GX), HEAD + (sp.fixed ? 0 : (H - h) / 2) + j * (CH + GY), i]); });
  let wires = '';
  for (const [a, b, cls] of sp.links) { let p = xy[a], q = xy[b]; if (!p || !q) continue; let d;
    if (p[2] === q[2]) { const up = p[1] < q[1] ? [p, q] : [q, p]; d = `M${up[0][0] + 26} ${up[0][1] + CH}L${up[1][0] + 26} ${up[1][1]}`; }
    else { if (p[2] > q[2]) [p, q] = [q, p]; const x1 = p[0] + CW, y1 = p[1] + CH / 2, x2 = q[0], y2 = q[1] + CH / 2, dx = (x2 - x1) * .5; d = `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`; }
    wires += `<path class="${cls || ''}" d="${d}" data-a="${esc(a)}" data-b="${esc(b)}"/>`; }
  graph.style.width = W + 'px'; graph.style.height = H + HEAD + 'px';
  graph.innerHTML = `<svg class="wires" width="${W}" height="${H + HEAD}" aria-hidden="true">${wires}</svg>`
    + cols.map((c, i) => c.head ? `<div class="ch" style="left:${i * (CW + GX)}px;width:${CW}px">${c.head}</div>` : '').join('')
    + cols.map(c => c.items.map(it => `<a class="cd t${it.tier || 2} ${it.cls || ''}${it.t ? ' hue' : ''}" style="left:${xy[it.k][0]}px;top:${xy[it.k][1]}px;width:${CW}px;height:${CH}px;${it.t ? L.hv(it.t) : ''}" href="${it.href}" data-k="${esc(it.k)}" title="${esc(it.title)}">${it.no ? `<i class="no">${it.no}</i>` : ''}<b>${esc(it.title)}</b><small>${esc(it.sub || '')}</small></a>`).join('')).join('');
  $('#bh').innerHTML = `<h1>${esc(sp.title)}</h1><p>${esc(sp.lead)}</p>`;
  const c = sp.center && xy[sp.center]; gwrap.scrollLeft = c ? c[0] + CW / 2 - gwrap.clientWidth / 2 : 0;
}
/* 鼠标停在一个方框上：只留它的线和它连着的方框 */
graph.addEventListener('mouseover', e => { const c = e.target.closest('.cd'); graph.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); graph.classList.toggle('hov', !!c); if (!c) return; const k = c.dataset.k; c.classList.add('hot');
  graph.querySelectorAll('path').forEach(p => { const o = p.dataset.a === k ? p.dataset.b : p.dataset.b === k ? p.dataset.a : null; if (o == null) return; p.classList.add('hot'); const x = graph.querySelector(`.cd[data-k="${CSS.escape(o)}"]`); if (x) x.classList.add('hot'); }); });
graph.addEventListener('mouseleave', () => { graph.classList.remove('hov'); graph.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); });

/* ——— 界面 ——— */
const HOME = `<div class="hello"><p class="lead">一张张从左到右的谱系图：方框是节点，线是谁建立在谁之上。</p><p>看一个节点时它在正中，左边是来源，右边是后续；点别的方框就换成以它为中心。</p>
  <p class="acts"><a class="go" href="#/s/intro">入门路线</a><a href="#/n/transformer">从Transformer看起</a><a href="#/n/alexnet">从AlexNet看起</a></p><p class="fine">图上只画最重要的关系，完整的前驱和后续在每篇讲解的末尾。</p></div>`;
let cur = null, lastKey = '';
const draw = () => cur && render(cur);
const run = L.nav(st, ({m, read: rd, moved}) => {
  list.innerHTML = m ? L.listHTML(m, st) : HOME; read.innerHTML = rd ? rd.html : ''; document.body.classList.toggle('reading', !!rd);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  cur = st.sel ? ego(st.sel) : rd && rd.nodes && rd.nodes.length ? dag(rd.nodes.map(N), `用到「${rd.title}」的节点`) : m && m.path ? chain(m)
    : m && m.thread ? dag(m.thread.ids.map(N), `主题线「${m.thread.name}」`, m.thread.blurb) : m && m.track ? tree(m.track) : m && m.focus && m.focus.size ? dag([...m.focus].map(N), m.title, m.lead) : tracks();
  draw(); const key = st.sel || st.concept || [st.panel, st.key, st.sub].join('/'); if (key !== lastKey) scrollTo(0, 0); lastKey = key;
});
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 120); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !/INPUT/.test(document.activeElement.tagName) && (st.sel || st.concept)) location.hash = st.close; });
run();
})();
