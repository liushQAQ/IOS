/* DOM 祖先链取证：header / composer / 消息列表 各自挂在哪，谁 overflow。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const CHAIN = (sel, maxDeep) => {
  const e0 = document.querySelector(sel);
  if (!e0) return { sel, found: false };
  const chain = [];
  let e = e0, i = 0;
  while (e && i++ < (maxDeep || 12)) {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    chain.push({
      tag: e.tagName,
      cls: (e.className || '').toString().slice(0, 48),
      display: cs.display, position: cs.position, oy: cs.overflowY,
      h: Math.round(r.height), top: Math.round(r.top),
      sh: e.scrollHeight, ch: e.clientHeight
    });
    e = e.parentElement;
  }
  return { sel, found: true, chain };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate((css) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }, APP_CSS);
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

  for (const [name, sel] of [['header', '[data-mobile-nav="frame"] header'], ['composer', '[class*="composerStack"]'], ['scrollBody', '[class*="_727C8a_scrollBody"]'], ['centerCol', '[class*="centerCol"]']]) {
    console.log('<<< ' + name + ' >>>');
    console.log(JSON.stringify(await p.evaluate(CHAIN, sel), null, 0));
  }
  // scrollBody 的直接子级
  console.log('<<< scrollBody children >>>');
  console.log(JSON.stringify(await p.evaluate(() => {
    const s = document.querySelector('[class*="_727C8a_scrollBody"]');
    if (!s) return null;
    return Array.from(s.children).map(c => ({ tag: c.tagName, cls: (c.className || '').toString().slice(0, 46), h: Math.round(c.getBoundingClientRect().height), oy: getComputedStyle(c).overflowY, sh: c.scrollHeight, ch: c.clientHeight }));
  }), null, 0));
  await b.close();
})();
