const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW/.test(l)).join('\n');

const DRAWER_W = 252;

// 待验证的修复样式
const FIX_CSS = `
/* ① 抽屉内一切元素绝不允许宽于抽屉 */
[class*="sidebarCol"] * {
  max-width: 100% !important;
  box-sizing: border-box !important;
}
/* ② 抽屉内的 flex 容器允许收缩，否则子项按内容撑宽 */
[class*="sidebarCol"] [class*="root"],
[class*="sidebarCol"] [class*="Area"],
[class*="sidebarCol"] [class*="List"],
[class*="sidebarCol"] [class*="list"],
[class*="sidebarCol"] [class*="Section"],
[class*="sidebarCol"] [class*="Row"],
[class*="sidebarCol"] [class*="row"],
[class*="sidebarCol"] [class*="Body"] {
  min-width: 0 !important;
}
/* ③ 单行文字一律省略号，绝不顶出抽屉 */
[class*="sidebarCol"] [class*="sessionRow"],
[class*="sidebarCol"] [class*="projectRow"],
[class*="sidebarCol"] [class*="rowText"],
[class*="sidebarCol"] [class*="label"],
[class*="sidebarCol"] [class*="Label"],
[class*="sidebarCol"] [class*="title"],
[class*="sidebarCol"] [class*="Footer"],
[class*="sidebarCol"] [class*="footer"] {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[class*="sidebarCol"] [class*="sessionRow"] *,
[class*="sidebarCol"] [class*="projectRow"] * {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
/* ④ 平价进度条那一行同样收紧 */
[class*="sidebarCol"] .cm-footer-stack,
[class*="sidebarCol"] .cm-peak-progress,
[class*="sidebarCol"] .cm-foot {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
[class*="sidebarCol"] .cm-peak-rail-label {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
`;

const measure = () => {
  const sb = document.querySelector('[class*="sidebarCol"]');
  const sq = sb.getBoundingClientRect();
  const rows = [];
  sb.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 6 || q.height < 6) return;
    const ov = Math.round((q.right - sq.right) * 10) / 10;
    if (ov <= 0.5 && q.left >= sq.left - 0.5) return;
    rows.push({
      tag: el.tagName, cls: String(el.className || '').slice(0, 40),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
      x: Math.round(q.x * 10) / 10, right: Math.round(q.right * 10) / 10, w: Math.round(q.width * 10) / 10, ov,
    });
  });
  rows.sort((a, b2) => b2.ov - a.ov);
  const gear = document.querySelector('button[aria-label="设置"]');
  const gq = gear ? gear.getBoundingClientRect() : null;
  return {
    drawerRight: Math.round(sq.right), drawerW: Math.round(sq.width),
    total: rows.length, top: rows.slice(0, 12),
    gear: gq ? { x: Math.round(gq.x), right: Math.round(gq.right), w: Math.round(gq.width) } : null,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  const clampDrawer = (W) => {
    document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol').forEach(el => {
      el.style.setProperty('width', W + 'px', 'important');
      el.style.setProperty('min-width', W + 'px', 'important');
      el.style.setProperty('max-width', W + 'px', 'important');
    });
  };

  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS });
  await p.waitForTimeout(400);
  await p.evaluate(clampDrawer, DRAWER_W);

  const btn = await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) { x.click(); return x.getAttribute('aria-label'); }
    return 'NOT FOUND';
  });
  await p.waitForTimeout(1800);
  await p.evaluate(clampDrawer, DRAWER_W);
  await p.waitForTimeout(600);

  const before = await p.evaluate(measure);
  console.log('=== 修复前（复刻真机）===');
  console.log('抽屉宽=' + before.drawerW + ' right=' + before.drawerRight + '  溢出元素=' + before.total);
  before.top.forEach(o => console.log('  +' + o.ov + ' x=' + o.x + ' right=' + o.right + ' w=' + o.w + ' ' + o.tag + '.' + o.cls + (o.text ? ' "' + o.text + '"' : '')));
  console.log('齿轮=' + JSON.stringify(before.gear));
  await p.screenshot({ path: 'drawer_before.png' });

  // 施加修复
  await p.evaluate((css) => {
    const s = document.createElement('style'); s.id = '__drawer_fix'; s.textContent = css;
    document.head.appendChild(s);
  }, FIX_CSS);
  await p.waitForTimeout(900);

  const after = await p.evaluate(measure);
  console.log('\n=== 修复后 ===');
  console.log('抽屉宽=' + after.drawerW + ' right=' + after.drawerRight + '  溢出元素=' + after.total);
  after.top.forEach(o => console.log('  +' + o.ov + ' x=' + o.x + ' right=' + o.right + ' w=' + o.w + ' ' + o.tag + '.' + o.cls + (o.text ? ' "' + o.text + '"' : '')));
  console.log('齿轮=' + JSON.stringify(after.gear));
  await p.screenshot({ path: 'drawer_after.png' });

  await b.close();
})();
