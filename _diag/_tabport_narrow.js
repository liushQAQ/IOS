/**
 * _tabport_narrow.js —— 窄屏（iOS 尺寸）下 tab 栏胶囊余量实测
 *
 * 老总 12:28：「提示词插件点击优化后会弹出更长的菜单，会遮挡后面的插件」
 *   → 已把顺序改成 积分在左 / 优化在右（order:1 / order:2）。
 *   本脚本量：优化胶囊右侧还剩多少空间，够不够它展开到 ~238px。
 *
 * 做法：先用桌面宽度进会话，再 setViewportSize 切到手机宽度（避开沙箱窄屏侧边栏折叠）。
 */
const { webkit } = require('playwright');

const SIZES = [[430, 900], [393, 852], [375, 812]];

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach(r => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  const picked = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="sessionRow"]')];
    const t = all.find(r => { const x = (r.innerText || '').trim(); return x && !/新会话/.test(x); }) || all[0];
    if (!t) return null; t.click(); return (t.innerText || '').trim().slice(0, 24);
  });
  await p.waitForTimeout(9000);
  console.log('会话: ' + picked);

  for (const [W, H] of SIZES) {
    await p.setViewportSize({ width: W, height: H });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const R2 = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const tabs = document.querySelector('[data-conversation-tabs]');
      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[data-dsh-po-shell]');
      const out = {
        vw: window.innerWidth,
        tabBar: R2(tabs),
        dcc: R2(dcc),
        po: R2(po),
        docSW: document.documentElement.scrollWidth,
      };
      out.roomRight = po && tabs ? Math.round(tabs.getBoundingClientRect().right - po.getBoundingClientRect().right) : null;
      out.poNow = po ? Math.round(po.getBoundingClientRect().width) : null;
      // 展开态需要多少额外宽度：优化胶囊 85 → 238（实测展开宽 238）
      out.extraFor238 = out.poNow === null ? null : Math.max(0, 238 - out.poNow);
      out.fit238 = out.roomRight === null ? null : out.roomRight >= out.extraFor238;
      out.orderOk = (dcc && po) ? po.getBoundingClientRect().x > dcc.getBoundingClientRect().x + dcc.getBoundingClientRect().width - 2 : null;
      return out;
    });
    console.log('\n■ ' + W + '×' + H + '  ' + JSON.stringify(r));
    await p.screenshot({ path: '_tabport_narrow_' + W + '.png', timeout: 45000 }).catch(() => {});
  }
  await browser.close();
})();
