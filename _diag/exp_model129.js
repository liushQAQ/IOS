/* 模型选择器新修法参数实验（新 DSH 前端 fingerprint 164rgq）：
   分别试 4 种 root/button 约束组合，量几何，选不压发送按钮且 label 可见的。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const MEASURE = () => {
  const root = document.querySelector('[class*="ofTiQG_root"]');
  const btn = document.querySelector('[class*="ofTiQG_trigger"]');
  const label = document.querySelector('[class*="triggerLabel"]');
  const name = label ? label.querySelector('span') : null;
  const send = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(b => {
    const r = b.getBoundingClientRect();
    return r.x > 300 && r.width > 30 && (b.className || '').toString().indexOf('primary') >= 0;
  }) || Array.from(document.querySelectorAll('[class*="composerStack"] button')).pop();
  const R = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) }; };
  return {
    root: root ? R(root) : null, btn: btn ? R(btn) : null,
    labelW: label ? Math.round(label.getBoundingClientRect().width) : null,
    nameRight: name ? Math.round(name.getBoundingClientRect().right) : null,
    send: send ? R(send) : null,
    gap: btn && send ? Math.round(send.getBoundingClientRect().x - btn.getBoundingClientRect().right) : null,
    docSW: document.documentElement.scrollWidth
  };
};

const VARIANTS = {
  A_rootNoShrink: '[class*="composerStack"] [class*="ofTiQG_root"] { flex-shrink: 0 !important; }',
  B_rootMin110: '[class*="composerStack"] [class*="ofTiQG_root"] { min-width: 110px !important; flex-shrink: 0 !important; }',
  C_rootW148: '[class*="composerStack"] [class*="ofTiQG_root"] { width: 148px !important; min-width: 148px !important; flex-shrink: 0 !important; }',
  D_rootMin110_noClampBtn: '[class*="composerStack"] [class*="ofTiQG_root"] { min-width: 110px !important; flex-shrink: 0 !important; } [class*="composerStack"] button[aria-label*="选择模型"] { max-width: none !important; }'
};

(async () => {
  for (const [name, css] of Object.entries(VARIANTS)) {
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
    await p.waitForTimeout(8000);
    await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
    await p.waitForTimeout(2500);
    await p.evaluate((extra) => {
      const st = document.createElement('style');
      st.id = '__variant';
      st.textContent = extra;
      document.head.appendChild(st);
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
    }, css);
    await p.waitForTimeout(1500);
    const m = await p.evaluate(MEASURE);
    console.log(name + ': ' + JSON.stringify(m));
    await b.close();
  }
})();
