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
    // 现行 sc 命中什么
    const sc = document.querySelector('[class*="VERcba_standardControls"], [class*="standardControls"], [class*="trailing"]');
    // 发送按钮及其各级父链
    const send = document.querySelector('[aria-label="发送消息"]');
    const chain = [];
    let e = send;
    for (let i = 0; e && i < 8; i++, e = e.parentElement) {
      const r = e.getBoundingClientRect();
      chain.push({ cls: String(e.className).slice(0, 46), rect: [Math.round(r.left), Math.round(r.right)], disp: getComputedStyle(e).display });
    }
    // 底排整行（add/trigger 所在父行）
    const add = document.querySelector('[aria-label="添加文件或调用指令"], button[class*="_add"]');
    const rowChain = [];
    e = add;
    for (let i = 0; e && i < 6; i++, e = e.parentElement) {
      const r = e.getBoundingClientRect();
      rowChain.push({ cls: String(e.className).slice(0, 46), rect: [Math.round(r.left), Math.round(r.right), Math.round(r.top)], disp: getComputedStyle(e).display });
    }
    return {
      scFound: !!sc, scCls: sc ? String(sc.className).slice(0, 50) : null,
      scRect: sc ? [Math.round(sc.getBoundingClientRect().left), Math.round(sc.getBoundingClientRect().right)] : null,
      sendChain: chain, addRowChain: rowChain,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
