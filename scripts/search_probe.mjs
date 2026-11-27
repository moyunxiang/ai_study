#!/usr/bin/env node
/* 批量探测：一批查询词里，哪些在站内搜不到。

   node scripts/search_probe.mjs <查询词文件> [--all]
   node scripts/search_probe.mjs - <<< $'wmpo\ngrpo'        从标准输入读

   查询词文件一行一个（# 开头的行和空行跳过）。搜索代码就是站点用的 docs/assets/search.js，数据是最近一次构建出来的
   docs/data/core.json 和 search.json——构建之后才登记的节点这里看不到，还要另外 grep data/skeleton/ 确认。
   每行输出：状态 <TAB> 查询词 <TAB> 最好的三个结果（得分 类型:id 标题）
     MISS  没有任何像样的结果（没有得分≥40的非模糊结果）
     WEAK  有结果，但没有得分≥92的精确命中——多半是只搜到了沾边的东西，要人看
     HIT   有得分≥92的精确命中。注意：命中的可能不是你要的那个东西（比如搜缩写，命中了另一个同名条目），要看一眼标题
   类型：n 节点 / c 概念或研究思路 / th 主题线 / s 专题 / t 术语。默认不打印 HIT，加 --all 全部打印。最后一行是统计。 */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = createRequire(import.meta.url)(join(root, 'docs/assets/search.js'));
const J = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const args = process.argv.slice(2), all = args.includes('--all'), file = args.find(a => a !== '--all');
if (!file) { console.error('用法：node scripts/search_probe.mjs <查询词文件|-> [--all]'); process.exit(2); }
const s = S.create(J('docs/data/core.json'), J('docs/data/search.json'));
const qs = readFileSync(file === '-' ? 0 : file, 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'));
const n = {HIT: 0, WEAK: 0, MISS: 0};
for (const q of qs) {
  const r = s.search(q, 20), exact = r.filter(x => !x.fuzzy && !x.partial);
  const st = exact.some(x => x.sc >= 92) ? 'HIT' : exact.some(x => x.sc >= 40) ? 'WEAK' : 'MISS';
  n[st]++;
  if (st !== 'HIT' || all) console.log([st, q, r.slice(0, 3).map(x => `${Math.round(x.sc)}${x.fuzzy ? '≈' : x.partial ? '~' : ''} ${x.k}:${x.id} ${x.t}`).join(' ; ') || '—'].join('\t'));
}
console.log(`\n共${qs.length}个查询：HIT ${n.HIT}、WEAK ${n.WEAK}、MISS ${n.MISS}`);
