const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  const dump = () => p.evaluate(()=>[...document.querySelectorAll('button,[role="button"]')]
      .map(e=>({a:e.getAttribute('aria-label')||'', c:String(e.className||'').slice(0,30), x:Math.round(e.getBoundingClientRect().x), y:Math.round(e.getBoundingClientRect().y)}))
      .filter(o=>/目录|侧|菜单|关/.test(o.a)));
  console.log('抽屉关闭时:', JSON.stringify(await dump()));
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1500);
  console.log('抽屉打开时:', JSON.stringify(await dump()));
  // 试着点同一个 toggle 关闭
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="关闭目录"]')||document.querySelector('[aria-label="打开目录"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);
  const sx = await p.evaluate(()=>{const s=document.querySelector('[class*="sidebarCol"]');return s?Math.round(s.getBoundingClientRect().x):null;});
  console.log('点 toggle 后 sidebar.x =', sx);
  await b.close();
})();
