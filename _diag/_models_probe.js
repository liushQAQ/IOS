/**
 * _models_probe.js —— 找清「模型选择器」全家桶在 91 版下的真实位置与数量
 * 目标：dcc-root(Loom y 9,230) / ofTiQG(gemini-3.8-flash) / 官方模型选择器，
 *       各自在哪个容器、可见性、宽高、被谁挤掉。
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

  const R = await p.evaluate(() => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const info = (e, tag) => {
      const cs = getComputedStyle(e), q = e.getBoundingClientRect();
      let host = 'none';
      const tr = e.closest('[class*="VERcba_trailing"]'); if (tr) host = 'trailing';
      const tls = e.closest('[class*="VERcba_tools"]'); if (tls) host = 'tools';
      const sc = e.closest('[class*="VERcba_standardControls"]'); if (sc) host = 'standardControls';
      return {
        tag, cls: (e.className || '').toString().slice(0, 50),
        text: (e.textContent || '').trim().slice(0, 24),
        aria: e.getAttribute('aria-label') || '',
        box: box(e), host,
        disp: cs.display, vis: cs.visibility, op: cs.opacity, ovf: cs.overflow,
        pos: cs.position, z: cs.zIndex,
        parentCls: (e.parentElement ? (e.parentElement.className || '').toString().slice(0, 40) : '')
      };
    };
    const out = { vw: window.innerWidth, dcc: [], ofTiQG: [], models: [], tabs: null, dock: null };
    document.querySelectorAll('.dcc-root, .dcc-btn').forEach(e => out.dcc.push(info(e, 'dcc')));
    document.querySelectorAll('[class*="ofTiQG_root"], [class*="ofTiQG_trigger"]').forEach(e => out.ofTiQG.push(info(e, 'ofTiQG')));
    // 任何含「模型」语义的元素
    document.querySelectorAll('[aria-label*="模型"], [title*="模型"], [data-testid*="model"]').forEach(e => out.models.push(info(e, 'model')));
    // 顶栏 tab 行
    const tabs = Array.from(document.querySelectorAll('button, [role="tab"]')).filter(b => /^(对话|轨迹|系统监控)$/.test((b.textContent || '').trim()));
    if (tabs.length) {
      const t0 = tabs[0], row = t0.parentElement;
      out.tabs = { items: tabs.map(t => ({ t: (t.textContent || '').trim(), box: box(t) })), rowCls: (row.className || '').toString().slice(0, 50), rowBox: box(row), rowDisp: getComputedStyle(row).display, rowW: getComputedStyle(row).width, parentBox: box(row.parentElement), parentCls: (row.parentElement.className || '').toString().slice(0, 40) };
    }
    // 费用明细 dock
    const dk = document.querySelector('[class*="VERcba_dock"]');
    if (dk) out.dock = { box: box(dk), cls: (dk.className || '').toString().slice(0, 40), disp: getComputedStyle(dk).display };
    // 会话框整体
    const card = document.querySelector('[class*="VERcba_card"]');
    if (card) out.card = { box: box(card), cls: (card.className || '').toString().slice(0, 40) };
    return out;
  });
  console.log(JSON.stringify(R, null, 1));
  await p.screenshot({ path: path.join(DIR, '_models_probe.png') });
  await browser.close();
})();
