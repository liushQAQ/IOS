const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,150)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);

  const btns = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('button,[role="button"]').forEach((el,i)=>{
      const r=el.getBoundingClientRect();
      if(r.width<10||r.height<10) return;
      out.push({ i, aria: el.getAttribute('aria-label')||'', cls: String(el.className||'').slice(0,40),
                 x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
                 txt:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,18) });
    });
    return out;
  });
  console.log('可见按钮数:', btns.length);
  btns.filter(x=>x.y<200).slice(0,25).forEach(x=>console.log('  ', JSON.stringify(x)));
  await p.screenshot({ path:'g7_home.png' });
  console.log('pageerror', errs.length, errs.slice(0,3));
  await b.close();
})();
