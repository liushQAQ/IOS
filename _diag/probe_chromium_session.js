const { webkit } = require('playwright');
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('TIMEOUT_SENTINEL'), ms))]);

(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto('http://127.0.0.1:3081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  const t0 = await race(page.evaluate(() => document.body.innerText.slice(0, 200)), 20000);
  console.log('PAGE:', String(t0).replace(/\n/g, ' | ').slice(0, 200));

  // open sidebar
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
    }
    if (best) best.click();
  }).catch(e => console.log('sidebar fail', e.message.slice(0, 60)));
  await page.waitForTimeout(2500);
  const ok = await race(page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return true; }
    }
    return false;
  }), 20000);
  console.log('session click:', ok);
  await page.waitForTimeout(15000);

  const report = await race(page.evaluate(() => {
    const out = { rows: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').trim();
      if (!t || !/^(运行命令|思考|工具调用|搜索|读取|写入|编辑|代码)/.test(t)) continue;
      const span = n.parentElement;
      if (!span || seen.has(span)) continue;
      seen.add(span);
      const r = span.getBoundingClientRect();
      if (r.width === 0 || r.top > innerHeight) continue;
      const chain = [];
      let el = span;
      for (let i = 0; i < 6 && el && el !== document.body; i++) {
        const cc = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        chain.push([el.tagName, String(el.className).slice(0, 55), 'h' + b.height.toFixed(0), 'w' + b.width.toFixed(0),
          'ws:' + cc.whiteSpace, 'ov:' + cc.overflow, 'lh:' + cc.lineHeight, 'fs:' + cc.fontSize, cc.display + '/' + cc.position].join(' '));
        el = el.parentElement;
      }
      out.rows.push({ t: t.slice(0, 55), h: +r.height.toFixed(1), w: +r.width.toFixed(1), chain });
      if (out.rows.length > 30) break;
    }
    out.rows.sort((a, b) => b.h - a.h);
    return out;
  }), 30000);
  if (report === 'TIMEOUT_SENTINEL') console.log('EVAL HUNG');
  else {
    console.log('rows:', report.rows.length);
    for (const r of report.rows.slice(0, 8)) {
      console.log('\nTEXT:', r.t, '| h=' + r.h, 'w=' + r.w);
      r.chain.forEach(c => console.log('   ', c));
    }
  }
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/probe_webkit_session.png' }).catch(e => console.log('shot fail'));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
