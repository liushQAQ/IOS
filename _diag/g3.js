const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  const errs=[], cons=[], fails=[];
  p.on('pageerror', e=>errs.push(String(e.message).slice(0,200)));
  p.on('console', m=>{ if(m.type()==='error') cons.push(String(m.text()).slice(0,200)); });
  p.on('requestfailed', r=>fails.push(r.url().slice(0,90)+' :: '+(r.failure()&&r.failure().errorText)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  for (const t of [10,20,30,45,60]) {
    await p.waitForTimeout(t===10?10000:(t===20?10000:(t===30?10000:(t===45?15000:15000))));
    const s = await p.evaluate(()=>({
      root: (document.querySelector('#root')||{}).innerHTML ? document.querySelector('#root').innerHTML.length : -1,
      text: (document.body.innerText||'').replace(/\s+/g,' ').slice(0,80),
      nodes: document.body.querySelectorAll('*').length
    }));
    console.log('t='+t+'s', JSON.stringify(s));
    if (s.nodes > 60) break;
  }
  console.log('pageerror', errs.length, errs.slice(0,4));
  console.log('console.error', cons.length, cons.slice(0,4));
  console.log('reqfailed', fails.length, fails.slice(0,6));
  await p.screenshot({ path:'g3_after.png' });
  await b.close();
})();
