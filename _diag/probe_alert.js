const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');
(async()=>{
  const b=await webkit.launch({headless:true});
  const c=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:UA,colorScheme:'dark'});
  const p=await c.newPage();
  await p.goto('http://127.0.0.1:3083/',{waitUntil:'load',timeout:60000});
  await p.waitForFunction(()=>document.body&&document.body.querySelectorAll('*').length>60,null,{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(7000);
  await p.evaluate(({js})=>{try{(0,eval)(js);}catch(e){}
    if(window.__dshLayoutFix)window.__dshLayoutFix();}, {js:APP_JS});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{const x=document.querySelector('[aria-label="打开侧边栏"]')||document.querySelector('[aria-label="打开左侧侧边栏"]');if(x)x.click();});
  await p.waitForTimeout(2000);
  await p.evaluate(()=>{if(window.__dshLayoutFix)window.__dshLayoutFix();});
  await p.waitForTimeout(1200);
  const r = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('[class*="cm-peak-alert"]').forEach(el=>{
      const q=el.getBoundingClientRect(); const cs=getComputedStyle(el);
      out.push({cls:String(el.className).slice(0,60), pos:cs.position, x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height),right:Math.round(q.right),
        parent:String(el.parentElement&&el.parentElement.className||'').slice(0,40), z:cs.zIndex, disp:cs.display});
    });
    const sb=document.querySelector('[class*="sidebarCol"]');
    const g=Array.from(document.querySelectorAll('button[aria-label="设置"]')).filter(b=>getComputedStyle(b).position==='fixed')[0];
    let ginfo=null;
    if(g){const gq=g.getBoundingClientRect();
      const hit=document.elementFromPoint(gq.x+gq.width/2,gq.y+gq.height/2);
      ginfo={rect:[Math.round(gq.x),Math.round(gq.y),Math.round(gq.width),Math.round(gq.height)],
        hit:hit?String(hit.className||hit.tagName).slice(0,50)+' | '+String(hit.getAttribute&&hit.getAttribute('aria-label')||''):'null',
        stack:document.elementsFromPoint(gq.x+gq.width/2,gq.y+gq.height/2).slice(0,5).map(e=>String(e.className||e.tagName).slice(0,40))};
    }
    return {alerts:out, drawerRight: sb?Math.round(sb.getBoundingClientRect().right):null, gear:ginfo,
      swipe: document.documentElement.scrollWidth};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
