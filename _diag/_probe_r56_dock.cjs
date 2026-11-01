const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(5000);
  const out = await p.evaluate(() => {
    // 找 dock：composerStack 内、含「费用明细」或 round/step 统计 pill 的行容器
    const stack = document.querySelector('[class*="composerStack"]');
    if (!stack) return { noStack: true };
    let dock = null;
    stack.querySelectorAll('div').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 300 && r.height > 20 && r.height < 120 && el.querySelector('[class*="cm-"], [class*="stat"]')) {
        const cs = getComputedStyle(el);
        if (!dock && (cs.display === 'flex' || cs.display === 'inline-flex')) dock = el;
      }
    });
    if (!dock) return { noDock: true };
    const r0 = dock.getBoundingClientRect();
    const kids = Array.from(dock.children).map(k => ({ t: (k.textContent || '').trim().slice(0, 12), r: [Math.round(k.getBoundingClientRect().left), Math.round(k.getBoundingClientRect().right)], w: Math.round(k.getBoundingClientRect().width) }));
    // 命中我们的 wrap 规则吗：composerStack 后代且 class 含 dock
    const hitWrap = !!dock.closest('[class*="composerStack"]') && (function (el) { let e = el; while (e && e !== document.body) { if ((String(e.className)).indexOf('dock') >= 0) return true; e = e.parentElement; } return false; })(dock);
    return {
      dockCls: String(dock.className).slice(0, 60),
      rect: [Math.round(r0.left), Math.round(r0.right), Math.round(r0.width), Math.round(r0.height)],
      display: getComputedStyle(dock).display, flexWrap: getComputedStyle(dock).flexWrap,
      overflowX: getComputedStyle(dock).overflowX,
      scrollW: dock.scrollWidth, clientW: dock.clientWidth,
      hitWrap, kids, vw: innerWidth,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
