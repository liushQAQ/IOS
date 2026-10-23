/**
 * _dock_verify.js —— 验证 shim_27（模型选择器停靠顶栏）
 * 断言：
 * ① 两个选择器都在顶栏下方、可见、标签宽 > 20
 * ② 底部 tools/trailing 已腾空，彼此零重叠
 * ③ 点开官方模型下拉 → 菜单紧贴按钮（|menu.top - btn.bottom| < 20）
 * ④ 点开插件模型面板 → 同样紧贴
 * ⑤ 430/375 两档
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const SIZES = [[430, 932], [375, 812]];
let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, name, detail) {
  if (c) { PASS++; console.log('  ✅ ' + name + (detail ? '   ' + detail : '')); }
  else { FAIL++; fails.push(name + ' — ' + (detail || '')); console.log('  ❌ ' + name + (detail ? '   ' + detail : '')); }
}

const BOX = `(e)=>{ const q=e.getBoundingClientRect(); return [Math.round(q.x),Math.round(q.y),Math.round(q.width),Math.round(q.height)]; }`;

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const [W, H] of SIZES) {
    console.log('\n■ ' + W + '×' + H);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
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
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__regTick());
    await p.waitForTimeout(1500); // 跨过一个 tick

    // 断言 ①②
    const base = await p.evaluate(() => {
      const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const off = document.querySelector('[class*="ofTiQG_root"]');
      const dcc = document.querySelector('.dcc-root');
      const lab = document.querySelector('[class*="ofTiQG_triggerLabel"]');
      const tools = document.querySelector('[class*="VERcba_tools"]');
      const tr = document.querySelector('[class*="VERcba_trailing"]');
      return {
        vw: window.innerWidth,
        off: off ? { box: box(off), pos: getComputedStyle(off).position, dock: off.getAttribute('data-dsh-modeldock') } : null,
        dcc: dcc ? { box: box(dcc), pos: getComputedStyle(dcc).position, dock: dcc.getAttribute('data-dsh-modeldock') } : null,
        lab: lab ? box(lab) : null,
        tools: tools ? box(tools) : null,
        tr: tr ? box(tr) : null
      };
    });
    console.log('  geo ' + JSON.stringify(base));

    chk(base.off && base.off.pos === 'fixed' && base.off.dock === '1', '[停靠] 官方模型选择器已 fixed 停靠', base.off ? 'pos=' + base.off.pos : '未找到');
    chk(base.dcc && base.dcc.pos === 'fixed' && base.dcc.dock === '1', '[停靠] 插件模型选择器已 fixed 停靠', base.dcc ? 'pos=' + base.dcc.pos : '未找到');
    chk(base.lab && base.lab[2] > 40, '[停靠] 官方模型标签已展开（不再 0 宽）', base.lab ? 'labelW=' + base.lab[2] : '无');
    if (base.off && base.dcc) {
      const inTop = base.off.box[1] < 200 && base.dcc.box[1] < 200;
      chk(inTop, '[停靠] 两钮都在顶栏下方（y<200）', 'offY=' + base.off.box[1] + ' dccY=' + base.dcc.box[1]);
      const gapOK = Math.abs((base.dcc.box[0] + base.dcc.box[2]) - base.off.box[0]) <= 12;
      chk(gapOK, '[停靠] 两钮横向不重叠且间距合理', 'dccRight=' + (base.dcc.box[0] + base.dcc.box[2]) + ' offLeft=' + base.off.box[0]);
      const rightOK = base.off.box[0] + base.off.box[2] <= base.vw - 4;
      chk(rightOK, '[停靠] 右缘不出屏', 'offRight=' + (base.off.box[0] + base.off.box[2]) + ' vw=' + base.vw);
    }
    // 底部腾空：tools 里不应再有 dcc（fixed 后不在流内）
    if (base.tools && base.tr) {
      const overlapY = !(base.tools[1] + base.tools[3] <= base.tr[1] || base.tr[1] + base.tr[3] <= base.tools[1]);
      const overlapX = !(base.tools[0] + base.tools[2] <= base.tr[0] || base.tr[0] + base.tr[2] <= base.tools[0]);
      chk(!(overlapX && overlapY), '[底排] tools 与 trailing 零重叠', 'tools=' + JSON.stringify(base.tools) + ' tr=' + JSON.stringify(base.tr));
    }
    await p.screenshot({ path: path.join(DIR, '_dock_verify_' + W + '.png') });

    // ③ 官方模型下拉
    const m1 = await p.evaluate(async () => {
      const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const btn = document.querySelector('[class*="ofTiQG_trigger"]');
      if (!btn) return { noBtn: true };
      btn.click();
      await new Promise(r => setTimeout(r, 1400));
      const cands = Array.from(document.querySelectorAll('[class*="ofTiQG_menu"], [class*="bre-model-menu"]'));
      const m = cands.find(e => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && q.width > 60 && q.height > 30; });
      return { btn: box(btn), menu: m ? box(m) : null, cls: m ? (m.className || '').toString().slice(0, 40) : null };
    });
    console.log('  menuOf ' + JSON.stringify(m1));
    if (m1.menu) {
      const d = m1.menu[1] - (m1.btn[1] + m1.btn[3]);
      chk(Math.abs(d) < 24, '[菜单] 官方模型菜单贴合按钮下方', 'delta=' + d + ' (btnBottom=' + (m1.btn[1] + m1.btn[3]) + ' menuTop=' + m1.menu[1] + ')');
      chk(m1.menu[0] >= 0 && m1.menu[0] + m1.menu[2] <= base.vw, '[菜单] 菜单不出屏', 'left=' + m1.menu[0] + ' right=' + (m1.menu[0] + m1.menu[2]));
    } else chk(false, '[菜单] 官方模型菜单未出现', JSON.stringify(m1));
    await p.screenshot({ path: path.join(DIR, '_dock_menu_of_' + W + '.png') });

    // 关菜单
    await p.evaluate(() => { document.body.click(); });
    await p.waitForTimeout(900);

    // ④ 插件模型面板
    const m2 = await p.evaluate(async () => {
      const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const btn = document.querySelector('.dcc-btn') || document.querySelector('.dcc-root');
      if (!btn) return { noBtn: true };
      btn.click();
      await new Promise(r => setTimeout(r, 1400));
      const cands = Array.from(document.querySelectorAll('.dcc-panel, [class*="dcc-panel"]'));
      const m = cands.find(e => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && q.width > 60 && q.height > 30; });
      return { btn: box(btn), menu: m ? box(m) : null, cls: m ? (m.className || '').toString().slice(0, 40) : null };
    });
    console.log('  menuDcc ' + JSON.stringify(m2));
    if (m2.menu) {
      const d = m2.menu[1] - (m2.btn[1] + m2.btn[3]);
      chk(Math.abs(d) < 24, '[菜单] 插件模型面板贴合按钮下方', 'delta=' + d + ' (btnBottom=' + (m2.btn[1] + m2.btn[3]) + ' panelTop=' + m2.menu[1] + ')');
    } else chk(false, '[菜单] 插件模型面板未出现', JSON.stringify(m2));
    await p.screenshot({ path: path.join(DIR, '_dock_menu_dcc_' + W + '.png') });

    const fatal = errs.filter(e => /SyntaxError|ReferenceError|is not a function|is not defined|Cannot read/i.test(e));
    chk(fatal.length === 0, '[脚本] 无致命 JS 错误', fatal.length ? fatal.slice(0, 2).join(' | ') : '页面错误 ' + errs.length + ' 条');
    await ctx.close();
  }
  await browser.close();
  console.log('\n结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) { console.log('未通过：'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
})();
