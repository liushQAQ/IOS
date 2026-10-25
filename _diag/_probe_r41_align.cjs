/* ============================================================================
 * R41b 高度对齐对比图生成器：会话页 vs 开始页 顶排是否同高
 *   ① 会话页：header 内容行 y（以 header 内抽屉按钮行为准）
 *   ② 开始页（正常进入）：R41b v2 对齐后的 chrome 按钮行 y
 *   ③ 开始页（模拟真机下移 +30px）：R41b 是否拉回与会话页齐平
 *   产物：_r41_align_session.png / _r41_align_start_fixed.png / _r41_align_start_shift_fixed.png
 *        + 拼图 _r41_align_compare.png（三格横排，红线=会话页行高基准）
 * 用法：node _diag/_probe_r41_align.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '48px');
    document.documentElement.style.setProperty('--dsh-statusbar', '48px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    try { (0, eval)(js); } catch (e) {}
    try { window.__dshSetStatusBar(48); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(1500);

  // —— ① 会话页行高基准 ——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2200);
  const sess = await p.evaluate(() => {
    const bt = document.querySelector('header button[aria-label="打开右侧边栏"]');
    const hd = document.querySelector('header');
    return {
      btnTop: bt ? Math.round(bt.getBoundingClientRect().top) : null,
      hdrTop: hd ? Math.round(hd.getBoundingClientRect().top) : null
    };
  });
  console.log('[会话页] header顶=' + sess.hdrTop + ' 内容行(抽屉按钮)顶=' + sess.btnTop);
  await p.screenshot({ path: path.join(DIR, '_r41_align_session.png'), clip: { x: 0, y: 0, width: 414, height: 130 } });

  // —— ② 开始页（正常进入 + R41b 对齐）——
  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const panel = document.querySelector('.dMHGga_panel') || document.querySelector('[data-sidebar-right-open]');
    if (!panel) return;
    const cands = Array.from(panel.querySelectorAll('button, [role="button"]'));
    const hit = cands.find(e => { const s = (e.textContent || '') + (e.getAttribute('aria-label') || ''); return s.indexOf('文件浏览') >= 0 || /^工作区/.test((e.textContent || '').trim()); });
    if (hit) hit.click();
  });
  await p.waitForTimeout(2500);
  const start1 = await p.evaluate(() => {
    const t = document.querySelector('[class*="tabHostHeader"]');
    if (!t) return null;
    let rowTop = Math.round(t.getBoundingClientRect().top) + 14;
    for (const bt of t.querySelectorAll('button')) { const r = bt.getBoundingClientRect(); if (r.width > 0 && r.top >= 0) { rowTop = Math.round(r.top); break; } }
    return { rowTop, pull: t.getAttribute('data-dsh-strip-pull-n') || '0', mt: t.style.marginTop || '(none)' };
  });
  console.log('[开始页·正常] 内容行顶=' + (start1 && start1.rowTop) + ' 拉力=' + (start1 && start1.pull) + '（会话页基准 ' + sess.btnTop + '）' + (start1 && Math.abs(start1.rowTop - sess.btnTop) <= 3 ? ' → 齐平 ✅' : ' → 差 ' + (start1 ? start1.rowTop - sess.btnTop : '?') + 'pt'));
  await p.screenshot({ path: path.join(DIR, '_r41_align_start_fixed.png'), clip: { x: 0, y: 0, width: 414, height: 130 } });

  // —— ③ 模拟真机下移 +30px：R41b 必须拉回齐平 ——
  await p.evaluate(() => {
    const t = document.querySelector('[class*="tabHostHeader"]');
    if (t) t.style.setProperty('margin-top', '30px', 'important');
  });
  await p.waitForTimeout(1400);
  const start2 = await p.evaluate(() => {
    const t = document.querySelector('[class*="tabHostHeader"]');
    if (!t) return null;
    let rowTop = Math.round(t.getBoundingClientRect().top) + 14;
    for (const bt of t.querySelectorAll('button')) { const r = bt.getBoundingClientRect(); if (r.width > 0 && r.top >= 0) { rowTop = Math.round(r.top); break; } }
    return { rowTop, pull: t.getAttribute('data-dsh-strip-pull-n') || '0' };
  });
  console.log('[开始页·模拟下移30] 内容行顶=' + (start2 && start2.rowTop) + ' 拉力=' + (start2 && start2.pull) + (start2 && Math.abs(start2.rowTop - sess.btnTop) <= 3 ? ' → 拉回齐平 ✅' : ' → ❌'));
  await p.screenshot({ path: path.join(DIR, '_r41_align_start_shift_fixed.png'), clip: { x: 0, y: 0, width: 414, height: 130 } });
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
