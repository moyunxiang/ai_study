/* 配色预览条：页面底部一排色块，点一下就原地换颜色，不跳页，停在哪儿还在哪儿。
   配色清单由 scripts/style_lab.py 写进页面（window.LAB_COLORS），当前配色的样式表是 <link id="labcss">。
   选中的配色记在本机（localStorage: aimap.lab.color），也写进地址的 ?c=，所以把地址发给别人看到的是同一套。
   快捷键：Alt+[ 上一套，Alt+] 下一套。 */
(function () {
  var S = window.LAB_COLORS || [], link = document.getElementById('labcss');
  if (!S.length || !link) return;
  var cur = Math.max(0, S.findIndex(function (s) { return s.key === (window.LAB_KEY || ''); }));
  var root = document.documentElement, mq = matchMedia('(prefers-color-scheme: light)');
  var isLight = function () { var t = root.dataset.theme; return t === 'light' || (t === 'auto' && mq.matches); };
  var themeBtn = document.getElementById('theme');

  var host = document.createElement('div');
  host.setAttribute('role', 'toolbar'); host.setAttribute('aria-label', '配色预览');
  host.style.cssText = 'position:fixed;z-index:2147483000;left:0;right:0;bottom:max(10px,env(safe-area-inset-bottom,0px));display:flex;justify-content:center;pointer-events:none';
  var sh = host.attachShadow({mode: 'open'});
  sh.innerHTML = '<style>' +
    '*{box-sizing:border-box}' +
    '.bar{pointer-events:auto;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 16px);height:46px;padding:0 8px;border-radius:23px;background:#17181C;color:#F2F2F2;' +
      'box-shadow:0 8px 28px rgb(0 0 0 / .35),0 0 0 1px rgb(255 255 255 / .14);font:13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}' +
    'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
    '.t{height:30px;padding:0 11px;border-radius:15px;white-space:nowrap;background:rgb(255 255 255 / .1)}' +
    '.t:hover{background:rgb(255 255 255 / .2)}' +
    '.sw{display:flex;align-items:center;gap:5px;overflow-x:auto;scrollbar-width:none;padding:4px 2px}' +
    '.sw::-webkit-scrollbar{display:none}' +
    '.s{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;border:1px solid rgb(255 255 255 / .28);outline-offset:2px}' +
    '.s i{width:10px;height:10px;border-radius:50%}' +
    '.s.on{outline:2px solid #fff}' +
    '.s:hover{transform:scale(1.12)}' +
    '.s:focus-visible,.t:focus-visible{outline:2px solid #8AB4FF}' +
    '.gap{flex:none;width:1px;height:18px;background:rgb(255 255 255 / .22);margin:0 3px}' +
    '.name{flex:none;min-width:5.5em;padding:0 6px 0 4px;white-space:nowrap}' +
    '.name b{font-weight:600}.name span{opacity:.6;margin-left:6px;font-variant-numeric:tabular-nums}' +
    '.tip{pointer-events:none;position:absolute;left:50%;bottom:54px;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:7px 12px;border-radius:9px;background:#17181C;color:#F2F2F2;' +
      'box-shadow:0 0 0 1px rgb(255 255 255 / .14);font:12.5px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tip[hidden]{display:none}' +
    '.bar.min .sw,.bar.min .name,.bar.min .gap,.bar.min #th{display:none}' +
    '@media (max-width:640px){.name span{display:none}.name{min-width:0}}' +
    '</style><div class="tip" hidden></div><div class="bar"><button class="t" id="hide" title="收起这一条"></button><button class="t" id="th" title="切换深色、浅色、跟随系统"></button><span class="gap"></span><div class="sw"></div><span class="gap"></span><span class="name"></span></div>';
  var bar = sh.querySelector('.bar'), sw = sh.querySelector('.sw'), nameEl = sh.querySelector('.name'), tip = sh.querySelector('.tip'),
      th = sh.getElementById('th'), hide = sh.getElementById('hide');

  S.forEach(function (s, i) {
    if (i && s.group !== S[i - 1].group) { var g = document.createElement('span'); g.className = 'gap'; sw.appendChild(g); }
    var b = document.createElement('button');
    b.className = 's'; b.setAttribute('aria-label', s.name + '：' + s.note); b.innerHTML = '<i></i>';
    b.onclick = function () { go(i); };
    b.onmouseenter = b.onfocus = function () { tip.textContent = s.name + ' · ' + s.note; tip.hidden = false; };
    b.onmouseleave = b.onblur = function () { tip.hidden = true; };
    sw.appendChild(b); s.el = b;
  });

  function paint() {
    var light = isLight();
    S.forEach(function (s, i) {
      var c = light ? s.l : s.d;
      s.el.style.background = c.paper; s.el.firstChild.style.background = c.accent;
      s.el.classList.toggle('on', i === cur); s.el.setAttribute('aria-pressed', i === cur);
    });
    nameEl.innerHTML = '<b></b><span>' + (cur + 1) + '/' + S.length + '</span>'; nameEl.firstChild.textContent = S[cur].name;
    th.textContent = ({light: '浅色', auto: '跟随系统'})[root.dataset.theme] || '深色';
    hide.textContent = bar.classList.contains('min') ? '配色' : '收起';
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = (light ? S[cur].l : S[cur].d).paper;
  }

  function go(i) {
    cur = (i + S.length) % S.length;
    var key = S[cur].key;
    if (key) link.href = 'colors/' + key + '.css'; else link.removeAttribute('href');
    try { localStorage.setItem('aimap.lab.color', key); } catch (e) {}
    try { history.replaceState(history.state, '', location.pathname + (key ? '?c=' + key : '') + location.hash); } catch (e) {}
    paint();
    S[cur].el.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  th.onclick = function () { if (themeBtn) themeBtn.click(); else { root.dataset.theme = isLight() ? '' : 'light'; } paint(); };
  hide.onclick = function () { bar.classList.toggle('min'); try { sessionStorage.setItem('aimap.lab.min', bar.classList.contains('min') ? '1' : ''); } catch (e) {} paint(); };
  try { if (sessionStorage.getItem('aimap.lab.min')) bar.classList.add('min'); } catch (e) {}
  new MutationObserver(paint).observe(root, {attributes: true, attributeFilter: ['data-theme']});
  mq.addEventListener('change', paint);
  addEventListener('keydown', function (e) {
    if (!e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.code === 'BracketLeft') { e.preventDefault(); go(cur - 1); }
    if (e.code === 'BracketRight') { e.preventDefault(); go(cur + 1); }
  });
  document.body.appendChild(host);
  paint();
  S[cur].el.scrollIntoView({block: 'nearest', inline: 'nearest'});
})();
