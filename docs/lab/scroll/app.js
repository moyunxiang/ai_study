/* 长卷：整个网站是一页编年史。从1943年往下滚到今天，点哪一条就在原地展开讲解，不换页。
   左边一根时间尺显示每年有多少东西、现在滚到了哪；路线是在同一条长卷上点亮几站；概念从右边抽屉里出来。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc, fmt, inline, rich} = L, $ = (s, el = document) => el.querySelector(s);
await L.brief(D.nodes.filter(n => n.tier <= 2));
const root = $('#root');
let tier = +(localStorage.getItem('lab.sc.tier') || 2), only = '', routeNow = null, drawn3 = false, openId = null;
const Y0 = 1943, Y1 = 2026, yr = n => Math.max(Y0, n.y);

const ent = n => `<li class="ent t${n.tier} k-${n.track} hue${L.status(n.id) === 2 ? ' done' : ''}" id="n-${esc(n.id)}" style="${L.hv(n.track)}"><a class="hd" href="#/n/${enc(n.id)}"><span class="mo">${n.y < Y0 ? n.y : n.m ? String(n.m).padStart(2, '0') + '月' : ''}</span><span class="ti">${esc(n.title)}</span><span class="tk">${esc(D.trackBy[n.track].short)}</span>${n.tier < 3 && n.problem ? `<span class="pb">${inline(n.problem).replace(/<a [^>]*>|<\/a>/g, '')}</span>` : ''}</a><div class="exp"></div></li>`;
function yearHTML(y) {
  const ns = D.chrono.filter(n => yr(n) === y), a = ns.filter(n => n.tier <= 2), b = ns.filter(n => n.tier === 3);
  return `<div class="year" id="y-${y}" data-y="${y}"><div class="yn"><b>${y}</b><small>${ns.length}个节点</small></div><div class="yb"><ol class="ents">${a.map(ent).join('')}</ol>${b.length ? `<ol class="ents ext" data-n="${b.length}">${drawn3 ? b.map(ent).join('') : ''}</ol>` : ''}</div></div>`;
}
function draw() {
  root.innerHTML = `<header class="top"><a class="brand" href="#/">AI脉络</a>
    <span class="seg" id="tier">${[[1, '主干'], [2, '+重要'], [3, '全部']].map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</span>
    <select id="only" aria-label="只看一条分支"><option value="">全部方向</option>${D.groups.map(g => `<optgroup label="${esc(g.name)}">${g.tracks.map(k => `<option value="${k}">${esc(D.trackBy[k].name)}</option>`).join('')}</optgroup>`).join('')}</select>
    <select id="rsel" aria-label="沿一条路线读"><option value="">沿一条路线读…</option>${L.routeList().map(r => `<option value="${r.key}">${esc(r.title)}（${r.n}站）</option>`).join('')}</select>
    <div class="find"><input id="q" type="search" placeholder="搜索" autocomplete="off"><ul id="hits" hidden></ul></div></header>
  <div class="rbar" id="rbar" hidden></div>
  <aside class="ruler" id="ruler"></aside>
  <main class="roll" id="roll">
    <section class="cover"><p class="k">1943 — 2026</p><h1>AI研究的<br>来龙去脉</h1><p class="lead">${D.nodes.length}个节点，按时间排成一卷。往下滚就是往后走；点任何一条，讲解在原地展开。</p>
      <p class="acts"><a href="#/s/intro">第一次来：沿入门路线读14站</a><a href="#/y/2017">跳到2017年</a><a href="#/y/2026">跳到今天</a></p></section>
    ${D.eras.map((e, i) => `<section class="era" id="e-${e.id}"><header class="eh"><p class="k">第${'一二三四五六七八九'[i]}章　${e.from}–${e.to}</p><h2>${esc(e.name)}</h2><p class="tg">${esc(e.tagline)}</p><p class="cx">${esc(e.context)}</p></header>
      ${Array.from({length: e.to - e.from + 1}, (_, j) => e.from + j).filter(y => D.chrono.some(n => yr(n) === y)).map(yearHTML).join('')}</section>`).join('')}
    <footer class="end">到这里就是今天。<a href="#/y/1943">回到开头 ↑</a></footer></main>
  <aside class="drawer" id="drawer" hidden><button class="x" aria-label="关闭">×</button><div id="dbody"></div></aside>`;
  bind(); drawRuler(); applyFilters();
}

/* ——— 筛选 ——— */
const dyn = document.head.appendChild(document.createElement('style'));
async function applyFilters() {
  if (tier === 3 && !drawn3) { drawn3 = true; document.querySelectorAll('.ents.ext').forEach(ol => { const y = +ol.closest('.year').dataset.y; ol.innerHTML = D.chrono.filter(n => yr(n) === y && n.tier === 3).map(ent).join(''); }); }
  document.body.dataset.tier = tier;
  document.querySelectorAll('#tier button').forEach(b => b.classList.toggle('on', +b.dataset.v === tier));
  $('#only').value = only;
  dyn.textContent = only ? `.ent:not(.k-${only}):not(.force){display:none!important}` : '';
  document.querySelectorAll('.year').forEach(y => { const ns = D.chrono.filter(n => yr(n) === +y.dataset.y && (!only || n.track === only)); y.classList.toggle('empty', !ns.some(n => n.tier <= tier)); const x = $('.ext', y); if (x) x.dataset.n = ns.filter(n => n.tier === 3).length; });
  measure();
}

/* ——— 时间尺 ——— */
let tops = [];
function drawRuler() {
  const H = 1000, max = Math.max(...Object.values(D.years).map(a => a.length)), ys = Y1 - Y0 + 1, h = H / ys;
  $('#ruler').innerHTML = `<svg viewBox="0 0 60 ${H}" preserveAspectRatio="none">${Array.from({length: ys}, (_, i) => { const y = Y0 + i, c = D.chrono.filter(n => yr(n) === y), a = c.filter(n => n.tier <= 2).length; return `<rect x="22" y="${i * h + .6}" width="${Math.max(1, 36 * Math.sqrt(c.length / max))}" height="${h - 1.2}" class="all"/><rect x="22" y="${i * h + .6}" width="${Math.max(1, 36 * Math.sqrt(a / max))}" height="${h - 1.2}" class="key"/>`; }).join('')}</svg>
    ${D.eras.map(e => `<a class="tick" href="#/y/${e.from}" style="top:${(e.from - Y0) / ys * 100}%" title="${esc(e.name)}">${e.from}</a>`).join('')}<i class="here" id="here"></i>`;
}
function measure() { tops = [...document.querySelectorAll('.year:not(.empty)')].map(el => [el.getBoundingClientRect().top + scrollY, +el.dataset.y]); onScroll(); }
function onScroll() {
  if (!tops.length) return;
  const at = y => { let i = 0; while (i < tops.length - 1 && tops[i + 1][0] <= y) i++; const [t, yy] = tops[i], nx = tops[i + 1]; return yy + (nx ? Math.max(0, Math.min(1, (y - t) / (nx[0] - t))) * (nx[1] - yy) : 0); };
  const a = at(scrollY + 80), b = at(scrollY + innerHeight), ys = Y1 - Y0 + 1, here = $('#here');
  here.style.top = (a - Y0) / ys * 100 + '%'; here.style.height = Math.max(.8, (b - a + .4) / ys * 100) + '%'; here.dataset.y = Math.floor(a);
}
addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', measure);

/* ——— 展开、收起 ——— */
async function open(id, note) {
  const n = D.byId[id]; if (!n) return;
  if (n.tier === 3 && !drawn3) { drawn3 = true; document.querySelectorAll('.ents.ext').forEach(ol => { const y = +ol.closest('.year').dataset.y; ol.innerHTML = D.chrono.filter(x => yr(x) === y && x.tier === 3).map(ent).join(''); }); }
  const li = document.getElementById('n-' + id); if (!li) return;
  if (openId && openId !== id) close();
  openId = id; li.classList.add('force', 'open'); li.closest('.year').classList.remove('empty');
  const box = $('.exp', li); box.innerHTML = '<p class="wait">正在载入讲解…</p>';
  li.scrollIntoView({block: 'start'});
  const x = await L.node(id); if (openId !== id) return;
  box.innerHTML = `<div class="sheet">${note ? `<div class="stepnote"><b>这一站：${esc(note.h)}</b>${rich(note.text)}</div>` : ''}${x.n.full ? `<p class="full">${esc(x.n.full)}</p>` : ''}<div class="a-meta">${x.parts.meta}</div>${x.parts.links ? `<div class="a-src">${x.parts.links}</div>` : ''}
    ${x.parts.gist ? `<div class="a-gist">${x.parts.gist}</div>` : ''}<div class="a-body">${x.parts.prereq}${x.parts.body}</div><div class="a-rel">${x.parts.relations}</div><div class="a-body">${x.parts.tail}</div>
    <p class="shut"><a href="#/">收起 ↑</a>${x.next ? `<a href="#/n/${enc(x.next.id)}">本分支下一个：${esc(x.next.title)}（${fmt(x.next.date)}）↓</a>` : ''}</p></div>`;
  document.title = n.title + ' · AI脉络'; measure();
}
function close() { const li = openId && document.getElementById('n-' + openId); if (li) { li.classList.remove('open'); $('.exp', li).innerHTML = ''; } openId = null; }

/* ——— 路线：在长卷上点亮几站 ——— */
async function setRoute(key, show) {
  document.querySelectorAll('.ent.stop').forEach(x => { x.classList.remove('stop', 'force'); x.removeAttribute('data-no'); });
  routeNow = key ? await L.route(key) : null;
  document.body.classList.toggle('routing', !!routeNow); $('#rsel').value = key || '';
  const bar = $('#rbar'); bar.hidden = !routeNow;
  if (!routeNow) { measure(); return; }
  if (routeNow.steps.some(s => (D.byId[s.node] || {}).tier === 3) && !drawn3) { tier = Math.max(tier, 2); drawn3 = true; document.querySelectorAll('.ents.ext').forEach(ol => { const y = +ol.closest('.year').dataset.y; ol.innerHTML = D.chrono.filter(x => yr(x) === y && x.tier === 3).map(ent).join(''); }); }
  routeNow.steps.forEach((s, i) => { const li = document.getElementById('n-' + s.node); if (li) { li.classList.add('stop', 'force'); li.dataset.no = i + 1; li.closest('.year').classList.remove('empty'); } });
  bar.innerHTML = `<b>${esc(routeNow.title)}</b><span class="stops">${routeNow.steps.map((s, i) => `<a href="#/n/${enc(s.node)}" data-i="${i}" title="${esc((D.byId[s.node] || {}).title || '')}">${i + 1}</a>`).join('')}</span><a class="about" href="#/s/${key}">这条路线讲什么</a><a class="quit" href="#/x">退出路线</a>`;
  if (show) { drawer(`<p class="k">${key === 'intro' ? '入门路线' : '研究专题'}</p><h2>${esc(routeNow.title)}</h2><p class="lead">${esc(routeNow.question)}</p><div class="a-body">${rich(routeNow.intro)}${routeNow.caveats ? `<h2>这条线的局限</h2>${rich(routeNow.caveats)}` : ''}</div><p><a class="go" href="#/n/${enc(routeNow.steps[0].node)}">从第一站开始：${esc(D.byId[routeNow.steps[0].node].title)} →</a></p>`); }
  measure();
}
function drawer(html) { const d = $('#drawer'); d.hidden = !html; if (html) { $('#dbody').innerHTML = html; d.scrollTop = 0; } }

/* ——— 地址 ——— */
async function route() {
  const {seg} = L.parseHash(), [v, a] = seg;
  if (v !== 'c' && v !== 's') drawer('');
  if (v === 'n' && D.byId[a]) { const st = routeNow && routeNow.steps.find(s => s.node === a); await open(a, st); document.querySelectorAll('#rbar .stops a').forEach(x => x.classList.toggle('on', routeNow.steps[+x.dataset.i].node === a)); }
  else if (v === 'c') { const x = await L.conceptHTML(a); if (x) drawer(x.html); }
  else if (v === 's') await setRoute(a, true);
  else if (v === 'x') { await setRoute(null); history.replaceState(null, '', '#/'); }
  else if (v === 't' && D.trackBy[a]) { only = a; close(); applyFilters(); scrollTo(0, $('.era').offsetTop - 60); }
  else if (v === 'y' || v === 'e') { close(); const el = v === 'y' ? [...document.querySelectorAll('.year:not(.empty)')].find(x => +x.dataset.y >= +a) : document.getElementById('e-' + a); if (el) el.scrollIntoView({block: 'start'}); }
  else { const y = openId && document.getElementById('n-' + openId); close(); if (y) y.scrollIntoView({block: 'center'}); document.title = 'AI脉络 · 长卷'; measure(); }
}
function bind() {
  L.bindState(root, (id, v) => { const li = document.getElementById('n-' + id); li && li.classList.toggle('done', v === 2); });
  $('#tier').onclick = e => { const b = e.target.closest('button'); if (!b) return; const y = +$('#here').dataset.y; tier = +b.dataset.v; localStorage.setItem('lab.sc.tier', tier); applyFilters(); const el = [...document.querySelectorAll('.year:not(.empty)')].find(x => +x.dataset.y >= y); if (el && scrollY > 400) el.scrollIntoView({block: 'start'}); };
  $('#only').onchange = e => { only = e.target.value; const y = +$('#here').dataset.y; applyFilters(); const el = [...document.querySelectorAll('.year:not(.empty)')].find(x => +x.dataset.y >= y); if (el && scrollY > 400) el.scrollIntoView({block: 'start'}); };
  $('#rsel').onchange = e => { location.hash = e.target.value ? '#/s/' + e.target.value : '#/x'; };
  $('#drawer .x').onclick = () => { drawer(''); if (/^#\/(c|s)\//.test(location.hash)) history.replaceState(null, '', openId ? '#/n/' + enc(openId) : '#/'); };
  root.addEventListener('click', e => { const a = e.target.closest('a.hd'); if (a && a.parentNode.classList.contains('open')) { e.preventDefault(); location.hash = '#/'; } });
  $('#ruler').addEventListener('click', e => { if (e.target.closest('a')) return; const r = $('#ruler').getBoundingClientRect(), y = Math.round(Y0 + (e.clientY - r.top) / r.height * (Y1 - Y0 + 1) - .5); location.hash = '#/y/' + y; });
  const q = $('#q'), hits = $('#hits');
  q.addEventListener('input', async () => { const v = q.value.trim(); if (!v) { hits.hidden = true; return; } const res = (await L.search(v, 12)).filter(x => x.k !== 't' && x.k !== 'th').slice(0, 9); if (q.value.trim() !== v) return; hits.hidden = false;
    hits.innerHTML = res.map(x => `<li><a href="${L.hitHref(x)}"><em>${x.k === 'n' ? x.date.slice(0, 4) : L.hitKind(x)}</em><b>${esc(x.t)}</b></a></li>`).join('') || '<li class="none">没有找到</li>'; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const a = $('a', hits); if (a) { location.hash = a.getAttribute('href'); hits.hidden = true; q.blur(); } } if (e.key === 'Escape') { hits.hidden = true; q.blur(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.find') || e.target.closest('a')) hits.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } if (e.key === 'Escape') $('#drawer .x').click(); });
}
draw(); addEventListener('hashchange', route); if (location.hash.length > 2) route();
})();
