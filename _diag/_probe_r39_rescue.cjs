/* ============================================================================
 * R39 救援 v2 验证探针：模拟真机恶劣条件下的出屏收敛
 *   ① flex 溢出 55px（>旧上限 48）→ 必须拉回 vw-2
 *   ② 溢出 + 邻居宽度每 250ms 抖 ±1~2px（模拟「1 个后台任务」胶囊文字变宽）
 *      → 模糊稳态门必须仍能触发救援（旧全等门在此永不满足）
 *   ③ 溢出解除 → 补偿必须清除（want=0 路径）
 *   ④ 巨量旧毒位移（-448px 面板内按钮）→ 自愈仍在（R38 铁律⑤回归）
 * 用法：node _diag/_probe_r39_rescue.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  // 进会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2000);

  const GEO = () => {
    var db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (!db) return null;
    var r = db.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), tf: db.getAttribute('style') || '' };
  };
  const vw = 430;

  let g0 = await p.evaluate(GEO);
  console.log('基线开关:', JSON.stringify(g0), ' → 期望 right=' + (vw - 2));

  /* ① 溢出 55px（超旧上限 48）：relative+left 不参与 flex，真实把按钮推出屏 */
  await p.evaluate(() => {
    const db = document.querySelector('header button[aria-label="打开右侧边栏"]');
    if (db) { db.style.setProperty('position', 'relative', 'important'); db.style.setProperty('left', '55px', 'important'); }
  });
  await p.waitForTimeout(1000);
  let g1a = await p.evaluate(GEO);
  console.log('① 毒写后即时:', JSON.stringify(g1a), '(应 right≈483 出屏)');
  await p.waitForTimeout(1200);
  let g1 = await p.evaluate(GEO);
  console.log('① 溢出55px 救援后:', JSON.stringify(g1), g1 && g1.right <= vw - 1 ? '→ 已拉回 ✅（旧48上限会留7px在屏外）' : '→ 未拉回 ❌');

  /* ② 溢出保持 + 按钮自身坐标每 250ms 抖 ±2px（模拟胶囊变宽导致的顶栏重排） */
  await p.evaluate(() => {
    const db = document.querySelector('header button[aria-label="打开右侧边栏"]');
    if (!db) return 'no-btn';
    window.__jit = setInterval(function () {
      db.style.setProperty('left', (54 + Math.round(Math.random() * 4)) + 'px', 'important');
    }, 250);
    return 'jitter-on';
  });
  await p.waitForTimeout(2800);
  let g2 = await p.evaluate(GEO);
  console.log('② 抖动中收敛:', JSON.stringify(g2), g2 && g2.right <= vw - 1 ? '→ 收敛 ✅（模糊稳态门吸收±2px抖动）' : '→ 未收敛 ❌');
  await p.evaluate(() => { if (window.__jit) clearInterval(window.__jit); });

  /* ③ 溢出解除：清 relative/left → 补偿必须清零 */
  await p.evaluate(() => {
    const db = document.querySelector('header button[aria-label="打开右侧边栏"]');
    if (db) { db.style.removeProperty('left'); db.style.removeProperty('position'); }
  });
  await p.waitForTimeout(1200);
  let g3 = await p.evaluate(GEO);
  console.log('③ 解除后:', JSON.stringify(g3), g3 && /translateX\((-[3-9][0-9]|-[1-9][0-9]{2,})/.test(g3.tf) === false ? '→ 补偿已清 ✅' : '→ 补偿残留 ❌');

  /* ④ R38 铁律⑤回归：面板内按钮 -448px 旧毒必须自愈 */
  await p.evaluate(() => { if (window.__dshCloseRightPanel) window.__dshCloseRightPanel(); });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    document.querySelectorAll('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]').forEach(function (b) {
      if (b.closest('header')) return;
      b.style.setProperty('transform', 'translateX(-448px)', 'important');
    });
  });
  await p.waitForTimeout(1200);
  const g4 = await p.evaluate(() => {
    var out = [];
    document.querySelectorAll('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]').forEach(function (b) {
      if (b.closest('header')) return;
      var t = b.style.getPropertyValue('transform');
      out.push(t || '(clean)');
    });
    return out;
  });
  console.log('④ 面板内旧毒-448px:', JSON.stringify(g4), g4.every(t => t !== 'translateX(-448px)') ? '→ 已自愈 ✅' : '→ 残留 ❌');

  await p.screenshot({ path: path.join(DIR, '_r39_rescue.png') }).catch(() => {});
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
