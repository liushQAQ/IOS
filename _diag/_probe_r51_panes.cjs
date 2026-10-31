const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.addScriptTag({ path: path.join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*="paneBody"], [class*="tabHostBody"], [class*="guide"], [class*="tabHostHeader"]').forEach(el => {
      const r = el.getBoundingClientRect();
      rows.push({ cls: String(el.className).slice(0, 70), rect: [Math.round(r.left), Math.round(r.right), Math.round(r.width)], inlineTf: el.style.transform || null, inlineAll: (el.getAttribute('style') || '').slice(0, 140), parent: el.parentElement ? String(el.parentElement.className).slice(0, 40) : null });
    });
    // 全抽屉子树里所有带 inline transform 的元素
    const panel = document.querySelector('[data-sidebar-right-open], .dMHGga_panel');
    const tfs = [];
    if (panel) panel.querySelectorAll('*').forEach(el => { const t = el.style.transform; if (t) tfs.push({ cls: String(el.className).slice(0, 50), tf: t, rect: [Math.round(el.getBoundingClientRect().left), Math.round(el.getBoundingClientRect().width)] }); });
    return { rows, tfs };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
