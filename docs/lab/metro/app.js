/* 地铁图：时间从左到右，每条主题线是一条地铁线，同一条分支的线并排走、同一个颜色；节点是站。
   线从哪里分出来，就在那一站拐个45度弯接出去。缩小看是十六条彩带，放大能看清每一条线和每一站。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc} = L, $ = s => document.querySelector(s), root = $('#root'), TAU = Math.PI * 2;
root.innerHTML = `<canvas id="cv" aria-label="AI研究线路图"></canvas>
  <header class="top"><a class="brand" href="#/"><b>AI脉络</b><span>线路图</span></a>
    <nav id="tabs">${[['t', '线路'], ['s', '行程'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav>
    <div class="find"><input id="q" type="search" placeholder="找一站：节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div></header>
  <aside class="panel" id="panel"></aside>
  <div class="zoom"><button id="zin" aria-label="放大">＋</button><button id="zout" aria-label="缩小">－</button><button id="fit">全图</button></div>
  <aside class="sheet" id="sheet" hidden><a class="x" id="shut" href="#/" aria-label="关闭讲解">×</a><div id="sbody"></div></aside>
  <div class="tip" id="tip" hidden></div>`;
const panel = $('#panel'), sheet = $('#sheet'), sbody = $('#sbody'), st = {panel: 'home'};
L.bindState(root, () => S.req()); L.finder($('#q'), $('#hits'));

/* ——— 布局：时间→横坐标，每条主题线占一条水平的道 ——— */
const sc = L.scale(1943, 2027, .6), X0 = 500, XW = 11000, tx = t => X0 + XW * sc(Math.max(1943, t)), LANE = 18;
let yy = 0;
for (const g of D.groups) { for (const k of g.tracks) { const t = D.trackBy[k]; t.y0 = yy; t.x0 = 1e9;
    for (const th of D.threads[k]) { th.y = yy; yy += LANE; th.x0 = 1e9; th.x1 = -1e9;
      const byY = {}; th.ids.forEach(i => (byY[Math.max(1943, D.byId[i].y)] ||= []).push(D.byId[i]));
      for (const y in byY) { const ls = byY[y].sort((p, q) => p.t - q.t), m = ls.length; ls.forEach((n, j) => { n.px = tx(+y + (j + .5) / m); n.py = th.y; th.x0 = Math.min(th.x0, n.px); th.x1 = Math.max(th.x1, n.px); }); } }
    t.y1 = yy - LANE; t.ym = (t.y0 + t.y1) / 2; yy += 46; }
  yy += 70; }
D.nodes.forEach(n => { if (n.px == null) { n.px = tx(n.t); n.py = D.trackBy[n.track].ym; } });
/* 每条线从哪里接出来：指定的分叉站；没有就接在母线上；分支的第一条线接在分支的分叉站上 */
for (const t of D.tracks) { const ths = D.threads[t.key].filter(x => x.ids.length), f = D.forks[t.key], fn = f && f.at && D.byId[f.at];
  for (const th of ths) { const v = th.via && D.byId[th.via], p = th.from && D.thBy[t.key][th.from]; th.anc = v ? [v.px, v.py] : p && p.ids.length ? [Math.min(p.x1, Math.max(p.x0, th.x0 - 40)), p.y] : null; }
  if (fn) { const roots = ths.filter(x => !x.anc).sort((a, b) => Math.max(0, a.x0 - fn.px) - Math.max(0, b.x0 - fn.px)); if (roots[0]) { roots[0].anc = [fn.px, fn.py]; roots[0].fork = 1; } }
  for (const th of ths) { const A = th.anc; let xs = th.x0;
    if (A) { const dy = th.y - A[1], s = Math.sign(dy), d = Math.min(Math.abs(dy), 40), xj = A[0] + d; th.con = Math.abs(dy) < 1 ? null : [[A[0], A[1]], [A[0], th.y - s * d], [xj, th.y]]; xs = Math.min(xs, Math.abs(dy) < 1 ? A[0] : xj); th.x1 = Math.max(th.x1, xj); }
    th.xs = xs; t.x0 = Math.min(t.x0, xs); } }
const joins = D.joins || (await L.load('core.json')).joins || [];
const order = [...D.nodes].sort((a, b) => b.tier - a.tier);

/* ——— 画 ——— */
const BG = '#F6F5F1', INK = '#14161A', RED = '#DC241F', YEL = '#FFD329', FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
const desk = () => innerWidth >= 860, topH = () => $('.top').offsetHeight;
const S = L.stage($('#cv'), {bounds: [0, -60, X0 + XW + 260, yy], draw, tip: $('#tip'), max: 34,
  inset: () => ({t: topH() + 28, l: desk() ? 324 : 0, r: desk() && !sheet.hidden ? sheet.offsetWidth + 12 : 0, b: desk() || sheet.hidden ? 0 : sheet.offsetHeight})});
function draw(ctx, S) {
  const {W, H, zr, X, Y} = S, z = S.view.z, F = st.focus, m = st.m, ft = m && m.track, fth = m && m.thread, T0 = topH();
  const trace = (pts, r = 9) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r); ctx.lineTo(...pts[pts.length - 1]); ctx.stroke(); };
  const scr = pts => pts.map(p => [X(p[0]), Y(p[1])]);
  const oct = (a, b) => { const dx = b.sx - a.sx, dy = b.sy - a.sy, k = Math.min(Math.abs(dx), Math.abs(dy)); return Math.abs(dx) > Math.abs(dy) ? [[a.sx, a.sy], [b.sx - Math.sign(dx) * k, a.sy], [b.sx, b.sy]] : [[a.sx, a.sy], [a.sx, b.sy - Math.sign(dy) * k], [b.sx, b.sy]]; };
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  if (m && m.era) { ctx.fillStyle = 'rgba(255,211,41,.2)'; ctx.fillRect(X(tx(m.era[0])), 0, X(tx(m.era[1] + 1)) - X(tx(m.era[0])), H); }
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,22,26,.09)'; for (const e of D.eras) { const x = Math.round(X(tx(e.from))) + .5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  /* 线 */
  const lw = Math.max(1.5, Math.min(6, 5 * z)); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const t of D.tracks) for (const th of D.threads[t.key]) { if (!th.ids.length) continue;
    const mine = (!ft || ft === t.key) && (!fth || fth === th), a = !mine ? .13 : F && !ft ? .32 : 1, y = Y(th.y); if (y < -200 && !th.con || y > H + 200 && !th.con) continue;
    ctx.strokeStyle = L.hsl(t.key, 72, 44, a); ctx.lineWidth = lw;
    if (th.con) { if (th.fork && a === 1) { ctx.strokeStyle = BG; ctx.lineWidth = lw + 3; trace(scr(th.con), 9 * Math.min(1.5, Math.max(.3, z * 3))); ctx.strokeStyle = L.hsl(t.key, 72, 44, a); ctx.lineWidth = lw; } trace(scr(th.con), 9 * Math.min(1.5, Math.max(.3, z * 3))); }
    ctx.beginPath(); ctx.moveTo(X(th.xs), y); ctx.lineTo(X(th.x1), y); ctx.stroke();
    if (lw > 3) { ctx.beginPath(); ctx.moveTo(X(th.x1), y - lw); ctx.lineTo(X(th.x1), y + lw); ctx.stroke(); } }
  /* 跨分支的汇流：虚线换乘通道 */
  ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(20,22,26,${F ? .22 : .55})`;
  for (const j of joins) { const a = D.byId[j.from], b = D.byId[j.to]; if (!a || !b) continue; a.sx = X(a.px); a.sy = Y(a.py); b.sx = X(b.px); b.sy = Y(b.py); trace(oct(a, b), 8);
    if (zr > 3.4 && !F) { ctx.setLineDash([]); ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const p = oct(a, b)[1]; ctx.lineWidth = 3; ctx.strokeStyle = BG; ctx.strokeText(j.label, p[0] + 6, p[1] + 10); ctx.fillStyle = '#555B66'; ctx.fillText(j.label, p[0] + 6, p[1] + 10); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(20,22,26,.55)'; } }
  ctx.setLineDash([]);

  /* 站 */
  const lp = LANE * z, g = Math.min(2.1, Math.sqrt(Math.max(1, zr))), RAD = [0, 4.6 * g, 2.5 * g, 1.5 * g], cand = [], path = m && m.path;
  for (const n of order) { if (!S.seen(n)) { n.vis = false; continue; }
    const on = !F || F.has(n.id), show = n.tier < 3 || lp > 8 || (F && on && F.size <= 600); S.put(n, RAD[n.tier] * (n.id === st.sel ? 1.5 : 1), on && show); if (!show) continue;
    const {sx, sy, sr: r} = n; ctx.globalAlpha = on ? 1 : .18; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
    if (n.tier === 3) { ctx.fillStyle = L.hsl(n.track, 70, 28); ctx.fill(); }
    else { ctx.fillStyle = L.status(n.id) === 2 ? L.hsl(n.track, 60, 78) : '#fff'; ctx.fill(); ctx.lineWidth = n.tier === 1 ? Math.max(2, r * .3) : 1.6; ctx.strokeStyle = n.tier === 1 ? INK : L.hsl(n.track, 72, 36); ctx.stroke(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 4.5, 0, TAU); ctx.strokeStyle = RED; ctx.lineWidth = 2.5; ctx.stroke(); }
    const pr = n.id === st.sel ? 0 : path && path.includes(n.id) ? 1 : F && on && F.size <= 400 ? 1 + n.tier : n.tier === 1 ? 2 : n.tier === 2 && lp > 9 ? 6 : n.tier === 3 && lp > 17 ? 8 : 99;
    if (on && pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1;

  /* 选中一站：它的前驱（黑）和后续（红），走横竖斜线 */
  if (st.sel) { const {s, before, after} = L.nearby(st.sel); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(20,22,26,.42)'; for (const o of before) trace(oct({sx: X(o.px), sy: Y(o.py)}, s), 6); ctx.strokeStyle = 'rgba(220,36,31,.5)'; for (const o of after) trace(oct(s, {sx: X(o.px), sy: Y(o.py)}), 6); }
  /* 行程：黑底黄芯的粗线，按顺序编号 */
  if (path) { const P = path.map(i => { const n = D.byId[i]; return {sx: X(n.px), sy: Y(n.py)}; }); for (const [c, w] of [[INK, 6.5], [YEL, 3]]) { ctx.strokeStyle = c; ctx.lineWidth = w; for (let k = 1; k < P.length; k++) trace(oct(P[k - 1], P[k]), 10); } }
  S.labels(cand, {halo: BG, dy: -9, gap: 2, font: (n, pr) => `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 13 : n.tier === 2 ? 12 : 11}px ${FONT}`, ink: n => n.tier === 3 ? '#555B66' : INK});
  if (path) path.forEach((i, k) => { const n = D.byId[i], x = X(n.px), y = Y(n.py); ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fillStyle = INK; ctx.fill(); ctx.fillStyle = YEL; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(k + 1, x, y + .5); });

  /* 主题线的名字：放大后写在每条线的起点 */
  const leftX = S.W > 859 ? 324 : 0;
  if (LANE * z > 13) { ctx.font = `600 11px ${FONT}`; ctx.textBaseline = 'middle';
    for (const t of D.tracks) { if (ft && ft !== t.key) continue; for (const th of D.threads[t.key]) { const y = Y(th.y); if (!th.ids.length || y < T0 + 30 || y > H) continue; const x = X(th.xs) - 9, stuck = x < leftX + 70; if (X(th.x1) < leftX + 80) continue;
      ctx.textAlign = stuck ? 'left' : 'right'; const tx0 = stuck ? leftX + 62 : x; ctx.lineWidth = 3.5; ctx.strokeStyle = BG; ctx.strokeText(th.name, tx0, y - (stuck ? 9 : 0)); ctx.fillStyle = L.hsl(t.key, 72, 32); ctx.fillText(th.name, tx0, y - (stuck ? 9 : 0)); } } }
  /* 线路牌：贴在每条分支的起点，滚过去之后贴在左边 */
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `700 ${zr < 1.6 ? 10.5 : 12}px ${FONT}`;
  for (const t of D.tracks) { const name = zr < 1.6 ? t.short : t.name, w = ctx.measureText(name).width + 12, h = zr < 1.6 ? 15 : 20, y = Math.max(T0 + 40, Math.min(H - 14, Y(t.ym))), x = Math.max(leftX + 8, X(t.x0) - w - 10);
    if (Y(t.y1) < T0 + 30 || Y(t.y0) > H) continue; ctx.globalAlpha = ft && ft !== t.key ? .3 : 1; ctx.fillStyle = L.hsl(t.key, 72, 40); ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(name, x + 6, y + .5); }
  ctx.globalAlpha = 1;

  /* 年份条：贴在顶栏下面 */
  ctx.fillStyle = 'rgba(246,245,241,.94)'; ctx.fillRect(0, T0, W, 28); ctx.fillStyle = INK; ctx.fillRect(0, T0 + 27, W, 1);
  ctx.textAlign = 'center'; const used = [], era = new Set(D.eras.map(e => e.from));
  for (const pass of [1, 0]) for (let y = 1943; y <= 2026; y++) { if (era.has(y) !== !!pass) continue; const x = X(tx(y)); if (x < leftX + 20 || x > W - 14 || used.some(u => Math.abs(u - x) < 40)) continue; used.push(x);
    ctx.font = `${pass ? 700 : 500} 11.5px ui-monospace,Menlo,monospace`; ctx.fillStyle = pass ? INK : '#6B7180'; ctx.fillText(y, x, T0 + 14); ctx.fillRect(Math.round(x), T0 + 23, 1, 5); }
}

/* ——— 界面 ——— */
const HOME = `<div class="hello"><h1>AI研究线路图</h1><p>时间从左往右走。每条线是一条主题线，同一条分支的线颜色相同、并排走；线上的圆点是站，黑圈大站是主干节点。</p><p>线从哪一站分出来，就在那一站拐弯接出去。虚线是跨分支的汇流。</p><p class="acts"><a class="go" href="#/s/intro">走一遍入门行程</a><a href="#/n/transformer">去Transformer站</a></p><p class="fine">拖动、滚轮缩放；放大到能看清每一站。</p></div>`;
const run = L.nav(st, ({m, read, moved}) => {
  panel.innerHTML = m ? L.listHTML(m, st) : HOME; if (moved) panel.scrollTop = 0;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  const was = sheet.hidden; sheet.hidden = !read; if (read) { sbody.innerHTML = read.html; sheet.scrollTop = 0; $('#shut').href = st.close; }
  document.body.classList.toggle('reading', !!read); if (was !== sheet.hidden) S.resize();
  if (st.sel) S.center(D.byId[st.sel], .72 / S.fitZ); else if (moved || was !== sheet.hidden) S.go(S.target(st.focus && st.focus.size < 1500 ? [...st.focus] : null, m && m.path ? 6 : 9));
  S.req();
});
$('#zin').onclick = () => S.zoomBy(1.6); $('#zout').onclick = () => S.zoomBy(1 / 1.6); $('#fit').onclick = () => S.go(S.target());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden && !/INPUT/.test(document.activeElement.tagName)) location.hash = st.close; });
S.resize(); Object.assign(S.view, S.target()); run();
})();
