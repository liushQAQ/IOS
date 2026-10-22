const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark', ignoreHTTPSErrors: true });
  const p = await c.newPage();
  const ws = [];
  p.on('websocket', w => { ws.push('OPEN ' + w.url().slice(0, 70)); w.on('close', () => ws.push('CLOSE ' + w.url().slice(0, 70))); });
  p.on('console', m => { if (m.type() === 'error') ws.push('ERR ' + m.text().slice(0, 100)); });
  await p.goto('https://liu-gw.tail2a9309.ts.net/?password=Liu326766@&dsh/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(12000);
  const wsOpen = ws.filter(x => x.startsWith('OPEN')).length, wsClose = ws.filter(x => x.startsWith('CLOSE')).length;
  console.log('WS open/close:', wsOpen, '/', wsClose);
  console.log(ws.slice(0, 8).join('\n'));
  const st = await p.evaluate(() => ({
    url: location.href.slice(0, 90),
    welcome: (document.body.textContent || '').indexOf('选择工作区') >= 0,
    loading: (document.body.textContent || '').indexOf('正在加载') >= 0,
    composer: !!document.querySelector('[class*="composerStack"]'),
    sessions: document.querySelectorAll('[class*="sessionRow"]').length,
    txt: (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  }));
  console.log('ST:', JSON.stringify(st));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_gw0.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
