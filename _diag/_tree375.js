/**
 * _tree375.js —— dump 会话框底部结构树（card 往下 4 层），确定 tools / trailing 的父容器
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const VW = parseInt(process.argv[2] || '375', 10);

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VW === 375 ? 812 : 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
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
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(2000);

  const R = await p.evaluate(() => {
    const tr = document.querySelector('[class*="composerStack"] [class*="VERcba_trailing"]');
    const tools = document.querySelector('[class*="composerStack"] [class*="VERcba_tools"]');
    const dump = (e, d) => {
      if (!e || d > 5) return null;
      const q = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return {
        cls: (e.className || '').toString().slice(0, 50),
        box: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)],
        disp: cs.display, fw: cs.flexWrap, fb: cs.flexBasis, jc: cs.justifyContent, gap: cs.gap,
        kids: Array.from(e.children).map(c => dump(c, d + 1)).filter(Boolean)
      };
    };
    // 从 common ancestor 起
    let a = tr, chain = [];
    while (a && chain.length < 8) { chain.push(a); a = a.parentElement; }
    const common = chain.find(x => x.contains(tools));
    return { vw: window.innerWidth, commonCls: common ? (common.className || '').toString().slice(0, 50) : null, tree: dump(common, 0) };
  });
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})();
