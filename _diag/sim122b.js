const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const SIZE = { w: 430, h: 932 };

const FIX = `
(function(){
  var hcs = document.querySelectorAll('[class*="headerCorner"]');
  var log = [];
  for (var i = 0; i < hcs.length; i++) {
    var hc = hcs[i], q = hc.getBoundingClientRect();
    if (q.width < 4 || q.height < 4) { log.push('skip-small'); continue; }
    var ov = Math.round(q.right - window.innerWidth);
    var m = getComputedStyle(hc).transform;
    var cur = 0;
    if (m && m !== 'none') { var parts = m.replace(/^matrix\\(|\\)$/g,'').split(','); cur = parseFloat(parts[4]) || 0; }
    if (ov > 0) { hc.style.setProperty('transform', 'translateX(' + (cur - ov) + 'px)', 'important'); log.push('right=' + Math.round(q.right) + ' ov=' + ov + ' -> tx=' + (cur - ov)); }
    else { log.push('right=' + Math.round(q.right) + ' ov=' + ov + ' tx=' + cur); }
  }
  return log;
})()
`;

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: SIZE.w, height: SIZE.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  await p.evaluate(() => {
    const hd = document.querySelector('header');
    if (hd) { hd.style.setProperty('position', 'sticky', 'important'); hd.style.setProperty('top', '0', 'important'); hd.style.setProperty('z-index', '999', 'important'); }
    if (!document.getElementById('__dsh-xclip')) {
      const s = document.createElement('style');
      s.id = '__dsh-xclip';
      s.textContent = 'html, body { overflow-x: clip !important; max-width: 100vw !important; }';
      document.head.appendChild(s);
    }
  });
  await p.waitForTimeout(400);

  for (let i = 1; i <= 4; i++) {
    const log = await p.evaluate(FIX);
    const st = await p.evaluate(() => {
      const hc = document.querySelector('[class*="headerCorner"]');
      if (!hc) return null;
      const q = hc.getBoundingClientRect();
      return { right: Math.round(q.right), tr: getComputedStyle(hc).transform, vw: innerWidth };
    });
    console.log('[第' + i + '轮] ' + JSON.stringify(log) + '  现在 right=' + (st ? st.right : '-') + ' / vw=' + (st ? st.vw : '-'));
    await p.waitForTimeout(500);
  }

  const fin = await p.evaluate(() => ({
    docSW: document.documentElement.scrollWidth, vw: innerWidth,
    canScrollX: (() => { window.scrollTo(9999, 0); const s = window.scrollX; window.scrollTo(0, 0); return s; })(),
    headerPos: getComputedStyle(document.querySelector('header')).position,
    headerTop: Math.round(document.querySelector('header').getBoundingClientRect().top),
  }));
  console.log('[最终] ' + JSON.stringify(fin));
  await b.close();
})();
