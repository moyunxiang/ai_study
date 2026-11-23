/* 星图：没有时间轴。每个节点是一颗星，位置由关系决定：有关系的互相靠近，于是同一条分支聚成一团星云，跨分支的工作落在星云之间。
   星越大，后续工作越多；越亮越新。底下的时间条可以拖、可以播放：只显示那一年以前已经出现的星，看这片星空是怎么长出来的。
   位置是 layout.mjs 预先算好的（layout.json）。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc} = L, $ = s => document.querySelector(s), root = $('#root'), TAU = Math.PI * 2;
const pos = await fetch('layout.json').then(r => r.json());
root.innerHTML = `<canvas id="cv" aria-label="AI研究星图"></canvas>
  <nav class="rail"><a class="brand" href="#/">AI<br>脉络</a><div id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</div>
    <div class="zoom"><button id="zin" aria-label="放大">＋</button><button id="zout" aria-label="缩小">－</button><button id="fit" aria-label="全图">◎</button></div></nav>
  <div class="find"><input id="q" type="search" placeholder="搜索一颗星：节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div>
  <aside class="panel" id="panel"></aside>
  <div class="time"><button id="play" aria-label="播放历史">▶</button><div class="yr"><b id="yr">2026</b><span id="cnt"></span></div><input id="tm" type="range" min="1943" max="2027" step="0.25" value="2027" aria-label="时间"><span id="era"></span></div>
  <aside class="sheet" id="sheet" hidden><a class="x" id="shut" href="#/" aria-label="关闭讲解">×</a><div id="sbody"></div></aside>
  <div class="tip" id="tip" hidden></div>`;
const panel = $('#panel'), sheet = $('#sheet'), sbody = $('#sbody'), st = {panel: 'home', T: 2027};
L.bindState(root, () => S.req()); L.finder($('#q'), $('#hits'));

/* ——— 布局：读预先算好的坐标；算出每条分支、每条主题线的重心，用来写名字 ——— */
let R = 0; D.nodes.forEach((n, i) => { n.px = pos[2 * i]; n.py = pos[2 * i + 1]; n.deg = D.out[n.id].length; n.k = 1 + Math.sqrt(Math.min(n.deg, 60)) * .13; n.lum = Math.max(0, Math.min(1, (n.t - 1985) / 40)); });
{ const rs = D.nodes.map(n => Math.hypot(n.px, n.py)).sort((a, b) => a - b); R = rs[Math.floor(rs.length * .965)]; }      // 取景按96.5%的星算，最外面零散的几颗不撑大画面
const cen = ids => { let x = 0, y = 0; for (const i of ids) { x += D.byId[i].px; y += D.byId[i].py; } return [x / ids.length, y / ids.length]; };
for (const t of D.tracks) { [t.cx, t.cy] = cen(D.order[t.key]); t.first = Math.min(...D.order[t.key].map(i => D.byId[i].t)); for (const th of D.threads[t.key]) if (th.ids.length) { [th.cx, th.cy] = cen(th.ids); th.sorted = th.ids.map(i => D.byId[i]).sort((a, b) => a.t - b.t); } }
const order = [...D.nodes].sort((a, b) => b.tier - a.tier), dust = Array.from({length: 170}, (_, i) => [(i * 7919 % 1000) / 1000, (i * 104729 % 997) / 997, .25 + (i * 31 % 10) / 14]);
const nUntil = T => { let c = 0; for (const n of D.chrono) { if (n.t > T) break; c++; } return c; };

/* ——— 画 ——— */
const BG = '#070A12', FONT = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
const desk = () => innerWidth >= 860;
const S = L.stage($('#cv'), {bounds: [-R - 40, -R - 40, R + 40, R + 40], draw, tip: $('#tip'), max: 30,
  inset: () => ({t: desk() ? 60 : 60 + panel.offsetHeight, l: desk() ? 64 + (panel.innerHTML ? 316 : 0) : 0, r: desk() && !sheet.hidden ? sheet.offsetWidth + 14 : 0, b: desk() || sheet.hidden ? 96 : sheet.offsetHeight})});
function draw(ctx, S) {
  const {W, H, zr, X, Y} = S, z = S.view.z, F = st.focus, m = st.m, ft = m && m.track, fth = m && m.thread, T = st.T, live = T < 2027;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const gl = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), R * z * 1.15); gl.addColorStop(0, 'rgba(60,80,150,.20)'); gl.addColorStop(1, 'rgba(60,80,150,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; for (const [a, b, o] of dust) { ctx.globalAlpha = o * .5; ctx.fillRect(a * W, b * H, 1.2, 1.2); } ctx.globalAlpha = 1;

  /* 关系：淡淡的细线，叠起来成了星云的纹理。缩小时只画主干和重要节点之间的 */
  ctx.beginPath(); const lod = zr < 1.8 ? 2 : 3, pad = 40;
  for (const e of D.edges) { const a = D.byId[e.from], b = D.byId[e.to]; if (a.tier > lod || b.tier > lod || a.t > T || b.t > T) continue; const ax = X(a.px), ay = Y(a.py), bx = X(b.px), by = Y(b.py);
    if ((ax < -pad && bx < -pad) || (ax > W + pad && bx > W + pad) || (ay < -pad && by < -pad) || (ay > H + pad && by > H + pad)) continue; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  ctx.strokeStyle = `rgba(140,165,255,${F ? .035 : zr < 1.8 ? .1 : .075})`; ctx.lineWidth = .7; ctx.stroke();
  /* 一条主题线：按时间把它的星连成星座 */
  if (fth && fth.sorted) { ctx.beginPath(); fth.sorted.forEach((n, i) => { if (n.t > T) return; i ? ctx.lineTo(X(n.px), Y(n.py)) : ctx.moveTo(X(n.px), Y(n.py)); }); ctx.strokeStyle = L.hsl(fth.track, 80, 72, .7); ctx.lineWidth = 1.2; ctx.stroke(); }
  const seg = (a, b, col, w) => { ctx.beginPath(); ctx.moveTo(X(a.px), Y(a.py)); ctx.lineTo(X(b.px), Y(b.py)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  if (st.sel) { const {s, before, after} = L.nearby(st.sel, 40); for (const o of before) seg(o, s, 'rgba(150,190,255,.55)', 1); for (const o of after) seg(s, o, 'rgba(255,170,110,.55)', 1); }
  const path = m && m.path; if (path) for (let k = 1; k < path.length; k++) seg(D.byId[path[k - 1]], D.byId[path[k]], 'rgba(255,214,102,.95)', 2);

  /* 星 */
  const g = Math.min(2.6, Math.sqrt(Math.max(1, zr))), cand = [];
  for (const n of order) { if (n.t > T || !S.seen(n)) { n.vis = false; continue; }
    const on = !F || F.has(n.id), born = live && T - n.t < 1.5 ? 1 - (T - n.t) / 1.5 : 0, r = [0, 3.3, 2, 1.15][n.tier] * g * n.k * (n.id === st.sel ? 1.5 : 1) * (1 + born * .9);
    S.put(n, r, on && (n.tier < 3 || zr > 1.5 || !!F)); const {sx, sy} = n, read = L.status(n.id) === 2; ctx.globalAlpha = on ? 1 : .13;
    if (on && (n.tier === 1 || born > .2)) { ctx.beginPath(); ctx.arc(sx, sy, r * (2.4 + born * 2), 0, TAU); ctx.fillStyle = L.hsl(n.track, 90, 65, .16 + born * .2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
    if (read) { ctx.strokeStyle = L.hsl(n.track, 85, 70); ctx.lineWidth = 1.3; ctx.stroke(); } else { ctx.fillStyle = L.hsl(n.track, n.tier === 3 ? 60 : 85, 52 + n.lum * 24 + born * 14); ctx.fill(); }
    if (n.id === st.sel) { ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke(); }
    const pr = n.id === st.sel ? 0 : path && path.includes(n.id) ? 1 : F && on && F.size <= 400 ? 1 + n.tier : born > .5 && n.tier < 3 ? 2 : n.tier === 1 ? 3 : n.tier === 2 && zr > 2.4 ? 6 : n.tier === 3 && zr > 5.5 ? 8 : 99;
    if (on && pr < 99) cand.push([pr, n]); }
  ctx.globalAlpha = 1;
  S.labels(cand, {halo: 'rgba(7,10,18,.9)', haloW: 3, font: (n, pr) => `${n.tier === 1 || pr < 2 ? 700 : 500} ${n.tier === 1 ? 12.5 : 11.5}px ${FONT}`, ink: (n, pr) => pr < 3 ? '#fff' : n.tier === 1 ? '#E9ECF5' : n.tier === 2 ? '#B9C1D4' : '#8791A8'});
  /* 星云的名字 */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (zr < 3.2 || ft) for (const t of D.tracks) { if (t.first > T) continue; const dim = (ft && ft !== t.key) || (F && !ft); ctx.font = `700 ${zr < 1.4 ? 13 : 16}px ${FONT}`; try { ctx.letterSpacing = '3px'; } catch {}
    const nm = zr < 1.4 ? t.short : t.name, w = ctx.measureText(nm).width + 16, x = X(t.cx), y = Y(t.cy); ctx.fillStyle = `rgba(7,10,18,${dim ? .3 : .72})`; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 24, 12); ctx.fill(); ctx.fillStyle = L.hsl(t.key, 85, 78, dim ? .3 : 1); ctx.fillText(nm, x + 1.5, y + .5); }
  try { ctx.letterSpacing = '0px'; } catch {}
  const nt = ft || (st.sel && D.byId[st.sel].track);
  if (zr > 3.2) for (const t of D.tracks) { if (nt ? t.key !== nt : zr < 5) continue; ctx.font = `600 11.5px ${FONT}`; for (const th of D.threads[t.key]) { if (!th.ids.length) continue; const x = X(th.cx), y = Y(th.cy); if (x < 0 || x > W || y < 0 || y > H) continue; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,10,18,.85)'; ctx.strokeText(th.name, x, y - 14); ctx.fillStyle = L.hsl(t.key, 70, 74, .85); ctx.fillText(th.name, x, y - 14); } }
  if (path) path.forEach((i, k) => { const n = D.byId[i]; if (n.t > T) return; const x = X(n.px), y = Y(n.py); ctx.beginPath(); ctx.arc(x, y, 9.5, 0, TAU); ctx.fillStyle = '#FFD666'; ctx.fill(); ctx.fillStyle = BG; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.fillText(k + 1, x, y + .5); });
}

/* ——— 时间条 ——— */
const tm = $('#tm'), play = $('#play'); let playing = 0;
function setT(T, fromSlider) { st.T = Math.max(1943, Math.min(2027, T)); if (!fromSlider) tm.value = st.T; const y = Math.min(2026, Math.floor(st.T)), e = D.eras.find(x => y <= x.to) || D.eras[D.eras.length - 1];
  $('#yr').textContent = st.T >= 2027 ? '今天' : y; $('#cnt').textContent = nUntil(st.T) + '颗星'; $('#era').textContent = e.name; S.req(); }
tm.addEventListener('input', () => { stop(); setT(+tm.value, 1); });
const stop = () => { playing = 0; play.textContent = '▶'; };
function start() { if (st.T >= 2027) setT(1943); playing = performance.now(); play.textContent = '❚❚';
  const tick = now => { if (!playing) return; const dt = Math.min(.1, (now - playing) / 1000); playing = now; setT(st.T + dt * (st.T < 1985 ? 7 : st.T < 2010 ? 3.6 : 1.5)); if (st.T >= 2027) return stop(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
play.onclick = () => playing ? stop() : start();
root.addEventListener('click', e => { if (e.target.closest('[data-play]')) { e.preventDefault(); stop(); setT(1943); start(); } });

/* ——— 界面 ——— */
const HOME = `<div class="hello"><h1>AI研究的星图</h1><p>每颗星是一个节点。有关系的星互相靠近，所以同一条分支聚成一团星云，跨分支的工作落在星云之间。</p><p>星越大，后来建立在它上面的工作越多；越亮越新。</p><p class="acts"><a class="go" href="#/" data-play>▶ 从1943年播放</a><a href="#/s/intro">入门路线</a><a href="#/n/transformer">Transformer</a></p><p class="fine">拖动、滚轮缩放；点一颗星看讲解。</p></div>`;
const run = L.nav(st, ({m, read, moved}) => {
  const hadPanel = !!panel.innerHTML; panel.innerHTML = m ? L.listHTML(m, st) : st.sel || st.concept ? '' : HOME; if (moved) panel.scrollTop = 0;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  const was = sheet.hidden; sheet.hidden = !read; if (read) { sbody.innerHTML = read.html; sheet.scrollTop = 0; $('#shut').href = st.close; if (st.sel && D.byId[st.sel].t > st.T) setT(2027); }
  document.body.classList.toggle('reading', !!read); S.resize();
  if (st.sel) S.center(D.byId[st.sel], 4.5); else if (moved || was !== sheet.hidden) S.go(S.target(st.focus && st.focus.size < 1500 ? [...st.focus] : null, m && m.path ? 4 : 6));
  S.req();
});
$('#zin').onclick = () => S.zoomBy(1.6); $('#zout').onclick = () => S.zoomBy(1 / 1.6); $('#fit').onclick = () => S.go(S.target());
document.addEventListener('keydown', e => { if (/INPUT/.test(document.activeElement.tagName)) return; if (e.key === 'Escape' && !sheet.hidden) location.hash = st.close; if (e.key === ' ') { e.preventDefault(); play.click(); } });
S.resize(); Object.assign(S.view, S.target()); setT(2027); run();
})();
