/* 配色预览条：页面底部两组色块，浅色五套、深色五套，分开选。
   点一个色块：这一档外观换成这套颜色，同时把页面切到这一档；不跳页，停在哪儿还在哪儿。
   配色清单由 scripts/style_lab.py 写进页面（window.LAB_COLORS = {l:[…], d:[…]}），
   两档各有一份可以原地更换的样式表：<link id="labcss-l">、<link id="labcss-d">。
   两边的选择记在本机（localStorage: aimap.lab.l / aimap.lab.d），也写进地址的 ?l=…&d=…。
   快捷键：Alt+[ 上一套，Alt+] 下一套（先浅色五套，再深色五套）。 */
(function () {
  var C = window.LAB_COLORS, K = window.LAB_KEY || {};
  if (!C || !C.l || !C.d) return;
  var MODES = ['l', 'd'], LABEL = {l: '浅色', d: '深色'};
  var link = {l: document.getElementById('labcss-l'), d: document.getElementById('labcss-d')};
  if (!link.l || !link.d) return;
  var sel = {};
  MODES.forEach(function (m) { sel[m] = Math.max(0, C[m].findIndex(function (s) { return s.key === (K[m] || ''); })); });
  var root = document.documentElement, mq = matchMedia('(prefers-color-scheme: light)');
  var mode = function () { var t = root.dataset.theme; return t === 'light' || (t === 'auto' && mq.matches) ? 'l' : 'd'; };
  var themeBtn = document.getElementById('theme');

  var host = document.createElement('div');
  host.setAttribute('role', 'toolbar'); host.setAttribute('aria-label', '配色预览');
  host.style.cssText = 'position:fixed;z-index:2147483000;left:0;right:0;bottom:max(10px,env(safe-area-inset-bottom,0px));display:flex;justify-content:center;pointer-events:none';
  var sh = host.attachShadow({mode: 'open'});
  var FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  sh.innerHTML = '<style>' +
    '*{box-sizing:border-box}' +
    '.bar{pointer-events:auto;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 16px);height:46px;padding:0 8px;border-radius:23px;background:#17181C;color:#F2F2F2;' +
      'box-shadow:0 8px 28px rgb(0 0 0 / .35),0 0 0 1px rgb(255 255 255 / .14);font:13px/1 ' + FONT + '}' +
    'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
    '.t{flex:none;height:30px;padding:0 11px;border-radius:15px;white-space:nowrap;background:rgb(255 255 255 / .1)}' +
    '.t:hover{background:rgb(255 255 255 / .2)}' +
    '.sw{display:flex;align-items:center;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:none;padding:4px 3px}' +
    '.sw::-webkit-scrollbar{display:none}' +
    '.g{flex:none;display:flex;align-items:center;gap:5px}' +
    '.lab{flex:none;padding:0 3px 0 2px;opacity:.5;white-space:nowrap}' +
    '.g.cur .lab{opacity:1;font-weight:600}' +
    '.lab .n{display:none}' +
    '.s{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;border:1px solid rgb(255 255 255 / .28);outline-offset:2px}' +
    '.s i{width:10px;height:10px;border-radius:50%}' +
    '.s.on{outline:1.5px solid rgb(255 255 255 / .42)}' +
    '.g.cur .s.on{outline:2px solid #fff}' +
    '.s:hover{transform:scale(1.12)}' +
    '.s:focus-visible,.t:focus-visible{outline:2px solid #8AB4FF}' +
    '.gap{flex:none;width:1px;height:18px;background:rgb(255 255 255 / .22);margin:0 4px}' +
    '.name{flex:none;min-width:3.2em;padding:0 8px 0 4px;white-space:nowrap;font-weight:600}' +
    '.tip{pointer-events:none;position:absolute;left:50%;bottom:54px;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:7px 12px;border-radius:9px;background:#17181C;color:#F2F2F2;' +
      'box-shadow:0 0 0 1px rgb(255 255 255 / .14);font:12.5px/1.5 ' + FONT + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tip[hidden]{display:none}' +
    '.bar.min .sw,.bar.min .name{display:none}' +
    '@media (max-width:640px){.name{display:none}.bar{gap:4px;padding:0 6px}.t{padding:0 9px}.sw,.g{gap:3px}.s{width:22px;height:22px}.s i{width:8px;height:8px}' +
      '.lab .w{display:none}.lab .n{display:inline}.gap{margin:0 2px}}' +
    '</style><div class="tip" hidden></div><div class="bar"><button class="t" id="hide" title="收起这一条"></button><div class="sw"></div><span class="name"></span></div>';
  var bar = sh.querySelector('.bar'), sw = sh.querySelector('.sw'), nameEl = sh.querySelector('.name'), tip = sh.querySelector('.tip'),
      hide = sh.getElementById('hide'), groups = {}, flat = [], tipTimer = 0;

  var showTip = function (m, s, ms) {
    clearTimeout(tipTimer);
    tip.textContent = LABEL[m] + ' · ' + s.name + '：' + s.note; tip.hidden = false;
    if (ms) tipTimer = setTimeout(function () { tip.hidden = true; }, ms);
  };
  MODES.forEach(function (m, gi) {
    if (gi) { var sep = document.createElement('span'); sep.className = 'gap'; sw.appendChild(sep); }
    var g = document.createElement('div'); g.className = 'g'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', LABEL[m]);
    g.innerHTML = '<span class="lab"><span class="w">' + LABEL[m] + '</span><span class="n">' + LABEL[m].charAt(0) + '</span></span>';
    C[m].forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 's'; b.setAttribute('aria-label', LABEL[m] + ' · ' + s.name + '：' + s.note); b.innerHTML = '<i></i>';
      b.style.background = s.paper; b.firstChild.style.background = s.accent;
      b.onclick = function () { go(m, i); };
      b.onmouseenter = b.onfocus = function () { showTip(m, s); };
      b.onmouseleave = b.onblur = function () { tip.hidden = true; };
      g.appendChild(b); s.el = b; flat.push([m, i]);
    });
    sw.appendChild(g); groups[m] = g;
  });

  /* 把页面切到某一档外观。走页面自己的外观按钮，这样它上面的字和记住的设置都跟着对。 */
  function setTheme(m) {
    var want = m === 'l' ? 'light' : '';
    if ((root.dataset.theme || '') === want) return;
    if (themeBtn) {
      try { localStorage.setItem('aimap.theme', JSON.stringify(m === 'l' ? '' : 'auto')); } catch (e) {}   // 按钮按“深色 → 浅色 → 跟随系统 → 深色”轮换，先退到前一档再点一下
      themeBtn.click();
    }
    if ((root.dataset.theme || '') !== want) { if (want) root.dataset.theme = want; else delete root.dataset.theme; }
  }

  function paint() {
    var cur = mode();
    MODES.forEach(function (m) {
      groups[m].classList.toggle('cur', m === cur);
      C[m].forEach(function (s, i) { s.el.classList.toggle('on', i === sel[m]); s.el.setAttribute('aria-pressed', i === sel[m] && m === cur); });
    });
    nameEl.textContent = C[cur][sel[cur]].name;
    hide.textContent = bar.classList.contains('min') ? '配色' : '收起';
    var meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = C[cur][sel[cur]].paper;
  }

  function go(m, i) {
    sel[m] = (i + C[m].length) % C[m].length;
    var key = C[m][sel[m]].key;
    if (key) link[m].href = 'colors/' + m + '-' + key + '.css'; else link[m].removeAttribute('href');
    try { localStorage.setItem('aimap.lab.' + m, key); } catch (e) {}
    var q = MODES.filter(function (x) { return C[x][sel[x]].key; }).map(function (x) { return x + '=' + C[x][sel[x]].key; }).join('&');
    try { history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) {}
    setTheme(m);
    paint();
    C[m][sel[m]].el.scrollIntoView({block: 'nearest', inline: 'nearest'});
    if (matchMedia('(max-width:640px)').matches) showTip(m, C[m][sel[m]], 1800);      // 窄屏上没有悬停，也没地方常显名字，点完提示一下
  }

  hide.onclick = function () { bar.classList.toggle('min'); try { sessionStorage.setItem('aimap.lab.min', bar.classList.contains('min') ? '1' : ''); } catch (e) {} paint(); };
  try { if (sessionStorage.getItem('aimap.lab.min')) bar.classList.add('min'); } catch (e) {}
  new MutationObserver(paint).observe(root, {attributes: true, attributeFilter: ['data-theme']});
  mq.addEventListener('change', paint);
  addEventListener('keydown', function (e) {
    if (!e.altKey || e.metaKey || e.ctrlKey || (e.code !== 'BracketLeft' && e.code !== 'BracketRight')) return;
    e.preventDefault();
    var cur = mode(), at = flat.findIndex(function (f) { return f[0] === cur && f[1] === sel[cur]; });
    var nx = flat[(at + (e.code === 'BracketLeft' ? -1 : 1) + flat.length) % flat.length];
    go(nx[0], nx[1]);
  });
  document.body.appendChild(host);
  paint();
})();
