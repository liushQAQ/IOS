// 探针：老总会话（解决插件更新超时失败）——插件条/费用明细/输入行/底栏全几何
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
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__regTick();
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
  // 弹窗清除
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
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const out = {};
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    out.card = card ? card.getBoundingClientRect().toJSON() : null;
    if (card) { out.card.y = Math.round(out.card.y); out.card.h = Math.round(out.card.height); out.card.w = Math.round(out.card.width); }
    // 插件条带：card 顶部 40px 内的所有可见元素
    out.strip = [];
    if (card) {
      const cq = card.getBoundingClientRect();
      document.querySelectorAll('[class*="composerStack"] *').forEach(e => {
        const q = e.getBoundingClientRect();
        if (q.height < 8 || q.width < 8) return;
        if (q.y < cq.top - 2 || q.y > cq.top + 42) return;
        const cs = getComputedStyle(e);
        if (cs.position !== 'absolute' && !e.closest('[class*="_card"]')) return;
        if (e.children.length > 3) return;
        out.strip.push({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), pos: cs.position });
      });
      out.strip.sort((a, b2) => a.x - b2.x);
    }
    // 费用明细下落
    const fee = document.querySelector('.cm-stat-entry');
    out.fee = fee ? (() => { const q = fee.getBoundingClientRect(); const cs = getComputedStyle(fee); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), disp: cs.display, pos: cs.position, vis: cs.visibility, inDock: !!fee.closest('[class*="dock"]'), parent: fee.parentElement.className.toString().slice(0, 30) }; })() : null;
    // 输入行按钮几何
    out.inputRow = [];
    document.querySelectorAll('[class*="composerStack"] button, [class*="composerStack"] [role="button"]').forEach(e => {
      const q = e.getBoundingClientRect();
      if (q.width < 14 || q.height < 8) return;
      const cs = getComputedStyle(e);
      if (cs.display === 'none') return;
      if (!card || q.y < card.getBoundingClientRect().top + 50) return;
      out.inputRow.push({ label: (e.getAttribute('aria-label') || (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16)).slice(0, 24), cls: (e.className || '').toString().slice(0, 30), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) });
    });
    out.inputRow.sort((a, b2) => a.x - b2.x);
    // dock 行
    const dock = document.querySelector('[class*="composerStack"] [class*="dock"]:not([class*="sm-"])');
    if (dock) {
      const q = dock.getBoundingClientRect();
      const cs = getComputedStyle(dock);
      out.dock = { y: Math.round(q.y), h: Math.round(q.height), fs: cs.fontSize, pad: cs.padding, gap: cs.gap };
      out.dockRows = [];
      Array.from(dock.children).forEach(ch => {
        const q2 = ch.getBoundingClientRect();
        if (q2.height < 4) return;
        out.dockRows.push({ cls: (ch.className || '').toString().slice(0, 34), txt: (ch.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 36), y: Math.round(q2.y), x: Math.round(q2.x), w: Math.round(q2.width), h: Math.round(q2.height) });
      });
      out.dockRows.sort((a, b2) => a.y - b2.y);
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  try { await p.screenshot({ path: DIR + '/boss_session.png', timeout: 10000 }); } catch (e) {}
  await b.close();
})();
