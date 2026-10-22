const { chromium } = require('playwright');
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('SENTINEL'), ms))]);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
    }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return; }
    }
  }).catch(() => {});
  await page.waitForTimeout(9000);

  const info = await race(page.evaluate(() => {
    function chain(el, depth = 7) {
      const out = [];
      let cur = el;
      for (let i = 0; i < depth && cur && cur !== document.body; i++) {
        const r = cur.getBoundingClientRect();
        const c = getComputedStyle(cur);
        out.push({
          tag: cur.tagName, cls: String(cur.className).slice(0, 70),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          disp: c.display, pos: c.position, flex: c.flexDirection + '/' + c.flexWrap
        });
        cur = cur.parentElement;
      }
      return out;
    }
    const res = {};
    const cap = document.querySelector('.dcc-btn');
    const capRoot = document.querySelector('[class*="dcc-"]');
    res.capsule = cap ? chain(cap) : null;
    res.capsuleRoot = capRoot ? chain(capRoot) : null;
    const stat = document.querySelector('.cm-stat-entry');
    res.statEntry = stat ? chain(stat, 8) : null;
    const dock = document.querySelector('[class*="dock"]');
    res.dock = dock ? chain(dock, 4) : null;
    const comp = document.querySelector('[class*="composerStack"]');
    res.composer = comp ? chain(comp, 4) : null;
    // 输入行 + 左槽容器
    const plus = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('附件') || (b.title || '').includes('附件'));
    res.plusBtn = plus ? chain(plus) : null;
    return res;
  }), 20000);
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
