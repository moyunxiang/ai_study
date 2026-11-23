/* 河流图：一张往下滚的长图。时间从上到下，十六条分支是十六条并排的河道，河道在某一年有多宽，
   就是那几年里这条分支的节点占全部节点的多少。所以一眼能看到谁在什么时候变宽、谁被挤窄。节点是河道里的点。
   右边一栏是目录和讲解；顶上一条细带随滚动显示“现在这一年”各条河道的名字。不用画布，整张图是SVG，按页面宽度排一次。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc} = L, $ = s => document.querySelector(s), root = $('#root');
root.innerHTML = `<header class="top" id="top"><a class="brand" href="#/">AI脉络<small>河流图</small></a>
    <nav id="tabs">${[['s', '路线'], ['t', '分支'], ['e', '年代'], ['idx', '概念'], ['me', '我的']].map(([k, n]) => `<a href="#/${k}" data-k="${k}">${n}</a>`).join('')}</nav>
    <div class="find"><input id="q" type="search" placeholder="在河里找：节点、概念、专题…" autocomplete="off"><ul id="hits" hidden></ul></div></header>
  <div class="strip" id="strip"><b id="now"></b></div>
  <main class="river" id="river"><svg id="sv" role="img" aria-label="AI研究河流图"></svg></main>
  <aside class="side" id="side"><div id="body"></div></aside>
  <div class="tip" id="tip" hidden></div>`;
const river = $('#river'), sv = $('#sv'), side = $('#side'), body = $('#body'), strip = $('#strip'), tip = $('#tip'), st = {panel: 'home'};
L.bindState(root, id => paintRead(id)); L.finder($('#q'), $('#hits'), '在河里点亮全部结果 ↵');

/* ——— 每条河道每年的宽度：这一年前后几年的节点数（平滑过），除以全部分支的总数 ——— */
const order = D.groups.flatMap(g => g.tracks), Y0 = 1943, Y1 = 2027, NY = Y1 - Y0, KER = [1, 2, 3, 2, 1];
const share = {}; { const cnt = {}, sm = {}, tot = new Float64Array(NY);
  order.forEach(k => { cnt[k] = new Float64Array(NY); sm[k] = new Float64Array(NY); });
  D.nodes.forEach(n => cnt[n.track][Math.max(0, Math.min(NY - 1, n.y - Y0))]++);
  for (const k of order) { const f = cnt[k].findIndex(v => v > 0); for (let i = f; i < NY; i++) { let a = 0, w = 0; KER.forEach((q, j) => { const x = i + j - 2; if (x >= f && x < NY) { a += q * cnt[k][x]; w += q; } }); sm[k][i] = a / w; tot[i] += sm[k][i]; } D.trackBy[k].f = f; }
  for (const k of order) { share[k] = new Float64Array(NY); for (let i = D.trackBy[k].f; i < NY; i++) share[k][i] = sm[k][i] + .018 * tot[i]; }
  for (let i = 0; i < NY; i++) { let s = 0; order.forEach(k => s += share[k][i]); order.forEach(k => share[k][i] /= s); } }
const sc = L.scale(Y0, Y1, .55), cv = document.createElement('canvas').getContext('2d');
let RW, XL, XR, HH, PADT = 16, KY, FL, FR, els = [], lbl = [], lit = [], selEl = null;
const ty = t => PADT + HH * sc(Math.max(Y0, t)), fx = f => XL + f * (XR - XL);
function at(yy) { let j = 0; while (j < KY.length - 2 && KY[j + 1] < yy) j++; const u = Math.max(0, Math.min(1, (yy - KY[j]) / (KY[j + 1] - KY[j]))); let lo = 0, hi = 1; for (let i = 0; i < 16; i++) { const s = (lo + hi) / 2; (1.5 * s * (1 - s) + s * s * s < u) ? lo = s : hi = s; } const s = (lo + hi) / 2; return [j, 3 * s * s - 2 * s * s * s]; }
const bandAt = (k, yy) => { const [j, b] = at(yy); return [fx(FL[k][j] + (FL[k][j + 1] - FL[k][j]) * b), fx(FR[k][j] + (FR[k][j + 1] - FR[k][j]) * b)]; };
const fill = (n, read) => read ? '#fff' : n.tier === 1 ? '#fff' : n.tier === 2 ? L.hsl(n.track, 68, 34) : L.hsl(n.track, 50, 46);
const RAD = [0, 6.5, 3.7, 2.1];

function build() {
  RW = river.clientWidth; XL = RW < 520 ? 44 : 58; XR = RW - 10; HH = RW < 520 ? 12500 : 9000;
  /* 结点：每年年中一个，两头各补一个 */
  const kt = [Y0, ...Array.from({length: NY}, (_, i) => Y0 + i + .5), Y1], ki = [0, ...Array.from({length: NY}, (_, i) => i), NY - 1]; KY = kt.map(ty); FL = {}; FR = {};
  order.forEach(k => { FL[k] = new Float64Array(kt.length); FR[k] = new Float64Array(kt.length); });
  ki.forEach((i, j) => { let c = 0; for (const k of order) { FL[k][j] = c; c += share[k][i]; FR[k][j] = c; } });
  const f1 = v => v.toFixed(1), edge = (A, rev) => { let d = ''; const n = KY.length; for (let q = 1; q < n; q++) { const j = rev ? n - 1 - q : q, p = rev ? j + 1 : j - 1, ym = (KY[p] + KY[j]) / 2; d += `C${f1(fx(A[p]))},${f1(ym)} ${f1(fx(A[j]))},${f1(ym)} ${f1(fx(A[j]))},${f1(KY[j])}`; } return d; };
  let h = '<g id="bands">';
  for (const k of order) h += `<path class="band" data-k="${k}" fill="${L.hsl(k, 58, 83)}" d="M${f1(fx(FL[k][0]))},${f1(KY[0])}${edge(FL[k])}L${f1(fx(FR[k][KY.length - 1]))},${f1(KY[KY.length - 1])}${edge(FR[k], 1)}Z"/>`;
  h += '</g><g id="names">';
  for (const k of order) { const t = D.trackBy[k]; let last = -1e9; for (let yy = ty(Y0 + t.f) + 60; yy < PADT + HH - 40; yy += 40) { const [a, b] = bandAt(k, yy); if (b - a < 44 || yy - last < 760) continue; last = yy; h += `<text class="bn" x="${f1((a + b) / 2)}" y="${f1(yy)}" fill="${L.hsl(k, 62, 34)}">${esc(b - a > 130 ? t.name : t.short)}</text>`; } }
  h += '</g><g id="grid">'; const eraBy = {}; D.eras.forEach(e => eraBy[e.from] = e); let ly = -99;
  for (let y = Y0; y <= 2026; y++) { const yy = ty(y), e = eraBy[y]; if (e) h += `<line class="yl era" x1="0" x2="${RW}" y1="${f1(yy)}" y2="${f1(yy)}"/><text class="en" x="${XL + 8}" y="${f1(yy + 15)}">${esc(e.name)} · ${esc(e.tagline)}</text>`; else h += `<line class="yl" x1="${XL - 6}" x2="${XR}" y1="${f1(yy)}" y2="${f1(yy)}"/>`;
    if (e || yy - ly > 15) { h += `<text class="yt${e ? ' era' : ''}" x="${XL - 9}" y="${f1(yy + 4)}">${y}</text>`; ly = yy; } }
  h += '</g><rect id="eraBox" x="1" width="' + (RW - 2) + '" height="0" hidden/><g id="lk"></g>';
  /* 点：同一条河道同一年的节点，在这一年的那一段河道里排成几行 */
  for (const k of order) { const byY = {}; D.order[k].forEach(i => (byY[Math.max(0, D.byId[i].y - Y0)] ||= []).push(D.byId[i]));
    for (const i in byY) { const ls = byY[i].sort((p, q) => p.t - q.t), m = ls.length, ya = ty(Y0 + +i), hgt = ty(Y0 + +i + 1) - ya, w = share[k][i] * (XR - XL), cols = Math.max(1, Math.min(m, Math.round(Math.sqrt(m * w / hgt)))), rows = Math.ceil(m / cols);
      ls.forEach((n, j) => { const r = Math.floor(j / cols), inRow = Math.min(cols, m - r * cols), yy = ya + hgt * (r + .5) / rows, [a, b] = bandAt(k, yy); n.py = yy; n.px = a + (b - a) * (.1 + .8 * (j % cols + .5) / inRow); }); } }
  h += '<g id="dots">'; const idx = new Map(D.nodes.map((n, i) => [n, i]));
  for (const tier of [3, 2, 1]) for (const n of D.nodes) if (n.tier === tier) { const rd = L.status(n.id) === 2; h += `<circle class="d t${tier}${rd ? ' rd' : ''}" data-i="${idx.get(n)}" cx="${f1(n.px)}" cy="${f1(n.py)}" r="${RAD[tier]}" fill="${fill(n, rd)}" stroke="${L.hsl(n.track, 70, 28)}"/>`; }
  h += '</g><g id="labels">';
  /* 名字：主干节点都写；重要节点写得下才写 */
  const rowsB = {}, hit = (a, b, row) => { for (let q = row - 1; q <= row + 1; q++) for (const [c, d] of rowsB[q] || []) if (a < d && b > c) return true; return false; };
  for (const n of [...D.nodes].filter(n => n.tier < 3).sort((a, b) => a.tier - b.tier || D.out[b.id].length - D.out[a.id].length)) { cv.font = n.tier === 1 ? '700 13px sans-serif' : '500 11.5px sans-serif'; const w = cv.measureText(n.title).width + 4, r = RAD[n.tier]; let x = n.px + r + 4, end = false; if (x + w > RW - 4) { x = n.px - r - 4; end = true; }
    const a = end ? x - w : x, row = Math.round(n.py / 13); if (n.tier > 1 && (hit(a - 3, a + w + 3, row) || a < XL)) continue; (rowsB[row] ||= []).push([a - 3, a + w + 3]);
    h += `<text class="lb t${n.tier}" data-i="${idx.get(n)}" x="${f1(x)}" y="${f1(n.py + 4)}"${end ? ' text-anchor="end"' : ''}>${esc(n.title)}</text>`; }
  h += '</g><g id="tmp"></g>';
  sv.setAttribute('width', RW); sv.setAttribute('height', PADT + HH + 90); sv.setAttribute('viewBox', `0 0 ${RW} ${PADT + HH + 90}`); sv.innerHTML = h;
  els = []; lbl = []; sv.querySelectorAll('circle.d').forEach(c => els[c.dataset.i] = c); sv.querySelectorAll('text.lb').forEach(c => lbl[c.dataset.i] = c); lit = []; selEl = null;
  strip.querySelectorAll('span').forEach(x => x.remove()); order.forEach(k => { const s = document.createElement('span'); s.dataset.k = k; s.style.color = L.hsl(k, 62, 30); s.style.background = L.hsl(k, 58, 83); strip.appendChild(s); });
}
const iOf = new Map(); D.nodes.forEach((n, i) => iOf.set(n.id, i));
function paintRead(id) { const n = D.byId[id], c = els[iOf.get(id)]; if (!c) return; const rd = L.status(id) === 2; c.classList.toggle('rd', rd); c.setAttribute('fill', fill(n, rd)); }

/* ——— 把当前状态画到图上：点亮、选中、连线、路线 ——— */
const vcurve = (a, b) => `M${a.px.toFixed(1)},${a.py.toFixed(1)}C${a.px.toFixed(1)},${((a.py + b.py) / 2).toFixed(1)} ${b.px.toFixed(1)},${((a.py + b.py) / 2).toFixed(1)} ${b.px.toFixed(1)},${b.py.toFixed(1)}`;
function paint() {
  const F = st.focus, m = st.m, ft = m && m.track, path = m && m.path;
  for (const i of lit) { els[i].classList.remove('on'); lbl[i] && lbl[i].classList.remove('on'); } lit = [];
  sv.classList.toggle('foc', !!F); if (F) for (const id of F) { const i = iOf.get(id); if (i == null) continue; els[i].classList.add('on'); lbl[i] && lbl[i].classList.add('on'); lit.push(i); }
  sv.querySelectorAll('.band').forEach(b => b.classList.toggle('dim', !!ft && b.dataset.k !== ft));
  if (selEl) { selEl.classList.remove('sel'); selEl.setAttribute('r', RAD[D.nodes[selEl.dataset.i].tier]); selEl = null; }
  let lk = '', tmp = ''; const tag = (n, cls = '') => { const end = n.px > RW - 150; tmp += `<text class="lb on tm ${cls}" x="${(n.px + (end ? -11 : 11)).toFixed(1)}" y="${(n.py + 4).toFixed(1)}"${end ? ' text-anchor="end"' : ''}>${esc(n.title)}</text>`; };
  if (st.sel) { const i = iOf.get(st.sel), {s, before, after} = L.nearby(st.sel, 30); selEl = els[i]; selEl.classList.add('sel'); selEl.setAttribute('r', RAD[s.tier] * 1.5 + 1.5);
    for (const o of before) lk += `<path class="in" d="${vcurve(o, s)}"/>`; for (const o of after) lk += `<path class="out" d="${vcurve(s, o)}"/>`;
    if (!lbl[i]) tag(s, 'b'); [...before.slice(0, 8), ...after.slice(0, 8)].forEach(o => { if (!lbl[iOf.get(o.id)]) tag(o); }); }
  if (path) { for (let k = 1; k < path.length; k++) lk += `<path class="route" d="${vcurve(D.byId[path[k - 1]], D.byId[path[k]])}"/>`;
    path.forEach((id, k) => { const n = D.byId[id]; tmp += `<circle class="stop" cx="${n.px.toFixed(1)}" cy="${n.py.toFixed(1)}" r="10"/><text class="stopn" x="${n.px.toFixed(1)}" y="${(n.py + 4).toFixed(1)}">${k + 1}</text>`; if (!lbl[iOf.get(id)]) tag(n, 'b'); }); }
  else if (F && F.size <= 40 && !st.sel) for (const id of F) { const n = D.byId[id]; if (n && !lbl[iOf.get(id)]) tag(n); }
  $('#lk').innerHTML = lk; $('#tmp').innerHTML = tmp;
  const box = $('#eraBox'); box.hidden = !(m && m.era); if (m && m.era) { box.setAttribute('y', ty(m.era[0])); box.setAttribute('height', ty(m.era[1] + 1) - ty(m.era[0])); }
}
/* 顶上的细带：现在滚到的这一年，各条河道在哪、叫什么 */
let tick = 0;
function section() { tick = 0; const yy = Math.max(PADT, Math.min(PADT + HH, scrollY + 34)); let y = Y0; while (y < 2026 && ty(y + 1) <= yy) y++; $('#now').textContent = y;
  strip.querySelectorAll('span').forEach(s => { const k = s.dataset.k, t = D.trackBy[k], [a, b] = bandAt(k, yy), w = b - a; if (w < 30 || y < Y0 + t.f) { s.hidden = true; return; } s.hidden = false; s.style.left = a + 'px'; s.style.width = w + 'px'; s.textContent = w > 118 ? t.name : w > 14 * t.short.length + 6 ? t.short : ''; }); }
addEventListener('scroll', () => { tick ||= requestAnimationFrame(section); }, {passive: true});
const desk = () => innerWidth >= 860, viewH = () => desk() ? innerHeight : innerHeight - side.offsetHeight;
function reveal(py, force) { const top = py - scrollY, hd = $('#top').offsetHeight + 40; if (!force && top > hd + 40 && top < viewH() - 80) return; scrollTo({top: Math.max(0, py - (hd + (viewH() - hd) * .36)), behavior: 'smooth'}); }

sv.addEventListener('click', e => { const c = e.target.closest('circle.d, text.lb[data-i]'); if (c) location.hash = '#/n/' + enc(D.nodes[c.dataset.i].id); });
sv.addEventListener('mousemove', e => { const c = e.target.closest('circle.d'); tip.hidden = !c; if (c) { const n = D.nodes[c.dataset.i]; tip.innerHTML = `<b>${esc(n.title)}</b><span>${L.fmt(n.date)} · ${esc(D.trackBy[n.track].name)} · ${L.TIER[n.tier]}</span>`; tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + 'px'; tip.style.top = e.clientY + 16 + 'px'; } });
sv.addEventListener('mouseleave', () => tip.hidden = true);

/* ——— 右边一栏 ——— */
const HOME = `<div class="hello"><h1>AI研究的河流图</h1><p>往下滚就是往后走：最上面是1943年，最下面是今天。十六条分支是十六条并排的河道。</p><p><b>河道有多宽</b>，就是那几年里这条分支的节点占全部节点的多少。所以能直接看到：哪条分支在什么时候变宽，哪条被挤窄。</p><p>河道里的点是节点：白色大圆是主干节点，深色的是重要节点，小点是延伸节点。</p><p class="acts"><a class="go" href="#/s/intro">沿入门路线顺流而下</a><a href="#/n/transformer">去看Transformer</a><a href="#/e/e7">2017年以后</a></p>
  <h6>六个大方向，从左到右</h6><ul class="groups">${D.groups.map(g => `<li><b>${esc(g.name)}</b><div>${g.tracks.map(k => `<a class="hue" style="${L.hv(k)}" href="#/t/${k}">${esc(D.trackBy[k].short)}</a>`).join('')}</div></li>`).join('')}</ul>
  <p class="fine">宽度按本站收录的节点数算（前后两年加权平均），不等于论文数量或影响力；近年收录得更细，早年的宽度更粗略。</p></div>`;
const run = L.nav(st, ({m, read, moved}) => {
  body.innerHTML = read ? `<a class="back" href="${st.close}">‹ ${m ? esc(m.title) : '回到总览'}</a>${read.html}` : m ? L.listHTML(m, st) : HOME; side.scrollTop = 0;
  side.classList.toggle('read', !!read); document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.k === st.panel));
  paint();
  if (st.sel) reveal(D.byId[st.sel].py); else if (moved && st.focus && st.focus.size) reveal(Math.min(...[...st.focus].map(i => D.byId[i] ? D.byId[i].py : 1e9)) + 60, true);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (st.sel || st.concept) && !/INPUT/.test(document.activeElement.tagName)) location.hash = st.close; });
let rz = 0, lastW = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (river.clientWidth !== lastW) { lastW = river.clientWidth; build(); paint(); section(); } }, 150); });
document.documentElement.style.setProperty('--top', $('#top').offsetHeight + 'px');
build(); lastW = river.clientWidth; section(); run();
})();
