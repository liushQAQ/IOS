/* v1.0.127 验证：模型选择器越界压发送按钮 —— 修前/修后三档宽度 + 特写图 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const FIX_CSS = `
[class*="composerStack"] button[aria-label*="选择模型"] {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
[class*="composerStack"] button[aria-label*="选择模型"] [class*="triggerLabel"] {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[class*="composerStack"] button[aria-label*="选择模型"] svg {
  flex: 0 0 auto !important;
}
`;

const MEASURE = () => {
  const all = Array.from(document.querySelectorAll('button, [role="button"]'));
  const m = all.find(e => /选择模型/.test(e.getAttribute('aria-label') || ''));
  const s = all.find(e => /发送消息|发送/.test(e.getAttribute('aria-label') || ''));
  if (!m || !s) return { miss: true };
  const mq = m.getBoundingClientRect(), sq = s.getBoundingClientRect();
  const root = m.parentElement, rq = root ? root.getBoundingClientRect() : null;
  const chev = m.querySelector('svg:last-of-type');
  const cq = chev ? chev.getBoundingClientRect() : null;
  const lab = m.querySelector('[class*="triggerLabel"]');
  const lq = lab ? lab.getBoundingClientRect() : null;
  const cs = getComputedStyle(m);
  const lcs = lab ? getComputedStyle(lab) : null;
  return {
    modelRight: Math.round(mq.right), modelW: Math.round(mq.width),
    rootRight: rq ? Math.round(rq.right) : null, rootW: rq ? Math.round(rq.width) : null,
    sendLeft: Math.round(sq.x),
    overlap: Math.max(0, Math.round(mq.right - sq.x)),
    gap: Math.round(sq.x - mq.right),
    chevron: cq ? { left: Math.round(cq.x), right: Math.round(cq.right), w: Math.round(cq.width), visible: cq.width > 4 } : null,
    label: lq ? { w: Math.round(lq.width), textOverflow: lcs.textOverflow, overflow: lcs.overflow, ws: lcs.whiteSpace } : null,
    modelText: (m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    modelMaxW: cs.maxWidth,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const [W, H, tag] of [[430, 932, '430'], [393, 852, '393'], [375, 812, '375']]) {
    const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6500);
    await p.evaluate(({ js, css }) => {
      const st = document.createElement('style'); st.id = '__appcss'; st.textContent = css; document.head.appendChild(st);
      try { (0, eval)(js); } catch (e) {}
      if (!document.getElementById('__reg_fakeenv')) {
        const fe = document.createElement('style');
        fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
        document.head.appendChild(fe);
      }
    }, { js: APP_JS, css: APP_CSS });
    await p.waitForTimeout(1000);
    await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
    await p.waitForTimeout(3200);
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1600);
    await p.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
    await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
    await p.waitForTimeout(3200);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(600);

    const before = await p.evaluate(MEASURE);
    // 特写：composer 底排
    const crop = async (name) => {
      const q = await p.evaluate(() => {
        const h = document.querySelector('[class*="composerStack"]');
        if (!h) return null;
        const r = h.getBoundingClientRect();
        return { x: 0, y: Math.max(0, r.bottom - 76), w: window.innerWidth, h: 76 };
      });
      if (q) await p.screenshot({ path: path.join(DIR, name), clip: { x: q.x, y: q.y, width: q.w, height: q.h } });
    };
    await crop('r127_' + tag + '_before.png');

    await p.evaluate((css) => {
      const st = document.createElement('style'); st.id = '__fix127'; st.textContent = css; document.head.appendChild(st);
    }, FIX_CSS);
    await p.waitForTimeout(900);
    const after = await p.evaluate(MEASURE);
    await crop('r127_' + tag + '_after.png');

    console.log('=== ' + tag + ' ===');
    console.log('BEFORE ' + JSON.stringify(before));
    console.log('AFTER  ' + JSON.stringify(after));
    console.log('');
    await c.close();
  }
  await b.close();
})();
