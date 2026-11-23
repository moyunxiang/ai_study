/* 气泡：按归属把节点一层层包起来。最外面是六个大方向，里面是十六条分支，再里面是主题线，最里面每个圆点是一个节点。
   同一条主题线里，最早的节点在圆心，越新的越靠外，像一朵向日葵往外长。点一个圈就放大进去；没有时间轴。明暗跟随系统。 */
(async () => {
const L = Lab, D = await L.boot(), {esc} = L, $ = s => document.querySelector(s), root = $('#root'), PI = Math.PI, TAU = PI * 2;
root.innerHTML = `<canvas id="cv" aria-label="AI研究的气泡图"></canvas>
  <nav class="crumb" id="crumb" aria-label="当前位置"></nav>
  <aside class="panel" id="panel"></aside>
  <div class="dock"><a class="brand" href="#/">AI脉络</a><div id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</div>
    <div class="find"><input id="q" type="search" placeholder="搜索…" autocomplete="off"><ul id="hits" hidden></ul></div>
    <div class="zoom"><button id="zout" aria-label="缩小">－</button><button id="zin" aria-label="放大">＋</button></div></div>
  <aside class="sheet" id="sheet" hidden><a class="x" id="shut" href="#/" aria-label="关闭讲解">×</a><div id="sbody"></div></aside>
  <div class="tip" id="tip" hidden></div>`;
const panel = $('#panel'), sheet = $('#sheet'), sbody = $('#sbody'), st = {panel: 'home'};
L.bindState(root, () => S.req()); L.finder($('#q'), $('#hits'));

/* ——— 布局：节点在主题线里排成向日葵（按时间从里到外），圆和圆之间用“贴着两个已放好的圆”的办法一个个塞紧 ——— */
const RN = [0, 9, 6.2, 3.8], GA = PI * (3 - Math.sqrt(5)), wrap = (o, r, kids) => ({o, r, x: 0, y: 0, kids});
function encl(cs) {      // 外接圆：从重心出发，每次往最远的那个圆挪一小步；最后把圆心移到原点，返回半径
  let cx = 0, cy = 0, R = 0; for (const c of cs) { cx += c.x / cs.length; cy += c.y / cs.length; }
  for (let k = 0; k < 90; k++) { let far = cs[0], fd = -1; for (const c of cs) { const d = Math.hypot(c.x - cx, c.y - cy) + c.r; if (d > fd) { fd = d; far = c; } }
    const d = Math.hypot(far.x - cx, far.y - cy) || 1e-6, tx = far.x + (far.x - cx) / d * far.r, ty = far.y + (far.y - cy) / d * far.r; cx += (tx - cx) / (k + 2); cy += (ty - cy) / (k + 2); }
  for (const c of cs) { c.x -= cx; c.y -= cy; R = Math.max(R, Math.hypot(c.x, c.y) + c.r); } return R;
}
function flower(ns) {
  let acc = 0; ns.forEach((c, i) => { const a = 4.3 * c.r * c.r, rho = Math.sqrt((acc + a / 2) / PI); c.x = rho * Math.cos(i * GA); c.y = rho * Math.sin(i * GA); acc += a; });
  for (let k = 0; k < 140; k++) for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, need = a.r + b.r + 2.2;
    if (d < need) { const p = (need - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; } }
  return encl(ns);
}
function pack(cs, gap) {
  const put = []; for (const c of [...cs].sort((a, b) => b.r - a.r)) {
    if (put.length === 1) c.x = put[0].r + c.r + gap;
    else if (put.length > 1) { let best = null;
      for (let i = 0; i < put.length; i++) for (let j = i + 1; j < put.length; j++) { const p = put[i], q = put[j], d = Math.hypot(q.x - p.x, q.y - p.y), r1 = p.r + c.r + gap, r2 = q.r + c.r + gap; if (d > r1 + r2 || d < 1e-6) continue;
        const u = (d * d + r1 * r1 - r2 * r2) / (2 * d), h2 = r1 * r1 - u * u; if (h2 < 0) continue; const h = Math.sqrt(h2), ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
        for (const s of [1, -1]) { const x = p.x + ux * u - uy * h * s, y = p.y + uy * u + ux * h * s, sc = x * x + y * y; if (best && sc >= best.sc) continue; if (put.every(o => Math.hypot(o.x - x, o.y - y) >= o.r + c.r + gap - 1e-6)) best = {x, y, sc}; } }
      if (best) { c.x = best.x; c.y = best.y; } else c.x = Math.max(...put.map(o => o.x + o.r)) + c.r + gap; }
    put.push(c); }
  return encl(cs);
}
const TK = {}, G = D.groups.map(g => { const ts = g.tracks.map(k => { const t = D.trackBy[k], lost = D.order[k].map(i => D.byId[i]).filter(n => !D.thBy[k][n.th]);
    const ths = [...D.threads[k].filter(th => th.ids.length).map(th => [th, th.ids.map(i => D.byId[i])]), ...(lost.length ? [[{key: '', name: '其他', track: k}, lost]] : [])].map(([th, ns]) => { const kids = ns.sort((a, b) => a.t - b.t).map(n => wrap(n, RN[n.tier])); return th.c = wrap(th, flower(kids) + 7, kids); });
    return TK[k] = wrap(t, pack(ths, 5) + 14, ths); }); return wrap(g, pack(ts, 12) + 24, ts); });
const RR = pack(G, 26);
for (const g of G) { g.ax = g.x; g.ay = g.y; for (const t of g.kids) { t.ax = g.ax + t.x; t.ay = g.ay + t.y; for (const th of t.kids) { th.ax = t.ax + th.x; th.ay = t.ay + th.y; for (const w of th.kids) { w.o.px = th.ax + w.x; w.o.py = th.ay + w.y; } } } }
const thOf = n => (D.thBy[n.track][n.th] || {}).c;

/* ——— 画 ——— */
const mq = matchMedia('(prefers-color-scheme: dark)'), FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', MONO = 'ui-monospace,"SF Mono",Menlo,monospace';
const pal = () => mq.matches
  ? {ink: '#F1F2F6', mute: '#9AA0B0', paper: '#0F1116', g: 'rgba(255,255,255,.035)', gl: 'rgba(255,255,255,.16)', t: [36, 15], tl: [45, 42], h: [38, 22], n: [78, 66], n3: [52, 47], nm: [70, 78], inn: '#8FBCFF', out: '#FFA36E', route: '#FFD15C', rtxt: '#0F1116', dim: .16}
  : {ink: '#1A1C22', mute: '#6B7080', paper: '#F5F6FA', g: 'rgba(30,40,80,.03)', gl: 'rgba(30,40,80,.16)', t: [58, 90], tl: [45, 62], h: [62, 96], n: [66, 45], n3: [48, 64], nm: [60, 30], inn: '#2B5DBE', out: '#D5531F', route: '#1A1C22', rtxt: '#fff', dim: .2};
mq.addEventListener('change', () => S.req());
const desk = () => innerWidth >= 860;
const S = L.stage($('#cv'), {bounds: [-RR, -RR, RR, RR], draw, tip: $('#tip'), max: 26, min: .8, miss, pick,
  inset: () => ({t: desk() ? 54 : 52 + panel.offsetHeight, l: desk() && panel.innerHTML ? 336 : 0, r: desk() && !sheet.hidden ? sheet.offsetWidth + 16 : 0, b: desk() || sheet.hidden ? 118 : sheet.offsetHeight})});
function draw(ctx, S) {
  const {W, H, X, Y, zr} = S, z = S.view.z, F = st.focus, m = st.m, P = pal(), ft = m && m.track, fth = m && m.thread;
  ctx.clearRect(0, 0, W, H);
  const ring = (c, fill, line, lw) => { ctx.beginPath(); ctx.arc(X(c.ax), Y(c.ay), c.r * z, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); };
  const vis = c => X(c.ax + c.r) > 0 && X(c.ax - c.r) < W && Y(c.ay + c.r) > 0 && Y(c.ay - c.r) < H;
  for (const g of G) ring(g, P.g, P.gl, 1.2);
  for (const g of G) for (const t of g.kids) { if (!vis(t)) continue; const k = t.o.key, dim = (ft && ft !== k) || (F && !ft && !st.sel);
    ring(t, L.hsl(k, P.t[0], P.t[1], dim ? .4 : 1), L.hsl(k, P.tl[0], P.tl[1], dim ? .3 : .9), ft === k ? 2.4 : 1);
    for (const th of t.kids) { if (th.r * z < 5 || !vis(th)) continue; const hot = fth && fth === th.o; ring(th, L.hsl(k, P.h[0], P.h[1], dim ? .35 : 1), hot ? P.ink : L.hsl(k, P.tl[0], P.tl[1], .4), hot ? 2 : .8); } }
  /* 关系和路线 */
  const seg = (a, b, col, w) => { ctx.beginPath(); ctx.moveTo(X(a.px), Y(a.py)); ctx.lineTo(X(b.px), Y(b.py)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  if (st.sel) { const {s, before, after} = L.nearby(st.sel, 40); ctx.globalAlpha = .75; for (const o of before) seg(o, s, P.inn, 1.2); for (const o of after) seg(s, o, P.out, 1.2); ctx.globalAlpha = 1; }
  const path = m && m.path; if (path) for (let k = 1; k < path.length; k++) seg(D.byId[path[k - 1]], D.byId[path[k]], P.route, 2.4);
  /* 节点 */
  const cand = [];
  for (const n of D.nodes) { if (n.px == null || !S.seen(n)) { n.vis = false; continue; }
    const on = !F || F.has(n.id), r = RN[n.tier] * z, inPath = path && path.includes(n.id); S.put(n, inPath ? 10 : Math.max(r, 3), on); const {sx, sy} = n;
    ctx.globalAlpha = on ? 1 : P.dim; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
    if (L.status(n.id) === 2 && r > 2) { ctx.strokeStyle = L.hsl(n.track, P.n[0], P.n[1]); ctx.lineWidth = 1.4; ctx.stroke(); } else { ctx.fillStyle = n.tier === 3 ? L.hsl(n.track, P.n3[0], P.n3[1]) : L.hsl(n.track, P.n[0], P.n[1]); ctx.fill(); }
    if (n.tier === 1) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, TAU); ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.stroke(); }
    const pr = n.id === st.sel ? 0 : inPath ? 1 : F && on && (st.sel || F.size <= 80) ? 1 + n.tier : !on ? 99 : n.tier === 1 && r > 6.5 ? 3 : n.tier === 2 && r > 8.5 ? 6 : n.tier === 3 && r > 9 ? 8 : 99;
    if (pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1;
  S.labels(cand, {halo: P.paper, haloW: 3.5, font: (n, pr) => `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 12.5 : 11.5}px ${FONT}`, ink: (n, pr) => pr < 3 || n.tier === 1 ? P.ink : P.mute});
  if (path) path.forEach((i, k) => { const n = D.byId[i]; ctx.beginPath(); ctx.arc(n.sx, n.sy, 9.5, 0, TAU); ctx.fillStyle = P.route; ctx.fill(); ctx.fillStyle = P.rtxt; ctx.font = `700 10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k + 1, n.sx, n.sy + .5); });
  /* 圈的名字：缩小时分支名写在圈中间，放大后挪到圈顶；主题线的名字在圈够大时才写 */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const name = (txt, x, y, font, ink, a = 1) => { ctx.font = font; ctx.globalAlpha = a; ctx.lineWidth = 4; ctx.strokeStyle = P.paper; ctx.strokeText(txt, x, y); ctx.fillStyle = ink; ctx.fillText(txt, x, y); ctx.globalAlpha = 1; };
  for (const g of G) for (const t of g.kids) { if (!vis(t)) continue; const k = t.o.key, rp = t.r * z, dim = ft && ft !== k;
    if (rp > 150) for (const th of t.kids) { const tr = th.r * z; if (tr < 40 || !vis(th)) continue; ctx.font = `600 11.5px ${FONT}`; if (ctx.measureText(th.o.name).width > tr * 2.6) continue; name(th.o.name, X(th.ax), Y(th.ay - th.r) + 1, `600 11.5px ${FONT}`, L.hsl(k, P.nm[0], P.nm[1]), dim ? .35 : .95); }
    if (rp > 26) name(rp > 70 ? t.o.name : t.o.short, X(t.ax), rp > 150 ? Y(t.ay - t.r) + 2 : Y(t.ay), `700 ${rp > 150 ? 15 : rp > 70 ? 14 : 12}px ${FONT}`, L.hsl(k, P.nm[0], P.nm[1]), dim ? .4 : 1); }
  if (zr < 3) for (const g of G) name(g.o.name, X(g.ax), Y(g.ay - g.r) + 1, `700 12.5px ${FONT}`, P.mute);
}
/* 点在空白处：点进所在的分支；已经在这条分支里，就点进所在的主题线；点在所有圈外面回到全图 */
function miss(x, y) { const wx = (x - S.view.x) / S.view.z, wy = (y - S.view.y) / S.view.z, inC = c => Math.hypot(wx - c.ax, wy - c.ay) < c.r;
  for (const g of G) for (const t of g.kids) if (inC(t)) { const th = t.kids.find(inC), cur = st.m && st.m.track === t.o.key && !st.sel; location.hash = th && th.o.key && cur ? `#/t/${t.o.key}/${th.o.key}` : '#/t/' + t.o.key; return; }
  if (st.panel !== 'home' || st.sel) location.hash = '#/'; }
/* 点在圆点上：圈还很小的时候（总览），当作点了它所在的圈；放大以后才是打开这个节点 */
function pick(n) { const th = thOf(n), lit = st.focus && st.focus.size < 200 && st.focus.has(n.id);
  if (th && th.r * S.view.z < 70 && !lit) { const cur = st.m && st.m.track === n.track && !st.sel; location.hash = cur && th.o.key ? `#/t/${n.track}/${th.o.key}` : '#/t/' + n.track; } else location.hash = '#/n/' + L.enc(n.id); }
const zoomTo = (c, cap = 5) => S.box(c.ax - c.r, c.ay - c.r, c.ax + c.r, c.ay + c.r, cap, 36);

/* ——— 界面 ——— */
const HOME = `<div class="hello"><h1>AI研究的气泡图</h1><p>每个圆点是一个节点，圈是它的归属：外面六个大方向，里面十六条分支，再里面是主题线。</p><p>一条主题线里，最早的节点在圆心，越新的越靠外。圈越大，里面的工作越多。</p>
  <p class="acts"><a class="go" href="#/s/intro">入门路线</a><a href="#/t/llm">点进一条分支</a><a href="#/n/transformer">Transformer</a></p><p class="fine">点一个圈放大进去，点圆点看讲解；也可以拖动和滚轮缩放。</p></div>`;
const run = L.nav(st, ({m, read, moved}) => {
  panel.innerHTML = m ? L.listHTML(m, st) : st.sel || st.concept ? '' : HOME; if (moved) panel.scrollTop = 0;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  const was = sheet.hidden; sheet.hidden = !read; if (read) { sbody.innerHTML = read.html; sheet.scrollTop = 0; $('#shut').href = st.close; }
  document.body.classList.toggle('reading', !!read);
  const n = st.sel && D.byId[st.sel], tk = n ? n.track : m && m.track, th = n ? D.thBy[n.track][n.th] : m && m.thread, t = tk && D.trackBy[tk];
  $('#crumb').innerHTML = `<a href="#/">全图</a>${t ? `<i>›</i><a href="#/t">${esc(t.g.name)}</a><i>›</i><a class="hue" style="${L.hv(tk)}" href="#/t/${tk}">${esc(t.name)}</a>` : ''}${t && th && th.key ? `<i>›</i><a href="#/t/${tk}/${th.key}">${esc(th.name)}</a>` : ''}${n ? `<i>›</i><b>${esc(n.title)}</b>` : ''}`;
  S.resize();
  if (n && thOf(n)) S.go(zoomTo(thOf(n), 6.5)); else if (moved || was !== sheet.hidden) S.go(m && m.thread && m.thread.c ? zoomTo(m.thread.c, 6.5) : m && m.track ? zoomTo(TK[m.track]) : S.target(st.focus && st.focus.size < 1500 ? [...st.focus] : null, 5));
  S.req();
});
$('#zin').onclick = () => S.zoomBy(1.6); $('#zout').onclick = () => S.zoomBy(1 / 1.6);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !/INPUT/.test(document.activeElement.tagName) && !sheet.hidden) location.hash = st.close; });
S.resize(); Object.assign(S.view, S.target()); run();
})();
