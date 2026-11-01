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
  const report = await p.evaluate(async () => {
    const toggle = () => document.querySelector('[data-sidebar-right-toggle], header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    const col0 = document.querySelector('[class*="rightbarCol"]');
    if (col0 && col0.getBoundingClientRect().left < innerWidth / 2) { toggle().click(); await new Promise(r => setTimeout(r, 1300)); }
    const grab = () => {
      const strip = document.querySelector('[class*="tabStrip"], [data-dockkit-strip]');
      if (!strip) return { noStrip: true };
      let el = strip, chain = [];
      for (let i = 0; el && i < 6; i++, el = el.parentElement) {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        chain.push({
          cls: String(el.className).slice(0, 28) + (el.getAttribute('data-dockkit-surface') !== null ? '[surface]' : '') + (el.getAttribute('data-sidebar-right-open') !== null ? '[open]' : ''),
          pos: cs.position, top: cs.top, pt: cs.paddingTop, mt: cs.marginTop,
          rectTop: Math.round(r.top * 10) / 10,
          inlinePT: el.style.paddingTop || '-', inlineTop: el.style.top || '-',
        });
      }
      const cssVar = getComputedStyle(document.querySelector('[class*="rightbarCol"]')).getPropertyValue('--dsh-statusbar');
      return { chain, sb: (cssVar || '-').trim(), t: Date.now() };
    };
    const start = Date.now();
    toggle().click();
    const seq = [];
    let lastKey = '';
    while (Date.now() - start < 2200) {
      const s = grab();
      const key = JSON.stringify(s.chain ? s.chain.map(c => c.rectTop + '/' + c.pt + '/' + c.top + '/' + c.pos) : s);
      if (key !== lastKey) { seq.push({ dt: Date.now() - start, ...s }); lastKey = key; }
      await new Promise(r => setTimeout(r, 30));
      if (seq.length > 10) break;
    }
    return seq;
  });
  console.log(JSON.stringify(report, null, 1).slice(0, 4200));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
