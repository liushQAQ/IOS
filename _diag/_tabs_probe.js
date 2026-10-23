/**
 * _tabs_probe.js —— 进会话页，dump 顶栏 tab 行（对话/轨迹/系统监控）结构，
 * 为「模型按钮停靠到 tab 行右侧」取锚点与几何。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const p = await ctx.newPage();
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
    try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR ' + e); }
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(2000);

  // 打开侧边栏，选第一个会话
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(6000);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(2000);

  const R = await p.evaluate(() => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const tabs = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"]')).filter(b => /^(对话|轨迹|系统监控)$/.test((b.textContent || '').trim()));
    if (!tabs.length) return { found: false, url: location.href, sample: Array.from(document.querySelectorAll('body *')).slice(0, 0).length };
    const t0 = tabs[0];
    // 找 tab 行的共同父容器
    let row = t0.parentElement;
    const dump = (e, d) => {
      if (!e || d > 4) return null;
      const cs = getComputedStyle(e);
      return { cls: (e.className || '').toString().slice(0, 46), box: box(e), disp: cs.display, fw: cs.flexWrap, jc: cs.justifyContent, ai: cs.alignItems, gap: cs.gap, pos: cs.position, h: cs.height, kids: Array.from(e.children).map(c => dump(c, d + 1)).filter(Boolean) };
    };
    return {
      found: true,
      items: tabs.map(t => ({ t: (t.textContent || '').trim(), box: box(t), cls: (t.className || '').toString().slice(0, 40) })),
      row: { cls: (row.className || '').toString().slice(0, 46), box: box(row), disp: getComputedStyle(row).display, gap: getComputedStyle(row).gap, jc: getComputedStyle(row).justifyContent },
      rowParent: { cls: (row.parentElement.className || '').toString().slice(0, 46), box: box(row.parentElement), disp: getComputedStyle(row.parentElement).display },
      tree: dump(row.parentElement, 0),
      // 顶栏（header）几何，用于判断停靠区
      header: (function () { const h = document.querySelector('header'); return h ? { cls: (h.className || '').toString().slice(0, 46), box: box(h) } : null; })(),
      // 会话框 card 与 tools
      card: (function () { const c = document.querySelector('[class*="VERcba_card"]'); return c ? box(c) : null; })(),
      tools: (function () { const c = document.querySelector('[class*="VERcba_tools"]'); return c ? box(c) : null; })(),
      trailing: (function () { const c = document.querySelector('[class*="VERcba_trailing"]'); return c ? box(c) : null; })()
    };
  });
  console.log(JSON.stringify(R, null, 1));
  await p.screenshot({ path: path.join(DIR, '_tabs_probe.png') });
  await browser.close();
})();
