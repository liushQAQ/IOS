const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' });
  const p = await c.newPage();
  const bad=[], fails=[], errs=[];
  p.on('pageerror', e=>errs.push(String(e.message).slice(0,180)));
  p.on('response', r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url().slice(0,110)); });
  p.on('requestfailed', r=>fails.push((r.failure()&&r.failure().errorText)+' '+r.url().slice(0,110)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 }).catch(e=>console.log('goto err',e.message.slice(0,80)));
  await p.waitForTimeout(20000);
  const s = await p.evaluate(()=>({ nodes: document.body.querySelectorAll('*').length, html: document.documentElement.outerHTML.length, hasRoot: !!document.getElementById('root') }));
  console.log('state', JSON.stringify(s));
  console.log('--- 4xx/5xx ---'); bad.forEach(x=>console.log(' ', x));
  console.log('--- requestfailed ---'); fails.forEach(x=>console.log(' ', x));
  console.log('--- pageerror ---', errs.length); errs.slice(0,5).forEach(x=>console.log(' ', x));
  await b.close();
})();
