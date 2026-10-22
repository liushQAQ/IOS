const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const pri = document.querySelector('[class*="_primary"]');
    const cs = getComputedStyle(pri);
    const q = pri.getBoundingClientRect();
    const chain = [];
    let cur = pri;
    for (let i = 0; i < 4 && cur; i++) {
      const c2 = getComputedStyle(cur); const qq = cur.getBoundingClientRect();
      chain.push({ cls: String(cur.className || '').slice(0, 36), y: Math.round(qq.y * 10) / 10, h: Math.round(qq.h || qq.height), disp: c2.display, pos: c2.position, ai: c2.alignItems, aself: c2.alignSelf, mt: c2.marginTop, mb: c2.marginBottom, style: (cur.getAttribute('style') || '').slice(0, 80) });
      cur = cur.parentElement;
    }
    // 试打 transform 看是否生效
    const before = pri.getBoundingClientRect().y;
    pri.style.setProperty('transform', 'translateY(2px)', 'important');
    const afterT = pri.getBoundingClientRect().y;
    pri.style.removeProperty('transform');
    return { y: Math.round(q.y * 10) / 10, pos: cs.position, transform: cs.transform, chain, before: Math.round(before * 10) / 10, afterT: Math.round(afterT * 10) / 10 };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
