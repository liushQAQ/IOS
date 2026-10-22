const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(12000);

  const sideX = () => p.evaluate(()=>{ const e=document.querySelector('.MnhYfG_sidebarCol'); return e?Math.round(e.getBoundingClientRect().x):null; });
  console.log('初始 抽屉 x =', await sideX());

  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);
  console.log('打开后 抽屉 x =', await sideX());

  // 1) 点遮罩（右侧空白处）
  await p.mouse.click(350, 400);
  await p.waitForTimeout(1200);
  console.log('点遮罩(350,400)后 抽屉 x =', await sideX());

  // 2) 若还开着，点抽屉内的「收起」按钮（logo 旁的图标）
  const stillOpen = (await sideX()) === 0;
  if (stillOpen) {
    const cl = await p.evaluate(()=>{ const e=document.querySelector('.qin2_W_trigger'); return null; });
    // 试 ESC
    await p.keyboard.press('Escape');
    await p.waitForTimeout(1000);
    console.log('按 ESC 后 抽屉 x =', await sideX());
  }

  // 3) 再点左上角那个按钮
  await p.mouse.click(30, 55);
  await p.waitForTimeout(1200);
  console.log('点左上角(30,55)后 抽屉 x =', await sideX());
  await p.screenshot({ path:'shot_afterclose.png' });
  await b.close();
})();
