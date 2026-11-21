#!/usr/bin/env node
/* 搜索回归测试。用例在 data/search_tests.json，搜索代码就是站点用的 docs/assets/search.js，数据是构建出来的 docs/data/core.json 和 search.json。

   node scripts/search_test.mjs            跑全部用例，打印通过率和每条耗时
   node scripts/search_test.mjs -v         同时打印每条用例的前5个结果
   node scripts/search_test.mjs 'grpo'     看某个查询的前10个结果

   用例格式：{q, want: [id…], top: 3, kind: 'n'|'c'|'th'|'s'（可省）, none: true（期望没有像样的结果）, note}
   通过条件：want 里任意一个出现在前 top 个结果里；none 的用例要求没有得分≥40的非模糊结果。 */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = createRequire(import.meta.url)(join(root, 'docs/assets/search.js'));
const J = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const t0 = performance.now();
const s = S.create(J('docs/data/core.json'), J('docs/data/search.json'));
const build = performance.now() - t0;
const args = process.argv.slice(2), verbose = args.includes('-v'), adhoc = args.filter(a => a !== '-v');
const show = r => r.slice(0, verbose ? 5 : 10).map(x => `     ${x.fuzzy ? '≈' : x.partial ? '~' : ' '} ${x.k} ${x.id} | ${x.t} | ${Math.round(x.sc)}`).join('\n');
if (adhoc.length) { for (const q of adhoc) { const r = s.search(q, 50); console.log(`\n== ${q}（${r.length}）\n${show(r)}`); } process.exit(0); }
const cases = J('data/search_tests.json');
let pass = 0, slow = 0; const fails = [], times = [];
for (const c of cases) {
  const t = performance.now(), r = s.search(c.q, 200), ms = performance.now() - t;
  times.push(ms); if (ms > 50) slow++;
  let ok, got;
  if (c.none) { const strong = r.filter(x => !x.fuzzy && !x.partial && x.sc >= 40); ok = !strong.length; got = strong.slice(0, 3).map(x => x.id).join(', ') || '（无）'; }
  else { const top = r.filter(x => x.k !== 't').slice(0, c.top || 3); ok = top.some(x => c.want.includes(x.id) && (!c.kind || x.k === c.kind)); got = top.map(x => x.id).join(', ') || '（无）'; }
  if (ok) pass++; else fails.push(c);
  if (verbose || !ok) console.log(`${ok ? '  ok ' : 'FAIL '} ${c.q.padEnd(34)} ${ms.toFixed(1).padStart(6)}ms  → ${got}${ok ? '' : `   期望 ${c.none ? '没有结果' : c.want.join(' / ')}${c.note ? '（' + c.note + '）' : ''}`}`);
  if (verbose) console.log(show(r));
}
times.sort((a, b) => a - b);
console.log(`\n${pass} / ${cases.length} 通过（${(pass / cases.length * 100).toFixed(1)}%）。建索引 ${build.toFixed(0)}ms，共 ${s.size} 条；单次查询中位数 ${times[times.length >> 1].toFixed(1)}ms，最慢 ${times.at(-1).toFixed(1)}ms，超过50ms的 ${slow} 条。`);
process.exit(fails.length ? 1 : 0);
