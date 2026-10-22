/* v1.0.127 深挖：模型选择器按钮 为什么右缘越界压到发送按钮
   输出：模型按钮 + 发送按钮的祖先链（4 层）与兄弟节点全部 rect / 计算样式 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const SCAN = () => {
  const out = {};
  const all = Array.from(document.querySelectorAll('button, [role="button"]'));
  const ms = all.filter(e => /选择模型/.test(e.getAttribute('aria-label') || ''));
  const sd = all.filter(e => /发送消息|发送/.test(e.getAttribute('aria-label') || ''));
  const desc = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const q = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 48),
      x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
      right: Math.round(q.right), bottom: Math.round(q.bottom),
      disp: cs.display, pos: cs.position, flex: cs.flex,
      flexShrink: cs.flexShrink, flexBasis: cs.flexBasis, minWidth: cs.minWidth, maxWidth: cs.maxWidth,
      width: cs.width, gap: cs.gap, colGap: cs.columnGap, justify: cs.justifyContent, align: cs.alignItems,
      wrap: cs.flexWrap, dir: cs.flexDirection, overflowX: cs.overflowX, transform: cs.transform,
      margin: cs.margin, padding: cs.padding, boxSizing: cs.boxSizing,
    };
  };
  const chain = (el) => {
    const arr = [];
    let a = el;
    for (let i = 0; i < 6 && a; i++) { arr.push(desc(a)); a = a.parentElement; }
    return arr;
  };
  out.modelCount = ms.length;
  out.sendCount = sd.length;
  out.model = desc(ms[0]);
  out.modelChain = chain(ms[0]);
  const mp = ms[0] && ms[0].parentElement;
  if (mp) {
    out.siblings = Array.from(mp.children).map(c => desc(c));
    out.parentChain = chain(mp);
  }
  out.send = desc(sd[0]);
  out.sendChain = chain(sd[0]);
  // 模型按钮内部结构（下箭头是不是独立元素）
  if (ms[0]) {
    out.modelInner = Array.from(ms[0].querySelectorAll('*')).slice(0, 12).map(e => {
      const q = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { tag: e.tagName, cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').slice(0, 24), x: Math.round(q.x), right: Math.round(q.right), w: Math.round(q.width), disp: cs.display, flex: cs.flex, minWidth: cs.minWidth };
    });
  }
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  const r = await p.evaluate(SCAN);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
