/* 手册：文档站式。左边是整棵树的目录（方向 › 分支 › 主题线 › 节点），中间读正文，右边是本页目录和前后关系。 */
(async () => {
const L = Lab, D = await L.boot(), {esc, enc, fmt, inline, rich} = L, $ = (s, el = document) => el.querySelector(s);
const root = $('#root');
let tierMax = +(localStorage.getItem('lab.hb.tier') || 2);
root.innerHTML = `<header class="bar"><button class="burger" aria-label="目录">☰</button><a class="brand" href="#/">AI脉络<small>手册</small></a><nav class="crumb" id="crumb"></nav>
  <div class="find"><input id="q" type="search" placeholder="搜索节点、概念、专题…　按 / 聚焦" autocomplete="off"><ul id="hits" hidden></ul></div></header>
  <aside class="side" id="side"></aside><main class="doc" id="doc" tabindex="-1"></main><aside class="rail" id="rail"></aside>`;
const side = $('#side'), doc = $('#doc'), rail = $('#rail'), crumb = $('#crumb');
L.bindState(root, () => drawSide.marks());

/* ——— 左侧目录 ——— */
const nodeLi = n => `<li><a class="n t${n.tier}${L.status(n.id) === 2 ? ' done' : ''}" data-id="${esc(n.id)}" href="#/n/${enc(n.id)}"><i>${n.y}</i>${esc(n.title)}</a></li>`;
function drawSide() {
  side.innerHTML = `<div class="filter"><span>目录里显示</span><button data-tier="1" class="${tierMax === 1 ? 'on' : ''}">主干</button><button data-tier="2" class="${tierMax === 2 ? 'on' : ''}">+重要</button><button data-tier="3" class="${tierMax === 3 ? 'on' : ''}">全部</button></div>
  <h6>开始</h6><ul><li><a href="#/" data-k="home">总目录</a></li><li><a href="#/s/intro" data-k="s/intro">入门路线 · 14站</a></li><li><a href="#/time" data-k="time">年表</a></li><li><a href="#/me" data-k="me">我的进度</a></li></ul>
  <h6>研究专题</h6><ul>${D.stories.map(s => `<li><a href="#/s/${s.key}" data-k="s/${s.key}">${esc(s.title)}</a></li>`).join('')}</ul>
  ${D.groups.map(g => `<h6>${esc(g.name)}</h6>${g.tracks.map(k => { const t = D.trackBy[k]; return `<details data-t="${k}"><summary><a href="#/t/${k}" data-k="t/${k}">${esc(t.name)}</a><b>${t.count}</b></summary>
    ${D.threads[k].map(th => `<details data-th="${k}/${th.key}"><summary><a href="#/t/${k}/${th.key}" data-k="t/${k}/${th.key}">${esc(th.name)}</a><b>${th.ids.length}</b></summary><ul class="nodes"></ul></details>`).join('')}</details>`; }).join('')}`).join('')}
  <h6>年代</h6><ul>${D.eras.map(e => `<li><a href="#/e/${e.id}" data-k="e/${e.id}"><i>${e.from}–${String(e.to).slice(2)}</i>${esc(e.name)}</a></li>`).join('')}</ul>
  <h6>概念</h6><ul>${Object.entries(L.AREA).map(([k, v]) => `<li><a href="#/idx/${k}" data-k="idx/${k}">${esc(v)}</a></li>`).join('')}</ul>`;
  side.querySelectorAll('details[data-th]').forEach(d => d.addEventListener('toggle', () => fill(d)));
}
function fill(d) {
  if (!d.open) return;
  const [k, th] = d.dataset.th.split('/'), ul = $('ul', d);
  ul.innerHTML = D.thBy[k][th].ids.map(i => D.byId[i]).filter(n => n.tier <= tierMax || n.id === cur.node).map(nodeLi).join('') || '<li class="none">这个范围里没有节点</li>';
  mark();
}
drawSide.marks = () => side.querySelectorAll('a.n').forEach(a => a.classList.toggle('done', L.status(a.dataset.id) === 2));
side.addEventListener('click', e => {
  const b = e.target.closest('[data-tier]');
  if (b) { tierMax = +b.dataset.tier; localStorage.setItem('lab.hb.tier', tierMax); const open = [...side.querySelectorAll('details[open]')].map(d => d.dataset.t || d.dataset.th); drawSide(); open.forEach(k => { const d = side.querySelector(`[data-t="${k}"],[data-th="${k}"]`); if (d) d.open = true; }); mark(); route(); }
  if (e.target.closest('a') && innerWidth < 900) document.body.classList.remove('nav');
});
$('.burger').onclick = () => document.body.classList.toggle('nav');
let cur = {};
function mark() {
  side.querySelectorAll('.on').forEach(a => a.tagName === 'A' && a.classList.remove('on'));
  const a = cur.node ? side.querySelector(`a.n[data-id="${CSS.escape(cur.node)}"]`) : side.querySelector(`a[data-k="${cur.key}"]`);
  if (a) { a.classList.add('on'); a.scrollIntoView({block: 'nearest'}); }
}
function reveal(track, th) {
  const d = side.querySelector(`[data-t="${track}"]`); if (d) d.open = true;
  if (th) { const x = side.querySelector(`[data-th="${track}/${th}"]`); if (x) { x.open = true; fill(x); } }
}

/* ——— 搜索 ——— */
const q = $('#q'), hits = $('#hits');
let hi = -1;
q.addEventListener('input', async () => {
  const v = q.value.trim(); if (!v) { hits.hidden = true; return; }
  const res = (await L.search(v, 10)).slice(0, 9); if (q.value.trim() !== v) return;
  hi = -1; hits.hidden = false;
  hits.innerHTML = res.map(x => `<li><a href="${L.hitHref(x)}"><em>${L.hitKind(x)}</em><b>${esc(x.t)}</b><span>${esc(x.s || '')}</span></a></li>`).join('') + `<li class="all"><a href="#/q/${enc(v)}">查看全部结果 ↵</a></li>`;
});
q.addEventListener('keydown', e => {
  const as = [...hits.querySelectorAll('a')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + as.length) % as.length; as.forEach((a, i) => a.classList.toggle('hi', i === hi)); }
  if (e.key === 'Enter' && q.value.trim()) { location.hash = hi >= 0 ? as[hi].getAttribute('href') : '#/q/' + enc(q.value.trim()); hits.hidden = true; q.blur(); }
  if (e.key === 'Escape') { hits.hidden = true; q.blur(); }
});
document.addEventListener('click', e => { if (!e.target.closest('.find')) hits.hidden = true; else if (e.target.closest('a')) hits.hidden = true; });
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === '/') { e.preventDefault(); q.focus(); }
  if (cur.prev && e.key === '[') location.hash = '#/n/' + enc(cur.prev);
  if (cur.next && e.key === ']') location.hash = '#/n/' + enc(cur.next);
});

/* ——— 各种页面 ——— */
const table = (ns, opt = {}) => `<table class="tb"><thead><tr><th>时间</th><th>节点</th>${opt.track ? '<th>分支</th>' : ''}<th>它回应的问题</th><th></th></tr></thead><tbody>${ns.map(n => `<tr class="t${n.tier}"><td class="d">${fmt(n.date)}</td><td><a class="hue" style="${L.hv(n.track)}" href="#/n/${enc(n.id)}">${esc(n.title)}</a>${n.tier === 1 ? '<sup>主干</sup>' : ''}</td>${opt.track ? `<td class="k">${esc(D.trackBy[n.track].short)}</td>` : ''}<td class="p">${n.problem ? inline(n.problem) : ''}</td><td class="s">${L.status(n.id) === 2 ? '✓' : ''}</td></tr>`).join('')}</tbody></table>`;
const pages = {
  async home() {
    const t1 = D.nodes.filter(n => n.tier === 1).length;
    return {crumb: '总目录', html: `<h1>AI研究的来龙去脉</h1>
      <p class="lead">一份按“问题 → 方法 → 影响”整理的AI研究手册：${D.nodes.length}个节点、${D.edges.length}条关系、${Object.keys(D.concepts).length}个概念，从1943年排到今天。左边的目录就是整棵树，从任何一层都能点进去。</p>
      <div class="start"><a href="#/s/intro"><b>第一次来</b><span>入门路线：14站看懂AI怎么走到今天</span></a><a href="#/time"><b>想看全貌</b><span>年表：每一年、每个方向发生了什么</span></a><a href="#/n/transformer"><b>直接看一篇</b><span>Transformer：一篇讲解长什么样</span></a></div>
      <p class="fine">${t1}个主干节点是“缺了后面就讲不通”的；目录默认只列主干和重要节点，左上角可以改成全部。</p>
      ${D.groups.map((g, i) => `<section class="grp"><h2><span>${String(i + 1).padStart(2, '0')}</span>${esc(g.name)}</h2><p>${esc(g.blurb)}</p>
        ${g.tracks.map(k => { const t = D.trackBy[k]; return `<div class="trow hue" style="${L.hv(k)}"><div><a class="tn" href="#/t/${k}">${esc(t.name)}</a><small>${t.count}个节点</small></div><div><p class="tq">${esc(t.question)}</p><p class="ths">${D.threads[k].map(th => `<a href="#/t/${k}/${th.key}">${esc(th.name)}<i>${th.ids.length}</i></a>`).join('')}</p></div></div>`; }).join('')}</section>`).join('')}`,
      rail: `<h6>本页</h6><ul>${D.groups.map(g => `<li>${esc(g.name)}</li>`).join('')}</ul><h6>研究专题</h6><ul>${D.stories.map(s => `<li><a href="#/s/${s.key}">${esc(s.title)}</a></li>`).join('')}</ul>`};
  },
  async n(id) {
    const x = await L.node(id); if (!x) return null;
    const {n, parts, before, after, prev, next, toc} = x;
    cur = {node: id, prev: prev && prev.id, next: next && next.id}; reveal(n.track, n.th);
    const mini = (es, key) => es.slice(0, 7).map(e => { const o = D.byId[e[key]]; return `<li><a href="#/n/${enc(o.id)}"><i>${o.y}</i>${esc(o.title)}</a></li>`; }).join('');
    return {title: n.title, crumb: parts.path + ' › ' + esc(n.title), cls: 'hue', style: L.hv(n.track),
      html: parts.article + `<div class="a-rel">${parts.relations}</div><div class="a-body">${parts.tail}</div>
        <nav class="pn">${prev ? `<a href="#/n/${enc(prev.id)}"><small>← 本分支上一篇 · ${fmt(prev.date)}</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="r" href="#/n/${enc(next.id)}"><small>本分支下一篇 · ${fmt(next.date)} →</small>${esc(next.title)}</a>` : ''}</nav>`,
      rail: `<div class="state">${parts.mine}</div><h6>本页</h6><ul>${toc.map(([a, t]) => `<li><a href="#" data-jump="${a}">${t}</a></li>`).join('')}</ul>
        ${before.length ? `<h6>前驱 <b>${before.length}</b></h6><ul class="mini">${mini(before, 'from')}</ul>` : ''}${after.length ? `<h6>后续 <b>${after.length}</b></h6><ul class="mini">${mini(after, 'to')}</ul>` : ''}<p class="keys">[ 上一篇　] 下一篇　/ 搜索</p>`};
  },
  async c(key) {
    const x = await L.conceptHTML(key); if (!x) return null;
    return {title: x.c.name, crumb: `<a href="#/idx/${x.c.area}">${esc(L.AREA[x.c.area])}</a> › ${esc(x.c.name)}`, key: 'idx/' + x.c.area, html: x.html,
      rail: x.c.needs.length ? `<h6>先会</h6><ul>${x.c.needs.map(k => `<li>${L.clink(k)}</li>`).join('')}</ul>` : ''};
  },
  async t(k, thk) {
    const t = D.trackBy[k]; if (!t) return null;
    const ths = thk ? D.threads[k].filter(x => x.key === thk) : D.threads[k], max = thk ? 3 : tierMax, f = D.forks[k] || {};
    const all = ths.flatMap(th => th.ids.map(i => D.byId[i])).filter(n => n.tier <= max);
    await L.brief(all); reveal(k, thk);
    return {title: thk && ths[0] ? ths[0].name : t.name, key: thk ? `t/${k}/${thk}` : 't/' + k, cls: 'hue', style: L.hv(k),
      crumb: `${esc(t.g.name)} › ${thk ? `<a href="#/t/${k}">${esc(t.name)}</a> › ${esc(ths[0].name)}` : esc(t.name)}`,
      html: thk ? `<h1>${esc(ths[0].name)}</h1><p class="lead">${esc(ths[0].blurb)}</p>${ths[0].from ? `<p class="fine">从“${esc((D.thBy[k][ths[0].from] || {}).name || '')}”分出来${ths[0].via && D.byId[ths[0].via] ? `，分叉点是${L.nlink(ths[0].via)}` : ''}。</p>` : ''}${table(all)}`
        : `<h1>${esc(t.name)}</h1><p class="lead">${esc(t.question)}</p><p>${esc(t.blurb)}</p>${f.why ? `<p class="fine">${f.from ? `从“${esc(D.trackBy[f.from].name)}”分出来。` : '树的一条根。'}${esc(f.why)}</p>` : ''}
          <h2>发展阶段</h2><table class="tb st"><tbody>${t.stages.map(s => `<tr><td class="d">${s.from}–${s.to}</td><td><b>${esc(s.name)}</b></td><td class="p">${esc(s.text)}</td></tr>`).join('')}</tbody></table>
          ${ths.map(th => { const ns = th.ids.map(i => D.byId[i]).filter(n => n.tier <= max); return `<h2 id="th-${th.key}"><a href="#/t/${k}/${th.key}">${esc(th.name)}</a><small>${ns.length}/${th.ids.length}</small></h2><p class="thb">${esc(th.blurb)}</p>${ns.length ? table(ns) : ''}`; }).join('')}`,
      rail: thk ? '' : `<h6>主题线</h6><ul>${ths.map(th => `<li><a href="#" data-jump="th-${th.key}">${esc(th.name)}</a></li>`).join('')}</ul>`};
  },
  async s(key) {
    const r = await L.route(key); if (!r) return null;
    const ns = r.steps.map(s => D.byId[s.node]).filter(Boolean); await L.brief(ns);
    return {title: r.title, key: 's/' + key, crumb: (key === 'intro' ? '开始' : '研究专题') + ' › ' + esc(r.title),
      html: `<h1>${esc(r.title)}</h1><p class="lead">${esc(r.question)}</p><div class="a-body">${rich(r.intro)}</div>
        <ol class="steps">${r.steps.map((s, i) => { const n = D.byId[s.node]; return n ? `<li id="st-${i}" class="hue" style="${L.hv(n.track)}"><div class="no">${i + 1}</div><div><h3>${esc(s.h)}</h3><p class="at"><a href="#/n/${enc(n.id)}">${esc(n.title)}</a> · ${fmt(n.date)} · ${esc(D.trackBy[n.track].short)} ${L.stBtn(n.id)}</p><div class="a-body">${rich(s.text)}</div></div></li>` : ''; }).join('')}</ol>
        ${r.takeaway ? `<h2>读完应该带走什么</h2><div class="a-body">${rich(r.takeaway)}</div>` : ''}${r.caveats ? `<h2>这条线的局限</h2><div class="a-body">${rich(r.caveats)}</div>` : ''}`,
      rail: `<h6>${r.steps.length}站</h6><ol class="mini num">${r.steps.map((s, i) => `<li><a href="#" data-jump="st-${i}">${esc((D.byId[s.node] || {}).title || '')}</a></li>`).join('')}</ol>`};
  },
  async e(id) {
    const e = D.eras.find(x => x.id === id); if (!e) return null;
    const ns = D.chrono.filter(n => n.y >= (e === D.eras[0] ? 0 : e.from) && n.y <= e.to && n.tier <= tierMax); await L.brief(ns);
    const ys = [...new Set(ns.map(n => n.y))];
    return {title: e.name, key: 'e/' + id, crumb: '年代 › ' + esc(e.name), html: `<h1>${esc(e.name)}<small>${e.from}–${e.to}</small></h1><p class="lead">${esc(e.tagline)}</p><p>${esc(e.context)}</p>
      <h2>这个年代各方向在问什么</h2><table class="tb st"><tbody>${e.questions.map(x => `<tr><td class="k"><a href="#/t/${x.track}">${esc(D.trackBy[x.track].short)}</a></td><td class="p">${esc(x.text)}</td></tr>`).join('')}</tbody></table>
      ${ys.map(y => `<h2 id="y-${y}">${y}<small>${ns.filter(n => n.y === y).length}</small></h2>${table(ns.filter(n => n.y === y), {track: 1})}`).join('')}`,
      rail: `<h6>年份</h6><ul class="yrs">${ys.map(y => `<li><a href="#" data-jump="y-${y}">${y}</a></li>`).join('')}</ul>`};
  },
  async time() {
    const rows = [];
    for (let y = 1943; y <= 2026; y++) { const ns = (D.years[y] || []); if (!ns.length) continue;
      rows.push(`<tr><th><a href="#/e/${L.eraOf({y}).id}">${y}</a></th>${D.groups.map(g => { const c = ns.filter(n => g.tracks.includes(n.track)), a = c.filter(n => n.tier === 1), b = c.length - a.length; return `<td>${a.map(n => `<a class="hue" style="${L.hv(n.track)}" href="#/n/${enc(n.id)}">${esc(n.title)}</a>`).join('')}${b ? `<span>${a.length ? '另' : ''}${b}个</span>` : ''}</td>`; }).join('')}</tr>`); }
    return {title: '年表', key: 'time', crumb: '年表', cls: 'wide', html: `<h1>年表</h1><p class="lead">每一行是一年，每一列是一个大方向。格子里写出来的是主干节点，其余只给数量；点年份进入那个年代。</p>
      <div class="xs"><table class="tb mx"><thead><tr><th></th>${D.groups.map(g => `<th>${esc(g.name)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`, rail: null};
  },
  async idx(area) {
    const cs = Object.values(D.concepts).filter(c => c.area === area).sort((a, b) => a.level - b.level || b.n - a.n);
    return {title: L.AREA[area], key: 'idx/' + area, crumb: '概念 › ' + esc(L.AREA[area] || ''), html: `<h1>${esc(L.AREA[area] || '概念')}</h1><p class="lead">${cs.length}个${area === 'idea' ? '研究思路' : '概念'}，按难度排列。数字是用到它的节点数。</p>
      <table class="tb"><thead><tr><th>${area === 'idea' ? '思路' : '概念'}</th><th>英文</th><th>难度</th><th>节点</th></tr></thead><tbody>${cs.map(c => `<tr><td><a href="#/c/${c.key}"><b>${esc(c.name)}</b></a></td><td class="p">${esc(c.en || '')}</td><td class="k">${L.LEVEL[c.level] || ''}</td><td class="d">${c.n}</td></tr>`).join('')}</tbody></table>`, rail: ''};
  },
  async q(query) {
    const res = await L.search(query, 80), ns = res.filter(x => x.k === 'n').map(x => D.byId[x.id]); await L.brief(ns);
    const other = res.filter(x => x.k !== 'n' && x.k !== 't');
    return {title: '搜索：' + query, crumb: '搜索', html: `<h1>“${esc(query)}”<small>${res.length}条</small></h1>
      ${other.length ? `<h2>概念、专题、分支</h2><ul class="res">${other.slice(0, 12).map(x => `<li><em>${L.hitKind(x)}</em><a href="${L.hitHref(x)}"><b>${esc(x.t)}</b></a><span>${esc(x.s || '')}</span></li>`).join('')}</ul>` : ''}
      ${ns.length ? `<h2>节点<small>${ns.length}</small></h2>${table(ns.slice(0, 50), {track: 1})}` : '<p>没有找到节点。换个说法，或者用英文原名试试。</p>'}`, rail: ''};
  },
  async me() {
    const p = L.progress(), m = L.marks(), list = v => Object.keys(p).filter(i => p[i] === v && D.byId[i]).map(i => D.byId[i]);
    const read = list(2), doing = list(1), fav = Object.keys(m).filter(i => D.byId[i]).map(i => D.byId[i]); await L.brief([...read, ...doing, ...fav]);
    return {title: '我的进度', key: 'me', crumb: '我的进度', html: `<h1>我的进度</h1><p class="lead">已读${read.length}个，在读${doing.length}个，收藏${fav.length}个。记录只存在这个浏览器里。</p>
      ${doing.length ? `<h2>在读</h2>${table(doing, {track: 1})}` : ''}${fav.length ? `<h2>收藏</h2>${table(fav, {track: 1})}` : ''}${read.length ? `<h2>已读</h2>${table(read, {track: 1})}` : ''}
      <h2>各分支读了多少</h2><table class="tb"><tbody>${D.tracks.map(t => { const d = D.order[t.key].filter(i => p[i] === 2).length; return `<tr><td><a href="#/t/${t.key}">${esc(t.name)}</a></td><td class="d">${d} / ${t.count}</td><td class="barc"><i style="width:${d / t.count * 100}%"></i></td></tr>`; }).join('')}</tbody></table>`, rail: ''};
  },
};
let rt = 0;
async function route() {
  const my = ++rt, {seg} = L.parseHash(), view = pages[seg[0]] ? seg[0] : 'home';
  cur = {key: view === 'home' ? 'home' : seg.join('/')};
  let p; try { p = await pages[view](seg[1], seg[2]); } catch (e) { console.error(e); p = {html: `<h1>没有载入成功</h1><p>${esc(e.message)}</p>`}; }
  if (my !== rt) return;
  if (!p) p = {crumb: '', html: '<h1>没有找到这一页</h1><p><a href="#/">回总目录</a></p>'};
  if (p.key) cur.key = p.key;
  doc.className = 'doc ' + (p.cls || ''); doc.style.cssText = p.style || '';
  doc.innerHTML = `<article>${p.html}</article>`;
  rail.innerHTML = p.rail || ''; document.body.classList.toggle('norail', !p.rail);
  crumb.innerHTML = p.crumb || ''; document.title = (p.title ? p.title + ' · ' : '') + 'AI脉络手册';
  mark(); scrollTo(0, 0);
}
root.addEventListener('click', e => { const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); const el = document.getElementById(j.dataset.jump); el && el.scrollIntoView({behavior: 'smooth', block: 'start'}); } });
drawSide(); addEventListener('hashchange', route); route();
})();
