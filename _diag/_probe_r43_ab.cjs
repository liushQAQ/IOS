/* ============================================================================
 * R43 A/B 对拍：同一环境同一路径，只换注入资产（修复前 / 修复后）
 *   路径：首页 → 开右侧抽屉 → 主窗格出现「开始页」（=老总真机那张图的形态）
 *   用法：node _diag/_probe_r43_ab.cjs app_inject_before_r43.js before
 *         node _diag/_probe_r43_ab.cjs app_inject.js after
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const ASSET = process.argv[2] || 'app_inject.js';
const TAG = process.argv[3] || 'after';
const APP_JS = fs.readFileSync(path.join(DIR, ASSET), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const AUDIT = () => {
  var out = { vw: window.innerWidth, clusters: [], cover: [] };
  var all = document.querySelectorAll('[class*="stripChrome"]');
  for (var i = 0; i < all.length; i++) {
    var c = all[i], r = c.getBoundingClientRect();
    if (r.width <= 0) continue;
    out.clusters.push({
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      visible: r.left < window.innerWidth,
      inline: (c.getAttribute('style') || '').slice(0, 90),
      bg: getComputedStyle(c).backgroundColor
    });
  }
  // 顶带里带不透明底色的元素（遮挡源）
  var all2 = document.querySelectorAll('body *');
  for (var j = 0; j < all2.length && out.cover.length < 8; j++) {
    var e = all2[j], r2 = e.getBoundingClientRect();
    if (r2.width <= 0 || r2.height <= 0 || r2.top > 140) continue;
    var bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !/^rgb\(2[45][0-9], 2[45][0-9], 2[45][0-9]\)$/.test(bg)) {
      out.cover.push({ cls: (typeof e.className === 'string' ? e.className.split(' ')[0] : '').slice(0, 28), rect: [Math.round(r2.left), Math.round(r2.top), Math.round(r2.width), Math.round(r2.height)], bg: bg });
    }
  }
  var tsh = document.querySelector('[class*="tabHostHeader"]');
  if (tsh) { var t = tsh.getBoundingClientRect(); out.tabHost = { rect: [Math.round(t.left), Math.round(t.top), Math.round(t.width), Math.round(t.height)], inline: tsh.getAttribute('style') || '' }; }
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    try { (0, eval)(js); } catch (e) {}
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
  await p.waitForTimeout(2600);
  const a = await p.evaluate(AUDIT);
  console.log('[' + TAG + '] clusters=' + JSON.stringify(a.clusters));
  console.log('[' + TAG + '] tabHost=' + JSON.stringify(a.tabHost));
  console.log('[' + TAG + '] 顶带不透明底=' + JSON.stringify(a.cover));
  await p.screenshot({ path: path.join(DIR, '_r43_' + TAG + '_full.png') });
  await p.screenshot({ path: path.join(DIR, '_r43_' + TAG + '_top.png'), clip: { x: 0, y: 0, width: 430, height: 130 } });
  await b.close();
  console.log('[' + TAG + '] 截图: _r43_' + TAG + '_full.png / _top.png');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
