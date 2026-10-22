// 87 夹具：z-index 抬升+实底 panel 后，排队条盖住相邻 GoalBar，几何零位移
const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const qcss = fs.readFileSync('_queuedock_css.css', 'utf8');
  const gcss = fs.readFileSync('_goalbar_css.css', 'utf8');
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const html = `<!DOCTYPE html><html><head><style>
  :root{ --dsh-composer-side-clearance:16px; --dsh-composer-dock-inset:12px; --dsh-composer-stack-gap:10px; --dsh-composer-card-max-width:430px;
    --dsw-radius-lg:16px; --dsw-radius-md:10px; --dsw-radius-sm:6px; --dsw-specific-menu:rgba(42,42,44,0.72); --dsw-menu-backdrop-filter:blur(20px);
    --dsw-alias-border-l1:rgba(255,255,255,.12); --dsw-alias-label-primary:#fff; --dsw-alias-label-tertiary:#999; }
  body{margin:0;background:#111;font-family:-apple-system,sans-serif;}
  .stack{display:flex;flex-direction:column;gap:var(--dsh-composer-stack-gap);padding:10px;}
  .card{background:#232325;border-radius:16px;height:80px;margin:0 auto;width:calc(100% - 32px);}
  </style></head><body>
  <div class="stack" id="stack">
    <div class="x1ZYoW_dock" data-queue-dock=""><div class="x1ZYoW_panel">
      <ul class="x1ZYoW_list"><li class="x1ZYoW_row">
        <span class="x1ZYoW_lead">😊</span>
        <span class="x1ZYoW_preview"><span class="_abc__text_1">那行修复策略问题，不加wb做引擎，怕费用明细筛选出问题影响结算准确性需要认真核对每一笔账单明细与折扣规则是否一致</span></span>
        <div class="x1ZYoW_actions"><button>🗑</button><button>↑</button></div>
      </li></ul>
    </div></div>
    <div class="_6qvijW_dock"><div class="_6qvijW_bar"><span>↑</span><span>0%</span><span class="goal_text_">费用明细筛选与结算校验</span></div></div>
    <div class="card"></div>
  </div>
  <div id="root"></div><div data-mobile-nav="frame"></div>
  </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.addStyleTag({ content: qcss + '\n' + gcss });
  // 模拟老手机：无前缀 backdrop-filter 失效
  await page.addStyleTag({ content: '.x1ZYoW_panel:before{backdrop-filter:none !important}' });
  const before = await page.evaluate(() => {
    const q = document.querySelector('[data-queue-dock]').getBoundingClientRect();
    const g = document.querySelector('._6qvijW_dock').getBoundingClientRect();
    // GoalBar 中心点被谁盖住
    const el = document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2);
    return { overlapZone: Math.round(q.bottom - g.y), coveredByQueue: !!(el && el.closest('[data-queue-dock]')), coveredBy: el ? (el.className || el.tagName).toString().slice(0, 30) : 'none' };
  });
  console.log('BEFORE fix:', JSON.stringify(before));
  // 应用 App 注入（87 修复在内）
  await page.addStyleTag({ content: fs.readFileSync('app_inject.css', 'utf8') });
  await page.evaluate(fs.readFileSync('app_inject.js', 'utf8')).catch(() => {});
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => {
    const qd = document.querySelector('[data-queue-dock]');
    const q = qd.getBoundingClientRect();
    const g = document.querySelector('._6qvijW_dock').getBoundingClientRect();
    const pv = document.querySelector('.x1ZYoW_preview').getBoundingClientRect();
    const el = document.elementFromPoint(g.x + g.width / 2, g.y + 1);
    const cs = getComputedStyle(document.querySelector('.x1ZYoW_panel'));
    return {
      previewH: Math.round(pv.height),
      queueH: Math.round(q.height),
      marginBottom: getComputedStyle(qd).marginBottom,
      goalCoveredByQueue: !!(el && el.closest('[data-queue-dock]')),
      panelBg: cs.backgroundColor,
      panelWebkitBF: cs.webkitBackdropFilter || cs.webkitBackropFilter || 'n/a'
    };
  });
  console.log('AFTER fix:', JSON.stringify(after));
  const pass = after.previewH <= 26 && after.goalCoveredByQueue === true && after.panelBg !== 'rgba(0, 0, 0, 0)' && after.marginBottom !== '0px';
  console.log(pass ? 'PASS ✅' : 'FAIL ❌');
  await page.screenshot({ path: '_fix_q87.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
