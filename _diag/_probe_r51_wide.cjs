const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); }).catch(() => {});
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    const rr = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
    const tabs = document.querySelector('[data-conversation-tabs]');
    const chip = document.querySelector('.dshp-rewind-chip');
    const btn = document.querySelector('.dshp-rewind');
    const card = document.querySelector('[class*="composerStack"]');
    let composerHasRewind = false, composerNativeOk = true, composerBtns = [];
    if (card) card.querySelectorAll('button').forEach(b => {
      const cls = String(b.className);
      if (cls.indexOf('dshp-rewind') >= 0) composerHasRewind = true;
      const r0 = b.getBoundingClientRect();
      composerBtns.push([b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 10), rr(b)]);
    });
    // tab 行两两重叠检查
    let overlaps = 0, pair = '';
    if (tabs) {
      const kids = Array.from(tabs.children).map(k => ({ r: k.getBoundingClientRect(), t: (k.textContent || '').trim().slice(0, 8) })).filter(k => k.r.width > 2);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].r, b = kids[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1) { overlaps++; pair = kids[i].t + '×' + kids[j].t; }
      }
    }
    const rowKids = tabs ? Array.from(tabs.children).map(k => ({ c: String(k.className).slice(0, 22), r: rr(k), t: (k.textContent || '').trim().slice(0, 8) })) : null;
    return {
      tabsRow: tabs ? rr(tabs) : null,
      chipInTabs: chip ? chip.parentElement === tabs : null,
      chipRect: chip ? rr(chip) : null,
      chipCs: chip ? getComputedStyle(chip).alignSelf + '/' + getComputedStyle(chip).flex + '/top=' + getComputedStyle(chip).top : null,
      btnRect: btn ? rr(btn) : null, btnText: btn ? (btn.textContent || '').trim() : null,
      composerHasRewind, composerBtns,
      overlaps, pair, rowKids,
      docSW: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  console.log(JSON.stringify(out));
  // 点回退看菜单方向（上半屏 → 应向下展开：菜单 top > 按钮 bottom）
  await p.evaluate(() => { const b = document.querySelector('.dshp-rewind'); if (b) b.click(); });
  await p.waitForTimeout(900);
  const menu = await p.evaluate(() => {
    const m = document.querySelector('.dshp-rewind-menu');
    const b = document.querySelector('.dshp-rewind');
    if (!m) return { open: false };
    const rm = m.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { open: true, menuTop: Math.round(rm.top), menuBottom: Math.round(rm.bottom), btnBottom: Math.round(rb.bottom), downward: rm.top >= rb.bottom - 2, items: Array.from(m.querySelectorAll('button')).map(x => (x.textContent || '').trim().slice(0, 10)) };
  });
  console.log('menu:', JSON.stringify(menu));
  await p.screenshot({ path: path.join(__dirname, '_r51_final_rewind.png') });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
