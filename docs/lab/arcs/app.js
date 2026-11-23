/* 弧线：所有节点按时间排在一条横轴上。轴的上面，每条关系是一道弧，从较早的工作跨到较晚的工作，颜色跟着较早那一头的分支；
   轴的下面，每个节点是一个点，同一段时间的点往下堆、按分支分层，所以堆的高度就是那段时间的工作量。
   图贴在页面顶部不动，目录和讲解在下面，跟着页面滚。明暗跟随系统。 */
(async () => {
const L = Lab, D = await L.boot(), {esc} = L, $ = s => document.querySelector(s), root = $('#root'), PI = Math.PI, TAU = PI * 2;
root.innerHTML = `<header class="top"><a class="brand" href="#/">AI脉络<small>弧线</small></a>
    <nav id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav>
    <div class="find"><input id="q" type="search" placeholder="搜索节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div></header>
  <div class="stagebox"><canvas id="cv" aria-label="AI研究的关系弧线图"></canvas>
    <div class="zoom"><button id="zin" aria-label="放大">＋</button><button id="zout" aria-label="缩小">－</button><button id="fit">全图</button></div>
    <div class="legend">${D.groups.map(g => g.tracks.map(k => `<a class="hue" style="${L.hv(k)}" href="#/t/${k}" data-t="${k}"><i></i>${esc(D.trackBy[k].short)}</a>`).join('')).join('<s></s>')}</div></div>
  <main class="desk" id="desk"><aside class="list" id="list"></aside><section class="read" id="read"></section></main><div class="tip" id="tip" hidden></div>`;
const list = $('#list'), read = $('#read'), desk = $('#desk'), st = {panel: 'home'};
L.bindState(root, () => S.req()); L.finder($('#q'), $('#hits'), '在图上点亮全部结果 ↵');

/* ——— 布局：时间→横坐标（按列对齐），同一列的点按分支顺序往下堆；每条关系算好一道椭圆弧 ——— */
const PITCH = 12, GAP = 70, WW = 5000, AH = 900, sc = L.scale(1943, 2027, .52), tx = t => WW * sc(t);
const rank = {}; D.groups.forEach(g => g.tracks.forEach(k => rank[k] = Object.keys(rank).length));
const cols = new Map(); for (const n of D.nodes) { const c = Math.round(tx(n.t) / PITCH); cols.has(c) ? cols.get(c).push(n) : cols.set(c, [n]); }
let deep = 0; for (const [c, a] of cols) { a.sort((p, q) => rank[p.track] - rank[q.track] || p.tier - q.tier || p.t - q.t); a.forEach((n, i) => { n.px = c * PITCH; n.py = GAP + (i + .5) * PITCH; }); deep = Math.max(deep, a.length); }
const ryOf = rx => AH * Math.pow(rx / (WW / 2), .72), mk = (a, b) => { const rx = Math.abs(a.px - b.px) / 2; return {a, b, cx: (a.px + b.px) / 2, rx, ry: ryOf(rx)}; };
const byTrack = D.tracks.map(() => []); let top = 0;
for (const e of D.edges) { const a = D.byId[e.from], b = D.byId[e.to]; if (a.px === b.px) continue; const o = mk(a, b); top = Math.max(top, o.ry); byTrack[D.trackBy[a.track].i].push(o); }
byTrack.forEach(a => a.sort((p, q) => q.rx - p.rx));
const BOT = GAP + deep * PITCH;

/* ——— 画 ——— */
const mq = matchMedia('(prefers-color-scheme: dark)'), FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', MONO = 'ui-monospace,"SF Mono",Menlo,monospace';
const pal = () => mq.matches
  ? {blend: 'source-over', a0: .12, aDim: .035, al: 62, ink: '#ECEAE4', mute: '#96928A', paper: '#0E0F12', band: 'rgba(255,255,255,.04)', s: 75, l: 62, s3: 50, l3: 48, inn: '#7FB5FF', out: '#FF9B6A', route: '#FFD15C', dim: .16}
  : {blend: 'multiply', a0: .13, aDim: .04, al: 50, ink: '#1B1B1F', mute: '#77736B', paper: '#FAF7F1', band: 'rgba(70,55,30,.05)', s: 72, l: 45, s3: 48, l3: 62, inn: '#2C5FB8', out: '#D2501E', route: '#111111', dim: .2};
mq.addEventListener('change', () => S.req());
const S = L.stage($('#cv'), {bounds: [-70, -top - 30, WW + 70, BOT + 90], draw, tip: $('#tip'), max: 26, min: .8, inset: () => ({t: 6, b: innerWidth >= 860 ? 34 : 8, l: 0, r: 0})});
function draw(ctx, S) {
  const {W, H, X, Y, zr} = S, z = S.view.z, F = st.focus, m = st.m, y0 = Y(0), P = pal(), lp = PITCH * z;
  ctx.clearRect(0, 0, W, H);
  D.eras.forEach((e, i) => { if (!(i % 2)) return; const a = X(tx(e.from)), b = X(tx(e.to + 1)); ctx.fillStyle = P.band; ctx.fillRect(a, y0, b - a, H - y0); });
  /* 弧：一条分支的弧一笔画完。有选中或点亮时，其余的弧退到很淡 */
  const arc = o => { ctx.moveTo(X(o.cx - o.rx), y0); ctx.ellipse(X(o.cx), y0, o.rx * z, o.ry * z, 0, PI, TAU); };
  const off = o => X(o.cx + o.rx) < 0 || X(o.cx - o.rx) > W || y0 < 0 || y0 - o.ry * z > H;
  ctx.globalCompositeOperation = P.blend; ctx.lineWidth = Math.min(1.5, .7 + zr * .1);
  D.tracks.forEach((t, k) => { ctx.beginPath(); for (const o of byTrack[k]) if (!off(o)) arc(o); ctx.strokeStyle = L.hsl(t.key, 78, P.al, F ? P.aDim : P.a0); ctx.stroke(); });
  if (F && !st.sel) { ctx.lineWidth = 1.2; D.tracks.forEach((t, k) => { ctx.beginPath(); for (const o of byTrack[k]) if (F.has(o.a.id) && F.has(o.b.id) && !off(o)) arc(o); ctx.strokeStyle = L.hsl(t.key, 82, P.al, .55); ctx.stroke(); }); }
  ctx.globalCompositeOperation = 'source-over';
  const one = (a, b, col, w) => { if (a.px === b.px) return; ctx.beginPath(); arc(mk(a, b)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  if (st.sel) { const s = D.byId[st.sel]; for (const e of D.inn[st.sel]) one(D.byId[e.from], s, P.inn, 1.5); for (const e of D.out[st.sel]) one(s, D.byId[e.to], P.out, 1.5); }
  const path = m && m.path; if (path) for (let k = 1; k < path.length; k++) one(D.byId[path[k - 1]], D.byId[path[k]], P.route, 2.6);

  /* 轴和年份 */
  ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(Math.max(0, X(0)), y0); ctx.lineTo(Math.min(W, X(WW)), y0); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const put = [];
  for (const step of [10, 5, 1]) for (let y = 1945; y <= 2026; y++) { if (y % step) continue; const x = X(tx(y + .5)); if (x < -20 || x > W + 20 || put.some(p => Math.abs(p - x) < 40)) continue; put.push(x);
    ctx.font = `${step === 10 ? 700 : 500} 11px ${MONO}`; ctx.fillStyle = step === 10 ? P.ink : P.mute; ctx.fillText(y, x, y0 + 4); }

  /* 点 */
  const cand = [], RN = [0, 5.4, 4.4, 3.2];
  for (const n of D.nodes) { if (!S.seen(n)) { n.vis = false; continue; }
    const on = !F || F.has(n.id), r = Math.max(1.15, RN[n.tier] * z) * (n.id === st.sel ? 1.5 : 1); S.put(n, path && path.includes(n.id) ? 10 : Math.max(r, 3), on); const {sx, sy} = n;
    ctx.globalAlpha = on ? 1 : P.dim; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
    if (L.status(n.id) === 2 && r > 2) { ctx.strokeStyle = L.hsl(n.track, P.s, P.l); ctx.lineWidth = 1.2; ctx.stroke(); } else { ctx.fillStyle = n.tier === 3 ? L.hsl(n.track, P.s3, P.l3) : L.hsl(n.track, P.s, P.l); ctx.fill(); }
    if (n.tier === 1 && r > 2.6) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, TAU); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx, sy - r - 4); ctx.lineTo(sx, y0); ctx.stroke(); }
    const pr = n.id === st.sel ? 0 : path && path.includes(n.id) ? 1 : F && on && (st.sel || F.size <= 70) ? 1 + n.tier : !on ? 99 : n.tier === 1 && lp > 8 ? 3 : n.tier === 2 && lp > 14 ? 6 : n.tier === 3 && lp > 22 ? 8 : 99;
    if (pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1;
  S.labels(cand, {halo: P.paper, haloW: 3.5, font: (n, pr) => `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 12.5 : 11.5}px ${FONT}`, ink: (n, pr) => pr < 3 || n.tier === 1 ? P.ink : P.mute});
  if (path) path.forEach((i, k) => { const n = D.byId[i]; ctx.beginPath(); ctx.arc(n.sx, n.sy, 9, 0, TAU); ctx.fillStyle = P.route; ctx.fill(); ctx.fillStyle = P.paper; ctx.font = `700 10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k + 1, n.sx, n.sy + .5); });
  /* 年代的名字贴在图的底边 */
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `600 11.5px ${FONT}`; ctx.fillStyle = P.mute;
  const ey = Math.min(H - (innerWidth >= 860 ? 30 : 6), Y(BOT + 62)); D.eras.forEach(e => { const a = Math.max(0, X(tx(e.from))), b = Math.min(W, X(tx(e.to + 1))), nm = e.name.split('：')[0]; if (b - a > ctx.measureText(nm).width + 14) ctx.fillText(nm, (a + b) / 2, ey); });
}
/* 取景：框住这些节点，上面留出它们之间最长那道弧的高度 */
const frame = ids => { const ns = (ids || []).map(i => D.byId[i]).filter(Boolean); if (!ns.length) return innerWidth < 700 ? S.box(tx(2011), -ryOf(WW * .16), WW, BOT, 9, 10) : S.target();
  let x0 = 1e9, x1 = -1e9, yb = GAP; for (const n of ns) { x0 = Math.min(x0, n.px); x1 = Math.max(x1, n.px); yb = Math.max(yb, n.py); }
  const pad = Math.max(70, (x1 - x0) * .05); return S.box(x0 - pad, -ryOf((x1 - x0) / 2 + 40) - 16, x1 + pad, yb + 50, 9, 30); };

/* ——— 界面 ——— */
const HOME = `<div class="hello"><h1>AI研究的弧线</h1><p class="lead">三千多个节点按时间排在一条横轴上。轴上面的每道弧是一条关系，从较早的工作跨到较晚的工作；轴下面的每个点是一个节点，堆得越高，那段时间的工作越多。</p>
  <p>弧的颜色跟着较早那一头所在的分支。又高又宽的弧，是隔了很多年才被接上的想法；贴着轴的密密的小弧，是同一时期你追我赶的工作。</p>
  <p class="acts"><a class="go" href="#/s/intro">从入门路线开始</a><a href="#/n/transformer">看看Transformer</a><a href="#/t">按分支看</a><a href="#/e">按年代看</a></p>
  <p class="fine">在图上拖动、滚轮缩放；点一个点看讲解。堆的高度按本站收录的节点数算，不代表论文数量或影响力。</p></div>`;
let lastSel = null;
const run = L.nav(st, ({m, read: rd, moved}) => {
  list.innerHTML = m ? L.listHTML(m, st) : HOME; desk.classList.toggle('solo', !rd); document.body.classList.toggle('reading', !!rd);
  read.innerHTML = rd ? `<a class="back" href="${st.close}">‹ 收起讲解</a>${rd.html}` : '';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  document.querySelectorAll('.legend a').forEach(a => a.classList.toggle('on', !!m && m.track === a.dataset.t));
  S.resize();
  if (moved || st.sel !== lastSel) { scrollTo(0, 0); S.go(frame(st.focus && st.focus.size < 1500 ? [...st.focus] : null)); }
  lastSel = st.sel; S.req();
});
$('#zin').onclick = () => S.zoomBy(1.6); $('#zout').onclick = () => S.zoomBy(1 / 1.6); $('#fit').onclick = () => S.go(S.target());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !/INPUT/.test(document.activeElement.tagName) && (st.sel || st.concept)) location.hash = st.close; });
S.resize(); Object.assign(S.view, frame()); run();
})();
