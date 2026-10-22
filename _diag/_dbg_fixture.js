const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
// 从 verify 脚本里抓夹具 HTML
const src = fs.readFileSync(DIR + '/verify_ui4_fixture.js', 'utf8');
const m = src.match(/const FIXTURE = `([\s\S]*?)`;/);
const FIXTURE = m[1];
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('console', msg => console.log('PAGE:', msg.text().slice(0, 300)));
  await p.route('**/_fixture.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
  await p.goto('http://127.0.0.1:3083/_fixture.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR', e.message); } }, { js: APP_JS });
  await p.waitForTimeout(2500);
  const dbg = await p.evaluate(() => {
    const out = {};
    const cards = document.querySelectorAll('[class*="_card"]');
    out.cardCount = cards.length;
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const cr = card.getBoundingClientRect();
    out.card = { l: cr.left, r: cr.right, w: cr.width, t: cr.top };
    const styles = Array.from(document.querySelectorAll('style')).map(s => (s.id || 'inline') + ':' + s.textContent.length);
    out.styles = styles;
    const tg = document.querySelector('[class*="_trigger"]');
    out.trigInline = tg ? tg.getAttribute('style') : null;
    out.trigCS = tg ? { mw: getComputedStyle(tg).maxWidth, w: getComputedStyle(tg).width } : null;
    const items = ['.dcc-root', '.dsh-po-capsule', '.cm-stat-entry'].map(s => { const e = document.querySelector(s); return { s, style: e.getAttribute('style'), cls: e.className }; });
    out.items = items;
    return out;
  });
  console.log(JSON.stringify(dbg, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
