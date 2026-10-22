// 轻量健康探针：只看 DSH 页能不能在 45 秒内加载出来（防死循环挂死）
const { webkit } = require('playwright');

(async () => {
  const t0 = Date.now();
  let b = null;
  try {
    b = await webkit.launch({ headless: true });
    const p = await b.newPage({ viewport: { width: 430, height: 932 } });
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(6000);
    const st = await p.evaluate(() => ({
      url: location.href,
      title: document.title,
      hasRoot: !!document.getElementById('root'),
      nodes: document.querySelectorAll('*').length,
      composer: !!document.querySelector('[class*="composerStack"]'),
      header: !!document.querySelector('[class*="headerCorner"]'),
      bodyText: (document.body.innerText || '').slice(0, 120).replace(/\n/g, ' ')
    }));
    console.log('HEALTH', JSON.stringify(st));
    console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } catch (e) {
    console.log('HEALTH_FAIL', e.message.split('\n')[0]);
    console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } finally {
    if (b) { try { await b.close(); } catch (e) {} }
  }
})();
