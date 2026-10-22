const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);
  await p.evaluate((css) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
    document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
      el.style.setProperty('width', '252px', 'important');
      el.style.setProperty('min-width', '252px', 'important');
      el.style.setProperty('max-width', '252px', 'important');
    });
  }, APP_CSS);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2200);

  const r = await p.evaluate(() => {
    const sb = document.querySelector('[class*="sidebarCol"]');
    const sr = sb.getBoundingClientRect();
    const out = [];
    // 找所有「时间」文本节点
    sb.querySelectorAll('span,div').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!/^\d+\s*(分钟|小时|天|刚刚)$/.test(t)) return;
      const q = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (q.width < 4) return;
      // 往上找 3 层
      const chain = [];
      let cur = el;
      for (let i = 0; i < 4 && cur && cur !== sb; i++) {
        const cq = cur.getBoundingClientRect();
        const ccs = getComputedStyle(cur);
        chain.push({
          tag: cur.tagName, cls: String(cur.className || '').slice(0, 36),
          x: Math.round(cq.x), w: Math.round(cq.width), right: Math.round(cq.right),
          disp: ccs.display, flex: ccs.flex, pos: ccs.position, of: ccs.overflowX,
        });
        cur = cur.parentElement;
      }
      out.push({ text: t, x: Math.round(q.x), w: Math.round(q.width), right: Math.round(q.right), vis: cs.visibility, chain });
    });
    return { drawerRight: Math.round(sr.right), items: out.slice(0, 6) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
