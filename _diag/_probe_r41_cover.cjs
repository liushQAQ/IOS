/* ============================================================================
 * R41-六犯 命中测试探针：找出「谁盖住了开始页顶栏」
 *   真机形态（老总 20:41:45 截图）：主窗格 = 开始页（🧭开始 + 三张卡片），抽屉关闭，
 *   顶栏整行只露出最底部 ~7pt（罗盘/「开始」/右侧按钮全被盖住）。
 *   做法：复现该状态 → 逐 y 做 elementFromPoint 命中测试 + 打印覆盖层几何/背景。
 * 用法：node _diag/_probe_r41_cover.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const PROBE = () => {
  function desc(el) {
    if (!el) return 'null';
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ')[0] : '').slice(0, 28)
      + (el.getAttribute('aria-label') ? '[aria=' + el.getAttribute('aria-label') + ']' : '')
      + ' rect=' + [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',')
      + ' pos=' + cs.position + ' z=' + cs.zIndex + ' bg=' + cs.backgroundColor;
  }
  var out = { vw: window.innerWidth, vh: window.innerHeight };
  out.hitLeft = [];   // x=60 竖扫（罗盘/开始 文字处）
  out.hitMid = [];    // x=215 竖扫
  out.hitRight = [];  // x=400 竖扫（右侧按钮处）
  for (var y = 30; y <= 120; y += 6) {
    out.hitLeft.push(y + ': ' + desc(document.elementFromPoint(60, y)));
    out.hitMid.push(y + ': ' + desc(document.elementFromPoint(215, y)));
    out.hitRight.push(y + ': ' + desc(document.elementFromPoint(400, y)));
  }
  // 覆盖候选：top<100 且宽度>vw*0.6 的可见元素
  out.wide = [];
  try {
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      if (r.width < window.innerWidth * 0.6 || r.height <= 0) continue;
      if (r.top > 100) continue;
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue;
      out.wide.push({ d: desc(el), bottom: Math.round(r.bottom), inline: (el.getAttribute('style') || '').slice(0, 130) });
    }
  } catch (e) {}
  var hdr = document.querySelector('header');
  if (hdr) { var hr = hdr.getBoundingClientRect(); out.header = { rect: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)], bg: getComputedStyle(hdr).backgroundColor, inline: (hdr.getAttribute('style') || '').slice(0, 200) }; }
  var th = document.querySelector('[class*="tabHostHeader"]');
  if (th) { var tr = th.getBoundingClientRect(); out.tabHost = { rect: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.width), Math.round(tr.height)], bg: getComputedStyle(th).backgroundColor, z: getComputedStyle(th).zIndex, pos: getComputedStyle(th).position, inline: (th.getAttribute('style') || '').slice(0, 200) }; }
  var ts = document.querySelector('[class*="tabStrip"]');
  if (ts) { var sr = ts.getBoundingClientRect(); out.tabStrip = { rect: [Math.round(sr.left), Math.round(sr.top), Math.round(sr.width), Math.round(sr.height)], bg: getComputedStyle(ts).backgroundColor, z: getComputedStyle(ts).zIndex, pos: getComputedStyle(ts).position, inline: (ts.getAttribute('style') || '').slice(0, 200) }; }
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

  // 开抽屉 → 主窗格出现「开始页」
  const r1 = await p.evaluate(() => {
    var t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]');
    if (t) { t.click(); return 'clicked'; } return 'no-btn';
  });
  console.log('[开抽屉]', r1);
  await p.waitForTimeout(2500);
  // 关抽屉（回到老总截图那一态：抽屉关、主窗格仍是开始页）
  const r2 = await p.evaluate(() => {
    var cands = Array.from(document.querySelectorAll('button'));
    var t = cands.find(e => (e.getAttribute('aria-label') || '') === '收起右侧边栏');
    if (t) { t.click(); return 'closed-by-btn'; } return 'no-close-btn';
  });
  console.log('[关抽屉]', r2);
  await p.waitForTimeout(2500);

  const s = await p.evaluate(PROBE);
  console.log('[header]', JSON.stringify(s.header));
  console.log('[tabHost]', JSON.stringify(s.tabHost));
  console.log('[tabStrip]', JSON.stringify(s.tabStrip));
  console.log('[x=60 竖扫]'); s.hitLeft.forEach(x => console.log('  ' + x));
  console.log('[x=400 竖扫]'); s.hitRight.forEach(x => console.log('  ' + x));
  console.log('[宽覆盖层]'); s.wide.forEach(x => console.log('  ' + x.d + ' bottom=' + x.bottom + ' inline=' + JSON.stringify(x.inline)));
  await p.screenshot({ path: path.join(DIR, '_r41_cover_430.png') });
  console.log('  截图: _r41_cover_430.png');
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
