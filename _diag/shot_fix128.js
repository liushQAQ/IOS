/* v1.0.128 修复前后截图（真机条件：模拟缓存旧 client 的 env=59，且模拟 JS 几何通道死亡：
   只注 CSS、绝不注 JS）。同一页面切换状态，位置完全可比。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const MEASURE = () => {
  const f = document.querySelector('[data-mobile-nav="frame"]');
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const lead = document.querySelector('[data-mobile-nav="frame"] header > [class*="headerLeading"]');
  return {
    framePT: f ? getComputedStyle(f).paddingTop : null,
    colTop: col ? Math.round(col.getBoundingClientRect().top * 10) / 10 : null,
    hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top * 10) / 10 : null,
    leadH: lead ? getComputedStyle(lead).height : null,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6500);
  // 真机条件：缓存里旧 client.js 的 env 规则（同特异性 !important）
  await p.evaluate(() => {
    const fe = document.createElement('style');
    fe.id = '__fakeenv';
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
  });
  await p.waitForTimeout(1500);
  // 进会话（老总截图那种带 tab 的页面）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);
  // 关掉一次性计费公告，别挡镜头
  await p.evaluate(() => { try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) { const btn = Array.from(d.querySelectorAll('button')).find(x => /知道了|确定|关闭|OK/i.test((x.textContent || '').trim())); if (btn) btn.click(); else d.close(); } } catch (e) {} });
  await p.waitForTimeout(600);

  const before = await p.evaluate(MEASURE);
  await p.screenshot({ path: path.join(DIR, 'v128_before.png'), clip: { x: 0, y: 0, width: 430, height: 210 } });

  // 只注 CSS（模拟真机 JS 通道死亡）
  await p.evaluate((css) => {
    const st = document.createElement('style'); st.id = '__fix128'; st.textContent = css; document.head.appendChild(st);
  }, APP_CSS);
  await p.waitForTimeout(1800);
  const after = await p.evaluate(MEASURE);
  await p.screenshot({ path: path.join(DIR, 'v128_after.png'), clip: { x: 0, y: 0, width: 430, height: 210 } });

  console.log('BEFORE(仅env59,无修复) ' + JSON.stringify(before));
  console.log('AFTER (仅CSS,JS全死)   ' + JSON.stringify(after));
  await b.close();
})();
