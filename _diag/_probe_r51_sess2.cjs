const path = require('path');
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
  await p.waitForTimeout(5000);
  const out = await p.evaluate(() => {
    const rr = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const tabs = document.querySelector('[data-conversation-tabs]');
    const chip = document.querySelector('.dshp-rewind-chip');
    const rewindBtn = document.querySelector('.dshp-rewind');
    const card = document.querySelector('[class*="composerStack"]');
    let composerHasRewind = false, composerBtns = [];
    if (card) card.querySelectorAll('button').forEach(b => {
      if (String(b.className).indexOf('dshp-rewind') >= 0) composerHasRewind = true;
      composerBtns.push([b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 12), rr(b)]);
    });
    return {
      inSession: !!card,
      tabsRow: tabs ? rr(tabs) : null,
      chip: chip ? { rect: rr(chip), parentIsTabs: chip.parentElement === tabs, cs: getComputedStyle(chip).alignSelf + '/' + getComputedStyle(chip).flex } : null,
      rewindBtn: rewindBtn ? { rect: rr(rewindBtn), text: (rewindBtn.textContent || '').trim() } : null,
      composerHasRewind, composerBtns,
      rowKids: tabs ? Array.from(tabs.children).map(k => ({ c: String(k.className).slice(0, 30), r: rr(k), t: (k.textContent || '').trim().slice(0, 10) })) : null,
    };
  });
  console.log(JSON.stringify(out));
  await p.screenshot({ path: path.join(__dirname, '_r51_sess2.png') });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
