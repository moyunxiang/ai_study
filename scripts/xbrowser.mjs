#!/usr/bin/env node
/* 跨浏览器回归测试：Chromium（本机Chrome）、WebKit（Safari的内核）、Firefox × 手机/平板/桌面三种宽度。
   需要 Playwright（不是本项目的依赖，装在别处，用环境变量指过去）：

     mkdir /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright && npx playwright install webkit firefox
     PW_DIR=/tmp/pw node scripts/xbrowser.mjs [--base http://127.0.0.1:8791/] [--only webkit] [--shots 目录]

   每个浏览器做两件事：
   1. 把主要页面在 390 / 768 / 1440 三种宽度下各打开一遍，检查有没有脚本报错、有没有整页横向溢出、有没有卡在“正在载入”。
   2. 走一遍主要功能：搜索→读讲解→前后关系→从零读到它→专题→演化树展开和选中→学习状态、收藏、笔记→导入→主题切换→静态页。 */
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const BASE = arg('base') || 'http://127.0.0.1:8791/', only = arg('only'), shots = arg('shots');
const pw = createRequire(join(process.env.PW_DIR || process.cwd(), 'x.js'))('playwright');
if (shots) mkdirSync(shots, {recursive: true});

const ROUTES = ['#/', '#/learn', '#/story/why-transformer', '#/from/deepseek-r1', '#/from/c/self-attention', '#/timeline', '#/era/e6', '#/year/2017', '#/map?view=tree', '#/map?view=list', '#/map?focus=transformer&view=tree',
  '#/track/llm', '#/track/llm?th=arch', '#/n/transformer', '#/n/ddpm', '#/index', '#/c/self-attention', '#/c/on-policy-self-distillation', '#/search', '#/search?q=transformer', '#/search?q=tranformer', '#/search?q=zzzqqqxx&full=0',
  '#/me', '#/tools', '#/link/perceptron/transformer', '#/stats', '#/orgs', '#/n/no-such-node', 'n/transformer.html', 'c/self-attention.html', 's/why-transformer.html', 't/llm.html', 'start.html', 'timeline.html', 'fields.html', 'glossary.html', 'about.html', 'design.html'];
const SIZES = [[390, 844], [768, 1024], [1440, 900]];
const url = r => r.startsWith('#') ? BASE + 'index.html' + r : BASE + r;
const results = [];
const note = (browser, what, ok, detail = '') => { results.push({browser, what, ok, detail}); if (!ok) console.log(`  ✗ [${browser}] ${what} ${detail}`); };

async function ready(page) {
  await page.waitForFunction(() => document.readyState === 'complete' && !document.querySelector('#app .loading') && (!document.querySelector('#app') || document.querySelector('#app').children.length > 0), null, {timeout: 20000});
  await page.waitForTimeout(250);
}

async function sweep(name, browser) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 1});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + (m.location().url || ''))) errs.push((m.text() + ' ' + (m.location().url || '')).slice(0, 240)); });
    for (const r of ROUTES) {
      errs.length = 0;
      try {
        await page.goto(url(r), {waitUntil: 'load'}); await ready(page);
        if (errs.some(e => /ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|NetworkError|Load failed/.test(e))) { errs.length = 0; await page.waitForTimeout(500); await page.reload({waitUntil: 'load'}); await ready(page); }      // 本地预览服务器偶尔断连，重试一次
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const empty = await page.evaluate(() => (document.querySelector('#app') || document.querySelector('main')).innerText.trim().length < 20);
        note(name, `${w}px ${r}`, !errs.length && over <= 1 && !empty, [errs.length ? '报错: ' + errs.join(' | ') : '', over > 1 ? `横向溢出${over}px` : '', empty ? '页面是空的' : ''].filter(Boolean).join('；'));
        if (shots && ['#/', '#/n/transformer', '#/map?view=tree', '#/search?q=transformer'].includes(r)) await page.screenshot({path: join(shots, `${name}-${w}-${r.replace(/[^a-z0-9]+/gi, '_')}.png`)});
      } catch (e) { note(name, `${w}px ${r}`, false, '超时或崩溃: ' + String(e.message).split('\n')[0]); }
    }
    await ctx.close();
  }
}

async function flows(name, browser, w, h) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}});
  const page = await ctx.newPage();
  const step = async (what, fn) => { try { const r = await fn(); note(name, `${w}px 流程：${what}`, r !== false, r === false ? '结果不符' : ''); } catch (e) { note(name, `${w}px 流程：${what}`, false, String(e.message).split('\n')[0].slice(0, 160)); } };
  const txt = sel => page.locator(sel).first().innerText();

  // 任务一：在网站里找到Transformer
  await page.goto(url('#/')); await ready(page);
  await step('首页有三个主入口', async () => (await page.locator('.entries .entry').count()) === 3);
  await step('首页搜索框：边输入边出提示栏，带“路线”入口，方向键能选，Esc能关', async () => {
    await page.fill('#hq', ''); await page.type('#hq', 'GRPO'); await page.waitForSelector('.hsrow .drop:not([hidden]) .opt');
    const first = (await txt('.hsrow .drop .opt .t')).trim(), via = await page.locator('.hsrow .drop .opt .via').first().getAttribute('href');
    await page.press('#hq', 'ArrowDown'); const sel = await page.locator('.hsrow .drop .opt.sel').count();
    await page.press('#hq', 'Escape'); const closed = await page.locator('.hsrow .drop').isHidden();
    return /^GRPO/.test(first) && via === '#/from/grpo' && sel === 1 && closed; });
  await step('搜索页的输入框也有提示栏，选中一条回车直接进入', async () => {
    await page.goto(url('#/search')); await ready(page); await page.type('#sq', '自回归'); await page.waitForSelector('#sf .drop:not([hidden]) .opt');
    await page.press('#sq', 'ArrowDown'); await page.press('#sq', 'Enter'); await ready(page);
    const ok = /^#\/c\/autoregressive/.test(await page.evaluate(() => location.hash)); await page.goto(url('#/')); await ready(page); return ok; });
  await step('首页搜索Transformer，最接近的结果就是它', async () => { await page.fill('#hq', 'Transformer'); await page.press('#hq', 'Enter'); await ready(page); return (await txt('.bestc h3')).trim() === 'Transformer'; });
  // 任务二：看懂它要解决的问题和前后关系
  await step('从结果进入讲解页，顶上有问题/方法/影响三格', async () => { await page.click('.bestc .btn.fill'); await ready(page); return (await txt('h1')).trim() === 'Transformer' && (await page.locator('.gist > div').count()) === 3; });
  await step('讲解页有前驱和后续关系，带类型和说明', async () => (await page.locator('#before + ul.rels li').count()) > 2 && (await page.locator('#after + ul.rels li').count()) > 2 && (await page.locator('#before + ul.rels .ty').first().innerText()).length > 0);
  await step('讲解页有审核状态和报告错误入口', async () => (await page.locator('#trustbox').count()) === 1 && /issues\/new/.test(await page.locator('#trustbox a.btn').getAttribute('href')));
  await step('在讲解页里画出它在树上的位置', async () => { await page.click('#showtree'); await page.waitForSelector('#ntree .nd.sel'); return (await page.locator('#ntree .nd').count()) > 5; });
  await step('标记学习状态、收藏、写笔记', async () => {
    await page.click('.mine .st'); await page.click('.mine .st'); await page.click('.mine [data-mark]'); await page.fill('#note', '自注意力让任意两个位置一步可达');
    return await page.evaluate(() => JSON.parse(localStorage.getItem('aimap.progress')).transformer === 2 && JSON.parse(localStorage.getItem('aimap.marks')).transformer === 1 && /一步可达/.test(JSON.parse(localStorage.getItem('aimap.notes')).transformer));
  });
  await step('刷新后学习记录还在', async () => { await page.reload(); await ready(page); return (await page.locator('.mine .st.s2').count()) === 1 && /一步可达/.test(await page.inputValue('#note')); });
  await step('从零读到Transformer：有一条按时间排的主线', async () => { await page.goto(url('#/from/transformer')); await ready(page); const n = await page.locator('ul.rows > li.row').count(); return n >= 5 && /你要学的就是这个/.test(await page.locator('ul.rows').innerText()); });
  // 任务三：找到一条继续学LLM训练的路径
  await step('开始学习页能找到“大语言模型是怎么训练出来的”并打开专题', async () => { await page.goto(url('#/learn')); await ready(page); await page.locator('.qgrid a', {hasText: '怎么训练'}).first().click(); await ready(page); return (await page.locator('ol.story > li').count()) >= 6 && /简化了什么/.test(await page.locator('.caveat').innerText()); });
  await step('开始学习页：输入“扩散模型”能得到从零读到它的路线入口', async () => { await page.goto(url('#/learn')); await ready(page); await page.fill('#lq', '扩散模型'); await page.press('#lq', 'Enter'); await page.waitForSelector('#lhit a.btn'); await page.locator('#lhit a.btn').first().click(); await ready(page); return /从零读到/.test(await txt('h1')); });
  await step('概念页有机制图', async () => { await page.goto(url('#/c/self-attention')); await ready(page); return (await page.locator('figure.fig svg').count()) >= 1; });
  // 演化树
  await step('演化树：展开一条分支后节点变多', async () => { await page.goto(url('#/map?view=tree')); await ready(page); await page.evaluate(() => { localStorage.setItem('aimap.mapHint', '1'); }); const a = await page.locator('.nd').count(); await page.locator('button[data-open="llm"]').click(); await page.waitForTimeout(300); return (await page.locator('.nd').count()) > a; });
  await step('演化树：点节点出现摘要面板并标出相关节点', async () => { await page.locator('.nd[data-id="transformer"]').click(); await page.waitForSelector('#panel:not([hidden]) h3'); return (await txt('#panel h3')).trim() === 'Transformer' && (await page.locator('.nd.hl').count()) > 1; });
  await step('演化树：从面板点相关节点会选中它，并能回到刚才的位置', async () => { const d = page.locator('#panel details').first(); if (!(await d.getAttribute('open') !== null)) await d.locator('summary').click(); await page.locator('#panel [data-go]').first().click(); await page.waitForTimeout(300); const t = (await txt('#panel h3')).trim(); await page.locator('#panel [data-back]').click(); await page.waitForTimeout(200); return t !== 'Transformer' && await page.locator('#panel').isHidden(); });
  await step('演化树：键盘可以选中节点，Esc关闭面板', async () => { await page.locator('.nd[data-id="transformer"]').focus(); await page.keyboard.press('Enter'); await page.waitForSelector('#panel:not([hidden])'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return await page.locator('#panel').isHidden(); });
  await step('领域地图的列表版能打开', async () => { await page.goto(url('#/map?view=list')); await ready(page); return (await page.locator('.trk').count()) === 16; });
  // 个人功能
  await step('我的进度里能看到刚才的记录', async () => { await page.goto(url('#/me')); await ready(page); return /Transformer/.test(await page.locator('#app').innerText()) && /不会.{0,14}同步/.test(await page.locator('.note').first().innerText()); });
  await step('导入进度文件', async () => { const f = join(tmpdir(), `aimap-import-${name}.json`); writeFileSync(f, JSON.stringify({progress: {transformer: 2, bert: 2}, notes: {}, marks: {bert: 1}})); await page.setInputFiles('#impf', f); await page.waitForTimeout(400); return await page.evaluate(() => JSON.parse(localStorage.getItem('aimap.progress')).bert === 2); });
  await step('默认外观是深色，能切到浅色', async () => { const dark = await page.evaluate(() => !document.documentElement.dataset.theme && getComputedStyle(document.body).backgroundColor === 'rgb(11, 20, 17)'); await page.click('#moreb'); await page.click('#theme'); return dark && await page.evaluate(() => document.documentElement.dataset.theme === 'light' && getComputedStyle(document.body).backgroundColor === 'rgb(245, 248, 244)' && /浅色/.test(document.querySelector('#theme').textContent)); });
  await step('浅色下讲解页正常显示', async () => { await page.goto(url('#/n/ddpm')); await ready(page); if (shots) await page.screenshot({path: join(shots, `${name}-${w}-light-node.png`)}); return (await page.locator('.gist').count()) === 1 && await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(245, 248, 244)'); });
  await step('旧链接仍然可用（#/path、#/concepts、#/chain/…、#/tracks）', async () => { for (const [r, re] of [['#/path', /从哪里读起/], ['#/concepts', /概念与研究思路/], ['#/chain/transformer', /从零读到/], ['#/tracks', /六个大方向/], ['#/guide', /从哪里读起/], ['#/open', /AI脉络/]]) { await page.goto(url(r)); await ready(page); if (!re.test(await txt('h1'))) return false; } return true; });
  await step('静态页：正文、canonical、分享信息齐全', async () => { await page.goto(url('n/transformer.html')); const c = await page.locator('link[rel=canonical]').getAttribute('href'); return /n\/transformer\.html$/.test(c) && (await page.locator('meta[property="og:title"]').count()) === 1 && (await page.locator('.gist').count()) === 1 && /Attention/.test(await page.locator('.prose').innerText()); });
  await ctx.close();
}

const BROWSERS = [['chromium', () => pw.chromium.launch({channel: 'chrome'})], ['webkit', () => pw.webkit.launch()], ['firefox', () => pw.firefox.launch()]].filter(b => !only || b[0] === only);
for (const [name, launch] of BROWSERS) {
  let browser;
  try { browser = await launch(); } catch (e) { console.log(`[${name}] 启动失败，跳过：${String(e.message).split('\n')[0]}`); results.push({browser: name, what: '启动', ok: false, detail: '未安装或无法启动'}); continue; }
  console.log(`[${name}] ${browser.version()}`);
  await sweep(name, browser);
  await flows(name, browser, 1440, 900);
  await flows(name, browser, 390, 844);
  await browser.close();
  const mine = results.filter(r => r.browser === name);
  console.log(`[${name}] ${mine.filter(r => r.ok).length} / ${mine.length} 通过`);
}
const bad = results.filter(r => !r.ok);
console.log(`\n合计 ${results.length - bad.length} / ${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
