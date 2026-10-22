const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:430,height:932}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  const seen = new Set();
  p.on('response', r => { const u=r.url(); const ct=(r.headers()['content-type']||''); if (/javascript|ecmascript/.test(ct)||/\.js(\?|$)/.test(u)) seen.add(u); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(25000);
  await b.close();
  const list = [...seen];
  fs.writeFileSync('js_list.json', JSON.stringify(list.map(u=>({u}))));
  console.log('采集到 JS:', list.length);
  let i = 0;
  for (const u of list) {
    const r = await fetch(u); const t = await r.text();
    fs.writeFileSync('chk_' + (i++) + '.js', t);
    console.log('chk_' + (i-1) + '.js', String(t.length).padStart(9), r.status, u.slice(-55));
  }
})();
