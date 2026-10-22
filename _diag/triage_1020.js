// 老总 2026-10-20 三连报的几何取证：
//   1) 底部「费用明细 / U 80.14% · 内存 / 本会话 ¥」插件小部件互相重叠
//   2) 插件页 左上角侧边栏按钮压住页面标题
//   3) 顶栏离 iOS 状态栏又变宽（上移校正没生效）
const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');

const PROBE = () => {
  const out = { vw: innerWidth, vh: innerHeight };
  out.nativeSB = window.__dshNativeStatusBar || null;
  out.topShift = window.__dshTopShift || null;
  out.safeArea = window.__dshSafeArea || null;

  // —— 顶栏 ——
  const hd = document.querySelector('header');
  if (hd) {
    const q = hd.getBoundingClientRect();
    const cs = getComputedStyle(hd);
    // 找 fixTop 实际改的那个 col（header 向上走到 frame 的直接子级）
    const frame = hd.closest('[data-mobile-nav="frame"]');
    let col = hd;
    while (col && col.parentElement) {
      if (frame && col.parentElement === frame) break;
      if (col.parentElement === document.body || col.parentElement === document.documentElement) break;
      col = col.parentElement;
    }
    const ccs = getComputedStyle(col);
    out.header = {
      tag: hd.tagName, cls: String(hd.className).slice(0, 40),
      top: Math.round(q.top * 10) / 10, h: Math.round(q.height),
      position: cs.position, padTop: cs.paddingTop, z: cs.zIndex,
      frameFound: !!frame,
      framePadTop: frame ? getComputedStyle(frame).paddingTop : null,
      colTag: col.tagName, colCls: String(col.className).slice(0, 40),
      colMarginTop: ccs.marginTop,
      titleTop: (function () {
        const t = hd.querySelector('h1,h2,[class*="title"]');
        return t ? Math.round(t.getBoundingClientRect().top) : null;
      })(),
    };
  } else out.header = null;

  // —— 左上角固定按钮（fab / 侧边栏开关） ——
  const fabs = [];
  document.querySelectorAll('[data-mobile-nav="fab"],[aria-label*="侧边栏"],[aria-label*="打开"]').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const q = el.getBoundingClientRect();
    if (q.width < 4) return;
    fabs.push({ label: el.getAttribute('aria-label'), cls: String(el.className).slice(0, 30),
      x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
      pos: cs.position, z: cs.zIndex });
  });
  out.fabs = fabs;

  // —— 底部插件 dock（费用明细 / CPU / 会话费用） ——
  const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
  if (dock) {
    const dq = dock.getBoundingClientRect();
    const kids = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      Array.from(el.children).forEach(c => {
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const q = c.getBoundingClientRect();
        if (q.width < 6 || q.height < 6) return;
        kids.push({ d: depth, cls: String(c.className || c.tagName).slice(0, 34),
          text: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26),
          x: Math.round(q.x), y: Math.round(q.y), r: Math.round(q.right), b: Math.round(q.bottom),
          w: Math.round(q.width), h: Math.round(q.height), pos: cs.position });
        walk(c, depth + 1);
      });
    };
    walk(dock, 0);
    // 两两重叠（非父子）
    const ov = [];
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i], b = kids[j];
      if (a.x <= b.x && b.r <= a.r && a.y <= b.y && b.b <= a.b) continue;
      if (b.x <= a.x && a.r <= b.r && b.y <= a.y && a.b <= b.y) continue;
      const yO = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      const xO = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      if (yO > 2 && xO > 2) ov.push({ yO: Math.round(yO), xO: Math.round(xO), a: a.cls + ' "' + a.text + '"', b: b.cls + ' "' + b.text + '"' });
    }
    out.dock = { box: { x: Math.round(dq.x), y: Math.round(dq.y), w: Math.round(dq.width), h: Math.round(dq.height) },
      kids: kids.slice(0, 24), overlaps: ov.slice(0, 12), overlapCount: ov.length };
  } else out.dock = null;

  // 页面标识
  out.page = { h1: (document.querySelector('h1') || {}).textContent || null,
    title: document.title, hasRoot: !!document.querySelector('#root'),
    url: location.pathname.slice(0, 60) };
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {}
    window.__t = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__t(); }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1200);

  console.log('===== 会话页 =====');
  console.log(JSON.stringify(await p.evaluate(PROBE), null, 1));

  // 进「插件」页：侧边栏 → 找带「插件」的入口
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  const items = await p.evaluate(() => Array.from(document.querySelectorAll('a,button,[role="menuitem"]')).map(e => ({
    tag: e.tagName, text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
    cls: String(e.className || '').slice(0, 30) })).filter(i => i.text && i.text.length <= 12).slice(0, 60));
  console.log('\n===== 抽屉可点项 =====');
  console.log(JSON.stringify(items));
  await b.close();
})();
