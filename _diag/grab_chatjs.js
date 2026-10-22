const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  let got = 0;
  p.on('response', async r => {
    const u = r.url();
    if (u.indexOf('dsh-client-ui-chat') >= 0 || (u.indexOf('plugins/??') >= 0 && got < 3)) {
      try {
        const body = await r.body();
        const name = u.replace(/[^a-z0-9]/gi, '_').slice(-80);
        fs.writeFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/_served_' + got + '_' + name + '.js', body);
        console.log('SAVED', r.status(), body.length, u.slice(0, 110));
        got++;
      } catch (e) { console.log('body err', e.message.slice(0, 60)); }
    }
  });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(12000);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
