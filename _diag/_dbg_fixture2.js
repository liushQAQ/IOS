const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
let APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
APP_JS = APP_JS.replace(
  "var sumW = 0;",
  "var sumW = 0; console.log('LAYOUT ws=' + JSON.stringify(ws) + ' cw=' + Math.round(cr.width) + ' total=' + Math.round(total) + ' n=' + n);"
);
const src = fs.readFileSync(DIR + '/verify_ui4_fixture.js', 'utf8');
const FIXTURE = src.match(/const FIXTURE = `([\s\S]*?)`;/)[1];
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('console', msg => { const t = msg.text(); if (t.startsWith('LAYOUT')) console.log(t); });
  await p.route('**/_fixture.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
  await p.goto('http://127.0.0.1:3083/_fixture.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  for (let i = 0; i < 5; i++) {
    await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR', e.message); } }, { js: APP_JS });
    await p.waitForTimeout(1200);
  }
  const st = await p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return s + ' w=' + Math.round(r.width) + ' style=' + e.getAttribute('style'); };
    return [g('.dcc-root'), g('.dsh-po-capsule'), g('.cm-stat-entry')];
  });
  console.log(st.join('\n'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
