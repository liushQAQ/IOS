/* v1.0.127 顶栏复验：真机条件 env=59 下顶栏几何 + 特写图 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const M = () => {
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const q = el => el ? el.getBoundingClientRect() : null;
  const fq = q(frame), cq = q(col), hq = q(hdr);
  // tab 下划线（会话页分段控件的选中条）
  let tabBottom = null;
  const cand = Array.from(document.querySelectorAll('[class*="tab"], [role="tab"]'))
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 10 && r.height < 60 && r.top < 200; })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  if (cand.length) {
    const r = cand[0].getBoundingClientRect();
    tabBottom = Math.round((r.bottom) * 10) / 10;
  }
  return {
    framePT: frame ? getComputedStyle(frame).paddingTop : null,
    frameTop: fq ? Math.round(fq.top) : null,
    colTop: cq ? Math.round(cq.top) : null,
    hdrTop: hq ? Math.round(hq.top) : null,
    tabBottom,
    sb: window.__dshNativeStatusBar,
    shift: window.__dshTopShift,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  // 先量「不注入 App」的真机条件（模拟 env=59）→ 证明代理层已无 59px 内边距
  await p.evaluate(() => {
    const fe = document.createElement('style'); fe.id = '__fakeenv';
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
  });
  await p.waitForTimeout(1500);
  const raw = await p.evaluate(M);

  await p.evaluate(({ js, css }) => {
    const fk = document.getElementById('__fakeenv'); if (fk) fk.remove();   // 交回 App 自己管状态栏
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(4200);
  const after = await p.evaluate(M);
  await p.screenshot({ path: path.join(DIR, 'v127_top_conv.png'), clip: { x: 0, y: 0, width: 430, height: 150 } });

  // 会话页（老总截图那种：有本轮费用行）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3200);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(700);
  const conv = await p.evaluate(M);
  await p.screenshot({ path: path.join(DIR, 'v127_top_session.png'), clip: { x: 0, y: 0, width: 430, height: 150 } });

  console.log('RAW(不注入App, env=59) ' + JSON.stringify(raw));
  console.log('AFTER(注入App, sb=59)  ' + JSON.stringify(after));
  console.log('CONV(会话页)           ' + JSON.stringify(conv));
  await b.close();
})();
