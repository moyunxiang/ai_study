#!/usr/bin/env node
/* 正文里反复提到、但搜索找不到对应条目的名字。用来发现“该有别名或该收录、却搜不到”的东西（评测集、数据集、模型版本、方法名）。

   node scripts/search_gaps.mjs [最少出现在几篇讲解里，默认3]     结果写到 data/_audit/search_gaps.tsv（篇数、名字、目前搜它得到的最好结果）

   做法：从每篇讲解的正文里取出英文名字（去掉[[链接]]、代码和网址），统计各出现在多少篇里；
   对每个名字跑一遍站内搜索，没有得分≥92的精确结果就列出来。列表里会混着机构、媒体、编程语言这类不属于本站主题的词，需要人或agent筛。 */
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), min = +(process.argv[2] || 5);
const M = require(root + '/docs/assets/search.js');
const core = JSON.parse(readFileSync(root + '/docs/data/core.json')), sd = JSON.parse(readFileSync(root + '/docs/data/search.json'));
const s = (M.create || M.AIMapSearch.create)(core, sd);
const cnt = new Map();
const re = /[A-Za-z][A-Za-z0-9]*(?:[-+.'][A-Za-z0-9]+)*\+?(?: (?:[A-Z0-9][A-Za-z0-9]*(?:[-+.][A-Za-z0-9]+)*))?/g;
for (const tr of readdirSync(root + '/data/content')) { let fs; try { fs = readdirSync(root + '/data/content/' + tr); } catch { continue; }
  for (const f of fs) if (f.endsWith('.json')) { const c = JSON.parse(readFileSync(`${root}/data/content/${tr}/${f}`));
    const txt = [c.problem, c.idea, c.impact, c.background, c.method, c.results, c.legacy, (c.limits || []).map(l => l.text).join('\n')].join('\n').replace(/\[\[[^\]]*\]\]/g, ' ').replace(/`[^`]*`/g, ' ').replace(/https?:\S+/g, ' ');
    const seen = new Set();
    for (const m of txt.match(re) || []) { if (m.length < 3 || /^[a-z]+$/.test(m)) continue; const k = m; if (seen.has(k)) continue; seen.add(k); cnt.set(k, (cnt.get(k) || 0) + 1); } } }
const out = [];
for (const [name, n] of cnt) { if (n < min) continue; const r = s.search(name, 3).filter(x => !x.fuzzy && !x.partial); const best = r[0]; if (best && best.sc >= 92) continue; out.push([n, name, best ? `${best.sc|0} ${best.k}:${best.t}` : '—']); }
out.sort((a, b) => b[0] - a[0]);
writeFileSync(root + '/data/_audit/search_gaps.tsv', '篇数\t名字\t目前最好的结果\n' + out.map(o => o.join('\t')).join('\n') + '\n');
console.log(`${out.length} 个名字，写到 data/_audit/search_gaps.tsv`);
