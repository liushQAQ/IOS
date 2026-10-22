const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
async function clearDialog(p) {
  for (let i = 0; i < 6; i++) {
    const ok = await p.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!ok) return;
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) { await p.waitForTimeout(800); continue; }
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1200);
  }
}
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await clearDialog(p);
  await p.waitForTimeout(2000);
  await clearDialog(p);
  // 状态诊断
  const st = await p.evaluate(() => {
    const fm = document.querySelector('[data-mobile-nav]');
    return {
      nav: fm ? fm.getAttribute('data-mobile-nav') : 'none',
      composer: !!document.querySelector('[class*="composerStack"]'),
      sessions: Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 20)).slice(0, 6),
      bodyTxt: (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    };
  });
  console.log('ST:', JSON.stringify(st));
  await p.screenshot({ path: DIR + '/_ov_state0.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
