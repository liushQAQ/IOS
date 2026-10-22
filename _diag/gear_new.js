const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  // 从 proxy.mjs 里抽出新的齿轮脚本，直接注入（省得重启 DSH）
  const src = fs.readFileSync('E:/desktop/所有skill/packages/dsh-anywhere/lib/proxy.mjs', 'utf8');
  const m = src.match(/<script data-dsh-anywhere-sidebar-gear="1">([\s\S]*?)<\/script>/);
  if (!m) { console.log('MISS'); process.exit(1); }
  const gearJS = m[1];

  for (const S of [{ w: 430, h: 932 }, { w: 393, h: 852 }, { w: 375, h: 667 }]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);

    // 摘掉旧的（页面里可能已有 server 注入的旧齿轮）
    await p.evaluate(() => { const o = document.querySelector('button[aria-label="设置"]'); if (o) o.remove(); window.__dshSidebarGear = 0; });
    await p.addScriptTag({ content: gearJS });
    await p.waitForTimeout(600);

    await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
    await p.waitForTimeout(1500);

    const r = await p.evaluate(() => {
      const g = document.querySelector('button[aria-label="设置"]');
      if (!g) return { gear: null };
      const q = g.getBoundingClientRect();
      const vis = getComputedStyle(g).display !== 'none';
      const s = document.querySelector('[class*="sidebarCol"]');
      const sr = s.getBoundingClientRect();
      // 逐个角点看命中谁
      const pts = [[q.x + 2, q.y + 2], [q.right - 2, q.y + 2], [q.x + 2, q.bottom - 2], [q.right - 2, q.bottom - 2], [q.x + q.width / 2, q.y + q.height / 2]];
      const hits = pts.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return 'null';
        const isSelf = el === g || g.contains(el);
        return (isSelf ? 'SELF' : el.tagName + '.' + String(el.className || '').slice(0, 22));
      });
      // 齿轮与抽屉是否重叠
      const overlapDrawer = !(q.right <= sr.x || q.x >= sr.right);
      // 与账号菜单按钮是否重叠
      const am = document.querySelector('[aria-label="账号菜单"]');
      let overlapAccount = false;
      if (am) { const aq = am.getBoundingClientRect(); overlapAccount = !(q.right <= aq.x || q.x >= aq.right || q.bottom <= aq.y || q.y >= aq.bottom); }
      return {
        vis, gear: { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) },
        drawerRight: Math.round(sr.right), hits, overlapDrawer, overlapAccount,
      };
    });
    console.log('\n[' + S.w + 'x' + S.h + '] ' + JSON.stringify(r));
    if (r.gear) await p.screenshot({ path: 'gear_new_' + S.w + '.png' });
    await b.close();
  }
})();
