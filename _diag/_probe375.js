/**
 * _probe375.js —— 375 窄屏底排按钮横向重叠归因
 * 闸门红：完全权限 × Lobster1,504 36x28 | Lobster1,504 × 优化 15x22
 * dump：按钮 rect、父链（trailing / standardControls / row）宽度与 flex 属性、narrow 标记是否生效。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
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
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(2000);

  const R = await p.evaluate(() => {
    const sc = document.querySelector('[class*="composerStack"] [class*="VERcba_standardControls"]');
    const tr = document.querySelector('[class*="composerStack"] [class*="VERcba_trailing"]');
    const tools = document.querySelector('[class*="composerStack"] [class*="VERcba_tools"]');
    const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const flex = (e) => { if (!e) return null; const cs = getComputedStyle(e); return { disp: cs.display, fb: cs.flexBasis, fw: cs.flexWrap, jc: cs.justifyContent, gap: cs.gap, ov: cs.overflow, minW: cs.minWidth, w: cs.width }; };
    // 底排按钮候选（与闸门同族：按钮/含按钮的胶囊）
    const cands = Array.from(document.querySelectorAll('[class*="composerStack"] button, [class*="composerStack"] [role="button"]'));
    const items = cands.map(b => {
      const q = b.getBoundingClientRect();
      return {
        t: (b.textContent || '').trim().slice(0, 16) || b.getAttribute('aria-label') || '?',
        cls: (b.className || '').toString().slice(0, 40),
        box: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)],
        row: tr && tr.contains(b) ? 'trailing' : (sc && sc.contains(b) ? 'sc' : 'other'),
        inline: b.getAttribute('style') || ''
      };
    }).filter(x => x.box[2] > 2 && x.box[3] > 2);
    // 两两重叠
    const over = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].box, c = items[j].box;
      const ox = Math.min(a[0] + a[2], c[0] + c[2]) - Math.max(a[0], c[0]);
      const oy = Math.min(a[1] + a[3], c[1] + c[3]) - Math.max(a[1], c[1]);
      if (ox > 1 && oy > 1) over.push(items[i].t + ' × ' + items[j].t + ' ' + ox + 'x' + oy);
    }
    return {
      vw: window.innerWidth,
      sc: { box: box(sc), flex: flex(sc) },
      tr: { box: box(tr), flex: flex(tr), narrow: tr ? tr.getAttribute('data-dsh-narrow') : null, inline: tr ? (tr.getAttribute('style') || '') : '' },
      tools: { box: box(tools), flex: flex(tools) },
      row: box(sc ? sc.parentElement : null),
      items, over
    };
  });
  console.log(JSON.stringify(R, null, 2));
  await p.screenshot({ path: path.join(DIR, '_probe375.png') });
  await browser.close();
})();
