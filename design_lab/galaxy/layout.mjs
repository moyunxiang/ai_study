// 星图的布局（只在改了数据之后重算）：node design_lab/galaxy/layout.mjs
// 有关系的两个节点互相拉近，所有节点互相推开，同一条分支、同一条主题线的略微聚拢。
// 结果写到 layout.json：按 core.N 的顺序排的 [x,y,x,y,…]，整数。初始位置用固定种子，重跑结果相同。
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const core = JSON.parse(fs.readFileSync(new URL('docs/data/core.json', root)));
const N = core.N, E = core.E, n = N.length, x = new Float64Array(n), y = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n);
let seed = 20261123; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const order = core.groups.flatMap(g => g.tracks), slot = core.tracks.map(t => order.indexOf(t.key)), nT = core.tracks.length;
const thKey = {}, th = new Int32Array(n); let nTh = 0;
for (let i = 0; i < n; i++) { const k = N[i][5] + '/' + N[i][6]; if (thKey[k] == null) thKey[k] = nTh++; th[i] = thKey[k];
  const a = slot[N[i][5]] / nT * Math.PI * 2 - Math.PI / 2, r = 250 * Math.sqrt(rnd()), b = rnd() * Math.PI * 2; x[i] = Math.cos(a) * 1100 + Math.cos(b) * r; y[i] = Math.sin(a) * 1100 + Math.sin(b) * r; }
const K = 30, K2 = K * K, IT = 420, cT = new Float64Array(nT * 3), cH = new Float64Array(nTh * 3);
for (let it = 0; it < IT; it++) {
  const temp = 60 * Math.pow(1 - it / IT, 1.5) + .5; fx.fill(0); fy.fill(0); cT.fill(0); cH.fill(0);
  for (let i = 0; i < n; i++) { const xi = x[i], yi = y[i]; let ax = 0, ay = 0;
    for (let j = i + 1; j < n; j++) { const dx = xi - x[j], dy = yi - y[j], f = K2 / (dx * dx + dy * dy + 4); ax += dx * f; ay += dy * f; fx[j] -= dx * f; fy[j] -= dy * f; }
    fx[i] += ax; fy[i] += ay; }
  for (const e of E) { const a = e[0], b = e[1], dx = x[a] - x[b], dy = y[a] - y[b], d = Math.sqrt(dx * dx + dy * dy) + .01, f = d / K * (N[a][5] === N[b][5] ? 1 : .55); fx[a] -= dx * f; fy[a] -= dy * f; fx[b] += dx * f; fy[b] += dy * f; }
  for (let i = 0; i < n; i++) { const t = N[i][5] * 3, h = th[i] * 3; cT[t] += x[i]; cT[t + 1] += y[i]; cT[t + 2]++; cH[h] += x[i]; cH[h + 1] += y[i]; cH[h + 2]++; }
  for (let i = 0; i < n; i++) { const t = N[i][5] * 3, h = th[i] * 3;
    fx[i] += (cT[t] / cT[t + 2] - x[i]) * .5 + (cH[h] / cH[h + 2] - x[i]) * 1.6 - x[i] * .12;
    fy[i] += (cT[t + 1] / cT[t + 2] - y[i]) * .5 + (cH[h + 1] / cH[h + 2] - y[i]) * 1.6 - y[i] * .12;
    const d = Math.hypot(fx[i], fy[i]) + 1e-9, s = Math.min(d, temp) / d; x[i] += fx[i] * s; y[i] += fy[i] * s; }
}
let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i] / n; my += y[i] / n; }
const out = []; for (let i = 0; i < n; i++) out.push(Math.round(x[i] - mx), Math.round(y[i] - my));
fs.writeFileSync(new URL('layout.json', import.meta.url), JSON.stringify(out));
let r = 0; for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(out[2 * i], out[2 * i + 1])); console.log('节点', n, '最大半径', Math.round(r));
