const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); }).catch(() => {});
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(5000);
  // 不注入 app shim（裸 DSH）——先看官方行为：+ 点开弹层是否存活
  const r = await p.evaluate(async () => {
    const plus = document.querySelector('button[class*="VERcba_add"], button[aria-label="添加文件或调用指令"], button[aria-label*="添加"]');
    if (!plus) return { noPlus: true };
    const rr = plus.getBoundingClientRect();
    const top = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    plus.click();
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await new Promise(r2 => setTimeout(r2, 250));
      const menu = document.querySelector('[data-trigger-menu], [data-composer-overlay] [role="menu"], [role="menu"][aria-label*="指令"], [class*="triggerMenu"], [class*="commandMenu"]');
      const items = document.querySelectorAll('[role="menuitem"], [role="option"], [data-command-item]');
      samples.push({ t: (i + 1) * 250, menu: !!menu, items: items.length });
    }
    return { plusRect: [rr.left, rr.top, rr.width, rr.height], hitSelf: top === plus || plus.contains(top), samples };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: '_r37_check.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
