/* 三态取证：① 裸 DSH 零注入 ② 只注 CSS ③ CSS + 页面锁
   看文档是否天然可滚、header/composer 是否在滚动祖先里。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const PROBE = () => {
  const de = document.documentElement;
  const hdr = document.querySelector('[data-mobile-nav="frame"] header') || document.querySelector('header');
  const comp = document.querySelector('[class*="composerStack"]') || document.querySelector('[class*="composer"]');
  const list = document.querySelector('[class*="thread"], [class*="messageList"], [class*="scrollArea"], [class*="msgList"]');
  const R = e => e ? (r => ({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }))(e.getBoundingClientRect()) : null;
  const scrollables = [];
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length && i < 3000; i++) {
    const e = all[i]; const cs = getComputedStyle(e);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.clientHeight > 100) {
      scrollables.push({ cls: (e.className || '').toString().slice(0, 46), sh: e.scrollHeight, ch: e.clientHeight,
        hasHdr: !!(hdr && e.contains(hdr)), hasComp: !!(comp && e.contains(comp)) });
    }
  }
  return {
    ih: innerHeight, docSH: de.scrollHeight, docCH: de.clientHeight, bodySH: document.body.scrollHeight,
    htmlPos: getComputedStyle(de).position, bodyPos: getComputedStyle(document.body).position,
    htmlOy: getComputedStyle(de).overflowY, bodyOy: getComputedStyle(document.body).overflowY,
    canScroll: de.scrollHeight > de.clientHeight + 2,
    header: R(hdr), composer: R(comp), frame: R(document.querySelector('[data-mobile-nav="frame"]')),
    scrollables: scrollables.slice(0, 6)
  };
};

async function run(tag, mode) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  if (mode !== 'raw') {
    await p.evaluate((css) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }, APP_CSS);
    await p.waitForTimeout(800);
  }
  if (mode === 'locked') {
    await p.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = 'html, body { overflow: hidden !important; overscroll-behavior: none !important; position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; }';
      document.head.appendChild(st);
    });
    await p.waitForTimeout(800);
  }
  // 进会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1600);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(8000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) d.close(); } catch (e) {} });

  const before = await p.evaluate(PROBE);
  // 用 JS 强制整页滚动，看能不能滚（模拟手指拖动）
  const after = await p.evaluate(() => {
    window.scrollTo(0, 400);
    document.documentElement.scrollTop = 400;
    document.body.scrollTop = 400;
    const de = document.documentElement;
    return { docTop: de.scrollTop, winY: window.scrollY };
  });
  console.log('### ' + tag);
  console.log(' before: ' + JSON.stringify(before));
  console.log(' scrollTo(400): ' + JSON.stringify(after));
  await p.screenshot({ path: path.join(DIR, 'scroll_' + tag + '.png'), clip: { x: 0, y: 0, width: 430, height: 260 } });
  await b.close();
}

(async () => {
  await run('raw', 'raw');
  await run('cssonly', 'css');
  await run('locked', 'locked');
})();
