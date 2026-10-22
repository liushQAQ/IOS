const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const M = () => {
  const host = document.querySelector('[class*="composerStack"]');
  const out = [];
  host.querySelectorAll('[class*="_row"] button').forEach(btn => {
    const q = btn.getBoundingClientRect();
    if (q.width < 14 || q.width > 80 || q.height < 14 || q.height > 80) return;
    out.push({ c: String(btn.className || '').slice(0, 20), w: Math.round(q.width), h: Math.round(q.height), cy: Math.round((q.y + q.height / 2) * 10) / 10 });
  });
  const cys = out.map(o => o.cy);
  return { items: out, spread: Math.round((Math.max(...cys) - Math.min(...cys)) * 10) / 10 };
};
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  console.log('before spread=', (await p.evaluate(M)).spread);
  await p.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '[class*="composerStack"] [class*="_primary"], [class*="composerStack"] [class*="_send"], [class*="composerStack"] [class*="_stop"] { transform: none !important; }';
    document.head.appendChild(s);
  });
  await p.waitForTimeout(600);
  const r = await p.evaluate(M);
  console.log('after  spread=', r.spread);
  r.items.forEach(o => console.log('  ' + o.c.padEnd(22) + o.w + 'x' + o.h + ' cy=' + o.cy));
  await b.close();
})();
