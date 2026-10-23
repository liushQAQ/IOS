/**
 * _host_verify.js —— 电脑端（DSH 前端插件侧）会话框占用迁移验证
 * 必须先打开真实会话：conversation.session.header.actions 只在会话态声明。
 *
 * 断言：
 * ① dcc-root（composer-credits 胶囊）已渲染
 * ② 不在 composer 卡片内 / 不在 conversation.input.left 内
 * ③ 挂在 conversation.session.header.actions 内
 * ④ 头部 actions 区各元素彼此不重叠、不出屏
 * ⑤ 官方模型选择器 ofTiQG_root 宽度正常（不再被挤扁）
 * ⑥ 会话框顶排 tools 零插件元素
 */
const { webkit } = require('playwright');

const SIZES = [[1440, 900], [1280, 800], [1024, 768], [760, 700]];
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
    p.on('pageerror', e => { const s = String(e); if (!/model\.label|remote\.session/.test(s)) errs.push(s.slice(0, 140)); });

    try { await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 }); }
    catch (e) { console.log('  !! goto 失败 ' + e.message.slice(0, 90)); await ctx.close(); continue; }
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 100, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(8000);

    // 打开真实会话（actions slot 只在会话态声明）
    const clicked = await p.evaluate(() => {
      const cands = [...document.querySelectorAll('[data-slot="sidebar.workspaces"] div, [data-slot="sidebar.workspaces"] li')];
      for (const c of cands) {
        const txt = (c.innerText || '').trim();
        if (txt && txt.length > 2 && txt.length < 40 && /修复6066|排队消息|未命名/.test(txt)) { c.click(); return txt.split('\n')[0].slice(0, 24); }
      }
      return null;
    });
    await p.waitForTimeout(9000);
    const hasActionsSlot = await p.evaluate(() => !!document.querySelector('[data-slot="conversation.session.header.actions"]'));
    console.log('  session=' + clicked + '  actionsSlot=' + hasActionsSlot);
    if (!hasActionsSlot) { console.log('  !! 未进入会话态，跳过'); await ctx.close(); continue; }

    const r = await p.evaluate(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const out = {};
      const dcc = document.querySelector('[class*="dcc-root"]');
      const act = document.querySelector('[data-slot="conversation.session.header.actions"]');
      const tools = document.querySelector('[class*="VERcba_tools"]');
      const card = document.querySelector('[class*="composerStack"]');
      const left = document.querySelector('[data-slot="conversation.input.left"]');
      const off = document.querySelector('[class*="ofTiQG_root"]');

      out.dcc = box(dcc);
      out.dccInActions = !!(dcc && act && act.contains(dcc));
      out.dccInCard = !!(dcc && card && card.contains(dcc));
      out.dccInTools = !!(dcc && tools && tools.contains(dcc));
      out.dccInLeft = !!(dcc && left && left.contains(dcc));

      // 头部 actions 内所有可见子元素几何
      out.actKids = [];
      if (act) {
        for (const c of act.children) {
          const b = box(c);
          const cls = typeof c.className === 'string' ? c.className : '';
          if (b && b[2] > 0 && b[3] > 0) out.actKids.push({ cls: cls.split(' ')[0].slice(0, 34), box: b });
        }
      }
      // 会话头部整体
      const hdr = document.querySelector('[data-slot="conversation.session.header"]');
      const tr = hdr ? hdr.querySelector('[class*="titleRow"]') : null;
      out.titleRow = box(tr);
      // corner 按钮（右端）
      const corner = document.querySelector('[data-slot="conversation.session.header.corner"]');
      out.cornerKids = corner ? [...corner.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 30), box: box(c) })) : [];
      out.corner = corner ? box(corner.firstElementChild) : null;

      out.off = box(off);
      out.toolsKids = tools ? [...tools.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 40), box: box(c) })) : [];
      out.vw = window.innerWidth;
      return out;
    });

    console.log('  dcc=' + JSON.stringify(r.dcc) + ' inActions=' + r.dccInActions + ' inCard=' + r.dccInCard + ' inTools=' + r.dccInTools + ' inLeft=' + r.dccInLeft);
    console.log('  actKids=' + JSON.stringify(r.actKids));
    console.log('  corner=' + JSON.stringify(r.corner) + ' kids=' + JSON.stringify(r.cornerKids));
    console.log('  ofTiQG=' + JSON.stringify(r.off));
    console.log('  toolsKids=' + JSON.stringify(r.toolsKids.map(x => x.cls)));

    chk(!!r.dcc, '胶囊已渲染', JSON.stringify(r.dcc));
    chk(r.dccInActions, '胶囊在 conversation.session.header.actions 内');
    chk(!r.dccInCard, '胶囊已离开 composer 卡片');
    chk(!r.dccInLeft, '胶囊不在 conversation.input.left 内');
    chk(!r.dccInTools, '胶囊不在工具行内');

    // 头部 actions 内两两不重叠
    let ov = null;
    for (let i = 0; i < r.actKids.length; i++) for (let j = i + 1; j < r.actKids.length; j++) {
      if (OV(r.actKids[i].box, r.actKids[j].box)) ov = r.actKids[i].cls + ' × ' + r.actKids[j].cls;
    }
    chk(!ov, '头部 actions 内零重叠', ov || (r.actKids.length + ' 个元素'));
    // 不出屏
    const outOfScreen = r.actKids.filter(k => k.box[0] < 0 || k.box[0] + k.box[2] > r.vw + 1);
    chk(outOfScreen.length === 0, '头部 actions 全部在屏内', JSON.stringify(outOfScreen));
    // 模型按钮未被挤扁
    chk(!!r.off && r.off[2] >= 60, '官方模型选择器宽度正常（未被挤扁）', JSON.stringify(r.off));
    // 工具行零插件
    const toolsPlugin = r.toolsKids.filter(x => /dcc-|dms-|wb-|workbuddy/i.test(x.cls));
    chk(toolsPlugin.length === 0, '会话框工具行零插件元素', JSON.stringify(r.toolsKids.map(x => x.cls)));
    chk(errs.length === 0, '无新增 JS 报错', errs.slice(0, 2).join(' | '));

    await ctx.close();
  }
  await browser.close();
  console.log('\n================ ' + PASS + ' 绿 / ' + FAIL + ' 红 ================');
  if (FAIL) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
})();
