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
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: DIR + '/_flx_state0.png' });
  const btn = await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]');
    if (!x) return { found: false };
    const r = x.getBoundingClientRect();
    const cs = getComputedStyle(x);
    let pe = x.parentElement, chain = [];
    while (pe && chain.length < 5) { const c2 = getComputedStyle(pe); chain.push({ disp: c2.display, vis: c2.visibility, h: pe.getBoundingClientRect().height }); pe = pe.parentElement; }
    return { found: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, disp: cs.display, chain };
  });
  console.log('BTN:', JSON.stringify(btn));
  // DOM click 打开抽屉
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: DIR + '/_flx_state1.png' });
  const sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 25)));
  console.log('SESSIONS:', JSON.stringify(sess.slice(0, 6)));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
