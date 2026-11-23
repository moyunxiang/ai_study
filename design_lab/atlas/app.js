/* 年轮：整个网站是一张可以拖动、缩放的图。圆心是1943年，越往外越新（每一圈是一年，节点多的年份圈更宽）；
   十六条分支各占一个扇区，扇区里每条主题线是一根从里往外长的细线。讲解从右边滑出来，图一直在。
   路线、分支、年代、概念、我的，都是往这张图上“打光”：相关的点亮着，其余变淡。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc, fmt, inline, rich} = L, $ = (s, el = document) => el.querySelector(s);
const root = $('#root'), TAU = Math.PI * 2;
root.innerHTML = `<canvas id="cv" aria-label="AI研究年轮图"></canvas>
  <div class="hud tl"><div class="bar"><a class="brand" href="#/">AI脉络</a><div class="find"><input id="q" type="search" placeholder="在图上找：节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div></div>
    <nav class="tabs" id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav>
    <div class="panel" id="panel"></div></div>
  <div class="hud bl"><button id="zin" aria-label="放大">＋</button><button id="zout" aria-label="缩小">－</button><button id="fit">全图</button><span class="legend"><i class="d1"></i>主干<i class="d2"></i>重要<i class="d3"></i>延伸</span></div>
  <aside class="sheet" id="sheet" hidden><a class="x" id="shut" href="#/" aria-label="关闭讲解">×</a><div id="sbody"></div></aside>
  <div class="tip" id="tip" hidden></div>`;
const cv = $('#cv'), ctx = cv.getContext('2d'), panel = $('#panel'), sheet = $('#sheet'), sbody = $('#sbody'), tip = $('#tip');
L.bindState(root, () => req());

/* ——— 布局：时间→半径，分支→角度 ——— */
const R0 = 170, R1 = 2600, sc = L.scale(1943, 2027, .75, .5), rad = t => R0 + (R1 - R0) * sc(t);
const tOf = d => +d.slice(0, 4) + (d.length > 4 ? (+d.slice(5, 7) - .5) / 12 : .5);
{ const GG = .05, GT = .012, w = t => Math.pow(t.count, .78), tot = D.tracks.reduce((s, t) => s + w(t), 0), avail = TAU - D.groups.length * GG - (D.tracks.length - D.groups.length) * GT;
  let a = -Math.PI / 2 + GG / 2;
  for (const g of D.groups) { g.a0 = a;
    for (const k of g.tracks) { const t = D.trackBy[k]; t.a0 = a; t.a1 = a + avail * w(t) / tot; t.mid = (t.a0 + t.a1) / 2;
      const ths = D.threads[k], tw = x => Math.pow(Math.max(x.ids.length, 4), .8), sum = ths.reduce((s, x) => s + tw(x), 0), pad = (t.a1 - t.a0) * .03; let b = t.a0 + pad;
      for (const th of ths) { th.a0 = b; th.a1 = b + (t.a1 - t.a0 - 2 * pad) * tw(th) / sum; th.mid = (th.a0 + th.a1) / 2; b = th.a1;
        const byY = {}; th.ids.forEach(i => (byY[D.byId[i].y] ||= []).push(D.byId[i]));
        for (const y in byY) { const ls = byY[y].sort((p, q) => p.t - q.t), m = ls.length; ls.forEach((n, j) => { const f = m === 1 ? .5 : (j + .5) / m; n.a = th.a0 + (th.a1 - th.a0) * (.1 + .8 * f); n.r = rad(Math.max(1943, n.t)); n.px = Math.cos(n.a) * n.r; n.py = Math.sin(n.a) * n.r; }); }
        th.r0 = rad(Math.max(1943, tOf(th.first))); th.r1 = rad(tOf(th.last)); }
      a = t.a1 + GT; }
    g.a1 = a - GT; g.mid = (g.a0 + g.a1) / 2; a = g.a1 + GG; } }
const order = [...D.nodes].sort((a, b) => b.tier - a.tier);      // 画的顺序：延伸在下，主干在上
const neigh = id => new Set([id, ...D.inn[id].map(e => e.from), ...D.out[id].map(e => e.to)]);

/* ——— 视图 ——— */
let W = 0, H = 0, dpr = 1, view = {z: .1, x: 0, y: 0}, fitZ = .1, raf = 0, fly = null;
let st = {panel: 'home', key: null, sub: null, sel: null, concept: null, focus: null, path: null, ring: null, note: null};
const desk = () => innerWidth >= 860, sheetW = () => sheet.hidden ? 0 : desk() ? sheet.offsetWidth : 0, sheetH = () => sheet.hidden || desk() ? 0 : sheet.offsetHeight;
const leftW = () => desk() ? 340 : 0;
function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; fitZ = Math.min(W - sheetW(), H - sheetH()) / (2 * (R1 + 260)); req(); }
function target(ids, maxRel = 7) {
  const vw = W - sheetW() - leftW(), vh = H - sheetH(), cx = leftW() + vw / 2, cy = vh / 2;
  if (!ids || !ids.length) { const z = Math.min(vw, vh) / (2 * (R1 + 200)); return {z, x: cx, y: cy}; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const i of ids) { const n = D.byId[i]; if (!n) continue; x0 = Math.min(x0, n.px); x1 = Math.max(x1, n.px); y0 = Math.min(y0, n.py); y1 = Math.max(y1, n.py); }
  const z = Math.min(fitZ * maxRel, (vw - 150) / Math.max(60, x1 - x0), (vh - 150) / Math.max(60, y1 - y0));
  return {z, x: cx - (x0 + x1) / 2 * z, y: cy - (y0 + y1) / 2 * z};
}
function go(t, ms = 520) { const a = {...view}, t0 = performance.now(); fly = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3); view.z = Math.exp(Math.log(a.z) + (Math.log(t.z) - Math.log(a.z)) * e); const u = (view.z - a.z) / (t.z - a.z || 1), f = Math.abs(t.z - a.z) < 1e-9 ? e : u; view.x = a.x + (t.x - a.x) * f; view.y = a.y + (t.y - a.y) * f; if (k >= 1) fly = null; }; req(); }
const req = () => { raf ||= requestAnimationFrame(() => { raf = 0; if (fly) { fly(); req(); } draw(); }); };
function zoomAt(sx, sy, f) { fly = null; const nz = Math.max(fitZ * .7, Math.min(fitZ * 22, view.z * f)); view.x = sx - (sx - view.x) * nz / view.z; view.y = sy - (sy - view.y) * nz / view.z; view.z = nz; req(); }

/* ——— 画 ——— */
const INK = '#23201B', PAPER = '#F4F0E7', LINE = 'rgba(70,56,30,', ACC = '#C2412A';
const lw = {}; function labelW(n, font) { const k = n.id + font; if (lw[k] == null) { ctx.font = font; lw[k] = ctx.measureText(n.title).width; } return lw[k]; }
function draw() {
  const z = view.z, zr = z / fitZ, X = v => v * z + view.x, Y = v => v * z + view.y;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(z, z);
  const fk = st.focusTrack;
  for (const t of D.tracks) { ctx.beginPath(); ctx.arc(0, 0, R1 + 46, t.a0, t.a1); ctx.arc(0, 0, R0, t.a1, t.a0, true); ctx.closePath(); ctx.fillStyle = L.hsl(t.key, 46, fk && fk !== t.key ? 95 : t.i % 2 ? 90.5 : 92.5, fk && fk !== t.key ? .5 : 1); ctx.fill(); }
  if (st.ring) { ctx.beginPath(); ctx.arc(0, 0, rad(st.ring[1] + 1), 0, TAU); ctx.arc(0, 0, rad(st.ring[0]), TAU, 0, true); ctx.fillStyle = 'rgba(194,65,42,.10)'; ctx.fill('evenodd'); }
  ctx.lineWidth = 1 / z;
  if (zr > 2.6) { ctx.strokeStyle = LINE + '.10)'; for (let y = 1944; y <= 2026; y++) { ctx.beginPath(); ctx.arc(0, 0, rad(y), 0, TAU); ctx.stroke(); } }
  ctx.strokeStyle = LINE + '.34)'; for (const e of D.eras) { ctx.beginPath(); ctx.arc(0, 0, rad(e.from), 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, rad(2027), 0, TAU); ctx.stroke();
  for (const t of D.tracks) for (const th of D.threads[t.key]) {      // 主题线：从它第一个节点长到最后一个节点
    ctx.beginPath(); ctx.moveTo(Math.cos(th.mid) * th.r0, Math.sin(th.mid) * th.r0); ctx.lineTo(Math.cos(th.mid) * th.r1, Math.sin(th.mid) * th.r1);
    ctx.strokeStyle = L.hsl(t.key, 48, 52, fk && fk !== t.key ? .12 : st.focus ? .28 : .5); ctx.lineWidth = 1.1 / z; ctx.stroke(); }
  for (const t of D.tracks) { const f = D.forks[t.key], n = f && f.at && D.byId[f.at]; if (!n || n.a == null) continue;      // 分支从哪个节点分出来：沿那一年的圈画一段弧
    const to = D.threads[t.key][0].mid, cw = ((to - n.a) % TAU + TAU) % TAU < Math.PI; ctx.beginPath(); ctx.arc(0, 0, n.r, n.a, to, !cw); ctx.strokeStyle = L.hsl(t.key, 55, 45, .55); ctx.lineWidth = 1.6 / z; ctx.setLineDash([6 / z, 5 / z]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();

  /* 年份：沿正上方那条缝写 */
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
  const yl = zr > 2.6 ? Array.from({length: 84}, (_, i) => 1943 + i) : D.eras.map(e => e.from); let lastY = 1e9;
  const lt = fk || (st.sel && D.byId[st.sel].track), la = lt ? D.trackBy[lt].a0 - .006 : -Math.PI / 2; let lastX = 1e9;
  for (const y of yl) { const sy = Y(Math.sin(la) * rad(y)), sx = X(Math.cos(la) * rad(y)); if (sx < -20 || sx > W + 20 || sy < -10 || sy > H + 10 || Math.hypot(lastY - sy, lastX - sx) < 22) continue; lastY = sy; lastX = sx; ctx.fillStyle = PAPER; ctx.fillRect(sx - 17, sy - 7, 34, 14); ctx.fillStyle = 'rgba(70,56,30,.85)'; ctx.fillText(y, sx, sy); }
  if (z * R0 > 46) { ctx.fillStyle = INK; ctx.font = `700 ${Math.min(30, z * R0 * .36)}px "Songti SC","Noto Serif CJK SC",Georgia,serif`; ctx.fillText('1943', X(0), Y(0) + 1); }

  /* 扇区名字：写在最外圈之外 */
  const rim = (R1 + 90) * z;
  for (const t of D.tracks) { const sx = view.x + Math.cos(t.mid) * rim, sy = view.y + Math.sin(t.mid) * rim; if (sx < -200 || sx > W + 200 || sy < -30 || sy > H + 30) continue;
    ctx.textAlign = Math.cos(t.mid) > .25 ? 'left' : Math.cos(t.mid) < -.25 ? 'right' : 'center'; ctx.font = `700 ${zr < 1.3 ? 12 : 14}px -apple-system,"PingFang SC",sans-serif`; ctx.fillStyle = L.hsl(t.key, 62, 30, fk && fk !== t.key ? .35 : 1); ctx.fillText(zr < 1.3 ? t.short : t.name, sx, sy); }

  /* 选中节点的前驱和后续：弯向圆心的线 */
  const curve = (a, b, col, w) => { const mx = (a.px + b.px) / 2 * .72, my = (a.py + b.py) / 2 * .72; ctx.beginPath(); ctx.moveTo(X(a.px), Y(a.py)); ctx.quadraticCurveTo(X(mx), Y(my), X(b.px), Y(b.py)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  if (st.sel) { const s = D.byId[st.sel], top = (es, k) => es.map(e => D.byId[e[k]]).sort((a, b) => a.tier - b.tier || Math.abs(a.t - s.t) - Math.abs(b.t - s.t)).slice(0, 26);      // 关系多的节点只画最重要的26条，其余的点仍然亮着
    for (const o of top(D.inn[st.sel], 'from')) curve(o, s, 'rgba(35,32,27,.36)', 1.1); for (const o of top(D.out[st.sel], 'to')) curve(s, o, 'rgba(194,65,42,.4)', 1.1); }
  if (st.path) for (let k = 1; k < st.path.length; k++) curve(D.byId[st.path[k - 1]], D.byId[st.path[k]], 'rgba(194,65,42,.85)', 2.2);

  /* 节点和名字 */
  const g = Math.sqrt(Math.max(1, Math.min(zr, 9))), RAD = [0, 4.4 * g, 2.5 * g, 1.25 * g], F = st.focus, cand = [];
  for (const n of order) { const sx = X(n.px), sy = Y(n.py); if (sx < -260 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    const on = !F || F.has(n.id), r = RAD[n.tier] * (n.id === st.sel ? 1.7 : 1);
    ctx.globalAlpha = on ? 1 : .16; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
    ctx.fillStyle = n.tier === 1 ? L.hsl(n.track, 68, 34) : n.tier === 2 ? L.hsl(n.track, 58, 46) : L.hsl(n.track, 42, 60); ctx.fill();
    if (n.tier === 1 || n.id === st.sel) { ctx.lineWidth = 1.6; ctx.strokeStyle = PAPER; ctx.stroke(); }
    if (L.status(n.id) === 2 && r > 2.4) { ctx.beginPath(); ctx.arc(sx, sy, r * .42, 0, TAU); ctx.fillStyle = PAPER; ctx.fill(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, TAU); ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.stroke(); }
    n.sx = sx; n.sy = sy; n.sr = r; n.vis = on && (n.tier < 3 || zr > 1.5 || !!F);
    const pr = n.id === st.sel ? 0 : st.path && st.path.includes(n.id) ? 1 : F && on && F.size <= 400 ? 1 + n.tier : n.tier === 1 ? 2 : n.tier === 2 && zr > 2.1 ? 6 : n.tier === 3 && zr > 4.6 ? 8 : 99;
    if (on && pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  const rows = {}, hit = (x0, x1, row) => { for (let k = row - 1; k <= row + 1; k++) for (const [a, b] of rows[k] || []) if (x0 < b && x1 > a) return true; return false; };
  for (const [pr, n] of cand.sort((a, b) => a[0] - b[0] || a[1].t - b[1].t)) {
    const font = `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 13 : n.tier === 2 ? 12 : 11}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`, w = labelW(n, font), x0 = n.sx + n.sr + 5, row = Math.round(n.sy / 9);
    if (hit(x0 - 3, x0 + w + 6, row)) continue; (rows[row] ||= []).push([x0 - 3, x0 + w + 6]);
    ctx.font = font; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = PAPER; ctx.strokeText(n.title, x0, n.sy); ctx.fillStyle = n.tier === 3 ? '#5A544A' : INK; ctx.fillText(n.title, x0, n.sy); }
  if (st.path) st.path.forEach((i, k) => { const n = D.byId[i]; ctx.beginPath(); ctx.arc(n.sx - 0, n.sy, 10, 0, TAU); ctx.fillStyle = ACC; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(k + 1, n.sx, n.sy + .5); });
}

/* ——— 手势 ——— */
const ptrs = new Map(); let moved = 0, pinch = null;
const nodeAt = (x, y) => { let best = null, bd = 15 * 15; for (const n of D.nodes) { if (!n.vis || n.sx == null) continue; const d = (n.sx - x) ** 2 + (n.sy - y) ** 2; if (d < bd + n.sr * n.sr && d < (best ? best.d : 1e9)) best = {n, d: d - (3 - n.tier) * 30}; } return best && best.n; };
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; fly = null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { const n = nodeAt(e.clientX, e.clientY); cv.style.cursor = n ? 'pointer' : 'grab'; tip.hidden = !n; if (n) { tip.innerHTML = `<b>${esc(n.title)}</b><span>${fmt(n.date)} · ${esc(D.trackBy[n.track].name)} · ${L.TIER[n.tier]}</span>`; tip.style.left = Math.min(W - 250, e.clientX + 14) + 'px'; tip.style.top = e.clientY + 16 + 'px'; } return; }
  if (ptrs.size === 1) { view.x += e.clientX - p[0]; view.y += e.clientY - p[1]; moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; moved = 99; }
  req();
});
const up = e => { const was = ptrs.size; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (was === 1 && moved < 6 && e.type === 'pointerup') { const n = nodeAt(e.clientX, e.clientY); if (n) location.hash = '#/n/' + enc(n.id); } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0016))); }, {passive: false});
$('#zin').onclick = () => zoomAt(leftW() + (W - leftW() - sheetW()) / 2, (H - sheetH()) / 2, 1.6); $('#zout').onclick = () => zoomAt(leftW() + (W - leftW() - sheetW()) / 2, (H - sheetH()) / 2, 1 / 1.6); $('#fit').onclick = () => go(target());

/* ——— 左边的面板 ——— */
const li = (href, main, opt = {}) => `<li><a href="${href}" class="${opt.on ? 'on' : ''}${opt.t ? ' hue' : ''}"${opt.t ? ` style="${L.hv(opt.t)}"` : ''}>${opt.no ? `<i class="no">${opt.no}</i>` : opt.t ? '<i class="dot"></i>' : ''}<span>${main}${opt.sub ? `<small>${opt.sub}</small>` : ''}</span>${opt.r != null ? `<em>${opt.r}</em>` : ''}</a></li>`;
const back = (href, txt) => `<a class="back" href="${href}">‹ ${txt}</a>`;
async function drawPanel() {
  const {panel: p, key, sub} = st; let h = '';
  st.focus = null; st.path = null; st.ring = null; st.focusTrack = null; let fitTo = null;
  if (p === 'home') h = `<div class="hello"><h1>AI研究的年轮</h1><p>圆心是1943年，越往外越新；每个扇区是一条分支，扇区里的细线是主题线。点越大越重要。</p><p>拖动、滚轮缩放，点任何一个点，讲解从右边出来。</p><p class="acts"><a class="go" href="#/s/intro">沿入门路线走一遍</a><a href="#/n/transformer">看Transformer</a></p></div>`;
  else if (p === 's' && !key) h = `<h6>路线与专题</h6><ul>${L.routeList().map(r => li('#/s/' + r.key, esc(r.title), {r: r.n + '站'})).join('')}</ul>`;
  else if (p === 's') { const r = await L.route(key); if (r) { st.path = r.steps.map(s => s.node).filter(i => D.byId[i]); st.focus = new Set(st.path); st.route = r; fitTo = st.path;
    h = back('#/s', '全部路线') + `<h2>${esc(r.title)}</h2><p class="lead">${esc(r.question)}</p><ol>${r.steps.map((s, i) => D.byId[s.node] ? li('#/n/' + enc(s.node), esc(D.byId[s.node].title), {no: i + 1, sub: esc(s.h), on: s.node === st.sel, r: D.byId[s.node].y}) : '').join('')}</ol><details><summary>这条路线讲什么</summary><div class="a-body">${rich(r.intro)}</div></details>`; } }
  else if (p === 't' && !key) h = `<h6>六个大方向，十六条分支</h6>${D.groups.map(g => `<p class="gh">${esc(g.name)}</p><ul>${g.tracks.map(k => li('#/t/' + k, esc(D.trackBy[k].name), {t: k, r: D.trackBy[k].count})).join('')}</ul>`).join('')}`;
  else if (p === 't') { const t = D.trackBy[key], th = t && sub && D.thBy[key][sub]; if (t) { st.focusTrack = key; st.focus = new Set(th ? th.ids : D.order[key]); fitTo = [...st.focus];
    h = back(th ? '#/t/' + key : '#/t', th ? t.name : '全部分支') + `<h2 class="hue" style="${L.hv(key)}">${esc(th ? th.name : t.name)}</h2><p class="lead">${esc(th ? th.blurb : t.question)}</p>${th ? `<ul>${th.ids.map(i => D.byId[i]).filter(n => n.tier <= 2).map(n => li('#/n/' + enc(n.id), esc(n.title), {t: n.track, r: n.y, on: n.id === st.sel})).join('')}</ul><p class="fine">列出的是主干和重要节点，共${th.ids.length}个节点都亮在图上。</p>`
      : `<p class="fine">${esc((D.forks[key] || {}).why || '')}</p><h6>主题线</h6><ul>${D.threads[key].map(x => li(`#/t/${key}/${x.key}`, esc(x.name), {r: x.ids.length, sub: `${x.first.slice(0, 4)}–${x.last.slice(0, 4)}`})).join('')}</ul>`}`; } }
  else if (p === 'e' && !key) h = `<h6>九个年代</h6><ul>${D.eras.map(e => li('#/e/' + e.id, esc(e.name), {r: `${e.from}–${String(e.to).slice(2)}`})).join('')}</ul>`;
  else if (p === 'e') { const e = D.eras.find(x => x.id === key); if (e) { st.ring = [e.from, e.to]; const ns = D.nodes.filter(n => n.y >= (e === D.eras[0] ? 0 : e.from) && n.y <= e.to); st.focus = new Set(ns.map(n => n.id));
    h = back('#/e', '全部年代') + `<h2>${esc(e.name)}</h2><p class="k">${e.from}–${e.to} · ${ns.length}个节点</p><p class="lead">${esc(e.tagline)}</p><p>${esc(e.context)}</p><h6>主干节点</h6><ul>${ns.filter(n => n.tier === 1).sort((a, b) => a.t - b.t).map(n => li('#/n/' + enc(n.id), esc(n.title), {t: n.track, r: n.y, on: n.id === st.sel})).join('')}</ul>`; } }
  else if (p === 'idx' && !key) h = `<h6>概念，按领域</h6><ul>${Object.entries(L.AREA).map(([k, n]) => li('#/idx/' + k, esc(n), {r: Object.values(D.concepts).filter(c => c.area === k).length})).join('')}</ul>`;
  else if (p === 'idx') h = back('#/idx', '全部领域') + `<h2>${esc(L.AREA[key] || '')}</h2><ul>${Object.values(D.concepts).filter(c => c.area === key).sort((a, b) => a.level - b.level || b.n - a.n).map(c => li('#/c/' + c.key, esc(c.name), {r: c.n, sub: L.LEVEL[c.level], on: c.key === st.concept})).join('')}</ul>`;
  else if (p === 'me') { const pg = L.progress(), mk = L.marks(), ls = {doing: ['在读', Object.keys(pg).filter(i => pg[i] === 1)], fav: ['收藏', Object.keys(mk)], read: ['已读', Object.keys(pg).filter(i => pg[i] === 2)]}, cur = ls[key];
    if (cur) { const ids = cur[1].filter(i => D.byId[i]); st.focus = new Set(ids); h = back('#/me', '我的') + `<h2>${cur[0]}</h2><ul>${ids.map(i => li('#/n/' + enc(i), esc(D.byId[i].title), {t: D.byId[i].track, r: D.byId[i].y})).join('') || '<li class="none">还没有</li>'}</ul>`; }
    else h = `<h6>我的进度</h6><ul>${Object.entries(ls).map(([k, [n, ids]]) => li('#/me/' + k, n, {r: ids.filter(i => D.byId[i]).length})).join('')}</ul><p class="fine">读完的点在图上是空心的。记录只存在这个浏览器里。</p>`; }
  else if (p === 'q') { const res = (await L.search(key, 40)).filter(x => x.k !== 't'); st.focus = new Set(res.filter(x => x.k === 'n').map(x => x.id));
    h = `<h6>“${esc(key)}” · ${res.length}条</h6><ul>${res.map(x => x.k === 'n' ? li('#/n/' + enc(x.id), esc(x.t), {t: x.track, r: x.date.slice(0, 4)}) : li(L.hitHref(x), esc(x.t), {sub: L.hitKind(x)})).join('') || '<li class="none">没有找到</li>'}</ul>`; if (!st.focus.size) st.focus = null; }
  panel.innerHTML = h; panel.scrollTop = 0;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === p));
  return fitTo;
}

/* ——— 地址 ——— */
let rt = 0, lastPanel = '';
async function route() {
  const my = ++rt, {seg} = L.parseHash(), [v, a, b] = seg; let fitTo = null, flyNode = null;
  if (v === 'n' && D.byId[a]) { st.sel = a; st.concept = null; flyNode = a; }
  else if (v === 'c' && D.concepts[a]) { st.concept = a; st.sel = null; if (st.panel !== 'idx') { st.panel = 'idx'; st.key = D.concepts[a].area; } }
  else { st.sel = null; st.concept = null; st.panel = ['s', 't', 'e', 'idx', 'me', 'q'].includes(v) ? v : 'home'; st.key = a || null; st.sub = b || null; }
  const pk = [st.panel, st.key, st.sub].join('/'); fitTo = await drawPanel(); if (my !== rt) return;
  let html = '';
  if (st.sel) { const x = await L.node(st.sel); if (my !== rt) return; const n = x.n, step = st.panel === 's' && st.route && st.route.steps.find(s => s.node === st.sel);
    st.focus = neigh(st.sel); if (st.path) st.path.forEach(i => st.focus.add(i));
    html = `<article class="hue" style="${L.hv(n.track)}">${step ? `<div class="stepnote"><b>这一站：${esc(step.h)}</b>${rich(step.text)}</div>` : ''}${x.parts.article}<div class="a-rel">${x.parts.relations}</div><div class="a-body">${x.parts.tail}</div></article>`;
    $('#shut').href = st.panel === 'home' ? '#/' : '#/' + [st.panel, st.key, st.sub].filter(Boolean).map(enc).join('/'); document.title = n.title + ' · AI脉络'; }
  else if (st.concept) { const x = await L.conceptHTML(st.concept); if (my !== rt) return; st.focus = new Set(x.nodes); fitTo = x.nodes.length ? null : null; html = `<article>${x.html}</article>`; $('#shut').href = '#/idx/' + x.c.area; document.title = x.c.name + ' · AI脉络'; }
  else document.title = 'AI脉络 · 年轮';
  const was = sheet.hidden; sheet.hidden = !html; if (html) { sbody.innerHTML = html; sheet.scrollTop = 0; }
  document.body.classList.toggle('reading', !!html);
  if (was !== sheet.hidden) resize();
  if (flyNode) { const n = D.byId[flyNode], vw = W - sheetW() - leftW(), z = Math.max(view.z, fitZ * 3.4); go({z, x: leftW() + vw / 2 - n.px * z, y: (H - sheetH()) / 2 - n.py * z}); }
  else if (pk !== lastPanel || was !== sheet.hidden) go(target(fitTo, st.panel === 's' ? 5 : 7));
  lastPanel = pk; req();
}
const q = $('#q'), hits = $('#hits');
q.addEventListener('input', async () => { const v = q.value.trim(); if (!v) { hits.hidden = true; return; } const res = (await L.search(v, 12)).filter(x => x.k !== 't').slice(0, 8); if (q.value.trim() !== v) return; hits.hidden = false;
  hits.innerHTML = res.map(x => `<li><a href="${L.hitHref(x)}"><em>${x.k === 'n' ? x.date.slice(0, 4) : L.hitKind(x)}</em><b>${esc(x.t)}</b></a></li>`).join('') + `<li><a class="all" href="#/q/${enc(v)}">把全部结果点亮在图上 ↵</a></li>`; });
q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) { location.hash = '#/q/' + enc(q.value.trim()); hits.hidden = true; q.blur(); } if (e.key === 'Escape') { hits.hidden = true; q.blur(); } });
document.addEventListener('click', e => { if (!e.target.closest('.find') || e.target.closest('a')) hits.hidden = true; });
document.addEventListener('keydown', e => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.key === '/') { e.preventDefault(); q.focus(); } if (e.key === 'Escape' && !sheet.hidden) location.hash = $('#shut').getAttribute('href'); });
addEventListener('resize', resize); addEventListener('hashchange', route);
resize(); Object.assign(view, target()); route();
})();
