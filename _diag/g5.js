const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  const errs=[], cons=[], nav=[];
  p.on('pageerror', e=>errs.push(String(e.message).slice(0,150)));
  p.on('console', m=>{ if(m.type()==='error') cons.push(String(m.text()).slice(0,150)); });
  p.on('framenavigated', f=>{ if(f===p.mainFrame()) nav.push(f.url().slice(0,60)); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  for (let i=1;i<=8;i++){
    await p.waitForTimeout(4000);
    const s = await p.evaluate(()=>({ nodes: document.body.querySelectorAll('*').length, text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,60) }));
    console.log('t='+(i*4)+'s', JSON.stringify(s));
    if (s.nodes>60) break;
  }
  console.log('nav', nav.length, nav.slice(0,5));
  console.log('pageerror', errs.length, errs.slice(0,3));
  console.log('consoleerr', cons.length, cons.slice(0,3));
  await p.screenshot({ path:'g5_chromium.png' });
  await b.close();
})();
