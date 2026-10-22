const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const qcss = fs.readFileSync('_queuedock_css.css', 'utf8');
  const gcss = fs.readFileSync('_goalbar_css.css', 'utf8');
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // 关键场景：队列 dock 里长预览文字 + 后面跟 GoalBar dock
  const html = `<!DOCTYPE html><html><head><style>
  :root{ --dsh-composer-side-clearance:16px; --dsh-composer-dock-inset:12px; --dsh-composer-stack-gap:10px; --dsh-composer-card-max-width:430px;
    --dsw-radius-lg:16px; --dsw-radius-md:10px; --dsw-radius-sm:6px; --dsw-specific-menu:#2a2a2c; --dsw-menu-backdrop-filter:blur(20px);
    --dsw-alias-border-l1:rgba(255,255,255,.12); --dsw-alias-label-primary:#fff; --dsw-alias-label-tertiary:#999; --dsw-alias-scrollbar-bg-l2:rgba(255,255,255,.2); --dsw-alias-scrollbar-hover-l2:rgba(255,255,255,.35); }
  body{margin:0;background:#111;font-family:-apple-system,sans-serif;}
  .stack{display:flex;flex-direction:column;gap:var(--dsh-composer-stack-gap);padding:10px;}
  .card{background:#232325;border-radius:16px;height:80px;margin:0 auto;width:calc(100% - 32px);}
  /* 模拟 App 侧 pre-wrap 干扰源（__dshMobileFit 时代规则命中 _text_） */
  .sim-inject [class*="_text_"]{white-space:pre-wrap !important;}
  </style></head><body>
  <div class="stack sim-inject" id="stack">
    <div class="x1ZYoW_dock" data-queue-dock=""><div class="x1ZYoW_panel">
      <ul class="x1ZYoW_list"><li class="x1ZYoW_row">
        <span class="x1ZYoW_lead">😊</span>
        <span class="x1ZYoW_preview"><span class="_abc__text_1">那行修复策略问题，不加wb做引擎，怕费用明细筛选出问题影响结算准确性需要认真核对每一笔账单明细与折扣规则是否一致</span></span>
        <div class="x1ZYoW_actions"><button>🗑</button></div>
      </li></ul>
    </div></div>
    <div class="_6qvijW_dock"><div class="_6qvijW_bar"><span>↑</span><span>0%</span><span class="goal_text_">费用明细筛选与结算校验</span></div></div>
    <div class="card"></div>
  </div>
  </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.addStyleTag({ content: qcss + '\n' + gcss });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const q = document.querySelector('[data-queue-dock]').getBoundingClientRect();
    const g = document.querySelector('._6qvijW_dock').getBoundingClientRect();
    const pv = document.querySelector('.x1ZYoW_preview').getBoundingClientRect();
    return { queue: { y: q.y, h: q.height, bottom: q.bottom }, goal: { y: g.y, h: g.height }, preview: { y: pv.y, h: pv.height }, overlap: g.y < q.bottom - 1 };
  });
  console.log('BEFORE fix:', JSON.stringify(before));
  await page.screenshot({ path: '_fix_q_before.png' });
  // 应用修法（shim 拟加的 CSS）
  const fix = `
  [data-queue-dock] { margin-bottom: 0 !important; }
  [data-queue-dock] [class*="_preview"], [data-queue-dock] [class*="_preview"] * { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; min-width: 0 !important; }
  [data-queue-dock] [class*="_row"] { flex-wrap: nowrap !important; }
  `;
  await page.addStyleTag({ content: fix });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const q = document.querySelector('[data-queue-dock]').getBoundingClientRect();
    const g = document.querySelector('._6qvijW_dock').getBoundingClientRect();
    const pv = document.querySelector('.x1ZYoW_preview').getBoundingClientRect();
    return { queue: { y: q.y, h: q.height, bottom: q.bottom }, goal: { y: g.y, h: g.height }, preview: { y: pv.y, h: pv.height }, overlap: g.y < q.bottom - 1 };
  });
  console.log('AFTER fix:', JSON.stringify(after));
  await page.screenshot({ path: '_fix_q_after.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
