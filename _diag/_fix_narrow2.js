/**
 * _fix_narrow2.js —— 真机场景复现 + 修复验证
 * 人为往 headerUtilities 里塞一个「⭕ 任务运行中」徽标（真机同款），
 * 量 BEFORE（应重叠）/ AFTER（必须 0 重叠），多档视口。
 */
const { webkit } = require('playwright');

const CSS = `
html body [data-phase] header [class*="titleRow"] [class*="crumbs"] {
  right: var(--dsh-head-right, 96px) !important;
  max-width: calc(100% - 54px - var(--dsh-head-right, 96px)) !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
html body [data-phase] header [class*="titleRow"] [class*="crumbs"] * {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
html body [data-phase] header [class*="headerUtilities"] {
  flex: 0 0 auto !important;
  max-width: 30vw !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
html body [data-phase] header [class*="headerUtilities"] * {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
[data-conversation-tabs] { flex-wrap: nowrap !important; min-width: 0 !important; }
[data-conversation-tabs] > button[role="tab"] {
  flex: 0 0 auto !important; white-space: nowrap !important;
  word-break: keep-all !important; overflow: hidden !important; text-overflow: ellipsis !important;
}
[data-conversation-tabs] > :not(button[role="tab"]) {
  flex: 0 1 auto !important; min-width: 0 !important;
  white-space: nowrap !important; overflow: hidden !important;
}
@media (max-width: 560px) {
  [data-conversation-tabs] { gap: 12px !important; }
  [data-conversation-tabs] > [class*="dcc-root"],
  [data-conversation-tabs] > [data-dsh-po-shell] { margin-left: 0 !important; }
}
`;

const FIX_JS = `(() => {
  var row = document.querySelector('[data-phase] header [class*="titleRow"]');
  if (row === null) return 'no-row';
  var rb = row.getBoundingClientRect();
  if (!(rb.width > 0)) return 'zero-row';
  var right = 0;
  var utils = row.querySelector('[class*="headerUtilities"]');
  if (utils !== null) {
    var ub = utils.getBoundingClientRect();
    if (ub.width > 0) right = (rb.right - ub.left) + 6;
  }
  if (!(right > 0)) {
    var acts = row.querySelector('[class*="headerActions"]');
    if (acts !== null) {
      var ab = acts.getBoundingClientRect();
      if (ab.width > 0) right = (rb.right - ab.left) + 6;
    }
  }
  var vw = window.innerWidth || 375;
  var cap = Math.round(vw * 0.55);
  if (right > cap) right = cap;
  if (right < 96) right = 96;
  document.documentElement.style.setProperty('--dsh-head-right', Math.ceil(right) + 'px');
  return Math.ceil(right) + 'px';
})()`;

async function run(browser, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; }); if (b) b.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim())); if (t) t.click(); });
  await p.waitForTimeout(9000);

  // 塞「任务运行中」假徽标（真机同款：转圈 + 文字）
  const injected = await p.evaluate(() => {
    const slot = document.querySelector('[data-slot="conversation.session.header.utilities"]');
    if (!slot) return 'no-slot';
    const sp = document.createElement('span');
    sp.setAttribute('data-fake-running', '1');
    sp.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:0 8px;height:24px;border-radius:12px;background:rgba(127,133,143,.18);font-size:12px;white-space:nowrap;flex:0 0 auto;';
    sp.innerHTML = '<i style="width:10px;height:10px;border:2px solid rgba(255,255,255,.35);border-top-color:#4a9eff;border-radius:50%;display:inline-block"></i>任务运行中';
    slot.appendChild(sp);
    return Math.round(sp.getBoundingClientRect().width) + 'px';
  });
  await p.waitForTimeout(600);

  const measure = () => p.evaluate(() => {
    const R = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const row = document.querySelector('[data-phase] header [class*="titleRow"]');
    const nav = document.querySelector('[class*="titleCluster"] > nav');
    const utils = document.querySelector('[class*="headerUtilities"]');
    const tabs = document.querySelector('[data-conversation-tabs]');
    const out = { vw: window.innerWidth, docSW: document.documentElement.scrollWidth, var: getComputedStyle(document.documentElement).getPropertyValue('--dsh-head-right').trim() };
    out.row = row ? R(row) : null;
    out.nav = nav ? R(nav) : null;
    out.utils = utils ? R(utils) : null;
    out.tabs = tabs ? R(tabs) : null;
    const ov = (a, b) => {
      const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return x > 1 && y > 1 ? [Math.round(x), Math.round(y)] : null;
    };
    const leaks = [];
    if (out.nav && out.utils) { const o = ov(out.nav, out.utils); if (o) leaks.push('标题 × 右侧模块 重叠 ' + o.join('×')); }
    // tab 行所有子元素两两重叠 + 越界
    if (tabs) {
      const kids = [...tabs.children].filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const o = ov(R(kids[i]), R(kids[j]));
          if (o) leaks.push('tab行 「' + (kids[i].innerText || '').trim().slice(0, 8) + '」× 「' + (kids[j].innerText || '').trim().slice(0, 8) + '」 重叠 ' + o.join('×'));
        }
      }
      kids.forEach((k) => {
        const r = R(k);
        if (r.x + r.w > window.innerWidth + 1) leaks.push('tab行 「' + (k.innerText || '').trim().slice(0, 8) + '」右越界 ' + Math.round(r.x + r.w - window.innerWidth));
        if (r.x < -1) leaks.push('tab行 「' + (k.innerText || '').trim().slice(0, 8) + '」左越界 ' + Math.round(-r.x));
      });
    }
    out.leaks = leaks;
    out.wrapped = tabs ? [...tabs.querySelectorAll('button[role="tab"]')].filter((b) => b.getBoundingClientRect().height > 50).map((b) => (b.innerText || '').trim()) : [];
    return out;
  });

  const before = await measure();
  // 真机顺序：shim CSS 随页面加载就先注入，JS 几何后跑（量的必须是 CSS 后的布局）
  await p.addStyleTag({ content: CSS });
  await p.waitForTimeout(800);
  const setVar = await p.evaluate(FIX_JS);
  await p.waitForTimeout(800);
  const after = await measure();

  const fmt = (m) => {
    const s = (o) => (o ? '[' + [o.x, o.y, o.w, o.h].map(Math.round).join(',') + ']' : 'null');
    return 'row=' + s(m.row) + ' nav=' + s(m.nav) + ' utils=' + s(m.utils) + ' var=' + (m.var || '-')
      + '\n    重叠/越界 ' + m.leaks.length + ' 条' + (m.leaks.length ? '：' : ' ✅')
      + (m.leaks.length ? '\n      ⚠ ' + m.leaks.join('\n      ⚠ ') : '')
      + '\n    竖排 tab ' + m.wrapped.length + ' 个' + (m.wrapped.length ? '：' + m.wrapped.join(',') : ' ✅');
  };
  console.log('\n########## 视口 ' + W + '×' + H + '  假徽标宽=' + injected + ' ##########');
  console.log('  BEFORE ' + fmt(before));
  console.log('  AFTER  ' + fmt(after));
  const pass = after.leaks.length === 0 && after.wrapped.length === 0;
  console.log('  → ' + (pass ? '✅ 修复有效（0 重叠 / 0 竖排）' : '❌ 仍有问题'));
  await p.screenshot({ path: '_fix2_' + W + '.png', timeout: 60000 }).catch(() => {});
  await ctx.close();
  return pass;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  let ok = 0; let all = 0;
  for (const [W, H] of [[430, 932], [393, 852], [375, 667], [320, 568]]) {
    try { if (await run(browser, W, H)) ok++; } catch (e) { console.log('视口 ' + W + ' 异常: ' + e.message); }
    all++;
  }
  console.log('\n=== 汇总 ' + ok + '/' + all + ' 档通过 ===');
  await browser.close();
})();
