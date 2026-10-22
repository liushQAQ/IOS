const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  const probe = async (label) => {
    const r = await p.evaluate(() => {
      const g = document.querySelector('button[aria-label="设置"]');
      const gearInfo = g ? (q => ({ x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), vis: getComputedStyle(g).display !== 'none' }))(g.getBoundingClientRect()) : null;
      // 关键：先把齿轮藏起来，再探 287~315 / 56~84 这块到底是谁
      const old = g ? g.style.display : null;
      if (g) g.style.display = 'none';
      const pts = [];
      for (const y of [58, 70, 82]) {
        for (const x of [289, 301, 313]) {
          const st = document.elementsFromPoint(x, y);
          const chain = st.slice(0, 5).map(el => el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0].slice(0, 24) : ''));
          const hitBtn = st.find(el => { try { return el.closest('button,a,[role="button"]'); } catch (e) { return null; } });
          pts.push(x + ',' + y + ' -> ' + chain.join(' | ') + (hitBtn ? '   ★按钮' : ''));
        }
      }
      if (g && old !== null) g.style.display = old;
      return { gearInfo, pts };
    });
    console.log('\n=== ' + label + ' ===');
    console.log('  齿轮: ' + JSON.stringify(r.gearInfo));
    r.pts.forEach(s => console.log('  ' + s));
    return r;
  };

  // 抽屉关闭状态
  await probe('抽屉关闭（齿轮应隐藏）');

  // 抽屉打开状态
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1600);
  await probe('抽屉打开');

  await p.screenshot({ path: 'under_gear_drawer_open.png' });
  // 关抽屉再看
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'under_gear_drawer_closed.png' });
  await b.close();
})();
