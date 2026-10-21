// 深挖：dock 完整子树配色/类名
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
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
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
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
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    // dock 区域全部叶子元素
    const dock = document.querySelector('[class*="VERcba_dock"], [class*="composerStack"] [class*="dock"]');
    if (!dock) return { noDock: true };
    const cs0 = getComputedStyle(dock);
    const out = { dockCls: dock.className.toString(), dockRect: dock.getBoundingClientRect().toJSON(), dockStyle: { disp: cs0.display, wrap: cs0.flexWrap, gap: cs0.gap, dir: cs0.flexDirection, maxH: cs0.maxHeight, ov: cs0.overflow }, kids: [] };
    const walk = (el, depth) => {
      if (depth > 6 || out.kids.length > 60) return;
      for (const k of el.children) {
        const q = k.getBoundingClientRect();
        const cs = getComputedStyle(k);
        if (cs.display === 'none') continue;
        out.kids.push({
          d: depth, tag: k.tagName, cls: (k.className || '').toString().slice(0, 44),
          txt: (k.children.length === 0 ? (k.textContent || '').slice(0, 30) : ''),
          y: Math.round(q.y), x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height),
          color: cs.color, bg: cs.backgroundColor,
        });
        walk(k, depth + 1);
      }
    };
    walk(dock, 0);
    // 插件注入的 style 标签内容（sm-root 的浅色变量）
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').filter(t => t.includes('--sm-') || t.includes('sm-dock') || t.includes('cm-corner'));
    out.pluginCss = styles.map(t => t.slice(0, 900));
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
