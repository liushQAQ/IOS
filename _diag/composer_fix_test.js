const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const MEASURE = () => {
  const pick = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return { y: Math.round(q.y * 10) / 10, h: Math.round(q.height * 10) / 10, cy: Math.round((q.y + q.height / 2) * 10) / 10 }; };
  const svgDelta = (sel) => {
    const e = document.querySelector(sel); if (!e) return null;
    const bq = e.getBoundingClientRect(); const svg = e.querySelector('svg');
    if (!svg) return null; const sq = svg.getBoundingClientRect();
    return {
      dy: Math.round(((sq.y + sq.height / 2) - (bq.y + bq.height / 2)) * 10) / 10,
      dx: Math.round(((sq.x + sq.width / 2) - (bq.x + bq.width / 2)) * 10) / 10,
    };
  };
  return {
    row: pick('[class*="_row"]'),
    add: pick('[class*="_add"]'),
    primary: pick('[class*="_primary"]'),
    gear: pick('.dsh-po-btn-gear'),
    addSvg: svgDelta('[class*="_add"]'),
    primarySvg: svgDelta('[class*="_primary"]'),
    gearSvg: svgDelta('.dsh-po-btn-gear'),
  };
};

const FIX = `
/* 抽屉/会话框按钮：一律 flex 居中 + 清掉不对称 padding */
[class*="composerStack"] [class*="_row"] {
  align-items: center !important;
}
[class*="composerStack"] [class*="_add"],
[class*="composerStack"] [class*="_primary"],
[class*="composerStack"] [class*="_send"],
[class*="composerStack"] [class*="_stop"],
[class*="composerStack"] [class*="_attach"],
[class*="composerStack"] [class*="_voice"],
[class*="composerStack"] [class*="_mic"],
[class*="composerStack"] .dsh-po-btn-gear,
[class*="composerStack"] .dsh-po-btn-opt {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  margin: 0 !important;
  align-self: center !important;
  box-sizing: border-box !important;
}
[class*="composerStack"] [class*="_add"] > svg,
[class*="composerStack"] [class*="_primary"] > svg,
[class*="composerStack"] [class*="_send"] > svg,
[class*="composerStack"] [class*="_stop"] > svg,
[class*="composerStack"] [class*="_attach"] > svg,
[class*="composerStack"] [class*="_voice"] > svg,
[class*="composerStack"] [class*="_mic"] > svg,
[class*="composerStack"] .dsh-po-btn-gear > svg,
[class*="composerStack"] .dsh-po-btn-opt > svg {
  display: block !important;
  margin: auto !important;
  flex: 0 0 auto !important;
}
`;

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  console.log('原始（无 App CSS）:');
  console.log('  ' + JSON.stringify(await p.evaluate(MEASURE)));

  await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, FIX);
  await p.waitForTimeout(700);
  console.log('施加修复后:');
  console.log('  ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.screenshot({ path: 'composer_fixed_430.png' });
  await b.close();
})();
