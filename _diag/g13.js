const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const sx = p => p.evaluate(()=>{const s=document.querySelector('[class*="sidebarCol"]');return s?Math.round(s.getBoundingClientRect().x):null;});

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, isMobile:true, hasTouch:true, userAgent:UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(15000);
  console.log('初始 sidebar.x =', await sx(p));

  const open = async()=>{ await p.evaluate(()=>{const e=document.querySelector('[aria-label="打开侧边栏"]');if(e)e.click();}); await p.waitForTimeout(1200); };

  // 方式1：真实点击 toggle(240,82)
  await open();
  console.log('打开后 x =', await sx(p));
  await p.mouse.click(254, 96);
  await p.waitForTimeout(1200);
  console.log('方式1 真点 toggle 后 x =', await sx(p));

  // 方式2：JS 点收起侧边栏
  await open();
  await p.evaluate(()=>{const e=document.querySelector('[aria-label="收起侧边栏"]');if(e)e.click();});
  await p.waitForTimeout(1200);
  console.log('方式2 JS点收起后 x =', await sx(p));

  // 方式3：点遮罩 (350,300)
  await open();
  await p.mouse.click(350, 300);
  await p.waitForTimeout(1200);
  console.log('方式3 点遮罩后 x =', await sx(p));
  await b.close();
})();
