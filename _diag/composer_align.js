const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

const PROBE = () => {
  const seat = document.querySelector('[class*="composerStack"]') || document.body;
  const out = [];
  if (!seat) return out;
  seat.querySelectorAll('button, [role="button"]').forEach(btn => {
    const bq = btn.getBoundingClientRect();
    if (bq.width < 14 || bq.width > 80 || bq.height < 14 || bq.height > 80) return;
    const cs = getComputedStyle(btn);
    if (cs.display === 'none') return;
    const svg = btn.querySelector('svg');
    const sq = svg ? svg.getBoundingClientRect() : null;
    out.push({
      cls: String(btn.className || '').slice(0, 34),
      bx: Math.round(bq.x * 10) / 10, by: Math.round(bq.y * 10) / 10,
      bw: Math.round(bq.width * 10) / 10, bh: Math.round(bq.height * 10) / 10,
      bcy: Math.round((bq.y + bq.height / 2) * 10) / 10,
      disp: cs.display, pad: cs.padding, ai: cs.alignItems, jc: cs.justifyContent,
      gap: cs.gap, lh: cs.lineHeight, fs: cs.fontSize,
      svg: sq ? Math.round(sq.width * 10) / 10 + 'x' + Math.round(sq.height * 10) / 10 : null,
      dCenterY: sq ? Math.round(((sq.y + sq.height / 2) - (bq.y + bq.height / 2)) * 10) / 10 : null,
      dCenterX: sq ? Math.round(((sq.x + sq.width / 2) - (bq.x + bq.width / 2)) * 10) / 10 : null,
    });
  });
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const before = await p.evaluate(PROBE);
  console.log('=== 修复前：按钮 vs 图标中心偏移（正数=图标偏下/偏右）===');
  before.forEach(o => console.log('  ' + (o.cls || '(无类名)').padEnd(26) + ' ' + o.bw + 'x' + o.bh + ' @(' + o.bx + ',' + o.by + ') cy=' + o.bcy +
    ' disp=' + o.disp + ' pad=' + o.pad + ' svg=' + o.svg + '  Δy=' + o.dCenterY + ' Δx=' + o.dCenterX));

  // 注入 App CSS 后再测
  await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, CSS);
  await p.waitForTimeout(600);
  const withApp = await p.evaluate(PROBE);
  console.log('\n=== 注入 App 现有 CSS 后 ===');
  withApp.forEach(o => console.log('  ' + (o.cls || '(无类名)').padEnd(26) + ' ' + o.bw + 'x' + o.bh + ' @(' + o.bx + ',' + o.by + ') cy=' + o.bcy + '  Δy=' + o.dCenterY + ' Δx=' + o.dCenterX));

  await b.close();
})();
