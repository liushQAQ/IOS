/* R47 固定位终验：抽屉按钮在全部场景必须恒定不动
 * 场景：①首页 ②普通会话页 ③「13 个后台任务」长标题会话 ④开抽屉 ⑤关抽屉回会话
 *      ⑥CSS-only（JS 通道死亡）同 ③
 * 判据：每场景 btn rect 恒定（right 同值），tf 恒定；出现任何漂移 = 不合格 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const SNAP = () => {
  const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
  if (!db) return { none: true };
  const r = db.getBoundingClientRect();
  return { right: Math.round(r.right), left: Math.round(r.left), top: Math.round(r.top), tf: db.style.transform || '(none)', disp: getComputedStyle(db.closest('[class*="headerCorner"]') || db).display };
};

async function boot(cssOnly) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, cssOnly }) => {
    const blocks = js.split('\n;\n');
    const head = cssOnly ? blocks.slice(0, 2) : blocks.slice(0, 12);
    try { (0, eval)(head.join('\n;\n')); } catch (e) {}
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    try { if (!cssOnly) window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS, cssOnly });
  await p.waitForTimeout(2500);
  return { b, p };
}
async function enterSession(p, kw) {
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate((kw) => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const hit = rows.find(e => (e.textContent || '').indexOf(kw) >= 0) || rows[0];
    if (hit) hit.click();
  }, kw);
  await p.waitForTimeout(4500);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
}

(async () => {
  const results = [];
  // 全 JS 场景
  {
    const { b, p } = await boot(false);
    results.push(['①首页(JS活)', await p.evaluate(SNAP)]);
    await enterSession(p, '同步DSH');
    results.push(['②普通会话页', await p.evaluate(SNAP)]);
    await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
    await p.waitForTimeout(2200);
    results.push(['④开抽屉(会话态)', await p.evaluate(SNAP)]);
    await p.evaluate(() => { const t = Array.from(document.querySelectorAll('button')).find(e => (e.getAttribute('aria-label') || '') === '收起右侧边栏'); if (t) t.click(); });
    await p.waitForTimeout(3000);
    results.push(['⑤关抽屉回会话', await p.evaluate(SNAP)]);
    // 13 任务长标题会话
    await enterSession(p, 'Generate the');
    results.push(['③13任务长标题会话', await p.evaluate(SNAP)]);
    await p.waitForTimeout(3000);
    results.push(['③b 静置3s后', await p.evaluate(SNAP)]);
    await b.close();
  }
  // CSS-only（JS 死亡）
  {
    const { b, p } = await boot(true);
    await enterSession(p, 'Generate the');
    results.push(['⑥CSS-only 13任务会话', await p.evaluate(SNAP)]);
    await p.waitForTimeout(3000);
    results.push(['⑥b 静置3s后', await p.evaluate(SNAP)]);
    await b.close();
  }
  console.log('场景 | right | left | top | tf | disp');
  for (const [name, s] of results) console.log(name + ' | ' + (s.none ? '无按钮' : [s.right, s.left, s.top, s.tf, s.disp].join(' | ')));
  const rights = results.filter(([, s]) => !s.none && s.disp !== 'none').map(([, s]) => s.right);
  console.log('\n判定: right 集合=' + JSON.stringify([...new Set(rights)]) + (new Set(rights).size === 1 ? ' → 恒定 ✅' : ' → 有漂移 ❌'));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
