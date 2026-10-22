/* v1.0.127 取证：会话框模型选择器下箭头 与 发送按钮 重叠
   量 composer 区域所有按钮/元素的 rect + 两两重叠矩阵（对照老总截图） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const SCAN = () => {
  const host = document.querySelector('[class*="composerStack"]');
  if (!host) return { noHost: true };
  const hq = host.getBoundingClientRect();
  const items = [];
  const walk = (el, depth) => {
    if (depth > 14) return;
    Array.from(el.children).forEach(k => walk(k, depth + 1));
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 6 || q.height < 6) return;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (el.tagName === 'svg' && q.y >= hq.y)) {
      items.push({
        tag: el.tagName,
        label: el.getAttribute('aria-label') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
        x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
        right: Math.round(q.right), bottom: Math.round(q.bottom),
        pos: cs.position, z: cs.zIndex,
        cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 30),
      });
    }
  };
  walk(host, 0);
  // 只保留 y 在 composer 底排（发送按钮那行）的
  const sendBtn = items.find(i => /发送|send/i.test(i.label) || /发送/.test(i.text)) || items.filter(i => i.h >= 30 && i.h <= 60).sort((a, b) => b.x - a.x)[0];
  const band = sendBtn ? { y0: sendBtn.y - 12, y1: sendBtn.bottom + 12 } : null;
  const row = band ? items.filter(i => i.y >= band.y0 && i.bottom <= band.y1 + 4) : items;
  // 重叠矩阵
  const pairs = [];
  for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
    const a = row[i], b = row[j];
    const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (ox > 3 && oy > 3) pairs.push([a.label || a.text || a.tag, b.label || b.text || b.tag, Math.round(ox) + 'x' + Math.round(oy)]);
  }
  return { hostRect: { y: Math.round(hq.y), h: Math.round(hq.height) }, n: row.length, row: row.slice(0, 30), pairs };
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
  // 老总截图是会话中（有本轮费用那行）→ 进会话
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
  console.log(JSON.stringify(r, null, 1).slice(0, 5000));
  // 顶区特写：composer 底排
  await p.evaluate(() => { const h = document.querySelector('[class*="composerStack"]'); if (h) { const q = h.getBoundingClientRect(); window.scrollTo(0, 0); } });
  await p.screenshot({ path: path.join(DIR, 'r127_composer.png') });
  await b.close();
})();
