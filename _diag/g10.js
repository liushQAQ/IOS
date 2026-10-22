const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

async function probe(h) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:h}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(()=>{
    const R=el=>{if(!el)return null;const q=el.getBoundingClientRect();return{x:Math.round(q.x),y:Math.round(q.y),w:Math.round(q.width),h:Math.round(q.height),b:Math.round(q.bottom)};};
    const side=document.querySelector('[class*="sidebarCol"]');
    const acct=document.querySelector('[aria-label="账号菜单"]');
    // 遮罩候选
    const masks=[...document.querySelectorAll('div')].filter(el=>{
      const q=el.getBoundingClientRect(); const cs=getComputedStyle(el);
      return q.width>=100 && q.height>=innerHeight*0.7 && q.x>=200 && (cs.position==='fixed'||cs.position==='absolute');
    }).slice(0,5).map(el=>({cls:String(el.className||'').slice(0,40), r:R(el), z:getComputedStyle(el).zIndex, bg:getComputedStyle(el).backgroundColor}));
    return { vh:innerHeight, sidebar:R(side), acct:R(acct),
             acctDisp: acct?getComputedStyle(acct).display:null,
             gear:R(document.querySelector('button[aria-label="设置"]')),
             gearDisp: (()=>{const g=document.querySelector('button[aria-label="设置"]');return g?getComputedStyle(g).display:null;})(),
             masks };
  });
  console.log('vh='+h, JSON.stringify(r));
  await p.screenshot({ path:'g10_'+h+'.png' });
  await b.close();
}
(async()=>{ await probe(600); await probe(667); })();
