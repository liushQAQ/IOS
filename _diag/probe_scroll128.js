/* 滚动归属取证：谁在滚？header/composer 是否在滚动容器内？
   模拟真机：注入 App 全部 CSS + shim，再调 __dshSetStatusBar(59)。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const PROBE = () => {
  const out = {};
  const de = document.documentElement;
  out.win = { iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio };
  out.doc = {
    scrollTop: de.scrollTop, scrollHeight: de.scrollHeight, clientHeight: de.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    bodyOverflow: getComputedStyle(document.body).overflowY,
    bodyPos: getComputedStyle(document.body).position,
    htmlOverflow: getComputedStyle(de).overflowY,
    htmlPos: getComputedStyle(de).position
  };
  const hdr = document.querySelector('[data-mobile-nav="frame"] header') || document.querySelector('header');
  const comp = document.querySelector('[class*="composerStack"]') || document.querySelector('[class*="composer"]');
  const col = document.querySelector('[class*="centerCol"]');
  const rect = e => e ? (r => ({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }))(e.getBoundingClientRect()) : null;
  out.header = rect(hdr);
  out.composer = rect(comp);
  out.col = rect(col);
  // 谁可滚动
  const scrollers = [];
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length && i < 4000; i++) {
    const e = all[i];
    const cs = getComputedStyle(e);
    const oy = cs.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 8) {
      scrollers.push({
        cls: (e.className && e.className.toString ? e.className.toString() : '').slice(0, 70),
        tag: e.tagName,
        sh: e.scrollHeight, ch: e.clientHeight, st: Math.round(e.scrollTop),
        hasHeader: !!(hdr && e.contains(hdr)),
        hasComposer: !!(comp && e.contains(comp)),
        top: Math.round(e.getBoundingClientRect().top),
        bottom: Math.round(e.getBoundingClientRect().bottom)
      });
    }
  }
  out.scrollers = scrollers.slice(0, 8);
  // frame 直接子级链
  const f = document.querySelector('[data-mobile-nav="frame"]');
  if (f) {
    out.frame = { h: Math.round(f.getBoundingClientRect().height), sh: f.scrollHeight, ch: f.clientHeight, pt: getComputedStyle(f).paddingTop, overflow: getComputedStyle(f).overflowY, children: [] };
    for (const c of f.children) out.frame.children.push({ tag: c.tagName, cls: (c.className || '').toString().slice(0, 60), h: Math.round(c.getBoundingClientRect().height) });
  }
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(2500);

  // 进会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) d.close(); } catch (e) {} });

  console.log('=== 初始 ===');
  console.log(JSON.stringify(await p.evaluate(PROBE), null, 1));

  // 模拟手指上滑（整页滚动？）
  await p.mouse.move(215, 600);
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(1200);
  console.log('=== 滚轮 +600 后 ===');
  console.log(JSON.stringify(await p.evaluate(PROBE), null, 1));
  await b.close();
})();
