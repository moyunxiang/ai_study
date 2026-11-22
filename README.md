# AI脉络

一张可探索的AI研究发展地图：<https://moyunxiang.com/ai_study/>

从1943年到今天，AI研究的各个方向是怎样一步步走过来的：每个阶段在解决什么问题，重要的方法为什么出现、怎么工作，又引出了哪些后来的工作。写给会编程、学过大一数学、但不一定读过论文的中文读者。

内容按“6个大方向 › 16条分支 › 190条主题线 › 约3300个节点”组织，节点包括论文、模型、系统、芯片、数据集和关键事件，彼此用“改进 / 延续 / 使用 / 竞争”四种关系连起来。另有206个基础概念、264个研究思路、10篇研究专题和16张机制示意图。

## 能做什么

- **开始学习**：14站入门路线；10篇围绕一个问题的研究专题（Transformer为什么出现、大语言模型是怎么训练出来的、从PPO到GRPO……）；69个节点的完整主干路线。
- **从零读到它**：任何一篇论文、一个模型、一个概念，都能搜到并得到一条从头读到它的路线（先补哪些概念，再按什么顺序读哪些工作）。
- **领域地图**：一棵按时间生长的演化树，默认只显示16条分支和主干节点，点分支名展开成主题线，点节点看它的前驱和后续；另有内容相同的列表版。
- **时间线**：九个时代，每个时代的条件、在攻克的问题和那几年的工作。
- **知识索引**：基础概念、研究思路、机制图、术语表。
- **搜索**：认名字、英文原题、缩写和别名、作者、机构；中英文叫法互通；能纠正常见的拼写错误；同名或同缩写时并列给出。
- **学习记录**：进度、收藏、笔记，只保存在浏览器本地，可导出导入。
- **静态页面**：每个节点、概念、专题都有一个不运行脚本也能读的页面（如 <https://moyunxiang.com/ai_study/n/transformer.html>），用于分享和搜索引擎收录。

## 内容能信到什么程度

讲解、关系、概念词条和专题都由AI模型撰写。每个节点标有审核状态：

- **人工复核**：真人核实过。目前0个。
- **来源已核对**：由AI模型实际打开原始来源逐项对照、改正并留下记录，未经人工复核。覆盖全部主干节点、入门路线和专题用到的节点，以及一批2024–2026年的重要节点，共一百多个。
- **待核对**：其余全部节点和全部概念词条，可能有错。

详见 <https://moyunxiang.com/ai_study/about.html>。发现错误请提issue，或用每个节点页底部的“报告错误”。引用前请以原文为准。

## 目录

```
data/tracks.json, eras.json      分支与时代
data/tree.json                   6个大方向、分支之间的分叉、跨分支借用
data/skeleton/*.txt              节点登记表：id | date | tier | kind | title | full | parents
data/content/<track>/<id>.json   每个节点的讲解
data/threads/<track>.json        每条分支的主题线，以及每个节点属于哪条
data/concepts.txt, concepts/     基础概念的登记与词条；concepts.aka.json 是别名和出处
data/ideas/, data/aliases/       研究思路；节点的别名和缩写（搜索用）
data/review/<id>.json            来源核对记录（没有记录的节点一律显示“待核对”）
data/stories/<key>.json          研究专题
data/routes.json                 入门路线和按问题进入的入口
data/figures/<key>.svg + .json   机制图
data/search_tests.json           搜索回归用例
data/_audit/                     审计报告（scripts/audit.py 生成）
guide/                           内容规范：census 普查、content 讲解、threads 主题线、hot 补录、
                                 review 来源核对、stories 专题、figures 机制图
scripts/build.py                 校验并生成 docs/data/ 和全部静态页面（static_pages.py）
scripts/audit.py                 内容审计：待核对的优先顺序、说得过满的措辞、重复、出处、时间冲突
scripts/search_test.mjs          搜索回归测试
scripts/browse.mjs               用本机Chrome截图、查报错、量加载数据量
scripts/xbrowser.mjs             Chrome / WebKit / Firefox 三个内核的回归测试（需要Playwright）
scripts/figshot.py               把一张机制图渲染成图片，目检用
docs/                            站点（GitHub Pages从这里发布）
docs/assets/                     app.js（页面与演化树）、search.js（搜索）、style.css
docs/data/                       构建生成的数据，首屏只取 core.json，其余按需
docs/n/, c/, s/, t/, *.html      构建生成的静态页面和 sitemap.xml
docs/design.html, docs/design/   设计说明页和截图；页里 <b data-stat="…"> 的数字每次构建重写
archive/design-v1/               2026-11视觉升级之前的设计存档（样式表、脚本、设计说明、截图），不参与构建和部署；同一时刻的整站另有 git 标签 design-v1
```

## 本地运行

```
python3 scripts/build.py --check --stats   # 只校验
python3 scripts/build.py                   # 生成 docs/data/ 和静态页面
python3 -m http.server 8791 -d docs        # 打开 http://127.0.0.1:8791/
python3 scripts/audit.py                   # 审计报告写到 data/_audit/
node scripts/search_test.mjs               # 搜索回归（先构建）
node scripts/browse.mjs --route '#/n/transformer' --w 390 --h 844 --shot a.png
PW_DIR=<装了playwright的目录> node scripts/xbrowser.mjs
```

## 改内容的流程

1. 改 `data/` 下的源文件（规范在 `guide/`）。
2. `python3 scripts/build.py`，必须0错误。
3. 改了搜索相关的别名或规则，跑 `node scripts/search_test.mjs`。
4. 改了页面，跑 `scripts/xbrowser.mjs` 或至少用 `scripts/browse.mjs` 看一眼手机宽度。
5. 改了结构、页面、搜索规则或视觉，同步改 `docs/design.html`。

新写的内容默认是“待核对”。要升级成“来源已核对”，按 `guide/review.md` 核对并写 `data/review/<id>.json`；“人工复核”只能由 `data/review/_humans.json` 里登记的人写。
