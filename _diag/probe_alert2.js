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
  await p.evaluate(({js})=>{try{(0,eval)(js);}catch(e){}}, {js:APP_JS});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{const x=document.querySelector('[aria-label="打开侧边栏"]')||document.querySelector('[aria-label="打开左侧侧边栏"]');if(x)x.click();});
  await p.waitForTimeout(2200);
  const r=await p.evaluate(()=>{
    const el=document.querySelector('.cm-peak-alert');
    if(!el) return {none:true};
    const chain=[]; let e=el;
    while(e&&chain.length<14){
      chain.push({tag:e.tagName, cls:String(e.className||'').slice(0,32), pos:getComputedStyle(e).position, z:getComputedStyle(e).zIndex, id:e.id||''});
      e=e.parentElement;
    }
    const g=Array.from(document.querySelectorAll('button[aria-label="设置"]')).filter(b=>getComputedStyle(b).position==='fixed')[0];
    return {chain, gearZ: g?getComputedStyle(g).zIndex:null, gearParent: g?String(g.parentElement.tagName)+'.'+String(g.parentElement.className||'').slice(0,30):null,
      hasDialog: !!document.querySelector('dialog[open]'),
      dialogs: Array.from(document.querySelectorAll('dialog')).map(d=>d.open+':'+String(d.className).slice(0,24))};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
