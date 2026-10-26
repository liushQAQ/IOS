/* R47 结构探针：CSS-only 注入下，抽屉按钮的祖先链类名 + 各层计算样式 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    const lines = js.split('\n');
    let css = '';
    for (const ln of lines) {
      const m = ln.match(/^\s*'(.*)',?\s*$/);
      if (m && /[{}:;]/.test(m[1])) css += m[1].replace(/\\'/g, "'").replace(/\\"/g, '"') + '\n';
    }
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const hit = rows.find(e => (e.textContent || '').indexOf('Generate the') >= 0) || rows[1] || rows[0];
    if (hit) hit.click();
  });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(() => {
    const out = { chain: [] };
    const db = document.querySelector('button[aria-label="打开右侧边栏"], button[aria-label="收起右侧边栏"]');
    if (!db) { out.noDb = true; return out; }
    const rr = db.getBoundingClientRect();
    out.btn = { right: Math.round(rr.right), left: Math.round(rr.left), top: Math.round(rr.top) };
    let n = db, depth = 0;
    while (n && depth < 8) {
      const cs = getComputedStyle(n);
      const r2 = n.getBoundingClientRect();
      out.chain.push({
        depth, tag: n.tagName.toLowerCase(),
        cls: (typeof n.className === 'string' ? n.className : '').slice(0, 60),
        pos: cs.position, right: cs.right, disp: cs.display,
        rect: [Math.round(r2.left), Math.round(r2.top), Math.round(r2.width), Math.round(r2.height)],
        inline: (n.getAttribute('style') || '').slice(0, 80)
      });
      n = n.parentElement; depth++;
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
