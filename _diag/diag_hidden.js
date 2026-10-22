const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(12000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const col = document.querySelector('.MnhYfG_sidebarCol');
    if (!col) return { err:1 };
    const res = { text: [], gearInSidebar: [], allWithSettings: [] };
    // 抽屉内所有叶子文本
    for (const el of col.querySelectorAll('*')) {
      if (el.children.length) continue;
      const t = (el.textContent||'').trim();
      if (!t) continue;
      const rr = el.getBoundingClientRect();
      res.text.push({ t: t.slice(0,16), y:Math.round(rr.y), h:Math.round(rr.height) });
    }
    // 抽屉内 SVG/按钮
    for (const el of col.querySelectorAll('button,svg,[role="button"]')) {
      const rr = el.getBoundingClientRect();
      const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (/设置|setting|gear/i.test(aria) || /btn-gear/.test(String(el.className||''))) {
        res.gearInSidebar.push({ aria, cls:String(el.className||'').slice(0,30), y:Math.round(rr.y), w:Math.round(rr.width) });
      }
    }
    return res;
  });
  console.log('=== 抽屉内全部文本（y 递增）===');
  (r.text||[]).sort((a,b)=>a.y-b.y).forEach(o=>console.log('  y='+String(o.y).padStart(4)+' h='+o.h+'  '+o.t));
  console.log('=== 抽屉内设置/齿轮类元素 ===', JSON.stringify(r.gearInSidebar));
  await b.close();
})();
