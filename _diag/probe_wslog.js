const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  const logs = [];
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' || t.indexOf('WebSocket') >= 0 || t.indexOf('socket') >= 0) logs.push(m.type() + ' ' + t.slice(0, 140)); });
  p.on('websocket', ws => logs.push('WS_OPEN ' + ws.url().slice(0, 100)));
  p.on('websocket', ws => { ws.on('close', () => logs.push('WS_CLOSE ' + ws.url().slice(0, 100))); ws.on('socketerror', e => logs.push('WS_ERR ' + ws.url().slice(0, 100))); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(15000);
  console.log(logs.slice(0, 30).join('\n') || '(no logs)');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
