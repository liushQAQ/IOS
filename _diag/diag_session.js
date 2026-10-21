// 诊断：抽屉行内容 + 点击后页面状态
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 120)));
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
    try { (0, eval)(js); } catch (e) { console.log('APP_JS ERR', e.message); }
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  const drawerBtn = await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    return x ? 'found' : 'missing';
  });
  console.log('drawer btn:', drawerBtn);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  const rows = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('[class*="sessionRow"]')).slice(0, 8).map(e => {
      const r = e.getBoundingClientRect();
      return { txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), y: Math.round(r.y), h: Math.round(r.height) };
    });
  });
  console.log('rows:', JSON.stringify(rows));
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => /Our Free Model|简单数学运算/.test(e.textContent || '')) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(12000);
  const st = await p.evaluate(() => ({
    composerStack: !!document.querySelector('[class*="composerStack"]'),
    textarea: !!document.querySelector('[class*="composerStack"] textarea'),
    ce: !!document.querySelector('[class*="composerStack"] [contenteditable="true"]'),
    dialogOpen: !!document.querySelector('dialog[open], [class*="cm-billion-notice"]'),
    title: (document.querySelector('[class*="pageHead"], header') || {}).textContent ? document.querySelector('[class*="pageHead"], header').textContent.replace(/\s+/g, ' ').slice(0, 40) : null,
    bodyLen: (document.body.innerText || '').length,
    dock: !!document.querySelector('[class*="VERcba_dock"]'),
  }));
  console.log('state:', JSON.stringify(st, null, 1));
  await b.close();
})();
