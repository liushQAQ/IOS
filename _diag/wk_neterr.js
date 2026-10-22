// 抓 9060 网关路径在 WebKit 下的失败请求与控制台错误
const { webkit } = require('playwright');

const TARGET = process.argv[2] || 'http://127.0.0.1:9060/dsh/?password=Liu326766@';

(async () => {
  const b = await webkit.launch();
  const c = await b.newContext({
    viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  });
  const p = await c.newPage();

  const fails = [], errs = [], cons = [];
  p.on('requestfailed', (r) => fails.push(r.url().slice(0, 150) + ' :: ' + (r.failure() && r.failure().errorText)));
  p.on('response', (r) => { if (r.status() >= 400) fails.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 140)); });
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') cons.push(m.type() + ': ' + m.text().slice(0, 300)); });

  await p.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(16000);

  const st = await p.evaluate(() => {
    const r = document.getElementById('root');
    return {
      root: !!r, kids: r ? r.children.length : -1,
      textLen: r ? String(r.innerText || '').trim().length : -1,
      moduleLoader: typeof window.__ModuleLoader__,
      bootKeys: window.__DSH_BOOT__ ? Object.keys(window.__DSH_BOOT__).join(',') : '',
      scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).slice(0, 6),
    };
  });
  console.log('STATE', JSON.stringify(st, null, 1));
  console.log('--- FAILED (' + fails.length + ')');
  fails.slice(0, 15).forEach((f) => console.log('  ' + f));
  console.log('--- PAGEERROR (' + errs.length + ')');
  errs.slice(0, 8).forEach((f) => console.log('  ' + f));
  console.log('--- CONSOLE (' + cons.length + ')');
  cons.slice(0, 12).forEach((f) => console.log('  ' + f));
  await b.close();
})();
