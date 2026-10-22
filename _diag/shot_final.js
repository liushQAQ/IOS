const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');
(async()=>{
  const b=await webkit.launch({headless:true});
  for (const [w,h,tag] of [[430,932,'430'],[393,852,'393'],[375,812,'375']]) {
    const c=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:UA,colorScheme:'dark'});
    const p=await c.newPage();
    await p.goto('http://127.0.0.1:3083/',{waitUntil:'load',timeout:60000});
    await p.waitForFunction(()=>document.body&&document.body.querySelectorAll('*').length>60,null,{timeout:60000}).catch(()=>{});
    await p.waitForTimeout(7000);
    await p.evaluate(({js})=>{try{(0,eval)(js);}catch(e){}
      window.__t=function(){try{if(window.__dshLayoutFix)window.__dshLayoutFix();}catch(e){}
        try{if(window.__dshSetStatusBar)window.__dshSetStatusBar(59);}catch(e){}};
      window.__t();}, {js:APP_JS});
    await p.waitForTimeout(1500);
    await p.evaluate(()=>window.__t());
    await p.evaluate(()=>{const x=document.querySelector('[aria-label="打开侧边栏"]')||document.querySelector('[aria-label="打开左侧侧边栏"]');if(x)x.click();});
    await p.waitForTimeout(2200);
    await p.evaluate(()=>window.__t());
    await p.waitForTimeout(3400);
    await p.evaluate(()=>window.__t());
    await p.waitForTimeout(900);
    await p.screenshot({path:'final124_'+tag+'.png'});
    console.log('final124_'+tag+'.png');
    await c.close();
  }
  await b.close();
})();
