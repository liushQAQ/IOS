const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

async function run(h) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:h}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,120)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开侧边栏"]'); if(e) e.click(); });
  await p.waitForTimeout(1300);

  const before = await p.evaluate(()=>{
    const g=document.querySelector('button[aria-label="设置"]');
    const s=document.querySelector('[class*="sidebarCol"]');
    if(!g) return {gear:null};
    const r=g.getBoundingClientRect();
    const t=document.elementFromPoint(Math.round(r.x+r.width/2), Math.round(r.y+r.height/2));
    return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
             disp:getComputedStyle(g).display, onTop: t===g||g.contains(t), sideX: s?Math.round(s.getBoundingClientRect().x):null };
  });
  console.log('['+h+'] 齿轮:', JSON.stringify(before));
  await p.screenshot({ path:'v_'+h+'_before.png' });

  if (before.gear !== null) {
    await p.mouse.click(before.x+before.w/2, before.y+before.h/2);
    await p.waitForTimeout(2200);
    const after = await p.evaluate(()=>{
      const s=document.querySelector('[class*="sidebarCol"]');
      const pn=document.querySelector('[class*="tklpSG_panel"]');
      const t=document.body.innerText.replace(/\s+/g,' ');
      return { sideX: s?Math.round(s.getBoundingClientRect().x):null,
               panel: pn?(()=>{const q=pn.getBoundingClientRect();return{x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height)};})():null,
               hasGeneral: t.includes('通用设置'), hasPlugin: t.includes('内置插件'), tail: t.slice(-90) };
    });
    console.log('['+h+'] 点后:', JSON.stringify(after));
    await p.screenshot({ path:'v_'+h+'_after.png' });
  }
  console.log('['+h+'] 错误:', errs.length, errs.slice(0,2));
  await b.close();
}
(async()=>{ await run(740); await run(600); })();
