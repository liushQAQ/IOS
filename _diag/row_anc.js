const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, CSS);
  await p.waitForTimeout(500);

  const r = await p.evaluate(() => {
    const add = document.querySelector('[class*="_add"]');
    const pri = document.querySelector('[class*="_primary"]');
    if (!add || !pri) return { err: 'not found' };
    // 公共祖先
    const anc = [];
    let cur = add.parentElement;
    while (cur) { anc.push(cur); cur = cur.parentElement; }
    const common = anc.find(a => a.contains(pri));
    const info = [];
    let n = add.parentElement, i = 0;
    while (n && i < 6) {
      const cs = getComputedStyle(n);
      const q = n.getBoundingClientRect();
      info.push({
        cls: String(n.className || '').slice(0, 44), w: Math.round(q.width), h: Math.round(q.height),
        disp: cs.display, ai: cs.alignItems, jc: cs.justifyContent, gap: cs.gap,
        isCommon: n === common,
      });
      n = n.parentElement; i++;
    }
    const pinfo = [];
    let q2 = pri; let j = 0;
    while (q2 && j < 5) {
      const cs2 = getComputedStyle(q2); const qq = q2.getBoundingClientRect();
      pinfo.push({
        cls: String(q2.className || "").slice(0, 40),
        y: Math.round(qq.y*10)/10, h: Math.round(qq.height*10)/10, cy: Math.round((qq.y+qq.height/2)*10)/10,
        disp: cs2.display, ai: cs2.alignItems, aself: cs2.alignSelf,
        mt: cs2.marginTop, mb: cs2.marginBottom, pt: cs2.paddingTop, pb: cs2.paddingBottom,
      });
      q2 = q2.parentElement; j++;
    }
    return { commonCls: common ? String(common.className).slice(0, 60) : null, chain: info, primary: pinfo };

  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
