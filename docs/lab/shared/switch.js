/* 设计切换条：贴在每套原型页面的底部，列出 styles.json 里的全部设计。
   地址都从这个脚本自己的位置推出来，所以放在本机（/lab/）和线上（/ai_study/lab/）都能用。
   在节点或概念页上切换，会带着同一个节点过去。地址里带 ?bare 时不显示（截图用）。 */
(function () {
  if (/[?&]bare\b/.test(location.search)) return;
  var base = new URL('..', document.currentScript.src).href, home = new URL('..', base).href, hide = false;
  try { hide = sessionStorage.getItem('aimap.labhide') === '1'; } catch (e) {}
  fetch(base + 'styles.json').then(function (r) { return r.json(); }).then(function (S) {
    S.forEach(function (s) { s.url = s.dir ? base + s.dir + '/' : home; });
    var here = location.href.split(/[?#]/)[0], cur = S.filter(function (s) { return s.dir && here.indexOf(s.url) === 0; })[0] || S[0], bar = document.createElement('div');
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '设计预览');
    bar.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);bottom:10px;max-width:calc(100vw - 16px);display:flex;gap:4px;align-items:center;padding:5px;border-radius:10px;background:#16181d;color:#fff;font:500 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4);overflow-x:auto;white-space:nowrap';
    function go(s) { var h = /^#\/(n|c)\//.test(location.hash) ? location.hash : ''; location.href = s.url + h; }
    function btn(text, title, on, fn) { var b = document.createElement('button'); b.textContent = text; b.title = title; b.style.cssText = 'all:unset;cursor:pointer;padding:8px 12px;border-radius:6px;' + (on ? 'background:#fff;color:#16181d;font-weight:700' : 'color:#e8eaee'); b.onclick = fn; bar.appendChild(b); return b; }
    function draw() {
      bar.innerHTML = '';
      btn(hide ? '设计' : '收起', '收起或展开设计切换条', false, function () { hide = !hide; try { sessionStorage.setItem('aimap.labhide', hide ? '1' : '0'); } catch (e) {} draw(); }).style.color = '#9aa3b2';
      if (hide) return;
      btn('总览', '全部设计的总览页', false, function () { location.href = base; }).style.color = '#9aa3b2';
      S.forEach(function (s, i) { btn((i + 1) + ' ' + s.name, s.blurb, s === cur, function () { go(s); }).setAttribute('aria-pressed', s === cur); });
    }
    draw(); document.body.appendChild(bar);
    addEventListener('keydown', function (e) { var k = e.code && e.code.indexOf('Digit') === 0 ? +e.code.slice(5) : 0; if (e.altKey && k && S[k - 1]) { e.preventDefault(); go(S[k - 1]); } });
  }).catch(function () {});
})();
