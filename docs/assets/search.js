/* AI脉络 · 搜索。纯函数，不碰DOM：浏览器里由 app.js 调用，命令行里由 scripts/search_test.mjs 调用，用的是同一份代码。
   输入是 docs/data/core.json 和 docs/data/search.json 两份数据。 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.AIMapSearch = m;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// 同义词组：搜其中任何一个，等于同时搜这一组（可以是多词短语）。只放“同一个东西的不同叫法”
const SYN = [
  ['rl', '强化学习', 'reinforcement learning'], ['marl', '多智能体强化学习', 'multi-agent rl', 'multi-agent reinforcement learning'], ['llm', '大语言模型', '大模型', 'large language model'],
  ['vlm', '视觉语言模型', 'vision-language model', 'vision language model'], ['vla', '视觉-语言-动作', 'vision-language-action'], ['ssl', '自监督', 'self-supervised'],
  ['kd', '蒸馏', 'distillation', 'distill'], ['swarm', '群体智能', '智能体群'], ['agent', '智能体', 'agents'], ['multi-agent', '多智能体', 'multiagent'], ['diffusion', '扩散'],
  ['autoregressive', '自回归', 'auto-regressive'], ['gnn', '图神经网络', 'graph neural network'], ['cv', '计算机视觉', 'computer vision'], ['nlp', '自然语言处理', 'natural language processing'],
  ['tts', '语音合成', 'text-to-speech', 'text to speech'], ['asr', '语音识别', 'speech recognition'], ['rag', '检索增强', 'retrieval-augmented', 'retrieval augmented'],
  ['cot', '思维链', 'chain-of-thought', 'chain of thought'], ['moe', '混合专家', 'mixture of experts', 'mixture-of-experts'], ['peft', '参数高效微调', 'parameter-efficient'],
  ['world model', '世界模型', 'world models'], ['icl', '上下文学习', 'in-context learning'], ['ttt', '测试时训练', 'test-time training', 'test time training'], ['tta', '测试时适应', 'test-time adaptation'],
  ['sae', '稀疏自编码器', 'sparse autoencoder'], ['interpretability', '可解释性', 'interp'], ['finetune', '微调', 'fine-tuning', 'fine-tune', 'finetuning'], ['quantization', '量化'],
  ['benchmark', '基准', '评测'], ['robot', '机器人', 'robotics'], ['reasoning', '推理'], ['alignment', '对齐'], ['embedding', '嵌入', '向量表示'], ['attention', '注意力'],
  ['pretraining', '预训练', 'pre-training', 'pretrain'], ['multimodal', '多模态', 'multi-modal'], ['video', '视频'], ['image', '图像'], ['speech', '语音'], ['tokenizer', '分词器', 'tokenization'],
  ['memory', '记忆'], ['tool use', '工具调用', 'tool calling', 'function calling'], ['planning', '规划'], ['imitation learning', '模仿学习', 'imitation'], ['offline rl', '离线强化学习', '离线rl'],
  ['self-play', '自我对弈', '自博弈'], ['gan', '生成对抗网络', '生成对抗'], ['vae', '变分自编码器'], ['flow matching', '流匹配'], ['3d', '三维'], ['detection', '检测'], ['segmentation', '分割'],
  ['safety', '安全'], ['jailbreak', '越狱'], ['hallucination', '幻觉'], ['compression', '压缩'], ['pruning', '剪枝'], ['scaling law', '规模定律', 'scaling laws'], ['on-policy', '在策略', '同策略'],
  ['off-policy', '离策略', '异策略'], ['self-distillation', '自蒸馏'], ['continual learning', '持续学习', 'lifelong learning', '终身学习'], ['meta-learning', '元学习', 'meta learning'],
  ['contrastive', '对比学习'], ['few-shot', '少样本'], ['zero-shot', '零样本'], ['transfer learning', '迁移学习'], ['curriculum', '课程学习'], ['prompt', '提示'], ['context engineering', '上下文工程'],
  ['humanoid', '人形机器人', '人形'], ['autonomous driving', '自动驾驶', 'self-driving'], ['protein', '蛋白质'], ['theorem proving', '定理证明'], ['code', '代码', 'coding'], ['long context', '长上下文'],
  ['inference', '推理服务'], ['kv cache', 'kv缓存'], ['gpu', '显卡'], ['dataset', '数据集'], ['evaluation', '评测'], ['optimizer', '优化器'], ['normalization', '归一化'], ['regularization', '正则化'],
  ['generalization', '泛化'], ['adversarial', '对抗'], ['backdoor', '后门'], ['privacy', '隐私'], ['governance', '治理'], ['open source', '开源', 'open-source'], ['synthetic data', '合成数据'],
  ['backprop', '反向传播', 'backpropagation'], ['gradient descent', '梯度下降'], ['cnn', '卷积神经网络', '卷积网络', 'convolutional neural network'], ['rnn', '循环神经网络', 'recurrent neural network'],
  ['transformer', '变换器'], ['perceptron', '感知机'], ['policy gradient', '策略梯度'], ['knowledge graph', '知识图谱'], ['text-to-image', '文生图', 'text to image'], ['text-to-video', '文生视频', 'text to video']
].map(g => g.map(x => x.toLowerCase()));
const synOf = {};
SYN.forEach(g => g.forEach(w => { synOf[w] = synOf[w] ? [...new Set([...synOf[w], ...g])] : g; }));
const synPhrases = Object.keys(synOf).filter(w => w.includes(' ')).sort((a, b) => b.length - a.length);

// 全角转半角、统一大小写和空白
const norm = s => String(s || '').toLowerCase().replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[　\s]+/g, ' ').trim();
// 去掉所有分隔符后的“紧凑写法”：gpt-4 / gpt 4 / GPT4 都变成 gpt4
const compact = s => norm(s).replace(/[^a-z0-9一-鿿]+/g, '');
// 英文原题各词的首字母连起来，用来按缩写找：搜“dlm”能命中“… Diffusion Language Models”
const initials = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean).map(w => w[0]).join('');
const low = a => (a || []).map(norm);

function editDistance(a, b, max) {      // 只关心是否不超过 max
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 1]);      // 相邻字母写反
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* core: core.json 的内容；sd: search.json 的内容（可以为空，这时只能按名字和id找） */
function create(core, sd) {
  sd = sd || {full: [], who: [], aka: {}, th: {}, c: {}, terms: []};
  const index = [];
  const trackOf = i => core.tracks[i];
  core.N.forEach((a, i) => {
    const [id, date, tier, , title, ti] = a, full = sd.full[i] || '', who = sd.who[i] || '', aka = sd.aka[i] || [], t = trackOf(ti);
    index.push({k: 'n', id, t: title, s: [full, who].filter(Boolean).join(' · ') || t.name, aka: low(aka), full: norm(full), tier, date, track: t.key,
      hay: norm([title, id, full, who, date, ...aka].join('\n')), hay2: norm([t.name, t.short, t.key].join('\n')), ac: initials(full), w: 4 - tier});
  });
  for (const tr of core.tracks) for (const th of core.threads[tr.key] || []) {
    const aka = ((sd.th[tr.key] || {})[th.key]) || [];
    index.push({k: 'th', id: `${tr.key}?th=${th.key}`, t: th.name, s: `主题线 · ${tr.name} · ${th.n}个节点`, track: tr.key, th: th.key, aka: low(aka),
      hay: norm([th.name, th.key, ...aka].join('\n')), hay2: norm([th.blurb, tr.name, tr.short, tr.key].join('\n')), w: 2.4});
  }
  for (const c of core.C) {
    const [key, name, en, area] = c, x = sd.c[key] || ['', []];
    index.push({k: 'c', id: key, t: name, s: (area === 'idea' ? '研究思路 · ' : '概念 · ') + (en || x[0] || ''), area, aka: [...low(x[1]), norm(en)].filter(Boolean), full: norm(en),
      hay: norm([name, en, key, ...x[1]].join('\n')), hay2: norm(x[0]), ac: initials(en), w: area === 'idea' ? 3.2 : 2.5});
  }
  for (const tr of core.tracks) index.push({k: 'tr', id: tr.key, t: tr.name, s: '分支 · ' + tr.question, aka: [norm(tr.short)], hay: norm([tr.name, tr.short, tr.key].join('\n')), hay2: '', w: 3.4});
  for (const s of core.stories || []) index.push({k: 's', id: s.key, t: s.title, s: '研究专题 · ' + s.question, aka: [], hay: norm(s.title + '\n' + s.key), hay2: norm(s.question), w: 3.6});
  for (const [t, ni] of sd.terms || []) index.push({k: 't', id: core.N[ni][0], t, s: '术语 · 见 ' + core.N[ni][4], hay: norm(t), hay2: '', w: 1});
  const tokens = new Map();      // 英文词 → 出现它的条目（拼写纠错用）
  for (const it of index) {
    it.tl = norm(it.t); it.tc = compact(it.t); it.akc = (it.aka || []).map(compact);
    it.tk = new Set(it.tl.match(/[a-z0-9]+/g) || []);      // 标题里的英文词，整词命中排在子串命中前面
    if (it.k !== 't') for (const w of new Set([...it.tk, ...(it.aka || []).flatMap(a => a.match(/[a-z0-9]+/g) || [])])) if (w.length >= 4) { if (!tokens.has(w)) tokens.set(w, []); tokens.get(w).push(it); }
  }

  function queryTerms(q) {      // 拆成词；同义词表里的多词短语算一个词
    let s = ' ' + norm(q) + ' ';
    const out = [];
    for (const p of synPhrases) if (s.includes(' ' + p + ' ')) { out.push(p); s = s.replace(' ' + p + ' ', ' '); }
    return [...out, ...s.trim().split(' ').filter(Boolean)];
  }
  // 短的英文词（≤4个字母）在英文原题、作者、id里必须从词头开始匹配，否则“marl”会命中作者 Hammarling
  const reCache = {};
  const inHay = (hay, w) => /^[a-z0-9]{1,4}$/.test(w) ? (reCache[w] ||= new RegExp('(^|[^a-z0-9])' + w)).test(hay) : hay.includes(w);
  function scoreWord(it, w, lit) {
    if (it.tl === w || (it.k !== 't' && it.k !== 'th' && it.id === w)) return 100;      // 名字，或节点、概念的id（id通常就是通行的缩写）
    if (it.aka && it.aka.includes(w)) return 80;
    if (it.tk.has(w)) return 70;
    if (it.tl.startsWith(w)) return w.length >= 4 && /^[a-z0-9 .\-+]+$/.test(w) && /^[\u4e00-\u9fff]+$/.test(it.tl.slice(w.length)) ? 90 : 60;      // “Stable Diffusion开源”这种“英文名+中文说明”的标题，搜英文名算接近完全对上
    if (it.tl.includes(w)) return 40;
    if (inHay(it.hay, w)) return 20;
    if (lit && it.ac && /^[a-z0-9]{3,8}$/.test(w) && it.ac.includes(w)) return 14;      // 按首字母缩写找，只对用户原样输入的词做
    return it.hay2 && inHay(it.hay2, w) ? 6 : 0;
  }
  function scoreTerm(it, w) {
    let s = scoreWord(it, w, true);
    if (synOf[w]) for (const a of synOf[w]) if (a !== w) s = Math.max(s, scoreWord(it, a) * .8);
    if (w.includes(' ')) s = Math.max(s, .9 * Math.min(...w.split(' ').map(x => scoreTerm(it, x))));      // 短语没有原样出现时，退回到每个词都出现
    return s;
  }

  /* 返回按相关度排好的结果。每项带 sc（每个词的平均得分）、partial（只匹配了一部分词）、fuzzy（按相近拼写找到的）。 */
  function search(q, limit = 200) {
    const ws = queryTerms(q);
    if (!ws.length) return [];
    const N = index.length, whole = norm(q), wc = compact(q);
    const run = ws => {
      const full = [], part = [], df = ws.map(() => 0);
      for (const it of index) {
        let sc = ws.map(w => scoreTerm(it, w));
        if (it.tl === whole) sc = sc.map(() => 100);                                                // 整个查询就是它的名字
        else if (it.aka && it.aka.includes(whole)) sc = sc.map(() => 96);
        else if (it.k !== 't' && whole.length >= 2 && ((it.tl.startsWith(whole) && /[\u4e00-\u9fff]/.test(whole) && /^[a-z0-9 .\-+]+$/.test(it.tl.slice(whole.length))) || (it.tl.endsWith(whole) && /^[\u4e00-\u9fff]{2,}$/.test(it.tl.slice(0, -whole.length)) && /^[a-z0-9 .\-+]+$/.test(whole)))) sc = sc.map(() => 97);      // 标题是“中文名+缩写”，搜其中一半                               // 或它的别名、缩写
        else if (wc.length >= 3 && (it.tc === wc || it.akc.includes(wc))) sc = sc.map(x => Math.max(x, 92));      // 只是分隔符不同：gpt4 / gpt-4 / chat gpt
        else if (it.full && whole.length >= 8 && it.full === whole) sc = sc.map(() => 98);                    // 完整的英文原题
        else if (ws.length >= 3 && whole.length >= 12 && it.full && it.full.includes(whole)) sc = sc.map(x => Math.max(x, 88));      // 原题的一大段      // 完整的英文原题
        const hit = sc.filter(Boolean).length;
        sc.forEach((x, i) => { if (x) df[i]++; });
        if (hit === ws.length) { const sum = sc.reduce((a, b) => a + b, 0), avg = sum / ws.length; full.push([avg + it.w * (avg >= 60 ? 3 : 1) + (it.tl === whole || it.tc === wc || (it.k !== 't' && it.id === whole) ? 40 : 0), it, avg]); }
        else if (hit) part.push([sc, it]);
      }
      // 只匹配一部分词的：必须包含最少见的那个词（“swarm rl”里是 swarm），按“词越少见越重要”排
      const rare = df.reduce((m, d, i) => d && (m < 0 || d < df[m]) ? i : m, -1), idf = df.map(d => Math.log(1 + N / (1 + d)));
      const loose = rare < 0 ? [] : part.filter(([sc]) => sc[rare] >= 14).map(([sc, it]) => [sc.reduce((a, x, i) => a + x * idf[i], 0) + it.w, it, Math.max(...sc) / 2]);
      return {full, loose};
    };
    let {full, loose} = run(ws);
    if (!full.length && ws.length === 1 && /^[一-鿿]{4,}$/.test(ws[0])) {      // 一整串中文没命中：试着从中间切成两个词
      const f = new Map(), l = new Map(), keep = (m, r, k) => { if (!m.has(r[1]) || m.get(r[1])[0] < r[0] * k) m.set(r[1], [r[0] * k, r[1], r[2] * k]); };
      for (let i = 2; i <= ws[0].length - 2; i++) { const r = run([ws[0].slice(0, i), ws[0].slice(i)]); r.full.forEach(x => keep(f, x, .5)); r.loose.filter(x => x[2] >= 20).forEach(x => keep(l, x, 1)); }
      full = [...f.values()]; loose = [...l.values()].filter(x => !f.has(x[1]));
    }
    const wrap = (it, sc, extra) => Object.assign(Object.create(it), {sc, partial: false, fuzzy: false}, extra);
    const res = full.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => wrap(x[1], x[2]));
    if (res.length < 8) for (const x of loose.sort((a, b) => b[0] - a[0]).slice(0, 40)) res.push(wrap(x[1], x[2], {partial: true}));
    if (!res.some(x => x.sc >= 40)) {      // 没有像样的结果：按相近拼写再找一遍（tranformer → transformer）
      const seen = new Set(res.map(x => x.k + x.id)), fz = [];
      for (const w of ws) {
        if (!/^[a-z][a-z0-9]{4,}$/.test(w)) continue;
        const max = w.length >= 9 ? 2 : 1;
        for (const [tok, items] of tokens) {
          if (tok[0] !== w[0] && tok[1] !== w[1]) continue;
          const d = editDistance(w, tok, max);
          if (d > 0 && d <= max) for (const it of items) if (!seen.has(it.k + it.id)) { seen.add(it.k + it.id); fz.push([(it.tk.has(tok) ? 50 : 30) - d * 8 + it.w * 3 + (it.tl === tok ? 30 : 0), it, tok]); }
        }
      }
      if (fz.length) return [...fz.sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => wrap(x[1], 30, {fuzzy: x[2]})), ...res];
    }
    return res;
  }
  return {search, queryTerms, synOf, size: index.length, norm};
}
return {create, norm, compact};
});
