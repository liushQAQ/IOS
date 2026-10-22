const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  const ws = [];
  p.on('websocket', w => { ws.push('OPEN ' + w.url().slice(0, 60)); w.on('close', () => ws.push('CLOSE ' + w.url().slice(0, 60))); });
  await p.goto('http://127.0.0.1:3083/?token=91306907', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  console.log('WS:', ws.slice(0, 6).join(' | '));
  const st = await p.evaluate(() => ({
    url: location.href.slice(0, 80),
    cookies: document.cookie.slice(0, 80),
    title: document.title.slice(0, 40),
    composer: !!document.querySelector('[class*="composerStack"], [class*="composer"]'),
    welcome: (document.body.textContent || '').indexOf('选择工作区') >= 0,
    loading: (document.body.textContent || '').indexOf('正在加载') >= 0,
    sessions: document.querySelectorAll('[class*="sessionRow"]').length
  }));
  console.log('ST:', JSON.stringify(st));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_auth0.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
