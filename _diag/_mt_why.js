/**
 * _mt_why.js —— 查清 94/95 顶栏 titleRow.y 相差 39px（35 vs -4）的真因
 * 直接 dump centerCol 的 margin-top / dataset.dshMt / window.__dshMtWant / 元素个数，
 * 判定 95 的「稳态零写入」短路是否把 centerCol 锁在了错误位置。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const B94 = fs.readFileSync(path.join(__dirname, 'app_inject_94.js'), 'utf8');
const B95 = fs.readFileSync(path.join(__dirname, 'app_inject.js'), 'utf8');

const DUMP = `(() => {
  const R = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const cols = [...document.querySelectorAll('[class*="centerCol"]')];
  const row = document.querySelector('[data-phase] header [class*="titleRow"]');
  const out = {
    vw: window.innerWidth,
    sbNative: getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native').trim(),
    rowY: row ? Math.round(row.getBoundingClientRect().y) : null,
    colCount: cols.length,
    want: window.__dshMtWant,
    cols: cols.map((c) => ({
      rect: R(c),
      inlineMt: c.style.marginTop || '(空)',
      dshMt: c.dataset.dshMt || '(未标)',
      inFrame: !!(c.closest && c.closest('[data-mobile-nav="frame"]'))
    }))
  };
  return out;
})()`;

async function run(browser, tag, SHIM, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.addInitScript({ content: 'window.__dshNativeStatusBar = 47; window.__dshTopShift = 18;' });
  await p.addInitScript({ content: SHIM });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { document.documentElement.style.setProperty('--dsh-sb-native', '47px'); });
  await p.waitForTimeout(2500);

  const a = await p.evaluate(DUMP);
  await p.waitForTimeout(4000);
  const b = await p.evaluate(DUMP);

  console.log('[' + tag + ' @' + W + ']');
  console.log('  T1: rowY=' + a.rowY + '  col数=' + a.colCount + '  want=' + a.want);
  a.cols.forEach((c, i) => console.log('     col' + i + ' rect=' + c.rect.join(',') + ' mt=' + c.inlineMt + ' dshMt=' + c.dshMt + ' inFrame=' + c.inFrame));
  console.log('  T2(+4s): rowY=' + b.rowY + '  col数=' + b.colCount + '  want=' + b.want);
  b.cols.forEach((c, i) => console.log('     col' + i + ' rect=' + c.rect.join(',') + ' mt=' + c.inlineMt + ' dshMt=' + c.dshMt + ' inFrame=' + c.inFrame));
  await ctx.close();
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const [tag, SHIM] of [['94', B94], ['95', B95]]) {
    await run(browser, tag, SHIM, 430, 932);
  }
  await browser.close();
})();
