/* v1.0.128 真机等价复现：shim 全部 documentStart 注入 + 原生只调 __dshSetStatusBar
   不手动调 __dshLayoutFix，看几何是否像真机一样完全没生效 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';

// 按 Swift 里的顺序抽出全部 shim（三引号块），逐块 initScript
function extractShims() {
  const src = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift', 'utf8');
  const lines = src.split('\n');
  const start = lines.findIndex(l => l.includes('static let iosCompatShims'));
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('    ]')) { end = i; break; }
  const shims = [];
  let i = start + 1;
  while (i < end) {
    const t = lines[i].trim();
    if (t === '"""') {
      let j = i + 1; const buf = [];
      while (j < end) {
        const tt = lines[j].trim();
        if (tt === '"""' || tt === '"",' || tt === '""') break;
        buf.push(lines[j]); j++;
      }
      shims.push(buf.join('\n'));
      i = j + 1; continue;
    }
    i++;
  }
  return shims;
}

(async () => {
    const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const shims = JSON.parse(require('fs').readFileSync(path.join(DIR, '_shims_rt.json'), 'utf8'));
  console.log('shim count:', shims.length, 'sizes:', shims.map(x => x.length).join(','));
  for (let k = 0; k < shims.length; k++) {
    const idx = k;
    await c.addInitScript(new Function('return ' + JSON.stringify(shims[idx]))());
  }
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 160)); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(5000);
  // 原生下发状态栏（设备上 native 会做的）
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) { console.log('setStatusBar threw', e); } });
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    const f = document.querySelector('[data-mobile-nav="frame"]');
    const col = document.querySelector('[class*="centerCol"]');
    const hdr = document.querySelector('header');
    const lead = hdr ? hdr.querySelector('[class*="headerLeading"]') : null;
    return {
      framePT: f ? getComputedStyle(f).paddingTop : null,
      colTop: col ? Math.round(col.getBoundingClientRect().top) : null,
      colMarginTop: col ? getComputedStyle(col).marginTop : null,
      hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
      hdrPos: hdr ? getComputedStyle(hdr).position : null,
      hdrPadTop: hdr ? getComputedStyle(hdr).paddingTop : null,
      leadH: lead ? getComputedStyle(lead).height : null,
      hasRoot: !!document.getElementById('root'),
      rootId: (document.querySelector('#root') || {}).id || null,
      layoutFixType: typeof window.__dshLayoutFix,
      nativeSB: window.__dshNativeStatusBar,
      topShift: window.__dshTopShift,
    };
  });
  console.log('DEVICE-LIKE ' + JSON.stringify(r, null, 1));
  await b.close();
})();
