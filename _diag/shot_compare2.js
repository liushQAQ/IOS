const { chromium } = require('playwright');
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('SENTINEL'), ms))]);

const FIX_CSS = `
.dcc-btn { height: 28px !important; align-self: center !important; border-radius: 8px !important; }
[class*="composerStack"] [class*="standardControls"] { padding-right: 48px !important; box-sizing: border-box !important; }
.cm-stat-entry { font-size: 11px !important; padding: 3px 9px !important; border: none !important; background: transparent !important; box-shadow: none !important; color: var(--dsw-alias-label-tertiary) !important; flex: none !important; margin-right: 4px !important; white-space: nowrap !important; }
.cm-bbox { border: none !important; background: transparent !important; box-shadow: none !important; font-size: 11px !important; padding: 0 2px !important; gap: 4px !important; }
.cm-bbox .cm-mm-title, .cm-bbox .cm-gw-sub { font-size: 11px !important; }
span[data-shimmer] > span[inert] { display: none !important; }
span[data-shimmer-text] { white-space: nowrap !important; }
span[data-shimmer] span[class*="_label"], span[data-shimmer] span[class*="_summaryText"], span[data-shimmer] span[class*="_summary"] {
  min-width: 0 !important; max-width: 100% !important; overflow: hidden !important;
  text-overflow: ellipsis !important; white-space: nowrap !important;
}
.ofm_toasts { pointer-events: none !important; }
.ofm_toast { max-width: 64vw !important; font-size: 11px !important; line-height: 15px !important; padding: 8px 10px 8px 12px !important; pointer-events: auto !important; }
`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  console.log('PAGE:', String(await race(page.evaluate(() => document.body.innerText.slice(0, 120)), 15000)).replace(/\n/g, '|'));

  // open sidebar
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
    }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);

  // click latest session
  const ok = await race(page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return t.slice(0, 30); }
    }
    // fallback: first session row
    const row = document.querySelector('[class*="sessionRow"]');
    if (row) { row.click(); return 'first-session-row'; }
    return null;
  }), 15000);
  console.log('session:', ok);
  await page.waitForTimeout(9000);

  // scroll conversation to bottom
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => { try { if (el.scrollHeight > el.clientHeight + 40) el.scrollTop = el.scrollHeight; } catch (e) {} });
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => {});
  await page.waitForTimeout(1500);

  // BEFORE
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shot_before_full.png' });
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shot_before_composer.png', clip: { x: 0, y: 780, width: 430, height: 152 } });

  // apply fix shims
  await page.addStyleTag({ content: FIX_CSS });
  await page.waitForTimeout(1200);

  // AFTER
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shot_after_full.png' });
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shot_after_composer.png', clip: { x: 0, y: 780, width: 430, height: 152 } });

  // measure key elements
  const m = await race(page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(0), y: +b.y.toFixed(0), w: +b.width.toFixed(0), h: +b.height.toFixed(0) }; };
    const cap = q('.dcc-btn');
    const stat = q('.cm-stat-entry');
    const bbox = q('.cm-bbox');
    const sc = q('[class*="standardControls"]');
    const send = q('[class*="primary"]');
    return { capsule: rect(cap), capsuleH: cap ? getComputedStyle(cap).height : null, statEntry: rect(stat), bbox: rect(bbox), stdControls: rect(sc), sendBtn: rect(send) };
  }), 15000);
  console.log('MEASURE:', JSON.stringify(m));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
