/**
 * _po_more_css.js —— 干净 CSS 沙盒验证窄屏几何（避开 DSH 窄视口渲染异常）
 *
 * 每个档位用**对应视口宽度**打开（media query 看视口，不看容器）。
 * 验证三件事：
 *   1. 展开后的「撤回/重优」在窄屏是 absolute 浮层，不撑宽外壳
 *   2. 胶囊允许 flex 收缩（省略号），空间不够时绝不越屏
 *   3. 任何元素之间零重叠
 */
const { webkit } = require('playwright');

const WIDTHS = [430, 390, 375, 320];
let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, name, detail) {
  if (c) { PASS++; console.log('  ✅ ' + name + (detail ? '   ' + detail : '')); }
  else { FAIL++; fails.push(name + ' — ' + (detail || '')); console.log('  ❌ ' + name + (detail ? '   ' + detail : '')); }
}
const OV = (a, b) => !(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5);

const CSS = `
[data-conversation-tabs] { display: flex; gap: 36px; margin-top: 10px; padding-left: 8px; position: relative; }
[data-conversation-tabs] > button[role="tab"] {
  background: 0 0; border: none; padding: 0 0 9px; font-size: 13px; font-weight: 500;
  line-height: 16px; color: #8a8f99; cursor: pointer; position: relative; flex: none;
}
.dcc-root { display: inline-flex; align-items: center; }
.dcc-btn { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px;
  border-radius: 6px; border: 1px solid #333; background: transparent; color: #ccc;
  font: inherit; font-size: 12px; line-height: 1; white-space: nowrap; }
.dcc-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; }
[data-conversation-tabs] > .dcc-root {
  align-self: center; flex: 0 1 auto; min-width: 34px; margin-left: -14px;
  max-width: 100%; order: 1; position: relative; top: -4.5px;
}
[data-conversation-tabs] > .dcc-root .dcc-btn { min-width: 0; overflow: hidden; }
[data-conversation-tabs] > .dcc-root .dcc-btn > span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-conversation-tabs] > .dcc-root .dcc-dot { flex: none; }

[data-dsh-po-shell] { display: inline-flex; align-items: center; position: relative; }
.dsh-po-capsule { display: inline-flex; align-items: center; height: 26px; padding: 1px 2px;
  border-radius: 6px; background: #26262a; border: 1px solid #3a3a40; box-sizing: border-box; }
.dsh-po-btn-opt, .dsh-po-btn-gear, .dsh-po-btn-sub {
  display: inline-flex; align-items: center; gap: 3px; background: 0 0; border: none;
  color: #c9c9cf; font: inherit; font-size: 11px; padding: 2px 4px; cursor: pointer; white-space: nowrap;
}
.dsh-po-divider { width: 1px; height: 12px; background: #3a3a40; margin: 0 1px; flex-shrink: 0; }
[data-conversation-tabs] > [data-dsh-po-shell] {
  align-self: center; flex: 0 1 auto; min-width: 46px; margin-left: -14px;
  max-width: 100%; order: 2; top: -4.5px;
}
[data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-capsule { min-width: 0; overflow: hidden; }
[data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-btn-opt,
[data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-btn-gear { flex: 0 1 auto; min-width: 0; }
[data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-btn-opt > span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-po-more { display: contents; }
@media (max-width: 560px) {
  [data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-more {
    display: flex; align-items: center; gap: 2px; position: absolute;
    top: calc(100% + 4px); right: 0; z-index: 40; padding: 3px 4px; border-radius: 8px;
    background: #232326; border: 1px solid #3a3a40; box-shadow: 0 8px 24px rgba(0,0,0,.28);
    white-space: nowrap;
  }
  [data-conversation-tabs] > [data-dsh-po-shell] .dsh-po-more .dsh-po-divider { display: none; }
}
body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a1d; }
`;

const HTML = `<!doctype html><html><head><style>${CSS}</style></head><body>
  <div id="host" style="width:100%">
    <div data-conversation-tabs>
      <button role="tab">对话</button>
      <button role="tab">轨迹</button>
      <button role="tab">系统监控</button>
      <div class="dcc-root"><button class="dcc-btn"><span class="dcc-dot"></span><span>TRAE</span><span>查询中…</span></button></div>
      <div data-dsh-po-shell>
        <div class="dsh-po-capsule">
          <button class="dsh-po-btn-opt"><span>✨ 优化</span></button>
          <div class="dsh-po-divider"></div>
          <button class="dsh-po-btn-gear">⚙</button>
          <div class="dsh-po-more">
            <button class="dsh-po-btn-sub undo">撤回</button>
            <div class="dsh-po-divider"></div>
            <button class="dsh-po-btn-sub">重优</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

(async () => {
  const browser = await webkit.launch({ headless: true });

  for (const W of WIDTHS) {
    console.log('\n■ 视口/容器 ' + W + 'px');
    const ctx = await browser.newContext({ viewport: { width: W, height: 320 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(HTML);
    await p.waitForTimeout(250);

    const r = await p.evaluate(() => {
      const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), right: +(q.x + q.width).toFixed(1) }; };
      const bar = document.querySelector('[data-conversation-tabs]');
      const dcc = document.querySelector('.dcc-root');
      const po = document.querySelector('[data-dsh-po-shell]');
      const more = document.querySelector('.dsh-po-more');
      return {
        bar: R(bar), dcc: R(dcc), po: R(po), more: R(more),
        morePos: getComputedStyle(more).position,
        moreDisp: getComputedStyle(more).display,
        dccOverflow: dcc.querySelector('.dcc-btn').scrollWidth > dcc.querySelector('.dcc-btn').clientWidth + 1,
        tabs: [...document.querySelectorAll('button[role="tab"]')].map(b => ({ t: b.textContent, r: R(b) })),
        docSW: document.documentElement.scrollWidth,
        vw: window.innerWidth,
      };
    });

    console.log('  bar=' + JSON.stringify(r.bar));
    console.log('  dcc=' + JSON.stringify(r.dcc) + '  po=' + JSON.stringify(r.po));
    console.log('  more=' + JSON.stringify(r.more) + '  [' + r.morePos + '/' + r.moreDisp + ']  收缩省略=' + r.dccOverflow);

    chk(r.morePos === 'absolute' && r.moreDisp === 'flex', W + '：辅助组是 absolute 浮层', r.morePos + '/' + r.moreDisp);

    let ovs = [];
    for (const t of r.tabs) { if (OV(r.po, t.r)) ovs.push('优化×' + t.t); if (r.dcc && OV(r.dcc, t.r)) ovs.push('积分×' + t.t); }
    if (r.dcc && OV(r.po, r.dcc)) ovs.push('优化×积分');
    chk(ovs.length === 0, W + '：零重叠', ovs.length ? ovs.join(',') : '0 对');

    chk(!!r.dcc && r.dcc.right <= r.vw + 1, W + '：积分胶囊不出屏', r.dcc ? 'right=' + r.dcc.right + ' vw=' + r.vw : '');
    chk(!!r.po && r.po.right <= r.vw + 1, W + '：优化胶囊不出屏', r.po ? 'right=' + r.po.right + ' vw=' + r.vw : '');
    chk(r.more.right <= r.vw + 1, W + '：浮层不出屏', 'more.right=' + r.more.right + ' vw=' + r.vw);
    chk(r.docSW <= r.vw + 1, W + '：无横向滚动', 'docSW=' + r.docSW + ' vw=' + r.vw);

    await p.screenshot({ path: '_po_more_' + W + '.png', clip: { x: 0, y: 0, width: W, height: 110 }, timeout: 30000 }).catch(() => {});
    await ctx.close();
  }

  console.log('\n' + '='.repeat(58));
  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) fails.forEach(f => console.log('   · ' + f));
  await browser.close();
})();
