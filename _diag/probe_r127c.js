/* v1.0.127 深挖 2：找出 ofTiQG_trigger 为什么比 ofTiQG_root 宽 18px
   还要回答：不开我们的注入 CSS 时是否也重叠（判定责任归属） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const MEASURE = () => {
  const all = Array.from(document.querySelectorAll('button, [role="button"]'));
  const m = all.find(e => /选择模型/.test(e.getAttribute('aria-label') || ''));
  const s = all.find(e => /发送消息|发送/.test(e.getAttribute('aria-label') || ''));
  if (!m || !s) return { miss: true, m: !!m, s: !!s };
  const mq = m.getBoundingClientRect(), sq = s.getBoundingClientRect();
  const root = m.parentElement;
  const rq = root ? root.getBoundingClientRect() : null;
  return {
    model: { x: Math.round(mq.x), right: Math.round(mq.right), w: Math.round(mq.width), h: Math.round(mq.height) },
    root: rq ? { x: Math.round(rq.x), right: Math.round(rq.right), w: Math.round(rq.width), cls: String(root.className || '').slice(0, 30) } : null,
    send: { x: Math.round(sq.x), right: Math.round(sq.right), w: Math.round(sq.width) },
    overlap: Math.max(0, Math.round(mq.right - sq.x)),
    modelInline: m.getAttribute('style') || '',
    rootInline: root ? (root.getAttribute('style') || '') : '',
    modelCS: (() => { const c = getComputedStyle(m); return { width: c.width, maxWidth: c.maxWidth, minWidth: c.minWidth, boxSizing: c.boxSizing, padding: c.padding, flex: c.flex, position: c.position, inset: c.inset, right: c.right }; })(),
  };
};

const RULES = () => {
  const hit = [];
  const scan = (rules, where) => {
    for (const r of rules) {
      try {
        if (r.cssRules) { scan(r.cssRules, where); continue; }
        const sel = r.selectorText || '';
        if (/ofTiQG|VERcba_standardControls|VERcba_trailing|VERcba_primary/.test(sel)) {
          hit.push({ where, sel: sel.slice(0, 160), css: (r.style && r.style.cssText || '').slice(0, 260) });
        }
      } catch (e) {}
    }
  };
  for (const ss of Array.from(document.styleSheets)) {
    try { scan(ss.cssRules, ss.ownerNode && ss.ownerNode.id ? '#' + ss.ownerNode.id : (ss.href ? String(ss.href).slice(-40) : 'inline')); } catch (e) {}
  }
  return hit;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.id = '__appcss'; st.textContent = css; document.head.appendChild(st);
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

  console.log('=== A. 有 App CSS 注入 ===');
  console.log(JSON.stringify(await p.evaluate(MEASURE), null, 1));

  console.log('=== B. DSH 相关规则 ===');
  console.log(JSON.stringify(await p.evaluate(RULES), null, 1));

  console.log('=== C. 摘掉 App CSS 后 ===');
  await p.evaluate(() => { const s = document.getElementById('__appcss'); if (s) s.disabled = true; });
  await p.waitForTimeout(1500);
  console.log(JSON.stringify(await p.evaluate(MEASURE), null, 1));
  await p.evaluate(() => { const s = document.getElementById('__appcss'); if (s) s.disabled = false; });
  await p.waitForTimeout(1200);

  console.log('=== D. 试修：button max-width:100% + text-overflow ===');
  console.log(JSON.stringify(await p.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const m = all.find(e => /选择模型/.test(e.getAttribute('aria-label') || ''));
    m.style.setProperty('max-width', '100%', 'important');
    m.style.setProperty('min-width', '0', 'important');
    const q = m.getBoundingClientRect();
    return { x: Math.round(q.x), right: Math.round(q.right), w: Math.round(q.width) };
  }), null, 1));
  await p.waitForTimeout(600);
  console.log('=== D2. 修后重叠 ===');
  console.log(JSON.stringify(await p.evaluate(MEASURE), null, 1));

  console.log('=== E. 试修：root 允许收缩 + 组件 gap ===');
  await p.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const m = all.find(e => /选择模型/.test(e.getAttribute('aria-label') || ''));
    m.style.removeProperty('max-width'); m.style.removeProperty('min-width');
    const trail = document.querySelector('[class*="composerStack"] [class*="trailing"]');
    const q0 = trail ? trail.getBoundingClientRect() : null;
    const st = trail ? trail.querySelector('[class*="standardControls"]') : null;
    if (st) st.style.setProperty('min-width', '0', 'important');
    if (st) st.style.setProperty('flex', '1 1 auto', 'important');
    if (st) st.style.setProperty('overflow', 'hidden', 'important');
    if (trail) trail.style.setProperty('gap', '10px', 'important');
    return null;
  });
  await p.waitForTimeout(800);
  console.log(JSON.stringify(await p.evaluate(MEASURE), null, 1));

  await b.close();
})();
