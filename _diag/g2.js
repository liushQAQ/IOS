const { webkit } = require('playwright');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({
    viewport: { width: 390, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1'
  });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(15000);

  // 打开抽屉
  await p.evaluate(() => { const e = document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if (e) e.click(); });
  await p.waitForTimeout(1800);

  const geo = await p.evaluate(() => {
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; };
    const side = document.querySelector('[class*="sidebarCol"]') || document.querySelector('[class*="MnhYfG"]');
    const acct = document.querySelector('[aria-label="账号菜单"]');
    const root = side ? side.querySelector('[class*="_root"]') : null;
    const g = document.querySelector('button[aria-label="设置"]');
    const cs = g ? getComputedStyle(g) : null;
    return {
      vh: innerHeight, vw: innerWidth,
      sidebar: R(side), sideOverflow: side ? getComputedStyle(side).overflowY : null,
      root: R(root),
      acct: R(acct),
      gear: R(g), gearDisp: cs ? cs.display : null,
      acctInView: acct ? (acct.getBoundingClientRect().top >= 0 && acct.getBoundingClientRect().bottom <= innerHeight) : false
    };
  });
  console.log('几何:', JSON.stringify(geo, null, 1));
  await p.screenshot({ path: 'g2_drawer.png' });

  // 点齿轮
  if (geo.gear && geo.gearDisp !== 'none') {
    await p.mouse.click(geo.gear.x + geo.gear.w / 2, geo.gear.y + geo.gear.h / 2);
    await p.waitForTimeout(2500);
    const after = await p.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      return {
        isPromptPanel: /提示词优化|思考强度/.test(t),
        hit: ['通用', '外观', '模型', '账号', '快捷键', '关于'].filter(k => t.includes(k)),
        snippet: t.slice(0, 160)
      };
    });
    console.log('点齿轮后:', JSON.stringify(after));
    await p.screenshot({ path: 'g2_clicked.png' });
  } else {
    console.log('齿轮不可见，直接点账号菜单兜底');
    await p.evaluate(() => { const a = document.querySelector('[aria-label="账号菜单"]'); if (a) a.click(); });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: 'g2_menu.png' });
  }

  console.log('页面错误:', errs.length, errs.slice(0, 3));
  await b.close();
})();
