const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const R = `(el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom),r2:Math.round(r.right)};})`;

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,150)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);

  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1800);

  const geo = await p.evaluate(() => {
    const R = el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom),rr:Math.round(r.right)};};
    const side = document.querySelector('[class*="sidebarCol"]');
    const acct = document.querySelector('[aria-label="账号菜单"]');
    const g = document.querySelector('button[aria-label="设置"]');
    const cs = g?getComputedStyle(g):null;
    return {
      vw:innerWidth, vh:innerHeight, docW: document.documentElement.scrollWidth,
      sidebar: R(side), sideCS: side?{pos:getComputedStyle(side).position, of:getComputedStyle(side).overflowY, z:getComputedStyle(side).zIndex}:null,
      acct: R(acct),
      gear: R(g), gearDisp: cs?cs.display:null,
      acctVisible: acct ? (acct.getBoundingClientRect().top>=0 && acct.getBoundingClientRect().bottom<=innerHeight) : false
    };
  });
  console.log('几何:', JSON.stringify(geo));
  await p.screenshot({ path:'g8_drawer.png' });

  if (geo.gear && geo.gearDisp!=='none') {
    await p.mouse.click(geo.gear.x+geo.gear.w/2, geo.gear.y+geo.gear.h/2);
    await p.waitForTimeout(2500);
    const after = await p.evaluate(()=>{
      const t=document.body.innerText.replace(/\s+/g,' ');
      return { promptPanel:/提示词优化|思考强度/.test(t), hits:['通用','外观','模型','账号','快捷键','关于','设置'].filter(k=>t.includes(k)), snip:t.slice(0,140) };
    });
    console.log('点齿轮后:', JSON.stringify(after));
    await p.screenshot({ path:'g8_clicked.png' });
  } else {
    console.log('齿轮不可见');
    await p.evaluate(()=>{ const a=document.querySelector('[aria-label="账号菜单"]'); if(a) a.click(); });
    await p.waitForTimeout(1500);
    const menu = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(-160));
    console.log('账号菜单内容:', menu);
    await p.screenshot({ path:'g8_menu.png' });
  }
  console.log('pageerror', errs.length, errs.slice(0,3));
  await b.close();
})();
