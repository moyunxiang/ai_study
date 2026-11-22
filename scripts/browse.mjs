#!/usr/bin/env node
/* 用本机的 Chrome（无头模式）打开页面做检查：截图、收集控制台报错、统计加载的数据量和耗时、在页面里执行一段脚本。
   只依赖 Node 自带的功能（22+），通过 Chrome DevTools Protocol 驱动浏览器。

   node scripts/browse.mjs [--base http://127.0.0.1:8791/] [--out 目录] job.json
   node scripts/browse.mjs --route '#/n/transformer' --w 390 --h 844 --shot a.png [--dark] [--full] [--eval 'JS表达式']

   job.json 是一个列表，每项 {name, route, w, h, dark, full, shot, eval, click, wait, perf}：
     route  以 # 开头是交互版的路由；否则是相对站点根目录的路径（如 n/transformer.html）
     theme  "light" 或 "auto"：截图前切到这个外观（默认外观是深色）
     eval   页面就绪后执行的表达式，结果打印出来（可以是 Promise）
     perf   true 时清空缓存后加载，报告请求数、传输字节数和就绪时间
     net    {down, up, rtt} 模拟限速网络（kbps、毫秒），例如 {"down":4000,"up":3000,"rtt":100}
*/
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const args = process.argv.slice(2), opt = {base: 'http://127.0.0.1:8791/', out: '.', w: 1440, h: 900};
let jobFile = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { const k = a.slice(2); if (['dark', 'full', 'perf'].includes(k)) opt[k] = true; else opt[k] = args[++i]; }
  else jobFile = a;
}
const jobs = jobFile ? JSON.parse(readFileSync(jobFile, 'utf8')) : [{name: 'page', route: opt.route || '#/', w: +opt.w, h: +opt.h, dark: opt.dark, full: opt.full, shot: opt.shot, eval: opt.eval, perf: opt.perf}];
mkdirSync(opt.out, {recursive: true});

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(process.pid % 500);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-proxy-server', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'aimap-chrome-'))}`, '--no-first-run', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map(), listeners = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(200); }
  }
  if (!ws) throw new Error('Chrome 没有启动成功');
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const [res, rej] = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else for (const l of listeners) l(m); };
}
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, [res, rej]); ws.send(JSON.stringify({id, method, params, sessionId})); });

async function run(job) {
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  const S = (m, p) => send(m, p, sessionId);
  const errors = [], reqs = new Map(); let bytes = 0, nreq = 0;
  const onMsg = m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push('异常: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('日志: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.responseReceived') reqs.set(m.params.requestId, m.params.response.url);
    if (m.method === 'Network.loadingFinished') { nreq++; bytes += m.params.encodedDataLength; }
  };
  listeners.push(onMsg);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', {width: job.w || 1440, height: job.h || 900, deviceScaleFactor: job.dpr || (job.w && job.w < 700 ? 2 : 1), mobile: !!(job.w && job.w < 700)});
  if (job.w && job.w < 700) await S('Emulation.setTouchEmulationEnabled', {enabled: true});
  await S('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: job.dark ? 'dark' : 'light'}]});
  if (job.perf) { await S('Network.setCacheDisabled', {cacheDisabled: true}); }
  if (job.net) await S('Network.emulateNetworkConditions', {offline: false, latency: job.net.rtt || 100, downloadThroughput: (job.net.down || 4000) * 125, uploadThroughput: (job.net.up || 3000) * 125});      // 限速：down/up 单位 kbps
  const url = job.route.startsWith('#') ? opt.base + 'index.html' + job.route : opt.base + job.route;
  const t0 = Date.now();
  await S('Page.navigate', {url});
  const ev = async expr => { const r = await S('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  let ready = 0;
  for (let i = 0; i < (job.net ? 1200 : 200); i++) {
    await sleep(50);
    const ok = await ev(`document.readyState==='complete' && !document.querySelector('#app .loading') && (!document.querySelector('#app') || document.querySelector('#app').children.length>0)`).catch(() => false);
    if (ok) { ready = Date.now() - t0; break; }
  }
  await sleep(job.wait ?? 350);
  let result;
  if (job.theme) { await ev(`document.documentElement.dataset.theme=${JSON.stringify(job.theme)}`); await sleep(450); }      // 外观：light / auto；不写就是默认的深色
  if (job.click) { await ev(`document.querySelector(${JSON.stringify(job.click)})?.click()`); await sleep(job.wait ?? 500); }
  if (job.eval) result = await ev(job.eval).catch(e => 'eval失败: ' + e.message);
  const overflow = await ev(`document.documentElement.scrollWidth - window.innerWidth`).catch(() => null);
  if (job.shot) {
    const shot = await S('Page.captureScreenshot', {format: 'png', captureBeyondViewport: !!job.full, ...(job.full ? {clip: {x: 0, y: 0, width: job.w || 1440, height: Math.min(await ev('document.documentElement.scrollHeight'), job.maxh || 6000), scale: 1}} : {})});
    writeFileSync(resolve(opt.out, job.shot), Buffer.from(shot.data, 'base64'));
  }
  listeners.splice(listeners.indexOf(onMsg), 1);
  await send('Target.closeTarget', {targetId});
  return {name: job.name || job.route, ready_ms: ready || 'timeout', requests: nreq, bytes, overflow_x: overflow, errors, ...(job.eval ? {result} : {}), ...(job.shot ? {shot: resolve(opt.out, job.shot)} : {})};
}

try {
  await connect();
  const out = [];
  for (const j of jobs) { const r = await run(j).catch(e => ({name: j.name || j.route, fatal: e.message})); out.push(r); console.log(JSON.stringify(r)); }
  const bad = out.filter(r => r.fatal || r.ready_ms === 'timeout' || (r.errors && r.errors.length) || r.overflow_x > 1);
  console.error(`\n${out.length} 个页面，${bad.length} 个有问题`);
  process.exitCode = bad.length ? 1 : 0;
} finally { try { ws && ws.close(); } catch {} chrome.kill(); }
