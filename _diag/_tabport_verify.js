/**
 * _tabport_verify.js —— 存量胶囊端到端几何验证（电脑端三档）
 *
 * 断言：
 *  A. tab 栏存在，且 tab 按钮 = 对话 / 轨迹 / 系统监控
 *  B. 积分胶囊（dcc-root）与优化外壳（dsh-po-shell）的 parentElement 就是 tab 栏
 *  C. 二者与每个 tab 按钮零重叠、不出屏
 *  D. 二者不在 composerStack（会话框）内
 *  E. 原生模型选择器 ofTiQG_root 未被动过（position:relative，不在 tab 栏）
 *  F. 胶囊垂直居中对齐 tab 行
 */
const { webkit } = require('playwright');

const SIZES = [[1440, 900]];
let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, name, detail) {
  if (c) { PASS++; console.log('  ✅ ' + name + (detail ? '   ' + detail : '')); }
  else { FAIL++; fails.push(name + ' — ' + (detail || '')); console.log('  ❌ ' + name + (detail ? '   ' + detail : '')); }
}
const OV = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const [W, H] of SIZES) {
    console.log('\n■ ' + W + '×' + H);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => { const s = String(e); if (!/model\.label|remote\.session/.test(s)) errs.push(s.slice(0, 130)); });

    try { await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 }); }
    catch (e) { console.log('  !! goto 失败'); await ctx.close(); continue; }
    await p.waitForTimeout(9000);

    // 展开工作区 → 点历史会话
    await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach(r => { try { r.click(); } catch (e) {} }); });
    await p.waitForTimeout(2200);
    const picked = await p.evaluate(() => {
      const all = [...document.querySelectorAll('[class*="sessionRow"]')];
      const t = all.find(r => { const x = (r.innerText || '').trim(); return x && !/新会话/.test(x); }) || all[0];
      if (!t) return null;
      t.click();
      return (t.innerText || '').trim().replace(/\n+/g, '|').slice(0, 30);
    });
    await p.waitForTimeout(9000);
    console.log('  会话: ' + picked);

    const r = await p.evaluate(() => {
      const R2 = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const out = {};
      const tabs = document.querySelector('[data-conversation-tabs]');
      out.hasTabs = !!tabs;
      out.tabBar = R2(tabs);
      out.tabBtns = tabs ? [...tabs.querySelectorAll('button[role="tab"]')].map(b => ({ t: (b.textContent || '').trim(), r: R2(b) })) : [];
      out.children = tabs ? [...tabs.children].map(c => ({ tag: c.tagName.toLowerCase(), cls: String(c.className).slice(0, 34), r: R2(c) })) : [];

      const dcc = document.querySelector('[class*="dcc-root"]');
      const poShell = document.querySelector('[data-dsh-po-shell]');
      out.dcc = dcc ? { r: R2(dcc), parentIsTabs: !!(tabs && dcc.parentElement === tabs), alignSelf: getComputedStyle(dcc).alignSelf, w: Math.round(dcc.getBoundingClientRect().width) } : null;
      out.po = poShell ? { r: R2(poShell), parentIsTabs: !!(tabs && poShell.parentElement === tabs), alignSelf: getComputedStyle(poShell).alignSelf } : null;

      const off = document.querySelector('[class*="ofTiQG_root"]');
      out.native = off ? { r: R2(off), pos: getComputedStyle(off).position, inTabs: !!(tabs && tabs.contains(off)), inComposer: !!off.closest('[class*="composerStack"]') } : null;

      const card = document.querySelector('[class*="composerStack"]');
      out.inComposer = card ? { dcc: !!card.querySelector('[class*="dcc-root"]'), po: !!card.querySelector('[class*="dsh-po"]') } : null;

      out.vw = window.innerWidth;
      out.docSW = document.documentElement.scrollWidth;
      return out;
    });

    console.log('  tabBar=' + JSON.stringify(r.tabBar) + '  tabs=' + r.tabBtns.map(b => b.t + '@x' + b.r[0]).join(','));
    console.log('  dcc=' + JSON.stringify(r.dcc) + '\n  po=' + JSON.stringify(r.po));
    console.log('  native=' + JSON.stringify(r.native));

    chk(r.hasTabs, 'tab 栏存在');
    chk(r.tabBtns.length >= 2, 'tab 按钮 ≥2（对话/轨迹/系统监控）', r.tabBtns.map(b => b.t).join(' / '));
    chk(r.dcc !== null, '积分胶囊已渲染');
    chk(r.po !== null, '优化胶囊已渲染');
    chk(!!r.dcc && r.dcc.parentIsTabs, '积分胶囊直接挂在 tab 栏下', r.dcc ? 'parent=' + (r.dcc.parentIsTabs ? 'tabs' : '其他') : '');
    chk(!!r.po && r.po.parentIsTabs, '优化胶囊直接挂在 tab 栏下', r.po ? 'parent=' + (r.po.parentIsTabs ? 'tabs' : '其他') : '');
    chk(!!r.dcc && r.dcc.alignSelf === 'center', '积分胶囊 align-self=center（不被拉伸）', r.dcc ? r.dcc.alignSelf : '');
    chk(!!r.po && r.po.alignSelf === 'center', '优化胶囊 align-self=center', r.po ? r.po.alignSelf : '');

    const caps = [];
    if (r.dcc) caps.push(['积分', r.dcc.r]);
    if (r.po) caps.push(['优化', r.po.r]);
    let ovs = [];
    for (const [nm, rc] of caps) for (const b of r.tabBtns) if (OV(rc, b.r)) ovs.push(nm + '×' + b.t);
    if (caps.length === 2 && OV(caps[0][1], caps[1][1])) ovs.push('积分×优化');
    chk(ovs.length === 0, '胶囊与 tab / 彼此零重叠', ovs.length ? ovs.join(',') : '0 对');

    const oob = caps.filter(([, rc]) => rc[0] < 0 || rc[0] + rc[2] > r.vw + 1);
    chk(oob.length === 0, '胶囊不出屏', oob.length ? oob.map(x => x[0]).join(',') : 'vw=' + r.vw);

    chk(!!r.inComposer && !r.inComposer.dcc && !r.inComposer.po, '会话框内零插件元素', JSON.stringify(r.inComposer));
    chk(!!r.native && r.native.pos === 'relative' && !r.native.inTabs, '原生模型选择器零干预', r.native ? 'pos=' + r.native.pos + ' w=' + r.native.r[2] : 'null');
    chk(!!r.dcc && !!r.po && r.po.r[0] > r.dcc.r[0] + r.dcc.r[2] - 2, '顺序：积分在左 / 提示词优化在右（展开不遮挡）', r.dcc && r.po ? 'dcc.x=' + r.dcc.r[0] + ' po.x=' + r.po.r[0] : '');
    chk(r.docSW <= r.vw + 1, '页面零横向溢出', 'docSW=' + r.docSW + ' vw=' + r.vw);
    if (errs.length) console.log('  页面错误: ' + JSON.stringify(errs.slice(0, 2)));

    await p.screenshot({ path: '_tabport_' + W + '.png', timeout: 60000 }).catch(() => console.log('  截图超时跳过'));
    await ctx.close();
  }
  console.log('\n' + '='.repeat(60));
  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) { console.log(' 未通过:'); fails.forEach(f => console.log('   · ' + f)); }
  await browser.close();
})();
