/**
 * _probe_fab91.js —— 归因：91 拆除布局劫持后「插件页 fab 中心命不中自身」
 * 闸门输出：命中=其它 pageHead z=19
 * 目标：dump fab 祖先链 + pageHead 祖先链 + elementFromPoint 命中链，
 *       找出到底是谁盖住 fab（stacking context / z-index / transform / isolation）。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const chainInfo = `
function chain(el, tag) {
  const out = [];
  let n = el, i = 0;
  while (n && n !== document.documentElement && i < 14) {
    const cs = getComputedStyle(n);
    const q = n.getBoundingClientRect();
    out.push({
      tag: tag + '^' + i,
      cls: (n.className || '').toString().slice(0, 60),
      pos: cs.position, z: cs.zIndex, disp: cs.display,
      tr: cs.transform, filt: cs.filter, iso: cs.isolation,
      op: cs.opacity, ov: cs.overflow, contain: cs.contain,
      mix: cs.mixBlendMode, willCh: cs.willChange, clip: cs.clipPath,
      box: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)],
      inlineZ: n.style.zIndex || ''
    });
    n = n.parentElement; i++;
  }
  return out;
}
`;

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR ' + e); }
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());

  // 进插件页（与闸门完全一致）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) { const b = Array.from(d.querySelectorAll('button')).find(x => /知道了|确定|关闭|OK/i.test((x.textContent || '').trim())); if (b) b.click(); else if (d.close) d.close(); } } catch (e) {}
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(3600);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(800);

  const R = await p.evaluate(new Function(chainInfo + `
    const ph = document.querySelector('[class*="pageHead"]');
    const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
      const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
      return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.x < 100 && q.y < 220;
    });
    if (!fabs.length) return { noFab: true, ph: !!ph };
    const fab = fabs[0];
    const q = fab.getBoundingClientRect();
    const cx = q.x + q.width / 2, cy = q.y + q.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    // 命中的元素从中心点往上剥，找到与 fab 的共同祖先前的第一个块
    const stack = document.elementsFromPoint(cx, cy).slice(0, 8).map(e => ({
      cls: (e.className || '').toString().slice(0, 60),
      tag: e.tagName, z: getComputedStyle(e).zIndex, pos: getComputedStyle(e).position,
      isFab: e === fab || fab.contains(e)
    }));
    return {
      ok: true,
      fabLabel: fab.getAttribute('aria-label'),
      fabBox: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)],
      center: [Math.round(cx), Math.round(cy)],
      hitCls: hit ? (hit.className || '').toString().slice(0, 60) : null,
      hitTag: hit ? hit.tagName : null,
      hitIsFab: !!(hit && (hit === fab || fab.contains(hit))),
      phZ: ph ? getComputedStyle(ph).zIndex : null,
      phInlineZ: ph ? ph.style.zIndex : null,
      stack: stack,
      fabChain: chain(fab, 'FAB'),
      phChain: ph ? chain(ph, 'PH') : [],
      // 该页所有 fixed 浮层
      fixeds: Array.from(document.querySelectorAll('body *')).filter(e => {
        const cs = getComputedStyle(e); return cs.position === 'fixed' && cs.display !== 'none';
      }).slice(0, 12).map(e => ({
        cls: (e.className || '').toString().slice(0, 50), z: getComputedStyle(e).zIndex,
        box: (function (r) { return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(e.getBoundingClientRect())
      }))
    };
  `));

  console.log('=== PROBE FAB 91 ===');
  console.log(JSON.stringify(R, null, 2));
  console.log('PAGE ERRORS: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ! ' + e));

  await p.screenshot({ path: path.join(DIR, '_probe_fab91.png') });
  await browser.close();
})();
