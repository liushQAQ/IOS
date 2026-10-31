// R51 毒写对拍：bleed guard 动画期命中 → translateX 滞留 → 开抽屉页面永久左移
const path = require('path');
const { webkit } = require('playwright');
const W = 430, H = 932;
const INJECT = path.join(__dirname, 'app_inject.js');
const FIX = process.argv[2] === 'fix'; // fix=注入修复补丁版（验证自愈）

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
  if (FIX) {
    // 修复版：把新守卫单独提前挂上（与将要写进 Swift 的逻辑同构），验证自愈行为
    await p.evaluate(() => {
      window.__r51Heal = setInterval(() => {
        document.querySelectorAll('[class*="rightbarCol"]').forEach(col => {
          const tf = col.style.getPropertyValue('transform');
          if (!tf) return;
          const open = !!col.querySelector('[data-sidebar-right-open="true"]') || col.getAttribute('data-sidebar-right-open') === 'true';
          const m = tf.match(/^translateX\\(-?([0-9.]+)px\\)$/i);
          if (open && m) { col.style.removeProperty('transform'); return; }
          if (!open && m && parseFloat(m[1]) > 0 && tf.indexOf('-') === tf.indexOf('translateX') + 11) {
            // 关态负位移=中毒（正常关态由 CSS 105% 控制），清掉交回 CSS
            col.style.removeProperty('transform');
          }
        });
      }, 250);
    });
  }
  await p.waitForTimeout(1500);

  const state = () => p.evaluate(() => {
    const col = document.querySelector('[class*="rightbarCol"]');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), tf: col.style.transform || '(css)' };
  });

  console.log('=== 机制证明：bleed 六条安全线逐条对拍（动画中途 t=120ms） ===');
  await p.evaluate(() => {
    const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]');
    window.__r51snap = null;
    if (b) b.click();
    const col = document.querySelector('[class*="rightbarCol"]');
    setTimeout(() => {
      const r = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      const vw = innerWidth;
      const ov = r.right - vw;
      const mtx = cs.transform.match(/^matrix\\(([^)]*)\\)$/);
      let pure = false, tx = 0;
      if (mtx) { const pp = mtx[1].split(','); if (pp.length >= 6) {
        pure = Math.abs(parseFloat(pp[0]) - 1) < 0.01 && Math.abs(parseFloat(pp[3]) - 1) < 0.01 && Math.abs(parseFloat(pp[1])) < 0.01 && Math.abs(parseFloat(pp[2])) < 0.01;
        tx = parseFloat(pp[4]) || 0; } }
      // 六条线
      const lines = {
        'w>=8,h>=8': r.width >= 8 && r.height >= 8,
        'ov>0.5(右溢)': ov > 0.5,
        '①left>=0': r.left >= 0,
        '②left<vw-1': r.left < vw - 1,
        '③width<=vw': r.width <= vw,
        '⑤纯位移矩阵': pure,
        '⑥ov<=120': ov <= 120,
      };
      let scrollable = false; let par = col.parentElement, d = 0;
      while (par && par !== document.body && d < 12) { const pcs = getComputedStyle(par); if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { scrollable = true; break; } par = par.parentElement; d++; }
      lines['④祖先不可横滑'] = !scrollable;
      const allPass = Object.values(lines).every(Boolean);
      window.__r51snap = { t: '120ms', rect: [r.left, r.right, r.width].map(v => +v.toFixed(1)), ov: +ov.toFixed(1), wouldWrite: allPass ? ('translateX(' + (tx - ov).toFixed(1) + 'px) !important ← 命中！') : '不命中', lines };
    }, 120);
  });
  await p.waitForFunction(() => window.__r51snap, null, { timeout: 5000 }).catch(() => {});
  console.log(JSON.stringify(await p.evaluate(() => window.__r51snap), null, 1));

  // 等动画结束，清掉中途态，回到关态基线
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const c = document.querySelector('[class*="rightbarCol"]'); const cb = document.querySelector('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]'); if (cb) cb.click(); });
  await p.waitForTimeout(1500);

  console.log('=== 毒写对拍：模拟 bleed 累计滞留 translateX(-103px) 后开抽屉 ===');
  console.log('关态注入前:', JSON.stringify(await state()));
  await p.evaluate(() => {
    const col = document.querySelector('[class*="rightbarCol"]');
    col.style.setProperty('transform', 'translateX(-103px)', 'important');
  });
  console.log('关态注毒后:', JSON.stringify(await state()));
  await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
  await p.waitForTimeout(2600);
  const after = await state();
  console.log('开后2.6s:', JSON.stringify(after), after && after.left < -2 ? ' ← 🔴 复现：页面太靠左出屏' : ' ← 正常');
  await p.screenshot({ path: path.join(__dirname, `_r51_poison_${FIX ? 'fixed' : 'broken'}.png`) });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
