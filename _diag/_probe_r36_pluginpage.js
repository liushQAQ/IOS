/**
 * _probe_r36_pluginpage.js — R36 实证探针：插件页左上角 fab 被整排隐藏后，
 * 该页面还剩哪些固定按钮 / 返回通道？pageHead 里有没有「返回」类 affordance？
 * 结论只看实测 DOM，不猜。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const ctx = await b.newContext({ userAgent: UA, viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
    try { (0, eval)(js); } catch (e) { }
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);

  // 走闸门场景 C 同款路径进插件页
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);

  const out = await p.evaluate(() => {
    const vis = el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
    const dump = el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { tag: el.tagName, aria: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex };
    };
    const fixedBtns = Array.from(document.querySelectorAll('button')).filter(b => getComputedStyle(b).position === 'fixed').map(dump);
    const topleftVisible = Array.from(document.querySelectorAll('button')).filter(b => { const r = b.getBoundingClientRect(); return vis(b) && r.x < 100 && r.y < 220 && r.width > 10; }).map(dump);
    const ph = document.querySelector('[class*="pageHead"]');
    const phBtns = ph ? Array.from(ph.querySelectorAll('button, a, [role="button"]')).map(dump) : null;
    const phHTML = ph ? ph.innerText.slice(0, 120) : null;
    const fabs = {};
    for (const sel of ['[data-mobile-nav="fab"]', '[data-mobile-nav="toggle"]', 'header button[aria-label="打开目录"]', '[aria-label="打开侧边栏"]']) {
      const el = document.querySelector(sel);
      if (el) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); fabs[sel] = { w: Math.round(r.width), h: Math.round(r.height), opacity: cs.opacity, display: cs.display }; }
      else fabs[sel] = null;
    }
    // goBack() 视角：顶区（y<=220）可见的「返回/后退」候选
    const backCands = Array.from(document.querySelectorAll('button, [role="button"]')).filter(el => {
      if (!vis(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.top > 220 || r.left < 0) return false;
      const lb = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '');
      return lb.indexOf('返回') >= 0 || lb.indexOf('后退') >= 0;
    }).map(dump);
    return { fixedBtns, topleftVisible, phBtns, phHTML, fabs, backCands, url: location.href.slice(0, 80) };
  });
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: path.join(DIR, '_probe_r36_pluginpage.png') });
  await b.close();
})();
