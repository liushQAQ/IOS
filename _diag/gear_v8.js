const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  for (const S of [{ w: 430, h: 932 }, { w: 393, h: 852 }, { w: 375, h: 667 }]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(8000);

    const tag = await p.evaluate(() => {
      const s = document.querySelector('script[data-dsh-anywhere-sidebar-gear="1"]');
      return s ? { has26: s.textContent.includes('width:26px'), hasAcct: s.textContent.includes('ar.right-W-4'), outside: s.textContent.includes('sr.right+7') } : null;
    });

    await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
    await p.waitForTimeout(1600);

    const r = await p.evaluate(() => {
      const g = document.querySelector('button[aria-label="设置"]');
      if (!g) return { gear: null };
      const q = g.getBoundingClientRect();
      const a = document.querySelector('[aria-label="账号菜单"]');
      const aq = a ? a.getBoundingClientRect() : null;
      return {
        vis: getComputedStyle(g).display !== 'none',
        gear: { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) },
        account: aq ? { x: Math.round(aq.x), y: Math.round(aq.y), w: Math.round(aq.width), h: Math.round(aq.height) } : null,
        insideAccountRow: aq ? (q.top >= aq.top - 4 && q.bottom <= aq.bottom + 4) : false,
        labelRight: (() => { const l = document.querySelector('[class*="qin2_W_label"]'); if (!l) return null; const lq = l.getBoundingClientRect(); return Math.round(lq.right); })(),
        overlapLabel: (() => { const l = document.querySelector('[class*="qin2_W_label"]'); if (!l) return false; const lq = l.getBoundingClientRect(); return !(q.right <= lq.x || q.x >= lq.right || q.bottom <= lq.y || q.y >= lq.bottom); })(),
        clickable: (() => { const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !!t && (t === g || g.contains(t)); })(),
      };
    });
    console.log('\n[' + S.w + 'x' + S.h + '] 脚本 ' + JSON.stringify(tag));
    console.log('   ' + JSON.stringify(r));
    if (r.gear) await p.screenshot({ path: 'gear_v8_' + S.w + '.png' });
    await b.close();
  }
})();
