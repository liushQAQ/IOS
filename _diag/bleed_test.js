const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW/.test(l)).join('\n');

// 与 Swift 里 v1.0.123 的 clamp 逐字同源
function CLAMP() {
  var __vw = window.innerWidth || 430;
  var __all = document.body ? document.body.getElementsByTagName('*') : [];
  var __hits = [];
  var __n = __all.length;
  if (__n > 3000) __n = 3000;
  for (var __bi = 0; __bi < __n; __bi++) {
    var __el = __all[__bi];
    if (!__el || __el.nodeType !== 1) continue;
    var __bq = __el.getBoundingClientRect();
    if (__bq.width < 8 || __bq.height < 8) continue;
    var __ov = __bq.right - __vw;
    if (__ov <= 0.5) continue;
    if (__bq.left < 0 || __bq.left >= __vw - 1) continue;
    if (__bq.width > __vw) continue;
    if (__ov > 120) continue;
    var __bcs = getComputedStyle(__el);
    if (__bcs.display === 'none' || __bcs.visibility === 'hidden') continue;
    var __bt = __bcs.transform;
    var __btx = 0;
    if (__bt && __bt !== 'none') {
      var __bm = __bt.match(/^matrix\(([^)]*)\)$/);
      if (!__bm) continue;
      var __bp = __bm[1].split(',');
      if (__bp.length < 6) continue;
      var __okT = Math.abs(parseFloat(__bp[0]) - 1) < 0.01 && Math.abs(parseFloat(__bp[1])) < 0.01
        && Math.abs(parseFloat(__bp[2])) < 0.01 && Math.abs(parseFloat(__bp[3]) - 1) < 0.01;
      if (!__okT) continue;
      __btx = parseFloat(__bp[4]) || 0;
    }
    var __par = __el.parentElement;
    var __scrollable = false;
    var __depth = 0;
    while (__par && __par !== document.body && __depth < 12) {
      var __pcs = getComputedStyle(__par);
      if (__pcs.overflowX === 'auto' || __pcs.overflowX === 'scroll') { __scrollable = true; break; }
      __par = __par.parentElement; __depth++;
    }
    if (__scrollable) continue;
    __hits.push([__el, __ov, __btx]);
  }
  for (var __hj = 0; __hj < __hits.length; __hj++) {
    var __h = __hits[__hj];
    __h[0].style.setProperty('transform', 'translateX(' + (__h[2] - __h[1]) + 'px)', 'important');
  }
  return __hits.length;
}

const SIZES = [{ w: 430, h: 932, sb: 59 }, { w: 393, h: 852, sb: 54 }, { w: 375, h: 667, sb: 20 }];

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const S of SIZES) {
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);
    await p.evaluate(({ css, sb }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', sb + 'px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
      document.head.appendChild(s);
    }, { css: APP_CSS, sb: S.sb });
    await p.waitForTimeout(800);

    const before = await p.evaluate(() => {
      const vw = innerWidth; const r = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const q = el.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return;
        const ro = Math.round((q.right - vw) * 10) / 10, lo = Math.round(-q.left * 10) / 10;
        if (ro <= 0.6 && lo <= 0.6) return;
        r.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 30), label: el.getAttribute('aria-label') || '', ro, lo, x: Math.round(q.x), w: Math.round(q.width) });
      });
      r.sort((a, b2) => b2.ro - a.ro); return r;
    });

    const n = await p.evaluate(CLAMP);
    const n2 = await p.evaluate(CLAMP); // 幂等性：第二轮应为 0 或更少
    await p.waitForTimeout(300);

    const after = await p.evaluate(() => {
      const vw = innerWidth; const r = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const q = el.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return;
        const ro = Math.round((q.right - vw) * 10) / 10, lo = Math.round(-q.left * 10) / 10;
        if (ro <= 0.6 && lo <= 0.6) return;
        r.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 30), label: el.getAttribute('aria-label') || '', ro, lo, x: Math.round(q.x), w: Math.round(q.width) });
      });
      r.sort((a, b2) => b2.ro - a.ro);
      // 关键元素是否被误伤
      const sb = document.querySelector('[class*="sidebarCol"]');
      const rb = document.querySelector('[class*="rightbarCol"]');
      return {
        list: r,
        sidebarX: sb ? Math.round(sb.getBoundingClientRect().x) : null,
        rightbarX: rb ? Math.round(rb.getBoundingClientRect().x) : null,
        docSW: document.documentElement.scrollWidth, vw,
      };
    });

    console.log('\n=== ' + S.w + 'x' + S.h + ' ===');
    console.log('钳制命中: 第1轮 ' + n + ' 个，第2轮 ' + n2 + ' 个（幂等 → 应为 0）');
    console.log('抽屉 x=' + after.sidebarX + '（应为 -150 左右，未被误伤）  右面板 x=' + after.rightbarX + '（应 ≥ vw，未被误伤）');
    console.log('docSW=' + after.docSW + ' vw=' + after.vw);
    console.log('-- 修复前右侧真出血（不含本身就在屏幕外的）--');
    before.filter(o => o.ro > 0.6 && o.x >= 0 && o.x < S.w - 1).slice(0, 8).forEach(o =>
      console.log('   R+' + o.ro + ' x=' + o.x + ' w=' + o.w + ' ' + o.tag + (o.label ? '[' + o.label + ']' : '') + '.' + o.cls));
    console.log('-- 修复后仍右侧出血 --');
    const left = after.list.filter(o => o.ro > 0.6 && o.x >= 0 && o.x < S.w - 1);
    if (!left.length) console.log('   （无 ✅）');
    left.slice(0, 8).forEach(o => console.log('   R+' + o.ro + ' x=' + o.x + ' w=' + o.w + ' ' + o.tag + (o.label ? '[' + o.label + ']' : '') + '.' + o.cls));
    await p.screenshot({ path: 'bleed_' + S.w + '.png' });
    await c.close();
  }
  await b.close();
})();
