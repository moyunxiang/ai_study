/* 画布舞台：拖动、滚轮和双指缩放、飞到某处、点选、悬停提示、标签避让。只管手势和坐标，画什么由各设计自己决定。
   用法：const S = Lab.stage(canvas, {bounds:[x0,y0,x1,y1], draw(ctx,S), inset:()=>({l,r,t,b}), pick(n), tip:元素, min, max})
   节点的世界坐标放在 n.px / n.py；draw 里用 S.put(n, 半径, 可点) 记下屏幕位置，点选和标签靠它。 */
Lab.stage = (cv, o) => {
  const ctx = cv.getContext('2d'), D = Lab.D, B = o.bounds, S = {ctx, view: {z: .1, x: 0, y: 0}, W: 0, H: 0, fitZ: .1, dpr: 1, zr: 1};
  const ins = () => Object.assign({l: 0, r: 0, t: 0, b: 0}, o.inset && o.inset());
  let raf = 0, fly = null;
  S.X = v => v * S.view.z + S.view.x; S.Y = v => v * S.view.z + S.view.y;
  S.req = () => { raf ||= requestAnimationFrame(() => { raf = 0; if (fly) { fly(); S.req(); } S.zr = S.view.z / S.fitZ; ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); o.draw(ctx, S); }); };
  S.box = (x0, y0, x1, y1, maxRel = 7, pad = 150) => { const i = ins(), vw = S.W - i.l - i.r, vh = S.H - i.t - i.b, z = Math.min(S.fitZ * maxRel, (vw - pad) / Math.max(60, x1 - x0), (vh - pad) / Math.max(60, y1 - y0)); return {z, x: i.l + vw / 2 - (x0 + x1) / 2 * z, y: i.t + vh / 2 - (y0 + y1) / 2 * z}; };
  S.target = (ids, maxRel) => {
    if (!ids || !ids.length) return S.box(B[0], B[1], B[2], B[3], 1, 0);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const i of ids) { const n = D.byId[i]; if (!n || n.px == null) continue; x0 = Math.min(x0, n.px); x1 = Math.max(x1, n.px); y0 = Math.min(y0, n.py); y1 = Math.max(y1, n.py); }
    return x0 > x1 ? S.box(B[0], B[1], B[2], B[3], 1, 0) : S.box(x0, y0, x1, y1, maxRel);
  };
  S.resize = () => { const r = cv.getBoundingClientRect(), i = ins(); S.dpr = Math.min(2, devicePixelRatio || 1); S.W = r.width; S.H = r.height; S.ox = r.left; S.oy = r.top; cv.width = S.W * S.dpr; cv.height = S.H * S.dpr;
    S.fitZ = Math.min((S.W - i.l - i.r) / (B[2] - B[0]), (S.H - i.t - i.b) / (B[3] - B[1])); S.req(); };
  S.go = (t, ms = 520) => { const a = {...S.view}, t0 = performance.now(), v = S.view; fly = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3); v.z = Math.exp(Math.log(a.z) + (Math.log(t.z) - Math.log(a.z)) * e); const f = Math.abs(t.z - a.z) < 1e-9 ? e : (v.z - a.z) / (t.z - a.z); v.x = a.x + (t.x - a.x) * f; v.y = a.y + (t.y - a.y) * f; if (k >= 1) fly = null; }; S.req(); };
  S.zoomAt = (sx, sy, f) => { fly = null; const v = S.view, nz = Math.max(S.fitZ * (o.min || .7), Math.min(S.fitZ * (o.max || 22), v.z * f)); v.x = sx - (sx - v.x) * nz / v.z; v.y = sy - (sy - v.y) * nz / v.z; v.z = nz; S.req(); };
  const mid = () => { const i = ins(); return [i.l + (S.W - i.l - i.r) / 2, i.t + (S.H - i.t - i.b) / 2]; };
  S.zoomBy = f => S.zoomAt(...mid(), f);
  S.center = (n, minRel = 3.4) => { const [cx, cy] = mid(), z = Math.max(S.view.z, S.fitZ * minRel); S.go({z, x: cx - n.px * z, y: cy - n.py * z}); };
  S.put = (n, r, vis) => { n.sx = S.X(n.px); n.sy = S.Y(n.py); n.sr = r; n.vis = vis; };
  S.seen = (n, m = 30) => { const x = S.X(n.px), y = S.Y(n.py); return x > -m - 240 && x < S.W + m && y > -m && y < S.H + m; };

  /* 标签：按优先级一个个放，同一行上撞到已经放下的就不画 */
  const lw = {};
  S.labels = (cand, q) => {
    const rows = {}, hit = (a, b, row) => { for (let k = row - 1; k <= row + 1; k++) for (const [c, d] of rows[k] || []) if (a < d && b > c) return true; return false; };
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const [pr, n] of cand.sort((a, b) => a[0] - b[0] || a[1].t - b[1].t)) {
      const font = q.font(n, pr), k = n.id + font; if (lw[k] == null) { ctx.font = font; lw[k] = ctx.measureText(n.title).width; }
      const w = lw[k], x0 = n.sx + n.sr + (q.gap || 5), y = n.sy + (q.dy || 0), row = Math.round(y / 9);
      if (pr > 0 && hit(x0 - 3, x0 + w + 6, row)) continue; (rows[row] ||= []).push([x0 - 3, x0 + w + 6]);
      ctx.font = font; if (q.halo) { ctx.lineWidth = q.haloW || 3.5; ctx.strokeStyle = q.halo; ctx.strokeText(n.title, x0, y); } ctx.fillStyle = q.ink(n, pr); ctx.fillText(n.title, x0, y);
    }
  };

  /* 手势 */
  const ptrs = new Map(); let moved = 0, pinch = null;
  const nodeAt = (x, y) => { let best = null; for (const n of D.nodes) { if (!n.vis || n.sx == null) continue; const d = (n.sx - x) ** 2 + (n.sy - y) ** 2; if (d < 225 + n.sr * n.sr && d - (3 - n.tier) * 30 < (best ? best.d : 1e9)) best = {n, d: d - (3 - n.tier) * 30}; } return best && best.n; };
  const loc = e => [e.clientX - S.ox, e.clientY - S.oy];
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, loc(e)); moved = 0; fly = null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId), [x, y] = loc(e);
    if (!p) { const n = nodeAt(x, y); cv.style.cursor = n ? 'pointer' : 'grab'; if (o.tip) { o.tip.hidden = !n; if (n) { o.tip.innerHTML = `<b>${Lab.esc(n.title)}</b><span>${Lab.fmt(n.date)} · ${Lab.esc(D.trackBy[n.track].name)} · ${Lab.TIER[n.tier]}</span>`; o.tip.style.left = Math.min(innerWidth - 250, e.clientX + 14) + 'px'; o.tip.style.top = e.clientY + 16 + 'px'; } } return; }
    if (ptrs.size === 1) { S.view.x += x - p[0]; S.view.y += y - p[1]; moved += Math.abs(x - p[0]) + Math.abs(y - p[1]); }
    ptrs.set(e.pointerId, [x, y]);
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); S.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; moved = 99; }
    S.req();
  });
  const up = e => { const was = ptrs.size; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (was === 1 && moved < 6 && e.type === 'pointerup') { const n = nodeAt(...loc(e)); if (n) o.pick ? o.pick(n) : (location.hash = '#/n/' + Lab.enc(n.id)); else if (o.miss) o.miss(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); S.zoomAt(...loc(e), Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0016))); }, {passive: false});
  addEventListener('resize', S.resize);
  Lab.S = S;      // 留给调试和检查脚本用
  return S;
};
