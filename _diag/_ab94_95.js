/**
 * _ab94_95.js —— A/B 决定性复核
 * 同一个沙箱、同一套页面操作、同一台浏览器，分别注入 94 真身 bundle 与 95 真身 bundle。
 * 用途：判定「95 复核 0/4」到底是 95 破坏了 94 的顶栏修复，还是沙箱页面状态假阳性。
 *   若 94 也是 0/4  → 沙箱假阳性，95 无罪
 *   若 94 是 4/4、95 是 0/4 → 95 真的破坏了，必须回滚
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const B94 = fs.readFileSync(path.join(__dirname, 'app_inject_94.js'), 'utf8');
const B95 = fs.readFileSync(path.join(__dirname, 'app_inject.js'), 'utf8');

const PROBE = `(() => {
  const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const ov = (a, b) => {
    const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return x > 1 && y > 1 ? [Math.round(x), Math.round(y)] : null;
  };
  const row = document.querySelector('[data-phase] header [class*="titleRow"]');
  const nav = document.querySelector('[class*="titleCluster"] > nav');
  const utils = row ? row.querySelector('[class*="headerUtilities"]') : null;
  const tabs = document.querySelector('[data-conversation-tabs]');
  const out = {
    vw: window.innerWidth,
    headRight: getComputedStyle(document.documentElement).getPropertyValue('--dsh-head-right').trim() || '(未写)',
    row: row ? R(row) : null,
    nav: nav ? R(nav) : null,
    utils: utils ? R(utils) : null
  };
  const leaks = [];
  if (out.nav && out.utils) { const o = ov(out.nav, out.utils); if (o) leaks.push('标题×右侧 重叠 ' + o.join('x')); }
  if (tabs) {
    const kids = [...tabs.children].filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const o = ov(R(kids[i]), R(kids[j]));
        if (o) leaks.push('tab 行重叠 ' + o.join('x'));
      }
    }
    out.wrapped = [...tabs.querySelectorAll('button[role="tab"]')].filter((b) => b.getBoundingClientRect().height > 50).length;
  } else { out.wrapped = 0; }
  out.leaks = leaks;
  return out;
})()`;

async function run(browser, tag, SHIM, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.addInitScript({ content: 'window.__dshNativeStatusBar = 47; window.__dshTopShift = 18;' });
  await p.addInitScript({ content: SHIM });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { document.documentElement.style.setProperty('--dsh-sb-native', '47px'); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; }); if (b) b.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim())); if (t) t.click(); });
  await p.waitForTimeout(9000);

  const injected = await p.evaluate(() => {
    const slot = document.querySelector('[class*="headerUtilities"]')
      || document.querySelector('[data-slot="conversation.session.header.utilities"]');
    if (!slot) return 'no-slot';
    const sp = document.createElement('span');
    sp.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:0 8px;height:24px;border-radius:12px;background:rgba(127,133,143,.18);font-size:12px;white-space:nowrap;flex:0 0 auto;';
    sp.innerHTML = '<i style="width:10px;height:10px;border:2px solid rgba(255,255,255,.35);border-top-color:#4a9eff;border-radius:50%;display:inline-block"></i>任务运行中';
    slot.appendChild(sp);
    return new Promise((r) => requestAnimationFrame(() => setTimeout(() => {
      const w = Math.round(sp.getBoundingClientRect().width);
      r(w > 0 ? w + 'px' : '0px(未渲染)');
    }, 300)));
  });
  await p.waitForTimeout(4200);

  const m = await p.evaluate(PROBE);
  const ok = m.leaks.length === 0 && m.wrapped === 0;
  console.log('[' + tag + '] ' + W + '  徽标=' + injected
    + '  headRight=' + m.headRight
    + '  row=' + (m.row ? m.row.x + ',' + m.row.y + ' w' + m.row.w : 'null')
    + '  nav=' + (m.nav ? m.nav.x + ',' + m.nav.y + ' w' + m.nav.w : 'null')
    + '  utils=' + (m.utils ? m.utils.x + ',' + m.utils.y + ' w' + m.utils.w : 'null')
    + '  重叠 ' + m.leaks.length + ' 竖排 ' + m.wrapped
    + '  → ' + (ok ? '✅' : '❌ ' + m.leaks.join('；')));
  await ctx.close();
  return ok;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const res = { 94: 0, 95: 0 };
  for (const [W, H] of [[430, 932], [393, 852], [375, 667], [320, 568]]) {
    console.log('--- 视口 ' + W + ' ---');
    for (const [tag, SHIM] of [['94', B94], ['95', B95]]) {
      try { if (await run(browser, tag, SHIM, W, H)) res[tag]++; } catch (e) { console.log('[' + tag + '] ' + W + ' 异常：' + e.message); }
    }
  }
  console.log('\n=== A/B 汇总：94 = ' + res['94'] + '/4  ，95 = ' + res['95'] + '/4 ===');
  console.log(res['94'] === res['95']
    ? '判定：两者表现一致 → 95 未破坏 94 的顶栏修复，此前 0/4 为沙箱页面状态假阳性'
    : '判定：两者表现不一致 → 95 真的动了顶栏，必须查');
  await browser.close();
})();
