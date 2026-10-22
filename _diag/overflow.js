const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const SIZES = [
  { name: '430x932 (14ProMax)', w: 430, h: 932 },
  { name: '393x852 (14Pro)', w: 393, h: 852 },
  { name: '390x844 (13/14)', w: 390, h: 844 },
  { name: '375x667 (SE)', w: 375, h: 667 },
];

async function run(sz) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: sz.w, height: sz.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  const r = await p.evaluate(() => {
    const iw = innerWidth, ih = innerHeight;
    const de = document.documentElement, bd = document.body;
    const out = {
      vw: iw, vh: ih,
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      bodyScrollW: bd.scrollWidth, bodyClientW: bd.clientWidth,
      htmlOverflowX: getComputedStyle(de).overflowX,
      bodyOverflowX: getComputedStyle(bd).overflowX,
      overflowing: [],
    };
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) continue;
      // 只报「右边界超出视口，但左边界还在视口内」的元素（真正被裁的）
      if (q.right > iw + 1 && q.left < iw) {
        out.overflowing.push({
          tag: el.tagName, cls: String(el.className || '').slice(0, 46),
          x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
          right: Math.round(q.right), over: Math.round(q.right - iw),
          z: cs.zIndex, pos: cs.position,
        });
      }
    }
    out.overflowing.sort((a, b) => b.over - a.over);
    out.overflowing = out.overflowing.slice(0, 12);
    return out;
  });

  console.log('\n===== ' + sz.name + ' =====');
  console.log('视口 ' + r.vw + 'x' + r.vh + ' | docScrollW=' + r.docScrollW + ' bodyScrollW=' + r.bodyScrollW +
    ' | html.overflowX=' + r.htmlOverflowX + ' body.overflowX=' + r.bodyOverflowX);
  if (!r.overflowing.length) console.log('  无横向溢出元素');
  else {
    console.log('  被裁元素 ' + r.overflowing.length + ' 个（右边界超出）：');
    r.overflowing.forEach(o => console.log('   - ' + o.tag + '.' + o.cls + ' [' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h + '] right=' + o.right + ' 超出 ' + o.over + 'px z=' + o.z));
  }
  await p.screenshot({ path: 'ov_' + sz.w + 'x' + sz.h + '.png' });
  await b.close();
}

(async () => { for (const sz of SIZES) await run(sz); })();
