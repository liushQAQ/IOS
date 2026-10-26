/* R47 假设验证：JS 通道死亡（真机 R42 实锤过的环境）时，
 * 「13 个后台任务」长胶囊会话的顶栏 flex 溢出 → 抽屉按钮默认出屏，CSS 无兜底。
 * 做法：只注入 app_inject.css（不注 JS），进该会话测按钮 right。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  const cssOnly = await p.evaluate(({ js }) => {
    const head = js.split('\n;\n').slice(0, 2).join('\n;\n');
    try { (0, eval)(head); } catch (e) { window.__cssErr = String(e); }
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    const st = document.getElementById('dsh-ios-glass-enhancement');
    return { styleIn: !!st, err: window.__cssErr || null };
  }, { js: APP_JS });
  console.log('[CSS-only 注入]', JSON.stringify(cssOnly), '（JS shim 后续段全程未跑）');
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  const found = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const hit = rows.find(e => (e.textContent || '').indexOf('Generate the') >= 0) || rows[1] || rows[0];
    if (hit) { hit.click(); return (hit.textContent || '').slice(0, 30); }
    return 'not-found';
  });
  console.log('[进会话]', found);
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(() => {
    const out = { vw: window.innerWidth };
    const db = document.querySelector('button[aria-label="打开右侧边栏"], button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; return out; }
    const rr = db.getBoundingClientRect();
    out.btnRight = Math.round(rr.right); out.btnLeft = Math.round(rr.left);
    out.inHeader = !!db.closest('header');
    // 顶栏行溢出量
    const row = db.closest('header') && (db.closest('header').querySelector('[class*="titleRow"]') || db.closest('header'));
    if (row) { out.rowSW = row.scrollWidth; out.rowCW = row.clientWidth; out.rowOvf = getComputedStyle(row).overflowX; }
    // 团队按钮
    const team = document.querySelector('header [class*="agentTeam"], header button[aria-label*="团队"]');
    if (team) { const tr = team.getBoundingClientRect(); out.teamRight = Math.round(tr.right); }
    return out;
  });
  console.log('[结果]', JSON.stringify(r));
  console.log(r.btnRight > r.vw ? '>>> 假设成立：JS 死亡时按钮默认出屏 right=' + r.btnRight + ' > vw=' + r.vw : '>>> 假设不成立：CSS 兜底已足够 right=' + r.btnRight);
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
