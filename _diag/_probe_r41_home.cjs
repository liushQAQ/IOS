/* ============================================================================
 * R41-六犯 取证探针（首页/开始页 + 会话页，真机参数对齐）
 *   真机：iPhone 14 Pro Max / 430x932pt / dsf3 / 状态栏 59pt / 浅色模式
 *   目的：复现老总 2026-10-25 20:41 两张真机截图
 *     · 首页顶栏整条几乎不可见（只露按钮底缘 ~y195px/3x ≈ 65pt）
 *     · 会话页右缘 x≈1240-1290、y≈1393-1444 有淡紫圆形按钮被右缘切掉
 *   用法：node _diag/_probe_r41_home.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const AUDIT = () => {
  var out = { vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio };
  out.docW = document.documentElement.scrollWidth;
  out.scrollY = Math.round(window.scrollY);
  var cs = getComputedStyle(document.documentElement);
  out.vars = {
    sb: cs.getPropertyValue('--dsh-statusbar').trim(),
    nat: cs.getPropertyValue('--dsh-sb-native').trim(),
    ts: cs.getPropertyValue('--dsh-topshift').trim()
  };
  var hdr = document.querySelector('header');
  out.header = hdr ? (function () {
    var r = hdr.getBoundingClientRect();
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inline: (hdr.getAttribute('style') || '').slice(0, 160), cls: (typeof hdr.className === 'string' ? hdr.className : '').slice(0, 60) };
  })() : null;
  // 顶带所有可见元素（top<160）
  out.topBand = [];
  try {
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.top > 160 || r.bottom < 0) continue;
      var aria = el.getAttribute('aria-label') || '';
      var cls = (typeof el.className === 'string' ? el.className.split(' ')[0] : '');
      var interesting = aria || /stripChrome|tabStrip|tabHostHeader|header|Header/.test(cls);
      if (!interesting) continue;
      out.topBand.push({
        tag: el.tagName.toLowerCase(), cls: cls.slice(0, 34), aria: aria,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        inline: (el.getAttribute('style') || '').slice(0, 120)
      });
    }
  } catch (e) { out.err = String(e); }
  // 右缘越界元素
  out.overRight = [];
  try {
    var all2 = document.querySelectorAll('body *');
    for (var j = 0; j < all2.length && out.overRight.length < 20; j++) {
      var e2 = all2[j], r2 = e2.getBoundingClientRect();
      if (r2.width <= 0 || r2.height <= 0) continue;
      if (r2.right > window.innerWidth + 1 && r2.left < window.innerWidth) {
        out.overRight.push({
          tag: e2.tagName.toLowerCase(),
          cls: (typeof e2.className === 'string' ? e2.className.split(' ')[0] : '').slice(0, 30),
          aria: e2.getAttribute('aria-label') || '',
          rect: [Math.round(r2.left), Math.round(r2.top), Math.round(r2.width), Math.round(r2.height)],
          right: Math.round(r2.right)
        });
      }
    }
  } catch (e) {}
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    try { (0, eval)(js); } catch (e) { window.__injErr = String(e); }
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2500);
  const home = await p.evaluate(AUDIT);
  console.log('[首页]', JSON.stringify({ vw: home.vw, vh: home.vh, docW: home.docW, scrollY: home.scrollY, vars: home.vars, header: home.header }, null, 0));
  console.log('  顶带元素:');
  home.topBand.forEach(t => console.log('   ', t.tag + '.' + t.cls, 'aria=' + JSON.stringify(t.aria), 'rect=' + JSON.stringify(t.rect), 'inline=' + JSON.stringify(t.inline)));
  console.log('  右缘越界:', JSON.stringify(home.overRight));
  await p.screenshot({ path: path.join(DIR, '_r41_home_430.png') });
  console.log('  截图: _r41_home_430.png');

  // 打开右侧抽屉
  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]'); if (t) t.click(); return !!t; });
  await p.waitForTimeout(2000);
  const drawer = await p.evaluate(AUDIT);
  console.log('[抽屉打开] header=' + JSON.stringify(drawer.header));
  console.log('  顶带元素:');
  drawer.topBand.forEach(t => console.log('   ', t.tag + '.' + t.cls, 'aria=' + JSON.stringify(t.aria), 'rect=' + JSON.stringify(t.rect), 'inline=' + JSON.stringify(t.inline)));
  console.log('  右缘越界:', JSON.stringify(drawer.overRight));
  await p.screenshot({ path: path.join(DIR, '_r41_drawer_430.png') });
  console.log('  截图: _r41_drawer_430.png');
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
