/* 出对照图：详情页顶区（fab 已下移）+ 会话页顶栏（已上移），弹窗先点掉 */
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js', 'utf8');
const APP_CSS = fs.readFileSync('app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');
const dismiss = () => {
  try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) { const btn = Array.from(d.querySelectorAll('button')).find(b => /知道了|确定|关闭|OK/i.test((b.textContent || '').trim())); if (btn) btn.click(); else if (d.close) d.close(); } } catch (e) {}
};
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, css }) => {
    const s = document.createElement('style'); s.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }'; document.head.appendChild(s);
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(dismiss);

  // 会话页顶栏特写
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'v126_conv_top.png', clip: { x: 0, y: 0, width: 430, height: 260 } });

  // 详情页顶区特写
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(dismiss);
  await p.evaluate(() => { const t = document.querySelector('[aria-label^="查看"]') || Array.from(document.querySelectorAll('[class*="cardTitle"]'))[0]; if (t) t.click(); });
  await p.waitForTimeout(3500);
  await p.evaluate(dismiss);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'v126_detail_top.png', clip: { x: 0, y: 0, width: 430, height: 300 } });
  await b.close();
  console.log('shots done');
})();
