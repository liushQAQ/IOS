// 探针：会话框下方 dock 部件几何/配色 + 主题切换复现
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

async function setup(p) {
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) {}
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(3000);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
}

async function dump(p, label) {
  const r = await p.evaluate(() => {
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const host = document.querySelector('[class*="composerStack"]');
    if (!card) return { noCard: true };
    const cq = card.getBoundingClientRect();
    const out = { cardY: Math.round(cq.y), cardH: Math.round(cq.height), vh: innerHeight, below: [] };
    // 找 card 下方（y > card 底部）的一切可见元素
    const seen = new Set();
    document.querySelectorAll('[class*="composerStack"] *, [data-composer-stats], .cm-stat-entry, .cm-bbox, [class*="dock"]').forEach(e => {
      const q = e.getBoundingClientRect();
      if (q.height < 6 || q.width < 10) return;
      if (q.y < cq.bottom - 4) return;                      // 只看 card 底部以下
      if (q.y > innerHeight) return;
      const cs = getComputedStyle(e);
      const key = Math.round(q.y) + 'x' + Math.round(q.x) + 'x' + Math.round(q.height);
      if (seen.has(key)) return; seen.add(key);
      if (out.below.length > 24) return;
      out.below.push({
        tag: e.tagName, cls: (e.className || '').toString().slice(0, 40),
        txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        y: Math.round(q.y), h: Math.round(q.height), x: Math.round(q.x), w: Math.round(q.width),
        color: cs.color, bg: cs.backgroundColor, disp: cs.display, pos: cs.position,
      });
    });
    out.below.sort((a, b) => a.y - b.y);
    return out;
  });
  console.log('===== ' + label + ' ===== cardY=' + r.cardY + ' cardH=' + r.cardH + ' vh=' + r.vh);
  for (const b of (r.below || [])) console.log(JSON.stringify(b));
  return r;
}

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await setup(p);
  await dump(p, 'dark 初次');
  // 主题反复切换
  await p.emulateMedia({ colorScheme: 'light' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await dump(p, 'dark 切回（第 1 轮后）');
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(1500);
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(1500);
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(1500);
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await dump(p, 'dark 切回（第 2 轮后）');
  await b.close();
})();
