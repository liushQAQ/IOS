const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { window.__dshNativeStatusBar = 59; window.__dshTopShift = 18; document.documentElement.style.setProperty('--dsh-sb-native', '59px'); document.documentElement.style.setProperty('--dsh-topshift', '18px'); });
  await p.addScriptTag({ path: path.join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(5000);
  const dump = label => p.evaluate(l => {
    const strip = document.querySelector('[class*="tabStrip"], [data-dockkit-strip]');
    if (!strip) return { label: l, noStrip: true };
    const out = { label: l, chain: [] };
    let el = strip;
    for (let i = 0; el && i < 10; i++, el = el.parentElement) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      out.chain.push(String(el.tagName) + '.' + String(el.className).slice(0, 24) + (el.hasAttribute('data-dockkit-surface') ? '[surface]' : '') + (el.hasAttribute('data-sidebar-right-open') ? '[open]' : '') + ' pos=' + cs.position + ' pt=' + cs.paddingTop + ' top=' + r.top.toFixed(0));
    }
    return out;
  }, label);
  await p.evaluate(() => { const b = document.querySelector('[data-sidebar-right-toggle], header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]'); if (b) b.click(); });
  await dump('t+60ms').then(r => console.log(JSON.stringify(r, null, 0)));
  await p.waitForTimeout(60);
  const d1 = await dump('t+120ms'); console.log(JSON.stringify(d1, null, 0));
  await p.waitForTimeout(1400);
  const d2 = await dump('t+1.5s'); console.log(JSON.stringify(d2, null, 0));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
