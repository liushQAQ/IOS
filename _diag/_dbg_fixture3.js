const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
const src = fs.readFileSync(DIR + '/verify_ui4_fixture.js', 'utf8');
const FIXTURE = src.match(/const FIXTURE = `([\s\S]*?)`;/)[1];
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route('**/_fixture.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
  await p.goto('http://127.0.0.1:3083/_fixture.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2200);
  const dbg = await p.evaluate(() => {
    const NATIVE = ['VERcba_', '_727C8a_', 'ank0OG_', 'CZPbNW_', 'WBG7Rq_', 'NwyCaq_', 'VYXhfG_', 'dMHGga_', 'ZiQlkq_', 'YdIzba_', 'PPCmka_', 'WYye1W_', 'bqwwaa_', 'bqwvaa_', 'z4IYsq_', 'tklpSG_', 'JZoinq_', '7aoaqW_', 'ZKHwIG_', 'dsh-mobile-', 'dsh-ios-'];
    function isNativeCls(cn) { for (var i = 0; i < NATIVE.length; i++) { if (cn.indexOf(NATIVE[i]) === 0) return true; } return false; }
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const cr = card.getBoundingClientRect();
    const top = cr.top - 2, bot = cr.top + 42;
    const hits = [];
    const all = card.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cn = (el.className || '').toString();
      if (!cn || isNativeCls(cn)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.width > 280 || r.height < 14 || r.height > 46) continue;
      const cy2 = r.top + r.height / 2;
      if (cy2 < top || cy2 > bot) continue;
      hits.push({ cls: cn.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), cy: Math.round(cy2), band: [Math.round(top), Math.round(bot)], cardTop: Math.round(cr.top) });
    }
    return { cardTop: Math.round(cr.top), hits };
  });
  console.log(JSON.stringify(dbg, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
