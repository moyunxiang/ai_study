/* 设计切换条：贴在每套原型页面的底部，可以在 styles.json 里的全部设计之间换。
   地址都从这个脚本自己的位置推出来，所以放在本机（/lab/）和线上（/ai_study/lab/）都能用。
   在节点或概念页上切换，会带着同一个节点过去。地址里带 ?bare 时不显示（截图用）。 */
(function () {
  if (/[?&]bare\b/.test(location.search)) return;
  var base = new URL('..', document.currentScript.src).href, home = new URL('..', base).href, hide = false;
  var GROUP = {'现': '线上现版', '色': '线上现版换颜色', '图': '以一张大图为主', '文': '以文字为主', '肤': '线上现版换风格'};
  try { hide = sessionStorage.getItem('aimap.labhide') === '1'; } catch (e) {}
  fetch(base + 'styles.json').then(function (r) { return r.json(); }).then(function (S) {
    S.forEach(function (s) { s.url = s.dir ? base + s.dir + '/' : home; });
    var here = location.href.split(/[?#]/)[0], cur = S.filter(function (s) { return s.dir && here.indexOf(s.url) === 0; })[0] || S[0], at = S.indexOf(cur), bar = document.createElement('div');
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '设计预览');
    bar.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);bottom:10px;max-width:calc(100vw - 16px);display:flex;gap:4px;align-items:center;padding:5px;border-radius:10px;background:#16181d;color:#fff;font:500 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4);white-space:nowrap';
    function go(s) { var h = /^#\/(n|c)\//.test(location.hash) ? location.hash : ''; location.href = s.url + h; }
    function btn(text, title, fn) { var b = document.createElement('button'); b.textContent = text; b.title = title; b.setAttribute('aria-label', title); b.style.cssText = 'all:unset;cursor:pointer;padding:8px 11px;border-radius:6px;color:#9aa3b2'; b.onclick = fn; bar.appendChild(b); return b; }
    function draw() {
      bar.innerHTML = '';
      btn(hide ? '设计' : '收起', '收起或展开设计切换条', function () { hide = !hide; try { sessionStorage.setItem('aimap.labhide', hide ? '1' : '0'); } catch (e) {} draw(); });
      if (hide) return;
      btn('总览', '全部设计的总览页', function () { location.href = base; });
      btn('‹', '上一套设计', function () { go(S[(at + S.length - 1) % S.length]); }).style.color = '#fff';
      var sel = document.createElement('select'); sel.setAttribute('aria-label', '换一套设计');
      sel.style.cssText = 'font:700 13px/1 inherit;font-family:inherit;color:#16181d;background:#fff;border:0;border-radius:6px;padding:7px 8px;max-width:46vw';
      var kinds = []; S.forEach(function (s) { var k = s.kind || '现'; if (kinds.indexOf(k) < 0) kinds.push(k); });
      kinds.forEach(function (k) { var g = document.createElement('optgroup'); g.label = GROUP[k] || k;
        S.forEach(function (s, i) { if ((s.kind || '现') !== k) return; var o = document.createElement('option'); o.value = i; o.textContent = (i + 1) + ' ' + s.name; o.selected = s === cur; g.appendChild(o); }); sel.appendChild(g); });
      sel.onchange = function () { go(S[+sel.value]); }; bar.appendChild(sel);
      btn('›', '下一套设计', function () { go(S[(at + 1) % S.length]); }).style.color = '#fff';
      var n = document.createElement('span'); n.textContent = (at + 1) + '/' + S.length; n.style.cssText = 'padding:0 8px 0 4px;color:#9aa3b2;font-size:12px'; bar.appendChild(n);
    }
    draw(); document.body.appendChild(bar);
    addEventListener('keydown', function (e) {
      if (!e.altKey) return; var k = e.code && e.code.indexOf('Digit') === 0 ? +e.code.slice(5) : 0, to = k ? S[k - 1] : e.code === 'BracketLeft' ? S[(at + S.length - 1) % S.length] : e.code === 'BracketRight' ? S[(at + 1) % S.length] : null;
      if (to) { e.preventDefault(); go(to); }
    });
  }).catch(function () {});
})();
