const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

// v1.0.124 最终 CSS（与 Swift 一致）
const FINAL_CSS = `
[class*="composerStack"] [class*="_add"],
[class*="composerStack"] [class*="_primary"],
[class*="composerStack"] [class*="_send"],
[class*="composerStack"] [class*="_stop"],
[class*="composerStack"] [class*="_attach"],
[class*="composerStack"] [class*="_voice"],
[class*="composerStack"] [class*="_mic"],
[class*="composerStack"] .dsh-po-btn-gear,
[class*="composerStack"] .dsh-po-btn-opt {
  display: flex !important; align-items: center !important; justify-content: center !important;
  padding: 0 !important; box-sizing: border-box !important;
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
  display: block !important; margin: auto !important; flex: 0 0 auto !important;
}
[class*="composerStack"] [class*="_row"] { align-items: center !important; }
[class*="composerStack"] [class*="_primary"],
[class*="composerStack"] [class*="_send"],
[class*="composerStack"] [class*="_stop"] { transform: none !important; }
`;

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const mode of ['before', 'after']) {
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);
    if (mode === 'after') {
      await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, FINAL_CSS);
      await p.waitForTimeout(700);
    }
    // 裁输入卡片区域
    const box = await p.evaluate(() => {
      const card = document.querySelector('[class*="_card"]') || document.querySelector('[class*="composerStack"]');
      const q = card.getBoundingClientRect();
      return { x: Math.max(0, Math.round(q.x) - 10), y: Math.max(0, Math.round(q.y) - 10), width: Math.min(innerWidth, Math.round(q.width) + 20), height: Math.round(q.height) + 20 };
    });
    await p.screenshot({ path: 'composer_' + mode + '_crop.png', clip: box });
    await c.close();
  }
  await b.close();
})();
