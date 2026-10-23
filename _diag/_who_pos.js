const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; }); if (b) b.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim())); if (t) t.click(); });
  await p.waitForTimeout(9000);

  const res = await p.evaluate(() => {
    const nav = document.querySelector('[class*="titleCluster"] > nav');
    const cl = document.querySelector('[class*="titleCluster"]');
    const hits = [];
    let layerNotes = [];
    const scan = (rules, where) => {
      [...rules].forEach((r) => {
        if (r.type === 1 && r.selectorText) {
          let m = false;
          try { m = nav.matches(r.selectorText) || cl.matches(r.selectorText); } catch (e) { m = false; }
          if (m) {
            const pos = r.style.getPropertyValue('position');
            const w = r.style.getPropertyValue('width');
            const L = r.style.getPropertyValue('left');
            const R = r.style.getPropertyValue('right');
            if (pos || w || L || R) {
              hits.push({ where, sel: r.selectorText.slice(0, 70), pos, width: w, left: L, right: R, imp: r.style.getPropertyPriority('position') });
            }
          }
        }
        if (r.cssRules) scan(r.cssRules, where + (r.name ? '@layer ' + r.name : ''));
      });
    };
    [...document.styleSheets].forEach((s, i) => {
      try { scan(s.cssRules, 'sheet' + i); } catch (e) { /* cross-origin */ }
    });
    return { hits: hits.slice(-25), navPos: getComputedStyle(nav).position, clPos: getComputedStyle(cl).position };
  });
  console.log('nav position=' + res.navPos + '  cluster position=' + res.clPos);
  console.log('命中 position/width/left/right 的规则（末 25 条）：');
  res.hits.forEach((h) => console.log('  [' + h.where + '] ' + h.sel + '  pos=' + h.pos + (h.imp ? '!' : '') + ' w=' + h.width + ' left=' + h.left + ' right=' + h.right));
  await browser.close();
})();
