/* v1.0.127 顶栏补拍：点掉计费公告后再截顶栏特写 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const killNotice = () => {
  try {
    const d = document.querySelector('dialog.cm-billion-notice');
    if (d) {
      const btn = Array.from(d.querySelectorAll('button')).find(b => /知道了|确定|关闭|OK/i.test((b.textContent || '').trim()));
      if (btn) btn.click(); else if (typeof d.close === 'function') d.close();
    }
  } catch (e) {}
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
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(4200);
  await p.evaluate(killNotice);
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(DIR, 'v127_top_home.png'), clip: { x: 0, y: 0, width: 430, height: 130 } });

  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(killNotice);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3200);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(700);
  const m = await p.evaluate(() => {
    const col = document.querySelector('[class*="centerCol"]');
    const hdr = document.querySelector('header');
    return {
      colTop: col ? Math.round(col.getBoundingClientRect().top) : null,
      hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
      framePT: (() => { const f = document.querySelector('[data-mobile-nav="frame"]'); return f ? getComputedStyle(f).paddingTop : null; })(),
    };
  });
  await p.screenshot({ path: path.join(DIR, 'v127_top_session2.png'), clip: { x: 0, y: 0, width: 430, height: 130 } });
  console.log('CONV ' + JSON.stringify(m));
  await b.close();
})();
