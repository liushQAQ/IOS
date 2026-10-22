const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  for (const S of [{ w: 430, h: 932 }, { w: 393, h: 852 }, { w: 375, h: 667 }]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
    const p = await c.newPage();
    const src = [];
    p.on('response', r => { if (r.url().includes('3083') && r.status() === 200) src.push(r.url().slice(-40)); });
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(8000);

    // 确认新脚本真的下发了
    const tagVer = await p.evaluate(() => {
      const s = document.querySelector('script[data-dsh-anywhere-sidebar-gear="1"]');
      if (!s) return { found: false };
      return { found: true, hasSafe: s.textContent.includes('elementsFromPoint'), hasW28: s.textContent.includes('width:28px'), oldGone: !s.textContent.includes('ar.right-40') };
    });

    await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
    await p.waitForTimeout(1600);

    const r = await p.evaluate(() => {
      const g = document.querySelector('button[aria-label="设置"]');
      if (!g) return { gear: null };
      const q = g.getBoundingClientRect();
      const s = document.querySelector('[class*="sidebarCol"]');
      const sr = s.getBoundingClientRect();
      const am = document.querySelector('[aria-label="账号菜单"]');
      let ovAcc = false;
      if (am) { const aq = am.getBoundingClientRect(); ovAcc = !(q.right <= aq.x || q.x >= aq.right || q.bottom <= aq.y || q.y >= aq.bottom); }
      const cx = q.x + q.width / 2, cy = q.y + q.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        vis: getComputedStyle(g).display !== 'none',
        gear: { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) },
        drawerRight: Math.round(sr.right),
        overlapDrawer: !(q.right <= sr.x || q.x >= sr.right),
        overlapAccount: ovAcc,
        clickable: !!top && (top === g || g.contains(top)),
      };
    });
    console.log('\n[' + S.w + 'x' + S.h + '] 脚本 ' + JSON.stringify(tagVer));
    console.log('   齿轮 ' + JSON.stringify(r));
    if (r.gear) await p.screenshot({ path: 'gear_live_' + S.w + '.png' });
    await b.close();
  }
})();
