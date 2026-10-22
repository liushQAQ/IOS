const { webkit } = require('playwright');
const T = 'http://127.0.0.1:9060/dsh/?password=Liu326766@';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:430,height:932}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  const bad = [];
  p.on('response', r => { const s = r.status(); if (s >= 400) bad.push(s + ' ' + r.url().slice(-70)); });
  p.on('pageerror', e => bad.push('pageerror ' + e.message.slice(0,120)));
  await p.goto(T, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const stages = [];
  for (const ms of [3000, 4000, 5000, 6000, 8000]) {
    await p.waitForTimeout(ms);
    const s = await p.evaluate(() => { const r=document.getElementById('root'); return { root:!!r, kids:r?r.children.length:-1, textLen:r?String(r.innerText||'').trim().length:-1, head:r?String(r.innerText||'').replace(/\s+/g,' ').slice(0,40):'' }; });
    stages.push(s);
    if (s.textLen > 60) break;
  }
  await b.close();
  console.log('阶段:', JSON.stringify(stages));
  console.log('异常(' + bad.length + '):'); bad.slice(0,10).forEach(x=>console.log('  - '+x));
})();
