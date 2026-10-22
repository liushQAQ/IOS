const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:700}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1500);

  // 1) 手动点账号菜单，看弹层
  await p.evaluate(()=>{ const a=document.querySelector('[aria-label="账号菜单"]'); if(a) a.click(); });
  await p.waitForTimeout(1200);
  const pop = await p.evaluate(()=>{
    const cand=[...document.querySelectorAll('[role="menu"],[role="menuitem"],div,ul')]
      .map(el=>({el, t:(el.textContent||'').replace(/\s+/g,' ').trim(), r:el.getBoundingClientRect()}))
      .filter(o=>o.t && /设置/.test(o.t) && o.t.length<40 && o.r.width>60 && o.r.height>20 && o.r.height<400);
    return cand.slice(0,6).map(o=>({t:o.t.slice(0,40), x:Math.round(o.r.x), y:Math.round(o.r.y), w:Math.round(o.r.width), h:Math.round(o.r.height), tag:o.el.tagName, role:o.el.getAttribute('role')}));
  });
  console.log('含「设置」的候选弹层:', JSON.stringify(pop, null, 1));
  await p.screenshot({ path:'g9_menu.png' });

  // 2) 关闭弹层（点空白）
  await p.mouse.click(20, 300);
  await p.waitForTimeout(800);

  // 3) 点齿轮
  const g = await p.evaluate(()=>{ const el=document.querySelector('button[aria-label="设置"]'); if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),d:getComputedStyle(el).display}; });
  console.log('齿轮:', JSON.stringify(g));
  if (g && g.d!=='none') {
    await p.mouse.click(g.x+g.w/2, g.y+g.h/2);
    await p.waitForTimeout(600);  await p.screenshot({ path:'g9_t600.png' });
    await p.waitForTimeout(1600); await p.screenshot({ path:'g9_t2200.png' });
    const t = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(-200));
    console.log('尾部文案:', t);
  }
  await b.close();
})();
