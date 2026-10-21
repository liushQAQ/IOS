// 对比截图 v3：字体请求秒回，杜绝 fonts.ready 挂死
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const ALL = fs.readFileSync(DIR + '/app_inject.js', 'utf8').split('\n;\n');

async function shot(tag, js) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  // 字体请求一律秒回空体 → 无 pending load → fonts.ready 立即解析
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
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
  }, { js });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  let seen = false;
  for (let i = 0; i < 15; i++) {
    await p.waitForTimeout(3000);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) { seen = true; break; }
  }
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.evaluate(() => { const x = document.querySelector('[aria-label="收起侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1200);
  // 点掉计费兼容提醒弹窗（真实鼠标点击，轮询到消失）
  for (let i = 0; i < 10; i++) {
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], a, div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) break;
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1200);
  }
  let okC = false, okF = false;
  for (let i = 0; i < 8 && !okC; i++) {
    try {
      await p.screenshot({ path: DIR + '/cmp_' + tag + '_composer.png', clip: { x: 0, y: 932 - 300, width: 430, height: 300 }, timeout: 8000 });
      okC = true; console.log(tag, 'composer OK (try', i + 1 + '), 插件部件:', seen);
    } catch (e) { await p.waitForTimeout(1500); }
  }
  for (let i = 0; i < 8 && !okF; i++) {
    try {
      await p.screenshot({ path: DIR + '/cmp_' + tag + '_full.png', timeout: 8000 });
      okF = true; console.log(tag, 'full OK (try', i + 1 + ')');
    } catch (e) { await p.waitForTimeout(1500); }
  }
  await b.close();
}

(async () => {
  await shot('before_76_77', ALL.slice(0, 18).join('\n;\n'));
  await shot('after_78', ALL.join('\n;\n'));
})();
