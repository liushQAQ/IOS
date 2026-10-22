// 终验夹具：直接用 app_inject.css/js（84+新修复）验证排队行
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
    --dsw-radius-lg:16px; --dsw-radius-md:10px; --dsw-radius-sm:6px; --dsw-specific-menu:#2a2a2c; --dsw-menu-backdrop-filter:blur(20px);
    --dsw-alias-border-l1:rgba(255,255,255,.12); --dsw-alias-label-primary:#fff; --dsw-alias-label-tertiary:#999; }
  body{margin:0;background:#111;font-family:-apple-system,sans-serif;}
  .stack{display:flex;flex-direction:column;gap:var(--dsh-composer-stack-gap);padding:10px;}
  .card{background:#232325;border-radius:16px;height:80px;margin:0 auto;width:calc(100% - 32px);}
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
  <div id="root"></div><div data-mobile-nav="frame"></div>
  </body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.addStyleTag({ content: qcss + '\n' + gcss });
  // App 注入 CSS + JS（新修复在内）
  await page.addStyleTag({ content: fs.readFileSync('app_inject.css', 'utf8') });
  await page.evaluate(fs.readFileSync('app_inject.js', 'utf8')).catch(e => console.log('[js err]', String(e).slice(0, 150)));
  // 触发 shim 的 boot（DOM ready 已过，手动 dispatch 或等 interval）
  await page.waitForTimeout(3500);
  const res = await page.evaluate(() => {
    const q = document.querySelector('[data-queue-dock]').getBoundingClientRect();
    const g = document.querySelector('._6qvijW_dock').getBoundingClientRect();
    const pv = document.querySelector('.x1ZYoW_preview').getBoundingClientRect();
    const qd = document.querySelector('[data-queue-dock]');
    return { queueH: Math.round(q.height), goalY: Math.round(g.y), queueBottom: Math.round(q.bottom), previewH: Math.round(pv.height), overlap: g.y < q.bottom - 1, qfix: qd.getAttribute('data-dsh-qfix'), mb: getComputedStyle(qd).marginBottom };
  });
  console.log(JSON.stringify(res));
  const pass = res.previewH <= 26 && !res.overlap;
  console.log(pass ? 'PASS ✅' : 'FAIL ❌');
  await page.screenshot({ path: '_fix_q_final.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
