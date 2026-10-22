const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('[pageerror] ' + String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(12000);
  const rootHtmlLen = await page.evaluate(() => (document.querySelector('#root') || {}).innerHTML?.length || 0);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('=== root innerHTML length:', rootHtmlLen);
  console.log('=== body text ===');
  console.log(bodyText);
  console.log('=== errors (' + errors.length + ') ===');
  errors.slice(0, 15).forEach(e => console.log(e));
  await browser.close();
})().catch(e => { console.error('PROBE_FAIL', e.message); process.exit(1); });
