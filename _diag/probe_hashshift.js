const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  const m = await page.evaluate(() => {
    const r = {};
    r.headerCorner = !!document.querySelector('[class*="headerCorner"]');
    r.composerStack = !!document.querySelector('[class*="composerStack"]');
    r.mobileNavFrame = !!document.querySelector('[data-mobile-nav="frame"]');
    // 找 standardControls 的实际前缀
    const sc = document.querySelector('[class*="standardControls"]');
    r.standardControlsCls = sc ? sc.className.toString() : null;
    const card = document.querySelector('[class*="_card"][class*="composerStack"] *, [class*="composerStack"] [class*="_card"]');
    r.cardCls = card ? card.className.toString().slice(0, 60) : null;
    // primary 按钮类名
    let prim = null;
    document.querySelectorAll('[class*="composerStack"] button').forEach(b => {
      const c = b.className.toString();
      if (c.includes('primary')) prim = c.slice(0, 60);
    });
    r.primaryCls = prim;
    return r;
  }).catch(e => 'EVAL_FAIL ' + e.message);
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
