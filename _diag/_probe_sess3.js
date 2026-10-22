const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3083/?password=Liu326766@', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  const raw = await page.evaluate(async () => {
    const body = { type: 'client-request', rpcId: 'probe-' + Date.now(), method: 'session/list', payload: { args: { _request: {} } } };
    const r = await fetch('/api/session/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await r.text();
  });
  require('fs').writeFileSync('_sessions_raw.json', raw);
  console.log(raw.slice(0, 800));
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
