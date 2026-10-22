const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // 进一个已存在的会话（点抽屉里的会话项）以拿到带 headerCorner 的顶栏
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const cands = [...document.querySelectorAll('div,li,a,button')].filter(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const q = el.getBoundingClientRect();
      return t.length > 1 && t.length < 26 && q.width > 120 && q.height > 20 && q.height < 60 && q.x < 280 && q.y > 250 && q.y < 500;
    });
    if (cands[0]) cands[0].click();
  });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(() => {
    const hd = document.querySelector('header');
    const corner = document.querySelector('[class*="headerCorner"]');
    if (!corner) return { corner: null, headerCls: hd ? hd.className : null };
    const cs = getComputedStyle(corner), hs = getComputedStyle(hd);
    const R = el => { const q = el.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), right: Math.round(q.right) }; };
    return {
      headerCls: hd.className,
      header: { rect: R(hd), display: hs.display, gtc: hs.gridTemplateColumns, pr: hs.paddingRight, pl: hs.paddingLeft, gap: hs.gap, width: hs.width, cols: hs.gridTemplateAreas },
      corner: { rect: R(corner), display: cs.display, ml: cs.marginLeft, mr: cs.marginRight, pos: cs.position, right: cs.right, width: cs.width, justifyContent: cs.justifyContent },
      parent: corner.parentElement ? { cls: String(corner.parentElement.className || '').slice(0, 40), rect: R(corner.parentElement), disp: getComputedStyle(corner.parentElement).display } : null,
      headerKids: hd ? [...hd.children].map(el => ({ cls: String(el.className || '').slice(0, 36), ...R(el) })) : [],
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: 'corner.png' });
  await b.close();
})();
