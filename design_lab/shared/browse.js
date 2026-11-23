/* 列表的数据：路线、分支、年代、概念、我的、搜索结果，各自有哪些条目、该在图上点亮哪些节点。
   只给数据，不给版式：{title, lead, fine, more:[标题,html], back:[href,文字], groups:[{h, items:[{href,label,sub,r,t,no,id}]}],
   focus:Set, path:[id…], era:[from,to], track, thread, route}。首页由各设计自己写，这里返回 null。 */
Lab.browse = async (p, key, sub) => {
  const L = Lab, D = L.D, N = i => D.byId[i], nd = (n, x) => ({href: '#/n/' + L.enc(n.id), label: n.title, t: n.track, r: n.y, id: n.id, tier: n.tier, ...x});
  const m = {p, key, sub, groups: [], focus: null, path: null, era: null, track: null, thread: null};
  if (p === 's' && !key) { m.title = '路线与专题'; m.lead = '每条路线是一串按顺序读的节点，在图上连成一条线。'; m.groups = [{items: L.routeList().map(r => ({href: '#/s/' + r.key, label: r.title, sub: r.question, r: r.n + '站'}))}]; }
  else if (p === 's') { const r = await L.route(key); if (!r) return null; const steps = r.steps.filter(s => N(s.node));
    Object.assign(m, {route: r, path: steps.map(s => s.node), back: ['#/s', '全部路线'], title: r.title, lead: r.question, more: ['这条路线讲什么', L.rich(r.intro)], groups: [{items: steps.map((s, i) => nd(N(s.node), {no: i + 1, sub: s.h}))}]}); m.focus = new Set(m.path); }
  else if (p === 't' && !key) { m.title = '六个大方向，十六条分支'; m.groups = D.groups.map(g => ({h: g.name, items: g.tracks.map(k => ({href: '#/t/' + k, label: D.trackBy[k].name, t: k, r: D.trackBy[k].count}))})); }
  else if (p === 't') { const t = D.trackBy[key], th = t && sub && D.thBy[key][sub]; if (!t) return null;
    Object.assign(m, {track: key, thread: th || null, focus: new Set(th ? th.ids : D.order[key]), back: th ? ['#/t/' + key, t.name] : ['#/t', '全部分支'], title: th ? th.name : t.name, lead: th ? th.blurb : t.question});
    if (th) { m.fine = `列出的是主干和重要节点；这条主题线共${th.ids.length}个节点，都亮在图上。`; m.groups = [{items: th.ids.map(N).filter(n => n.tier <= 2).map(n => nd(n))}]; }
    else { m.fine = (D.forks[key] || {}).why || ''; m.groups = [{h: '主题线', items: D.threads[key].map(x => ({href: `#/t/${key}/${x.key}`, label: x.name, t: key, r: x.ids.length, sub: `${x.first.slice(0, 4)}–${x.last.slice(0, 4)}`}))}]; } }
  else if (p === 'e' && !key) { m.title = '九个年代'; m.groups = [{items: D.eras.map(e => ({href: '#/e/' + e.id, label: e.name, sub: e.tagline, r: `${e.from}–${String(e.to).slice(2)}`}))}]; }
  else if (p === 'e') { const e = D.eras.find(x => x.id === key); if (!e) return null; const ns = D.nodes.filter(n => n.y >= (e === D.eras[0] ? 0 : e.from) && n.y <= e.to);
    Object.assign(m, {era: [e.from, e.to], focus: new Set(ns.map(n => n.id)), back: ['#/e', '全部年代'], title: e.name, lead: e.tagline, fine: `${e.from}–${e.to} · ${ns.length}个节点`, more: ['这个年代的背景', `<p>${L.esc(e.context)}</p>`], groups: [{h: '主干节点', items: ns.filter(n => n.tier === 1).sort((a, b) => a.t - b.t).map(n => nd(n))}]}); }
  else if (p === 'idx' && !key) { m.title = '概念，按领域'; m.groups = [{items: Object.entries(L.AREA).map(([k, n]) => ({href: '#/idx/' + k, label: n, r: Object.values(D.concepts).filter(c => c.area === k).length}))}]; }
  else if (p === 'idx') { m.back = ['#/idx', '全部领域']; m.title = L.AREA[key] || ''; m.groups = [{items: Object.values(D.concepts).filter(c => c.area === key).sort((a, b) => a.level - b.level || b.n - a.n).map(c => ({href: '#/c/' + c.key, label: c.name, sub: L.LEVEL[c.level], r: c.n, ck: c.key}))}]; }
  else if (p === 'me') { const pg = L.progress(), mk = L.marks(), ls = {doing: ['在读', Object.keys(pg).filter(i => pg[i] === 1)], fav: ['收藏', Object.keys(mk)], read: ['已读', Object.keys(pg).filter(i => pg[i] === 2)]}, cur = ls[key];
    if (cur) { const ids = cur[1].filter(N); m.focus = new Set(ids); m.back = ['#/me', '我的']; m.title = cur[0]; m.groups = [{items: ids.map(i => nd(N(i)))}]; m.empty = '还没有'; }
    else { m.title = '我的进度'; m.fine = '学习状态和收藏只存在这个浏览器里。'; m.groups = [{items: Object.entries(ls).map(([k, [n, ids]]) => ({href: '#/me/' + k, label: n, r: ids.filter(N).length}))}]; } }
  else if (p === 'q') { const res = (await L.search(key, 40)).filter(x => x.k !== 't'), ids = res.filter(x => x.k === 'n').map(x => x.id);
    m.title = `“${key}”`; m.fine = `${res.length}条结果`; m.focus = ids.length ? new Set(ids) : null; m.empty = '没有找到';
    m.groups = [{items: res.map(x => x.k === 'n' ? nd(N(x.id)) : {href: L.hitHref(x), label: x.t, sub: L.hitKind(x)})}]; }
  else return null;
  return m;
};
/* 搜索框：边打边出前几条，回车看全部 */
Lab.finder = (q, hits, all = '在图上点亮全部结果 ↵') => {
  const L = Lab;
  q.addEventListener('input', async () => { const v = q.value.trim(); if (!v) { hits.hidden = true; return; } const res = (await L.search(v, 12)).filter(x => x.k !== 't').slice(0, 8); if (q.value.trim() !== v) return; hits.hidden = false;
    hits.innerHTML = res.map(x => `<li><a href="${L.hitHref(x)}"><em>${x.k === 'n' ? x.date.slice(0, 4) : L.hitKind(x)}</em><b>${L.esc(x.t)}</b></a></li>`).join('') + `<li><a class="all" href="#/q/${L.enc(v)}">${all}</a></li>`; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) { location.hash = '#/q/' + L.enc(q.value.trim()); hits.hidden = true; q.blur(); } if (e.key === 'Escape') { hits.hidden = true; q.blur(); } });
  document.addEventListener('click', e => { if (e.target !== q && !hits.contains(e.target) || e.target.closest('a')) hits.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
};
/* 读一个节点或概念时放进讲解栏的HTML；step 是路线里这一站的说明 */
Lab.reading = async (st, route) => {
  const L = Lab;
  if (st.sel) { const x = await L.node(st.sel), step = route && route.steps.find(s => s.node === st.sel);
    return {x, title: x.n.title, html: `<article class="hue" style="${L.hv(x.n.track)}">${step ? `<div class="stepnote"><b>这一站：${L.esc(step.h)}</b>${L.rich(step.text)}</div>` : ''}${x.parts.article}<div class="a-rel">${x.parts.relations}</div><div class="a-body">${x.parts.tail}</div></article>`}; }
  if (st.concept) { const x = await L.conceptHTML(st.concept); return x && {x, title: x.c.name, nodes: x.nodes, html: `<article>${x.html}</article>`}; }
  return null;
};
/* 列表的骨架HTML（样式由各设计自己写）。st.sel / st.concept 用来标出当前这一条 */
Lab.listHTML = (m, st = {}) => {
  const L = Lab, e = L.esc, item = x => `<li><a href="${x.href}" class="${(x.id && x.id === st.sel) || (x.ck && x.ck === st.concept) ? 'on' : ''}${x.t ? ' hue' : ''}"${x.t ? ` style="${L.hv(x.t)}"` : ''}>${x.no ? `<i class="no">${x.no}</i>` : x.t ? '<i class="dot"></i>' : ''}<span>${e(x.label)}${x.sub ? `<small>${e(x.sub)}</small>` : ''}</span>${x.r != null ? `<em>${x.r}</em>` : ''}</a></li>`;
  return `${m.back ? `<a class="back" href="${m.back[0]}">‹ ${e(m.back[1])}</a>` : ''}<h2${m.track ? ` class="hue" style="${L.hv(m.track)}"` : ''}>${e(m.title)}</h2>${m.lead ? `<p class="lead">${e(m.lead)}</p>` : ''}${m.fine ? `<p class="fine">${e(m.fine)}</p>` : ''}`
    + m.groups.map(g => `${g.h ? `<h6>${e(g.h)}</h6>` : ''}<ul>${g.items.map(item).join('') || `<li class="none">${m.empty || '暂无'}</li>`}</ul>`).join('')
    + (m.more ? `<details><summary>${m.more[0]}</summary><div class="a-body">${m.more[1]}</div></details>` : '');
};
/* 地址 → 状态：st.sel 选中的节点，st.concept 概念，st.panel/key/sub 列表，st.m 列表数据，st.focus 图上该亮的节点。
   每次地址变了调 render({m, read, moved})：read 是讲解（没有则为 null），moved 表示列表换了、图该重新取景 */
Lab.nav = (st, render) => {
  const L = Lab, D = L.D; let rt = 0, last = '';
  const run = async () => {
    const my = ++rt, [v, a, b] = L.parseHash().seg;
    if (v === 'n' && D.byId[a]) { st.sel = a; st.concept = null; }
    else if (v === 'c' && D.concepts[a]) { st.concept = a; st.sel = null; if (st.panel !== 'idx') { st.panel = 'idx'; st.key = D.concepts[a].area; st.sub = null; } }
    else { st.sel = null; st.concept = null; st.panel = ['s', 't', 'e', 'idx', 'me', 'q'].includes(v) ? v : 'home'; st.key = a || null; st.sub = b || null; }
    const m = st.panel === 'home' ? null : await L.browse(st.panel, st.key, st.sub); if (my !== rt) return;
    const read = await L.reading(st, m && m.route); if (my !== rt) return;
    st.m = m; st.close = st.concept ? '#/idx/' + D.concepts[st.concept].area : st.panel === 'home' ? '#/' : '#/' + [st.panel, st.key, st.sub].filter(Boolean).map(L.enc).join('/');
    st.focus = st.sel ? new Set([st.sel, ...D.inn[st.sel].map(e => e.from), ...D.out[st.sel].map(e => e.to), ...(m && m.path || [])]) : read && read.nodes ? new Set(read.nodes) : m ? m.focus : null;
    document.title = (read ? read.title + ' · ' : '') + 'AI脉络';
    const pk = [st.panel, st.key, st.sub].join('/'); render({m, read, moved: pk !== last}); last = pk;
  };
  addEventListener('hashchange', run); return run;
};
/* 选中节点时要画的关系：前驱和后续各取最重要的 cap 条 */
Lab.nearby = (id, cap = 26) => { const D = Lab.D, s = D.byId[id], top = (es, k) => es.map(e => D.byId[e[k]]).sort((a, b) => a.tier - b.tier || Math.abs(a.t - s.t) - Math.abs(b.t - s.t)).slice(0, cap); return {s, before: top(D.inn[id], 'from'), after: top(D.out[id], 'to')}; };
