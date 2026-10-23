/**
 * _mt96_verify.js —— 直接复现老总的三个动作，高频采样顶栏 centerCol 的实测 top。
 * 判定标准：
 *   稳态位置 == want(27)   → 位置对
 *   上滑/切会话过程中 top 波动 <= 2px → 不跳（94 波动几十 px）
 *   结束后 top 仍 == 27    → 不被锁死（95 锁死在 -12）
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const B94 = fs.readFileSync(path.join(__dirname, 'app_inject_94.js'), 'utf8');
const B96 = fs.readFileSync(path.join(__dirname, 'app_inject.js'), 'utf8');

const TOP = `(() => {
  const c = document.querySelector('[class*="centerCol"]');
  if (!c) return null;
  return Math.round(c.getBoundingClientRect().top * 10) / 10;
})()`;

async function sample(p, n, gap) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = await p.evaluate(TOP);
    if (t !== null) arr.push(t);
    await p.waitForTimeout(gap);
  }
  return arr;
}

async function run(browser, tag, SHIM) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.addInitScript({ content: 'window.__dshNativeStatusBar = 47; window.__dshTopShift = 18;' });
  await p.addInitScript({ content: SHIM });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { document.documentElement.style.setProperty('--dsh-sb-native', '47px'); });
  await p.waitForTimeout(2500);

  // 进会话
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; }); if (b) b.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim())); if (t) t.click(); });
  await p.waitForTimeout(9000);

  const rest = await p.evaluate(TOP);

  // 动作一：上滑（老总报的第一个动作）
  // mobile WebKit 不支持 mouse.wheel → 直接操作真实滚动容器 + 派发 scroll 事件
  const scroll = [];
  for (let i = 0; i < 14; i++) {
    await p.evaluate(() => {
      let sc = null;
      const all = document.querySelectorAll('div,main,section');
      for (const e of all) {
        const st = getComputedStyle(e).overflowY;
        if ((st === 'auto' || st === 'scroll') && e.scrollHeight > e.clientHeight + 40) { sc = e; break; }
      }
      if (sc) { sc.scrollTop += 260; sc.dispatchEvent(new Event('scroll', { bubbles: true })); }
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop += 260;
      }
      window.dispatchEvent(new Event('scroll'));
    });
    await p.waitForTimeout(120);
    const t = await p.evaluate(TOP);
    if (t !== null) scroll.push(t);
  }
  await p.evaluate(() => {
    let sc = null;
    const all = document.querySelectorAll('div,main,section');
    for (const e of all) {
      const st = getComputedStyle(e).overflowY;
      if ((st === 'auto' || st === 'scroll') && e.scrollHeight > e.clientHeight + 40) { sc = e; break; }
    }
    if (sc) sc.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    window.dispatchEvent(new Event('scroll'));
  });
  await p.waitForTimeout(2500);

  // 动作二：切会话（老总报的第二个动作，含读旧会话的几秒中间态）
  const swap = [];
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a[1] || a[0]; if (t) t.click(); });
  for (let i = 0; i < 14; i++) {
    const t = await p.evaluate(TOP);
    if (t !== null) swap.push(t);
    await p.waitForTimeout(300);
  }
  const after = await p.evaluate(TOP);

  const rng = (a) => (a.length ? (Math.max(...a) - Math.min(...a)) : -1);
  console.log('[' + tag + ']  静止=' + rest
    + '   上滑 14 帧 波动=' + rng(scroll).toFixed(1) + 'px  值=[' + scroll.join(',') + ']'
    + '   切会话 14 帧 波动=' + rng(swap).toFixed(1) + 'px  值=[' + swap.join(',') + ']'
    + '   结束后=' + after);
  await ctx.close();
  return { rest, scrollRng: rng(scroll), swapRng: rng(swap), after };
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const r94 = await run(browser, '94', B94);
  const r96 = await run(browser, '96', B96);
  console.log('');
  console.log('=== 对照 ===');
  console.log('94：静止 ' + r94.rest + ' → 上滑波动 ' + r94.scrollRng.toFixed(1) + 'px → 切会话波动 ' + r94.swapRng.toFixed(1) + 'px → 结束 ' + r94.after);
  console.log('96：静止 ' + r96.rest + ' → 上滑波动 ' + r96.scrollRng.toFixed(1) + 'px → 切会话波动 ' + r96.swapRng.toFixed(1) + 'px → 结束 ' + r96.after);
  await browser.close();
})();
