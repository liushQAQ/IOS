const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true, proxy: { server: 'direct://' } });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  const errs=[], cons=[];
  p.on('pageerror', e=>errs.push(String(e.message).slice(0,150)));
  p.on('console', m=>{ if(m.type()==='error') cons.push(String(m.text()).slice(0,150)); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  for (let i=1;i<=8;i++){
    await p.waitForTimeout(5000);
    const s = await p.evaluate(()=>({ nodes: document.body.querySelectorAll('*').length, text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,60) }));
    console.log('t='+(i*5)+'s', JSON.stringify(s));
    if (s.nodes>60) break;
  }
  console.log('pageerror', errs.length, errs.slice(0,3));
  console.log('consoleerr', cons.length, cons.slice(0,3));
  await p.screenshot({ path:'g4_after.png' });
  await b.close();
})();
