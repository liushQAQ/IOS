// 探针：模型选择器 trigger 的 flex 祖先链 + 各层几何（为「填满空洞」定 CSS）
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
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
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('解决插件更新超时') >= 0) || rows[1];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(2500);
  for (let i = 0; i < 5; i++) {
    const dlg = await p.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!dlg) break;
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) break;
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const out = { chain: [], row: null };
    const tg = document.querySelector('[class*="composerStack"] [class*="standardControls"] [class*="_trigger"]');
    if (!tg) { out.err = 'no trigger'; return out; }
    let el = tg;
    for (let d = 0; d < 10 && el && d < 10; d++) {
      const cs = getComputedStyle(el);
      const rc = el.getBoundingClientRect();
      out.chain.push({
        d, tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
        display: cs.display, pos: cs.position, flex: cs.flex, justifyContent: cs.justifyContent,
        x: Math.round(rc.x), w: Math.round(rc.width)
      });
      el = el.parentElement;
    }
    // 发送钮与 trigger 同行的几何
    const prim = document.querySelector('[class*="composerStack"] [class*="_primary"], [class*="composerStack"] button[class*="primary"]');
    if (prim) { const rc = prim.getBoundingClientRect(); out.row = { primary: { x: Math.round(rc.x), w: Math.round(rc.width) } }; }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
