const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

async function openSettings(p) {
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const a = document.querySelector('[aria-label="账号菜单"]'); if (a) a.click(); });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('[role="menuitem"],button')) {
      const t = (el.textContent || '').replace(/\s+/g, '');
      if (t.indexOf('设置') === 0) { el.click(); return; }
    }
  });
  await p.waitForTimeout(1800);
  // 收起抽屉，否则设置面板被 280px 抽屉盖住，探测点全落在抽屉上
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(900);
}

async function probe(p, label) {
  const r = await p.evaluate(() => {
    const panel = document.querySelector('[class*="tklpSG_panel"]');
    const hd = document.querySelector('header');
    if (!panel) return { panel: false };
    const q = panel.getBoundingClientRect();
    // 在面板顶部中间取点，看命中谁
    const pts = [];
    for (const y of [Math.round(q.top + 8), Math.round(q.top + 26)]) {
      const el = document.elementFromPoint(Math.round(q.x + q.width / 2), y);
      pts.push({ y, tag: el ? el.tagName : null, cls: el ? String(el.className || '').slice(0, 34) : null,
                 inPanel: el ? (panel.contains(el) || el === panel) : false });
    }
    return {
      panel: true, panelTop: Math.round(q.top),
      headerZ: hd ? getComputedStyle(hd).zIndex : null,
      headerPos: hd ? getComputedStyle(hd).position : null,
      hits: pts,
    };
  });
  console.log(label + ' -> ' + JSON.stringify(r));
  return r;
}

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // 场景 1：原始（App 未注入）—— 基线
  await openSettings(p);
  await probe(p, '[A] 无 App 注入（header z=auto）');
  await p.screenshot({ path: 'z_A.png' });

  // 关闭设置，回到干净状态
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="关闭"], [class*="close"]'); if (x) x.click(); });
  await p.waitForTimeout(800);

  // 场景 2：模拟 App —— header sticky + z-index 1020
  await p.evaluate(() => {
    const hd = document.querySelector('header');
    if (hd) { hd.style.setProperty('position', 'sticky', 'important'); hd.style.setProperty('top', '0', 'important'); hd.style.setProperty('z-index', '1020', 'important'); }
  });
  await openSettings(p);
  await probe(p, '[B] 模拟 App：header z=1020');
  await p.screenshot({ path: 'z_B.png' });

  // 场景 3：同一状态，把 header 降到 999
  await p.evaluate(() => {
    const hd = document.querySelector('header');
    if (hd) hd.style.setProperty('z-index', '999', 'important');
  });
  await p.waitForTimeout(400);
  await probe(p, '[C] header 降到 999');
  await p.screenshot({ path: 'z_C.png' });

  await b.close();
})();
