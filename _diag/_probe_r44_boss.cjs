/* ============================================================================
 * R44 取证探针 2：用老总真机同一条会话「同步DSH iOS打包更新」复现
 *   真机形态：会话页顶栏 = 标题 + 「1 个后台任务」胶囊 + 团队图标 + 抽屉按钮，
 *   开→关抽屉一轮后按钮出屏约 1/3（32pt 按钮越界 ~10pt）。
 *   连拍几何轨迹 + 记录「谁在清位移」：对按钮与 headerCorner 装属性观察器。
 * 用法：node _diag/_probe_r44_boss.cjs
 * ==========================================================================*/
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
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    try { (0, eval)(js); } catch (e) {}
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2500);

  // 打开侧栏，找「同步DSH iOS打包更新」这条会话点进去
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  const found = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"], [class*="sessionItem"], li, button'));
    const hit = rows.find(e => (e.textContent || '').indexOf('同步DSH iOS打包更新') >= 0);
    if (hit) { hit.click(); return 'clicked'; }
    return 'not-found';
  });
  console.log('[进会话]', found);
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  // 装观察器：盯按钮 + headerCorner 的 style 属性变化（谁在清/写位移）
  await p.evaluate(() => {
    window.__mut = [];
    window.__t0 = performance.now();
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    const targets = [db];
    let n = db; for (let i = 0; i < 3 && n; i++) { n = n.parentElement; if (n) targets.push(n); }
    targets.forEach((t, ti) => {
      new MutationObserver(muts => {
        muts.forEach(m => {
          if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
            const tf = t.style ? t.style.transform : '';
            window.__mut.push({ t: Math.round(performance.now() - window.__t0), el: ti + ':' + (typeof t.className === 'string' ? t.className.split(' ')[0].slice(0, 20) : t.tagName), attr: m.attributeName, tf: tf.slice(0, 40) });
          }
        });
      }).observe(t, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    window.__trace = [];
    setInterval(() => {
      const d2 = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
      if (!d2) return;
      const r = d2.getBoundingClientRect();
      window.__trace.push({ t: Math.round(performance.now() - window.__t0), right: Math.round(r.right), tf: d2.style.transform || '', vis: getComputedStyle(d2).display });
    }, 150);
  });

  const base = await p.evaluate(() => {
    const d2 = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    const r = d2.getBoundingClientRect();
    return { right: Math.round(r.right), tf: d2.style.transform || '' };
  });
  console.log('[基线] right=' + base.right + ' tf=' + JSON.stringify(base.tf));

  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('button')).find(e => (e.getAttribute('aria-label') || '') === '收起右侧边栏'); if (t) t.click(); });
  await p.waitForTimeout(7000);

  const tr = await p.evaluate(() => window.__trace.slice(-25));
  const mut = await p.evaluate(() => window.__mut.slice(0, 60));
  console.log('[轨迹尾25拍]'); tr.forEach(x => console.log('  ' + JSON.stringify(x)));
  console.log('[style/class 变更事件]'); mut.forEach(x => console.log('  ' + JSON.stringify(x)));
  await p.screenshot({ path: path.join(DIR, '_r44_boss_after.png'), clip: { x: 0, y: 0, width: 430, height: 130 } });
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
