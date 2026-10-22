const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const a=document.querySelector('[aria-label="账号菜单"]'); if(a) a.click(); });
  await p.waitForTimeout(600);
  // 直接点菜单里的「设置」
  await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('[role="menuitem"],button')];
    for(const el of btns){ const t=(el.textContent||'').replace(/\s+/g,''); if(t.indexOf('设置')===0){ el.click(); return; } }
  });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(()=>{
    const R=el=>{if(!el)return null;const q=el.getBoundingClientRect();return{x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height),r2:Math.round(q.right)};};
    const side=document.querySelector('[class*="sidebarCol"]');
    const rb=document.querySelector('[class*="rightbarCol"]');
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].map(el=>({cls:String(el.className||'').slice(0,30), r:R(el)}));
    // 找含「通用设置」的最外层可见容器
    let host=null;
    for(const el of document.querySelectorAll('div,section')){
      const t=el.textContent||'';
      if(t.includes('通用设置')&&t.includes('模型')&&t.length<3000){ host=el; }
    }
    return { vw:innerWidth, sidebar:R(side), rightbar:R(rb), dialogs, host:R(host), hostCls: host?String(host.className||'').slice(0,50):null,
             sideHidden: side?getComputedStyle(side).transform:null };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path:'g11_settings.png' });
  await b.close();
})();
