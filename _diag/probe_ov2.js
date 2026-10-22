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
  await p.waitForTimeout(1500);
  await clearDialog(p);
  // 点「选择工作区」
  try { await p.click('text=选择工作区', { timeout: 6000 }); } catch (e) { console.log('ws click fail'); }
  let item = null;
  for (let i = 0; i < 15; i++) {
    await p.waitForTimeout(2000);
    item = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, [class*="option"], [class*="menu"] [class*="item"], [class*="popover"] div, [class*="Item"]')).filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 120 && r.height > 24 && r.height < 90 && (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length < 40 && (e.textContent || '').indexOf('正在加载') < 0 && (e.textContent || '').indexOf('选择') < 0;
      });
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return { t: (els[0].textContent || '').trim().slice(0, 20), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (item) break;
  }
  console.log('ITEM:', JSON.stringify(item));
  if (item) { await p.mouse.click(item.x, item.y); await p.waitForTimeout(6000); }
  await clearDialog(p);
  // 开抽屉找会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2500);
  const sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 25)));
  console.log('SESSIONS:', JSON.stringify(sess.slice(0, 8)));
  // 点目标会话
  const hit = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('0815') >= 0 || (e.textContent || '').indexOf('晴天') >= 0) || rows[0];
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { t: (t.textContent || '').trim().slice(0, 20), x: r.x + 60, y: r.y + r.height / 2 };
  });
  console.log('HIT:', JSON.stringify(hit));
  if (hit) { await p.mouse.click(hit.x, hit.y); }
  // 等消息流渲染
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => document.querySelectorAll('[class*="message"], [class*="Message"]').length > 3)) break;
  }
  await p.waitForTimeout(3000);
  await clearDialog(p);
  await p.screenshot({ path: DIR + '/_ov_state1.png' });
  // 全页滚动到消息区找重叠
  await p.evaluate(() => { const sc = document.querySelector('[data-mobile-nav="frame"] [class*="scroll"], [class*="conversation"] '); });
  await p.screenshot({ path: DIR + '/_ov_full.png', fullPage: false });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
