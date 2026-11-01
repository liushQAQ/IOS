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
    window.__dbgTypes = [];
    const dbg = new MutationObserver(ms => {
      window.__dbgTypes = window.__dbgTypes.concat(ms.map(m => m.type));
      if (window.__dbgTypes.length > 30) dbg.disconnect();
    });
    dbg.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'], childList: true, subtree: true });
    const el = document.createElement('div');
    el.className = 'fake rightbarCol test';
    document.body.appendChild(el);
    const t0 = Date.now();
    let padAt = null;
    while (Date.now() - t0 < 600) {
      if (el.style.getPropertyValue('padding-top') === '79px') { padAt = Date.now() - t0; break; }
      await new Promise(r => setTimeout(r, 8));
    }
    await new Promise(r => setTimeout(r, 100));
    const types = {};
    window.__dbgTypes.forEach(t => types[t] = (types[t] || 0) + 1);
    el.remove();
    return { padAt, dbgTypes: types, n: window.__dbgTypes.length };
  });
  console.log(JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
