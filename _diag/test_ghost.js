const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const q of ['', '?oldios=1', '?oldios=1&shim=1', '?shim=1']) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto('file:///E:/desktop/所有skill/deepseek-harness-ios/_diag/repro_shimmer_ghost.html' + q);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => window.__measure());
    console.log('=== case "' + (q || 'current-ios') + '" ===');
    console.log('rows:', JSON.stringify(m.rows));
    console.log('decos:', JSON.stringify(m.decos));
    console.log('docScrollH:', m.docScrollH);
    await page.screenshot({ path: `E:/desktop/所有skill/deepseek-harness-ios/_diag/ghost_${q.replace(/[?&=]/g, '_') || 'base'}.png` });
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
