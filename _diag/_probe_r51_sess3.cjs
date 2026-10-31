const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  const logs = [];
  p.on('console', m => { if (/error|warn|dsh-purge|slot/i.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 220)); });
  p.on('pageerror', e => logs.push('PAGEERROR: ' + String(e).slice(0, 220)));
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
    // header 区域全量（会话标题行）
    const hdr = document.querySelector('header');
    const hdrBtns = hdr ? Array.from(hdr.querySelectorAll('button')).map(b => ({ t: (b.textContent || '').trim().slice(0, 14) || b.getAttribute('aria-label'), r: rr(b), c: String(b.className).slice(0, 26) })) : null;
    // 找 tablist（任意 role=tablist）
    const tl = Array.from(document.querySelectorAll('[role="tablist"]')).map(t => ({ r: rr(t), kids: Array.from(t.children).map(k => (k.textContent || '').trim().slice(0, 8) + '@' + rr(k).join(',')) }));
    // data-conversation-tabs 任意形态
    const dct = document.querySelectorAll('[data-conversation-tabs]').length;
    return { hdrBtns, tl, dct, tabsAny: !!document.querySelector('[data-conversation-tabs]') };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('=== console ===');
  logs.slice(0, 25).forEach(l => console.log(l));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
