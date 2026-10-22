// 第二步：进具体会话量 dock 重叠；进「插件」页量 frame/标题/fab
const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');

async function boot(p) {
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {}
    window.__t = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__t(); }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1000);
}

const TOP = () => {
  const o = { url: location.pathname.slice(0, 50) };
  const hd = document.querySelector('header');
  o.hasHeader = !!hd;
  if (hd) { const q = hd.getBoundingClientRect(); o.headerTop = Math.round(q.top); }
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  o.frameFound = !!frame;
  o.framePadTop = frame ? getComputedStyle(frame).paddingTop : null;
  // frame 的前几个可见子块（内容列）
  if (frame) {
    o.frameKids = Array.from(frame.children).slice(0, 6).map(el => {
      const cs = getComputedStyle(el); const q = el.getBoundingClientRect();
      return { tag: el.tagName, cls: String(el.className).slice(0, 30), y: Math.round(q.y), h: Math.round(q.height), mt: cs.marginTop, pos: cs.position };
    });
  }
  const h1 = document.querySelector('h1,h2');
  if (h1) { const q = h1.getBoundingClientRect(); o.h1 = { text: (h1.textContent||'').slice(0,12), y: Math.round(q.y), x: Math.round(q.x) }; }
  // fixed 按钮
  o.fixedBtns = Array.from(document.querySelectorAll('button')).filter(b => {
    const cs = getComputedStyle(b); if (cs.position !== 'fixed' || cs.display === 'none') return false;
    const q = b.getBoundingClientRect(); return q.width > 10 && q.y < 200;
  }).map(b => { const q = b.getBoundingClientRect();
    return { label: b.getAttribute('aria-label'), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), z: getComputedStyle(b).zIndex }; });
  return o;
};

const DOCK = () => {
  const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
  if (!dock) return { none: true };
  const leaves = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const hasVisibleChild = Array.from(el.children).some(c => getComputedStyle(c).display !== 'none');
    const q = el.getBoundingClientRect();
    if (!hasVisibleChild || depth >= 4) {
      if (q.width > 6 && q.height > 6) leaves.push({ cls: String(el.className || el.tagName).slice(0, 30),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        x: Math.round(q.x * 10) / 10, y: Math.round(q.y), r: Math.round(q.right * 10) / 10, b: Math.round(q.bottom), w: Math.round(q.width), h: Math.round(q.height) });
      return;
    }
    Array.from(el.children).forEach(c => walk(c, depth + 1));
  };
  walk(dock, 0);
  const ov = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    const yO = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    const xO = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    if (yO > 2 && xO > 2) ov.push({ yO: Math.round(yO * 10) / 10, xO: Math.round(xO * 10) / 10, a: a.cls + ' "' + a.text + '"', b: b.cls + ' "' + b.text + '"' });
  }
  return { leaves: leaves.slice(0, 30), overlapCount: ov.length, overlaps: ov.slice(0, 14) };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await boot(p);

  // 1) 打开抽屉，点第一个会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const r = Array.from(document.querySelectorAll('[class*="sessionRow"],[class*="cIzfCa_row"]')).find(e => e.getBoundingClientRect().width > 100); if (r) r.click(); });
  await p.waitForTimeout(3500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1500);
  console.log('===== 会话内 · 顶栏 =====');
  console.log(JSON.stringify(await p.evaluate(TOP), null, 1));
  console.log('===== 会话内 · 底部插件 dock =====');
  console.log(JSON.stringify(await p.evaluate(DOCK), null, 1));

  // 2) 打开抽屉 → 插件
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b) b.click(); });
  await p.waitForTimeout(3500);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1500);
  console.log('===== 插件页 · 顶栏/标题/固定按钮 =====');
  console.log(JSON.stringify(await p.evaluate(TOP), null, 1));
  await p.screenshot({ path: 'plugin_page_now.png' });
  await b.close();
})();
