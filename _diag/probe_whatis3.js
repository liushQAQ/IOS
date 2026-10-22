const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2000);
  const labels = await p.evaluate(() => Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).filter(l => l.indexOf('侧边栏') >= 0 || l.indexOf('边栏') >= 0));
  console.log('ARIA:', JSON.stringify(labels));
  const st = await p.evaluate(() => {
    const fm = document.querySelector('[data-mobile-nav]');
    return fm ? fm.getAttribute('data-mobile-nav') : 'none';
  });
  console.log('NAV STATE:', st);
  // 用真实鼠标点第一个侧边栏按钮
  const pt = await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"], [aria-label="收起侧边栏"]');
    if (!x) return null;
    const r = x.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('BTN PT:', JSON.stringify(pt));
  if (pt) { await p.mouse.click(pt.x, pt.y); }
  await p.waitForTimeout(3000);
  const st2 = await p.evaluate(() => {
    const fm = document.querySelector('[data-mobile-nav]');
    return fm ? fm.getAttribute('data-mobile-nav') : 'none';
  });
  console.log('NAV STATE2:', st2);
  const sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 25)));
  console.log('SESSIONS:', JSON.stringify(sess.slice(0, 8)));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
