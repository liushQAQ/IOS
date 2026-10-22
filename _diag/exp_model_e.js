/* 修复实验 E：root 抢回 96~150px，胶囊（dsh-po-capsule）可缩让位 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const FIX = `
[class*="composerStack"] [class*="ofTiQG_root"] {
  flex: 1 1 auto !important;
  min-width: 96px !important;
  max-width: 150px !important;
}
[class*="composerStack"] [class*="dsh-po-capsule"] {
  flex-shrink: 1 !important;
  min-width: 36px !important;
  max-width: 83px !important;
  overflow: hidden !important;
}
`;

const MEASURE = () => {
  const root = document.querySelector('[class*="ofTiQG_root"]');
  const btn = root ? root.querySelector('button') : null;
  const label = document.querySelector('[class*="triggerLabel"]');
  const caps = document.querySelector('[class*="dsh-po-capsule"]');
  const send = Array.from(document.querySelectorAll('[class*="composerStack"] button')).filter(b => {
    const r = b.getBoundingClientRect(); return r.x > 300 && r.width > 25;
  }).sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
  const R = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) }; };
  const span = label ? label.querySelector('span') : null;
  return {
    root: root ? R(root) : null, btn: btn ? R(btn) : null,
    cap: caps ? R(caps) : null, send: send ? R(send) : null,
    labelW: label ? Math.round(label.getBoundingClientRect().width) : null,
    spanRight: span ? Math.round(span.getBoundingClientRect().right) : null,
    vw: document.documentElement.clientWidth,
    docSW: document.documentElement.scrollWidth
  };
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
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1600);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate((fix) => {
    const st = document.createElement('style'); st.textContent = fix; document.head.appendChild(st);
    try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
  }, FIX);
  await p.waitForTimeout(1500);
  console.log('E: ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.screenshot({ path: path.join(DIR, 'model_e.png'), clip: { x: 0, y: 600, width: 430, height: 332 } });
  await b.close();
})();
