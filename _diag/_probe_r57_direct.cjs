const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { window.__dshNativeStatusBar = 59; window.__dshTopShift = 18; });
  await p.addScriptTag({ path: path.join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => {
    const el = document.createElement('div');
    el.className = 'fake rightbarCol test';
    document.body.appendChild(el);
    const t0 = Date.now();
    let padAt = null;
    while (Date.now() - t0 < 500) {
      if (el.style.getPropertyValue('padding-top') === '79px') { padAt = Date.now() - t0; break; }
      await new Promise(r => setTimeout(r, 8));
    }
    el.remove();
    // 对照：sidebarCol 同样验证
    const el2 = document.createElement('div');
    el2.className = 'fake sidebarCol test';
    document.body.appendChild(el2);
    const t1 = Date.now();
    let padAt2 = null;
    while (Date.now() - t1 < 500) {
      if (el2.style.getPropertyValue('padding-top') === '79px') { padAt2 = Date.now() - t1; break; }
      await new Promise(r => setTimeout(r, 8));
    }
    el2.remove();
    return { rightbarColPadMs: padAt, sidebarColPadMs: padAt2 };
  });
  console.log(JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
