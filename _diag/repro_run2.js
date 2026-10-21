// 二次运行：抓 sm 插件完整 CSS 与 dock 全子树（含 value span 配色）
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
    const t = rows.find(e => /Our Free Model|简单数学运算/.test(e.textContent || '')) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  // 等 composer 出现（最多 60s），没出现就重进
  for (let retry = 0; retry < 3; retry++) {
    for (let i = 0; i < 10; i++) {
      await p.waitForTimeout(3000);
      if (await p.evaluate(() => !!document.querySelector('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]'))) break;
    }
    if (await p.evaluate(() => !!document.querySelector('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]'))) break;
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rows.find(e => /Our Free Model|简单数学运算/.test(e.textContent || '')) || rows[1] || rows[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
  }
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(1500);
  for (let i = 0; i < 5; i++) {
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
  await p.evaluate(() => { const x = document.querySelector('[aria-label="收起侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1200);
  // 二次弹窗清除（弹窗在插件挂载后才弹出，拦截输入框点击）
  for (let i = 0; i < 8; i++) {
    const dlg = await p.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!dlg) break;
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) { await p.waitForTimeout(1500); continue; }
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1200);
  }
  await p.click('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]');
  await p.type('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]', '再答一个数字别运行命令：2+2=?', { delay: 20 });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[class*="composerStack"] button, [class*="composerStack"] [role="button"]'));
    const send = btns.find(b => /发送|send/i.test(b.getAttribute('aria-label') || ''));
    if (send) send.click();
  });
  console.log('已发送');
  let captured = false;
  for (let i = 0; i < 50 && !captured; i++) {
    await p.waitForTimeout(2500);
    await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
    captured = await p.evaluate(() => !!document.querySelector('.sm-dock-value, .sm-dock-item'));
    if (captured) {
      const r = await p.evaluate(() => {
        const dump = [];
        const dock = document.querySelector('[class*="composerStack"] [class*="dock"]');
        const walk = (el, depth) => {
          for (const k of el.children) {
            const q = k.getBoundingClientRect();
            const cs = getComputedStyle(k);
            if (cs.display === 'none') continue;
            dump.push({ d: depth, tag: k.tagName, cls: (k.className || '').toString().slice(0, 48), txt: (k.children.length ? '' : (k.textContent || '').slice(0, 26)), y: Math.round(q.y), h: Math.round(q.height), color: cs.color, bg: cs.backgroundColor });
            if (depth < 7) walk(k, depth + 1);
          }
        };
        if (dock) walk(dock, 0);
        const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').filter(t => t.includes('--sm-'));
        // dock 容器与父链几何
        const chain = [];
        let e = dock;
        for (let i = 0; i < 5 && e; i++) { const q = e.getBoundingClientRect(); const cs = getComputedStyle(e); chain.push({ cls: (e.className || '').toString().slice(0, 40), y: Math.round(q.y), h: Math.round(q.height), disp: cs.display, ov: cs.overflow, maxH: cs.maxHeight }); e = e.parentElement; }
        return { dump, styles, chain, dark: !!document.body.getAttribute('data-ds-dark-theme'), dockRect: dock ? dock.getBoundingClientRect().toJSON() : null };
      });
      console.log('dark attr:', r.dark);
      console.log('CHAIN:', JSON.stringify(r.chain));
      console.log('DOCK:', JSON.stringify(r.dockRect));
      console.log('== 子树 ==');
      for (const d of r.dump) console.log(JSON.stringify(d));
      console.log('== 插件 CSS ==');
      for (const s of r.styles) console.log(s.slice(0, 3000));
      // 等 run 结束后主题切换
      await p.waitForTimeout(20000);
      for (let round = 1; round <= 2; round++) {
        await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(1800);
        await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(1800);
      }
      const after = await p.evaluate(() => {
        const v = document.querySelector('.sm-dock-value, .sm-dock-item');
        if (!v) return { gone: true };
        const cs = getComputedStyle(v);
        return { color: cs.color, cls: v.className.toString() };
      });
      console.log('切换后:', JSON.stringify(after));
      try { await p.screenshot({ path: DIR + '/repro2_after_toggle.png', timeout: 8000 }); } catch (e) {}
    }
  }
  await b.close();
})();
