const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  const r = await p.evaluate(() => {
    const R = el => { const q = el.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), right: Math.round(q.right) }; };
    const hd = document.querySelector('header') || document.querySelector('[class*="header"]');
    const corner = document.querySelector('[class*="headerCorner"]');
    const info = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        cls: String(el.className || '').slice(0, 60), rect: R(el),
        pos: cs.position, z: cs.zIndex, pr: cs.paddingRight, pl: cs.paddingLeft, mr: cs.marginRight,
        right: cs.right, width: cs.width, boxSizing: cs.boxSizing, display: cs.display, gap: cs.gap,
      };
    };
    const kids = hd ? [...hd.children].map(el => ({ tag: el.tagName, cls: String(el.className || '').slice(0, 40), ...R(el) })) : [];
    return {
      vw: innerWidth, vh: innerHeight,
      htmlCls: document.documentElement.className.slice(0, 80),
      bodyCls: document.body.className.slice(0, 80),
      header: info(hd), corner: info(corner), headerKids: kids,
      rootW: document.getElementById('root') ? R(document.getElementById('root')) : null,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: 'hdr_393.png' });
  await b.close();
})();
