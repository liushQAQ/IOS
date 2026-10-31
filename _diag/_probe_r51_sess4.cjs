const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); }).catch(() => {});
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    const rr = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const dshp = [];
    document.querySelectorAll('[class*="dshp-"]').forEach(el => {
      dshp.push({ c: String(el.className).slice(0, 34), r: rr(el), t: (el.textContent || '').trim().slice(0, 10) });
    });
    // 会话标题行（titleRow）里有什么
    const tr = document.querySelector('header [class*="titleRow"], [class*="titleRow"]');
    const trKids = tr ? Array.from(tr.querySelectorAll('button, [role="button"]')).map(b => ({ t: (b.textContent || '').trim().slice(0, 12) || b.getAttribute('aria-label'), r: rr(b) })) : null;
    // headerActions / headerUtilities
    const hau = [];
    document.querySelectorAll('[class*="headerAction"], [class*="headerUtilit"], [class*="crumbs"]').forEach(el => hau.push({ c: String(el.className).slice(0, 30), r: rr(el) }));
    return { dshp, trKids, hau, title: tr ? (tr.textContent || '').trim().slice(0, 20) : null };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
