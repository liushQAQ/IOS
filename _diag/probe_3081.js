const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3081/', { waitUntil: 'load', timeout: 30000 }).catch(e => console.log('nav err', e.message.slice(0, 60)));
  await p.waitForTimeout(9000);
  const st = await p.evaluate(() => ({
    welcome: !!Array.from(document.querySelectorAll('*')).find(e => (e.textContent || '').trim() === '选择工作区' && e.children.length === 0),
    loading: (document.body.textContent || '').indexOf('正在加载工作区') >= 0,
    composer: !!document.querySelector('[class*="composerStack"]'),
    sessionRows: document.querySelectorAll('[class*="sessionRow"]').length
  }));
  console.log('3081:', JSON.stringify(st));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
