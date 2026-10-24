/* ============================================================================
 * R39 毒写 A/B 对拍探针：模拟真机 DSH 的三种 --dsh-statusbar 毒写，
 * 测当前代码（v1.0.136 注入）在每种写法下的顶栏/面板几何响应。
 *   P1: html 定向 setProperty('--dsh-statusbar','75px')
 *   P2: html 整段覆写 style（抹掉 sb-native/topshift，只留 DSH 自己的 75）
 *   P3: 深层容器（面板根）写 75
 * 用法：node _diag/_probe_r39_poison.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const MEASURE = () => {
  var out = {};
  var h = document.querySelector('header');
  if (h) { var r = h.getBoundingClientRect(); out.headerTop = Math.round(r.top); }
  var cs = getComputedStyle(document.documentElement);
  out.vars = {
    sb: cs.getPropertyValue('--dsh-statusbar').trim(),
    native: cs.getPropertyValue('--dsh-sb-native').trim(),
    ts: cs.getPropertyValue('--dsh-topshift').trim()
  };
  var col = document.querySelector('[class*="rightbarCol"]');
  if (col) out.colPad = getComputedStyle(col).paddingTop;
  // 打开目录按钮（DSH 自带规则 top: calc(var(--dsh-statusbar,54px) - 24px)）
  var cat = document.querySelector('button[aria-label="打开目录"]');
  if (cat) out.catBtnTop = Math.round(cat.getBoundingClientRect().top);
  // 顶栏内抽屉开关
  var tgl = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('header button[aria-label="收起右侧边栏"]');
  if (tgl) out.toggleTop = Math.round(tgl.getBoundingClientRect().top);
  return out;
};

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
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2000);

  // 进会话（尽力而为，失败也继续——首页也有 header）
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

  const S = async (tag) => {
    const m = await p.evaluate(MEASURE);
    console.log('[' + tag + ']', JSON.stringify(m));
    return m;
  };

  await S('基线');
  const base = await p.evaluate(MEASURE);

  /* P1: html 定向写 75 */
  await p.evaluate(() => { document.documentElement.style.setProperty('--dsh-statusbar', '75px'); });
  await p.waitForTimeout(700);
  const p1 = await S('P1定向75+700ms');
  await p.waitForTimeout(1500);
  const p1b = await S('P1定向75+2200ms');

  /* P2: html 整段覆写（模拟 DSH setAttribute('style',...) —— 抹掉我们的全部变量） */
  await p.evaluate(() => {
    document.documentElement.setAttribute('style', 'color-scheme: dark; --dsh-statusbar: 75px;');
  });
  await p.waitForTimeout(700);
  const p2 = await S('P2整段覆写+700ms');
  await p.waitForTimeout(1600);
  const p2b = await S('P2整段覆写+2300ms');

  /* P3: 深层容器写 75（面板根 / body 下的主容器） */
  await p.evaluate(() => {
    const root = document.querySelector('[class*="root"]') || document.body.firstElementChild;
    if (root) root.style.setProperty('--dsh-statusbar', '75px');
  });
  await p.waitForTimeout(700);
  const p3 = await S('P3深层容器75+700ms');
  await p.waitForTimeout(1600);
  const p3b = await S('P3深层容器75+2300ms');

  /* 汇总判定 */
  const val = (m, k) => m && m.vars && m.vars[k];
  console.log('\n===== 判定 =====');
  console.log('基线 headerTop=' + base.headerTop + ' vars=' + JSON.stringify(base.vars));
  console.log('P1 700ms 后 sb=' + val(p1, 'sb') + ' native=' + val(p1, 'native') + ' headerTop=' + p1.headerTop + (p1.headerTop === base.headerTop ? ' → 守卫已修 ✅' : ' → 顶栏位移 ❌'));
  console.log('P2 700ms 后 sb=' + val(p2, 'sb') + ' native=' + val(p2, 'native') + ' ts=' + val(p2, 'ts') + ' headerTop=' + p2.headerTop + (p2.headerTop === base.headerTop ? ' → 守卫已修 ✅' : ' → 顶栏位移 ❌（topshift 丢失即真机「下移」根因）'));
  console.log('P3 700ms 后 sb(html)=' + val(p3, 'sb') + ' 深层未测(需查子元素) headerTop=' + p3.headerTop);

  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
