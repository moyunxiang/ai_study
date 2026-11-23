/* 大树：一棵从1943年往上长的树。越高越新；每条主题线是一根枝，从它的母枝上分出来；节点是枝上的叶子，主干节点是果子。
   根部窄、树冠宽，因为早年的线少、近年的线多。左边一栏是目录和讲解，树一直在右边。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc} = L, $ = s => document.querySelector(s), root = $('#root'), TAU = Math.PI * 2;
root.innerHTML = `<canvas id="cv" aria-label="AI研究演化树"></canvas>
  <aside class="col" id="col"><header><a class="brand" href="#/">AI脉络<small>一棵从1943年长到今天的树</small></a>
      <div class="find"><input id="q" type="search" placeholder="在树上找：节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div>
      <nav id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav></header>
    <div class="body" id="body"></div></aside>
  <div class="zoom"><button id="zin" aria-label="放大">＋</button><button id="zout" aria-label="缩小">－</button><button id="fit">整棵树</button></div>
  <div class="tip" id="tip" hidden></div>`;
const col = $('#col'), body = $('#body'), st = {panel: 'home'};
L.bindState(root, () => S.req()); L.finder($('#q'), $('#hits'));

/* ——— 布局：时间→高度，主题线→从左到右的一条道；道的间距随高度张开 ——— */
const sc = L.scale(1943, 2027, .7), HH = 5200, HW = 2700, ty = t => -HH * sc(Math.max(1943, t));
const spread = t => { const v = Math.max(0, (sc(Math.max(1943, t)) - .09) / .91); return .055 + .945 * Math.pow(Math.sin(v * Math.PI / 2), .86); };
const ths = []; { let u = 0;
  for (const g of D.groups) { for (const k of g.tracks) { const t = D.trackBy[k]; t.u0 = u; for (const th of D.threads[k]) { if (!th.ids.length) continue; const w = Math.pow(Math.max(th.ids.length, 4), .6); th.u = u + w / 2; u += w; th.ph = ths.length * 1.7; ths.push(th); } t.u1 = u; u += 3; } u += 6; }
  const U = u - 9; ths.forEach(th => th.u = th.u / U * 2 - 1); D.tracks.forEach(t => t.um = (t.u0 + t.u1) / U - 1); }
const lx = (th, t) => (th.u * HW + Math.sin(t * .55 + th.ph) * 16) * spread(t), P = (th, t) => [lx(th, t), ty(t)];
for (const th of ths) { const byY = {}; th.ids.forEach(i => (byY[Math.max(1943, D.byId[i].y)] ||= []).push(D.byId[i])); let k = 0; th.t0 = 1e9; th.t1 = 0;
  for (const y of Object.keys(byY).sort()) { const ls = byY[y].sort((p, q) => p.t - q.t), m = ls.length; ls.forEach((n, j) => { const te = +y + (j + .5) / m, side = k % 2 ? 1 : -1, off = n.tier === 1 ? 0 : 6 + (k * 7 % 3) * 3.5; k++;
    n.te = te; n.px = lx(th, te) + side * off; n.py = ty(te) - (n.tier === 1 ? 0 : 3); n.rot = side * .7; th.t0 = Math.min(th.t0, te); th.t1 = Math.max(th.t1, te); }); } }
D.nodes.forEach(n => { if (n.px == null) { n.te = n.t; n.px = 0; n.py = ty(n.t); n.rot = 0; } });
/* 每根枝接在哪：指定的分叉节点；否则接在母枝上；分支里没有母枝的，接在这条分支最早的那根枝上；最早的那根接在分支的分叉节点上，再没有就一直通到地面 */
const bez = (a, b, steps = 14) => { const k = Math.max(26, (a[1] - b[1]) * .45), out = []; for (let i = 0; i <= steps; i++) { const s = i / steps, q = 1 - s; out.push([q * q * q * a[0] + 3 * q * q * s * a[0] + 3 * q * s * s * b[0] + s * s * s * b[0], q * q * q * a[1] + 3 * q * q * s * (a[1] - k) + 3 * q * s * s * (b[1] + k) + s * s * s * b[1]]); } return out; };
for (const t of D.tracks) { const mine = ths.filter(x => x.track === t.key), f = D.forks[t.key], fn = f && f.at && D.byId[f.at], main = mine.filter(x => !x.via && !x.from).sort((a, b) => a.t0 - b.t0)[0];
  t.wt = 2 + Math.sqrt(t.count) * .42;
  for (const th of mine) { const v = th.via && D.byId[th.via], p = th.from ? D.thBy[t.key][th.from] : th !== main ? main : null; let A = null, ground = false;
    if (v && v.te < th.t0) A = [v.px, v.py]; else if (p && p.ids.length && p !== th && p.t0 < th.t0) { const ta = Math.max(p.t0, th.t0 - .5); A = P(p, ta); } else if (th === main && fn && fn.te < th.t0) A = [fn.px, fn.py]; else ground = true;
    const from = ground ? 1943 : th.t0, lane = []; for (let s = from; s < th.t1; s += .5) lane.push(P(th, s)); lane.push(P(th, th.t1));
    th.pts = A ? [...bez(A, lane[0]), ...lane.slice(1)] : lane; th.w = (1.5 + Math.sqrt(th.ids.length) * .62) * (th === main ? 1.5 : 1); th.main = th === main;
    th.graft = ground && th === main && fn ? bez([fn.px, fn.py], P(th, fn.te + 1)) : null; } }
const order = [...D.nodes].sort((a, b) => b.tier - a.tier);

/* ——— 画 ——— */
const BG = '#EDF0E6', INK = '#22271F', BARK = '#4B3A2B', ACC = '#B5432A', FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
const desk = () => innerWidth >= 860;
const S = L.stage($('#cv'), {bounds: [-HW - 260, -HH - 430, HW + 260, 260], draw, tip: $('#tip'), max: 26, inset: () => ({l: desk() ? col.offsetWidth : 0, b: desk() ? 0 : col.offsetHeight})});
function draw(ctx, S) {
  const {W, H, zr, X, Y} = S, z = S.view.z, F = st.focus, m = st.m, ft = m && m.track, fth = m && m.thread, leftX = desk() ? col.offsetWidth : 0;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#DED8C6'; ctx.fillRect(0, Y(0), W, Math.max(0, H - Y(0)));
  ctx.save(); ctx.translate(S.view.x, S.view.y); ctx.scale(z, z);
  /* 树干的轮廓：1990年以前所有枝合在一起的那一段，往下张开成根 */
  ctx.beginPath(); ctx.moveTo(-250, 200); ctx.quadraticCurveTo(-150, 60, -HW * spread(1943) - 14, 0); for (let t = 1943; t <= 1992; t++) ctx.lineTo(-HW * spread(t) * 1.03 - 12, ty(t)); for (let t = 1992; t >= 1943; t--) ctx.lineTo(HW * spread(t) * 1.03 + 12, ty(t)); ctx.quadraticCurveTo(150, 60, 250, 200); ctx.closePath();
  const gr = ctx.createLinearGradient(0, 0, 0, ty(1992)); gr.addColorStop(0, 'rgba(75,58,43,.34)'); gr.addColorStop(1, 'rgba(75,58,43,0)'); ctx.fillStyle = gr; ctx.fill();
  if (m && m.era) { ctx.fillStyle = 'rgba(181,67,42,.10)'; const a = ty(m.era[0]), b = ty(m.era[1] + 1); ctx.fillRect(-HW * 1.1, b, HW * 2.2, a - b); }
  /* 枝 */
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const limb = (pts, w, col) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineWidth = Math.max(w, 1.1 / z); ctx.strokeStyle = col; ctx.stroke(); };
  for (const th of ths) { const on = (!ft || ft === th.track) && (!fth || fth === th), a = !on ? .12 : F && !ft ? .4 : .92, c = L.hsl(th.track, 30, th.main ? 27 : 34, a);
    if (th.graft) { ctx.setLineDash([10, 8]); limb(th.graft, th.w * .7, c); ctx.setLineDash([]); } limb(th.pts, th.w, c); }
  ctx.restore();

  /* 年代的横线和年份 */
  ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
  const years = zr > 2.6 ? Array.from({length: 84}, (_, i) => 1943 + i) : D.eras.map(e => e.from), isEra = new Set(D.eras.map(e => e.from)); let last = 1e9; const marks = [];
  for (const y of years) { const sy = Math.round(Y(ty(y))) + .5, hw = HW * spread(y) + 60, x0 = Math.max(leftX, X(-hw)), x1 = Math.min(W, X(hw)); if (sy < 0 || sy > H || last - sy < 15) continue; last = sy;
    ctx.strokeStyle = `rgba(34,39,31,${isEra.has(y) ? .2 : .08})`; ctx.setLineDash(isEra.has(y) ? [] : [3, 4]); ctx.beginPath(); ctx.moveTo(x0, sy); ctx.lineTo(x1, sy); ctx.stroke();
    marks.push([y, x0, sy]); }
  ctx.setLineDash([]);

  /* 选中节点的关系、路线 */
  const curve = (a, b, col, w) => { ctx.beginPath(); ctx.moveTo(X(a.px), Y(a.py)); ctx.quadraticCurveTo(X((a.px + b.px) / 2 * .82), Y((a.py + b.py) / 2 + Math.abs(a.px - b.px) * .12), X(b.px), Y(b.py)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  if (st.sel) { const {s, before, after} = L.nearby(st.sel); for (const o of before) curve(o, s, 'rgba(34,39,31,.4)', 1.1); for (const o of after) curve(s, o, 'rgba(181,67,42,.45)', 1.1); }
  const path = m && m.path; if (path) for (let k = 1; k < path.length; k++) curve(D.byId[path[k - 1]], D.byId[path[k]], 'rgba(181,67,42,.9)', 2.4);

  /* 叶子和果子 */
  const g = Math.min(3, Math.sqrt(Math.max(1, zr))), cand = [];
  for (const n of order) { if (!S.seen(n)) { n.vis = false; continue; }
    const on = !F || F.has(n.id), big = n.id === st.sel ? 1.6 : 1, r = [0, 4.6, 3.4, 2.1][n.tier] * g * big; S.put(n, r, on && (n.tier < 3 || zr > 1.5 || !!F));
    const {sx, sy} = n, read = L.status(n.id) === 2; ctx.globalAlpha = on ? 1 : .15; ctx.beginPath();
    if (n.tier === 1) ctx.arc(sx, sy, r, 0, TAU); else ctx.ellipse(sx, sy, r, r * .52, n.rot, 0, TAU);
    ctx.fillStyle = read ? BG : n.tier === 1 ? L.hsl(n.track, 72, 40) : n.tier === 2 ? L.hsl(n.track, 55, 44) : L.hsl(n.track, 44, 56); ctx.fill();
    if (read || n.tier === 1) { ctx.lineWidth = read ? 1.3 : 1.6; ctx.strokeStyle = read ? L.hsl(n.track, 60, 40) : BG; ctx.stroke(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, TAU); ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.stroke(); }
    const pr = n.id === st.sel ? 0 : path && path.includes(n.id) ? 1 : F && on && F.size <= 400 ? 1 + n.tier : n.tier === 1 ? 2 : n.tier === 2 && zr > 2.2 ? 6 : n.tier === 3 && zr > 5 ? 8 : 99;
    if (on && pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1;
  for (const [y, x0, sy] of marks) { const era = isEra.has(y), e = era && D.eras.find(q => q.from === y); ctx.font = `${era ? 700 : 500} 11.5px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(237,240,230,.9)'; ctx.fillRect(x0 + 3, sy - 8, 38, 16); ctx.fillStyle = era ? INK : '#6C7366'; ctx.fillText(y, x0 + 7, sy);
    if (e) { ctx.font = `500 11.5px ${FONT}`; const w = ctx.measureText(e.name).width; if (x0 - leftX > w + 16) { ctx.textAlign = 'right'; ctx.fillStyle = '#6C7366'; ctx.fillText(e.name, x0 - 4, sy); } } }
  S.labels(cand, {halo: BG, font: (n, pr) => `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 13 : n.tier === 2 ? 12 : 11}px ${FONT}`, ink: n => n.tier === 3 ? '#565C50' : INK});
  if (path) path.forEach((i, k) => { const n = D.byId[i]; ctx.beginPath(); ctx.arc(n.sx, n.sy, 10, 0, TAU); ctx.fillStyle = ACC; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(k + 1, n.sx, n.sy + .5); });

  /* 分支的名字写在树冠顶上；放大后，当前分支每根枝的名字竖着写在枝梢 */
  ctx.textAlign = 'center';
  const ends = [-1e9, -1e9]; D.tracks.forEach((t, i) => { const sx = X(t.um * HW * spread(2027)), row = i % 2, sy = Y(ty(2027)) - 26 - row * 17; if (sy < -20 || sy > H) return; ctx.font = `700 ${zr < 1.5 ? 12 : 14}px ${FONT}`; const nm = zr < 1.5 ? t.short : t.name, w = ctx.measureText(nm).width;
    if (sx - w / 2 < ends[row] + 6 && ft !== t.key) return; ends[row] = sx + w / 2; ctx.fillStyle = L.hsl(t.key, 62, 30, ft && ft !== t.key ? .35 : 1); ctx.fillText(nm, sx, sy); });
  const nt = ft || (st.sel && D.byId[st.sel].track);
  if (nt && zr > 2) { ctx.font = `600 11.5px ${FONT}`; ctx.textAlign = 'left'; for (const th of ths) { if (th.track !== nt) continue; const sx = X(lx(th, th.t1)), sy = Y(ty(th.t1)) - 12; if (sx < leftX || sx > W || sy < 0 || sy > H + 100) continue; ctx.save(); ctx.translate(sx, sy); ctx.rotate(-Math.PI / 2.6); ctx.lineWidth = 3; ctx.strokeStyle = BG; ctx.strokeText(th.name, 0, 0); ctx.fillStyle = L.hsl(nt, 62, 28); ctx.fillText(th.name, 0, 0); ctx.restore(); } }
  if (z * 150 > 40) { ctx.font = `700 ${Math.min(26, z * 60)}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(75,58,43,.75)'; ctx.fillText('1943', X(0), Y(120)); }
}

/* ——— 左边一栏：目录或讲解 ——— */
const HOME = `<div class="hello"><h1>AI研究这棵树</h1><p>它从1943年的地面往上长，越高越新。每根枝是一条主题线，从它的母枝上分出来；叶子是节点，圆的果子是主干节点，颜色是所属的分支。</p><p>树根很窄、树冠很宽：早年只有几条线，近十年的工作占了大半棵树。</p><p class="acts"><a class="go" href="#/s/intro">沿入门路线往上爬</a><a href="#/n/transformer">看Transformer那个分叉</a></p>
  <h6>六个大方向</h6><ul class="groups">${D.groups.map(g => `<li><b>${esc(g.name)}</b><span>${esc(g.role)}</span><div>${g.tracks.map(k => `<a class="hue" style="${L.hv(k)}" href="#/t/${k}">${esc(D.trackBy[k].short)}</a>`).join('')}</div></li>`).join('')}</ul>
  <p class="fine">拖动、滚轮缩放；点一片叶子，讲解出现在这一栏。读过的叶子是空心的。</p></div>`;
const run = L.nav(st, ({m, read, moved}) => {
  const wide = col.classList.contains('read');
  body.innerHTML = read ? `<a class="back" href="${st.close}">‹ ${m ? esc(m.title) : '回到树'}</a>${read.html}` : m ? L.listHTML(m, st) : HOME; body.scrollTop = 0;
  col.classList.toggle('read', !!read); document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  if (wide !== !!read) S.resize();
  if (st.sel) S.center(D.byId[st.sel], 4.2); else if (moved || wide !== !!read) S.go(S.target(st.focus && st.focus.size < 1500 ? [...st.focus] : null, m && m.path ? 5 : 7));
  S.req();
});
$('#zin').onclick = () => S.zoomBy(1.6); $('#zout').onclick = () => S.zoomBy(1 / 1.6); $('#fit').onclick = () => S.go(S.target());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.sel && !/INPUT/.test(document.activeElement.tagName)) location.hash = st.close; });
S.resize(); Object.assign(S.view, S.target()); run();
})();
