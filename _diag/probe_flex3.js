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
  // 等弹窗二次弹出再清一次
  await p.waitForTimeout(2000);
  await clearDialog(p);
  // 若在工作区选择页：点开下拉选第一个
  const ws = await p.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div, span, button')).find(e => (e.textContent || '').trim().startsWith('选择工作区') && e.getBoundingClientRect().width > 50 && e.getBoundingClientRect().width < 300);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + 30, y: r.y + r.height / 2 };
  });
  console.log('WS:', JSON.stringify(ws));
  if (ws) {
    await p.mouse.click(ws.x, ws.y);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: DIR + '/_flx_ws.png' });
    // 点第一个菜单项
    const item = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, [class*="option"], [class*="item"]')).filter(e => e.getBoundingClientRect().width > 100 && e.getBoundingClientRect().height > 20 && e.getBoundingClientRect().height < 80 && (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length < 40);
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return { t: (els[0].textContent || '').trim().slice(0, 20), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    console.log('ITEM:', JSON.stringify(item));
    if (item) { await p.mouse.click(item.x, item.y); }
    await p.waitForTimeout(4000);
  }
  await clearDialog(p);
  await p.screenshot({ path: DIR + '/_flx_state2.png' });
  const sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 25)));
  console.log('SESSIONS:', JSON.stringify(sess.slice(0, 6)));
  const trigs = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="_trigger"]')).map(e => { const r = e.getBoundingClientRect(); return { cls: (e.className || '').toString().slice(0, 40), x: Math.round(r.x), w: Math.round(r.width) }; }));
  console.log('TRIGGERS:', JSON.stringify(trigs));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
