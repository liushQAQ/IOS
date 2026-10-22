const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const meta = await p.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return {
      content: m ? m.getAttribute('content') : '(无 viewport meta)',
      iw: innerWidth, ih: innerHeight,
      dpr: devicePixelRatio,
      sw: screen.width, sh: screen.height,
      docCW: document.documentElement.clientWidth,
      docSW: document.documentElement.scrollWidth,
      bodyCW: document.body.clientWidth,
      bodySW: document.body.scrollWidth,
      visualScale: window.visualViewport ? window.visualViewport.scale : null,
      visualW: window.visualViewport ? Math.round(window.visualViewport.width) : null,
      textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
    };
  });
  console.log('=== 视口基线 ===');
  console.log(JSON.stringify(meta, null, 2));

  const ovf = await p.evaluate(() => {
    const vw = innerWidth;
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
      const q = el.getBoundingClientRect();
      if (q.width < 1 || q.height < 1) return;
      const rightOv = Math.round((q.right - vw) * 10) / 10;
      const leftOv = Math.round((0 - q.left) * 10) / 10;
      if (rightOv <= 0.6 && leftOv <= 0.6) return;
      out.push({
        tag: el.tagName,
        cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 40),
        id: el.id || '',
        pos: cs.position,
        z: cs.zIndex,
        x: Math.round(q.x * 10) / 10, w: Math.round(q.width * 10) / 10,
        right: Math.round(q.right * 10) / 10,
        rightOv, leftOv,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
      });
    });
    out.sort((a, b2) => b2.rightOv - a.rightOv);
    return out;
  });
  console.log('\n=== 右/左溢出的元素（按右溢出降序，共 ' + ovf.length + '）===');
  ovf.slice(0, 45).forEach(o => console.log(
    '  R+' + o.rightOv + (o.leftOv > 0.6 ? ' L+' + o.leftOv : '') + '  ' + o.pos + ' z=' + o.z +
    '  x=' + o.x + ' w=' + o.w + ' right=' + o.right +
    '  ' + o.tag + '#' + o.id + '.' + o.cls + (o.text ? '  "' + o.text + '"' : '')));

  const fixedOnly = ovf.filter(o => o.pos === 'fixed');
  console.log('\n=== 其中 position:fixed 的（clip 管不住的）===');
  if (!fixedOnly.length) console.log('  （无）');
  fixedOnly.forEach(o => console.log('  R+' + o.rightOv + '  z=' + o.z + ' x=' + o.x + ' w=' + o.w + ' ' + o.tag + '.' + o.cls + (o.text ? ' "' + o.text + '"' : '')));

  await p.screenshot({ path: 'ovf_scan_430.png', fullPage: false });
  await b.close();
})();
