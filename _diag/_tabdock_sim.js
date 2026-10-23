/**
 * _tabdock_sim.js —— 人造 tab 行验证 93 版停靠逻辑
 * 两条硬边界：
 *  ① 原生模型按钮 ofTiQG **零干预**（必须在会话框内、无 data-dsh-modeldock）
 *  ② 插件元素（dcc / po）固定到 tab 行右侧空白，不压 tab、不出屏
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, n, d) { if (c) { PASS++; console.log('  ✅ ' + n + (d ? '   ' + d : '')); } else { FAIL++; fails.push(n + ' — ' + (d || '')); console.log('  ❌ ' + n + (d ? '   ' + d : '')); } }
const OV = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
const SIZES = [[430, 932], [393, 852], [375, 812]];

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const [W, H] of SIZES) {
    console.log('\n■ ' + W + '×' + H);
    const p = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA })).newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);
    await p.evaluate(({ js }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', '59px');
      document.documentElement.style.setProperty('--dsh-sb-native', '59px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      window.__dshNativeStatusBar = 59;
      if (!document.getElementById('__reg_fakeenv')) {
        const fe = document.createElement('style');
        fe.id = '__reg_fakeenv';
        fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
        document.head.appendChild(fe);
      }
      try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR ' + e); }
    }, { js: APP_JS });
    await p.waitForTimeout(2500);

    // 人造 tab 行（位置贴近真机：y=83, 三按钮）
    const tabGeo = await p.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.id = '__sim_tabs';
      wrap.style.cssText = 'position:fixed;left:0;top:83px;height:28px;display:flex;align-items:center;gap:18px;padding-left:14px;z-index:5;';
      ['对话', '轨迹', '系统监控'].forEach(t => {
        const b = document.createElement('button');
        b.textContent = t;
        b.style.cssText = 'background:none;border:none;color:#888;font-size:13px;padding:0;';
        wrap.appendChild(b);
      });
      document.body.appendChild(wrap);
      const q = wrap.getBoundingClientRect();
      // 人造插件元素（沙箱无积分数据时不渲染 dcc/po）
      if (!document.querySelector('[class*="dcc-root"]')) {
        const d = document.createElement('div');
        d.className = 'dcc-root';
        d.textContent = 'Lobster 1,504';
        d.style.cssText = 'font-size:12px;padding:0 8px;border-radius:12px;background:#eef;border:1px solid #ccd;height:24px;display:inline-flex;align-items:center;';
        document.body.appendChild(d);
      }
      if (!document.querySelector('[class*="dsh-po-capsule"]')) {
        const o = document.createElement('button');
        o.className = 'dsh-po-capsule';
        o.textContent = '优化';
        o.style.cssText = 'font-size:12px;padding:0 8px;border-radius:12px;background:#efe;border:1px solid #cdc;height:26px;';
        document.body.appendChild(o);
      }
      return { right: Math.round(q.right), y: Math.round(q.y), h: Math.round(q.height) };
    });
    console.log('  人造 tab 行 right=' + tabGeo.right + ' y=' + tabGeo.y);
    await p.waitForTimeout(2600); // 跨两个 tick

    const R = await p.evaluate(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const off = document.querySelector('[class*="ofTiQG_root"]');
      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[class*="dsh-po-capsule"]');
      const wrap = document.getElementById('__sim_tabs');
      const tb = wrap ? [...wrap.querySelectorAll('button')].map(box) : [];
      return {
        vw: innerWidth, vh: innerHeight,
        tabY: wrap ? Math.round(wrap.getBoundingClientRect().y) : 0,
        tabRight: wrap ? Math.round(wrap.getBoundingClientRect().right) : 0,
        tabBtns: tb,
        off: box(off), offTag: off ? off.getAttribute('data-dsh-modeldock') : null,
        dcc: box(dcc), dccTag: dcc ? dcc.getAttribute('data-dsh-modeldock') : null,
        po: box(po), poTag: po ? po.getAttribute('data-dsh-modeldock') : null,
      };
    });
    console.log('  geo ' + JSON.stringify({ off: R.off, dcc: R.dcc, po: R.po, tabY: R.tabY }));

    // ① 原生模型按钮：必须在会话框（下半屏）、未被停靠
    chk(!!R.off, '[原生] 模型按钮存在', JSON.stringify(R.off));
    chk(R.off && R.off[1] > R.vh * 0.5, '[原生] 模型按钮在会话框内（下半屏）', 'y=' + (R.off ? R.off[1] : '?') + ' vh=' + R.vh);
    chk(R.offTag === null, '[原生] 模型按钮未被停靠（零干预）', 'tag=' + R.offTag);

    // ② 插件：停靠到 tab 行
    for (const k of ['dcc', 'po']) {
      const b = R[k];
      if (!b) { chk(false, '[插件] ' + k + ' 存在', '未渲染'); continue; }
      chk(R[k + 'Tag'] === '1', '[插件] ' + k + ' 已停靠', JSON.stringify(b));
      chk(Math.abs(b[1] + b[3] / 2 - (R.tabY + 14)) <= 16, '[插件] ' + k + ' 垂直落在 tab 行', 'y=' + b[1] + ' tabY=' + R.tabY);
      chk(R.tabBtns.filter(t => OV(b, t)).length === 0, '[插件] ' + k + ' 不压 tab 按钮');
      chk(b[0] + b[2] <= R.vw + 1, '[插件] ' + k + ' 不出屏', 'right=' + (b[0] + b[2]) + ' vw=' + R.vw);
      chk(b[2] >= 40, '[插件] ' + k + ' 宽度达底线', 'w=' + b[2]);
    }
    // ③ 两个插件互不重叠
    if (R.dcc && R.po) chk(!OV(R.dcc, R.po), '[插件] dcc 与 po 不重叠');

    await p.screenshot({ path: path.join(DIR, '_tabdock_sim_' + W + '.png'), clip: { x: 0, y: 60, width: W, height: 90 } });
    await p.context().close();
  }
  await browser.close();
  console.log('\n结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) { fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
})();
