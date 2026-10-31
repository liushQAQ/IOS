// R51b: 1) 谁在写 rightbarCol 的 inline transform（monkey-patch 抓栈）
//       2) 毒写内层 panel → 开抽屉是否永久左移（正则修正版）
const path = require('path');
const { webkit } = require('playwright');
const W = 430, H = 932;
const INJECT = path.join(__dirname, 'app_inject.js');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => {
    window.__dshNativeStatusBar = 59; window.__dshTopShift = 18;
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click();
  });
  await p.addScriptTag({ path: INJECT });
  await p.waitForTimeout(1200);

  console.log('=== 1) 抓谁在写 rightbarCol inline transform ===');
  await p.evaluate(() => {
    window.__writers = [];
    const orig = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (k, v, pri) {
      try {
        if (k === 'transform' && this._el && this._el.className && typeof this._el.className === 'string' && this._el.className.indexOf('rightbarCol') >= 0) {
          window.__writers.push({ v, stack: (new Error().stack || '').split('\n').slice(2, 6).join(' | ').slice(0, 400) });
        }
      } catch (e) {}
      return orig.call(this, k, v, pri);
    };
    // 给每个元素的 style 挂回 el 引用
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'style');
    Object.defineProperty(Element.prototype, 'style', { get: function () { const s = desc.get.call(this); try { s._el = this; } catch (e) {} return s; }, configurable: true });
  });
  await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
  await p.waitForTimeout(2000);
  console.log(JSON.stringify(await p.evaluate(() => window.__writers), null, 1));
  // 关回去再开一次（抓关态写入者）
  await p.evaluate(() => { const c = document.querySelector('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]'); if (c) c.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
  await p.waitForTimeout(2000);
  console.log('writers(两轮):', JSON.stringify(await p.evaluate(() => window.__writers ? window.__writers.length : 0)));
  console.log(JSON.stringify(await p.evaluate(() => (window.__writers || []).slice(-6)), null, 1));

  console.log('=== 2) 毒写内层 panel（页面本体）→ 是否永久左移 ===');
  await p.evaluate(() => { const c = document.querySelector('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]'); if (c) c.click(); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const panel = document.querySelector('[data-sidebar-right-open], .dMHGga_panel');
    if (panel) panel.style.setProperty('transform', 'translateX(-103px)', 'important');
  });
  await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
  await p.waitForTimeout(2600);
  const st = await p.evaluate(() => {
    const panel = document.querySelector('[data-sidebar-right-open], .dMHGga_panel');
    const r = panel.getBoundingClientRect();
    return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), tf: panel.style.transform || '(none)' };
  });
  console.log('开抽屉2.6s后 panel:', JSON.stringify(st), st.left < -2 ? ' ← 🔴 复现：页面太靠左出屏' : ' ← 正常');
  await p.screenshot({ path: path.join(__dirname, '_r51_panel_poison.png') });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
