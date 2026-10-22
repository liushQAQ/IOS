const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3081/', { waitUntil: 'load', timeout: 30000 }).catch(e => console.log('nav err', e.message.slice(0, 60)));
  await p.waitForTimeout(6000);
  console.log('TITLE:', await p.title());
  console.log('URL:', p.url());
  const txt = await p.evaluate(() => (document.body.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200));
  console.log('BODY:', txt);
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_3081.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
