const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto('file:///E:/desktop/所有skill/deepseek-harness-ios/_diag/repro_shimmer_overlap.html');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => window.__measure());
  console.log(JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/repro_shimmer_webkit.png' });
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
