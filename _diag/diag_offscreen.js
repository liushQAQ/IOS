const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  for (const [W,H] of [[390,740],[375,667],[320,568]]) {
    const c = await b.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
    await p.waitForTimeout(12000);
    const r = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const out = { vw, vh, off: [], gear: null, all: [] };
      const g = document.querySelector('.dsh-po-btn-gear');
      if (g) { const rr = g.getBoundingClientRect(); out.gear = { x:Math.round(rr.x), y:Math.round(rr.y), w:Math.round(rr.width), h:Math.round(rr.height), visible: rr.x>=0 && rr.y>=0 && rr.right<=vw && rr.bottom<=vh }; }
      for (const el of document.querySelectorAll('button,[role="button"],a')) {
        const rr = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (rr.width === 0 || rr.height === 0) continue;
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const t = (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,14) || el.getAttribute('aria-label') || String(el.className||'').slice(0,24);
        const bad = rr.right > vw + 1 || rr.bottom > vh + 1 || rr.x < -1 || rr.y < -1;
        const o = { t, x:Math.round(rr.x), y:Math.round(rr.y), w:Math.round(rr.width), h:Math.round(rr.height) };
        if (bad) out.off.push(o);
        out.all.push(o);
      }
      return out;
    });
    console.log('\n===== 视口 ' + W + 'x' + H + ' =====');
    console.log('齿轮:', JSON.stringify(r.gear));
    console.log('溢出视口的按钮(' + r.off.length + '):');
    r.off.forEach(o=>console.log('  🔴 ' + JSON.stringify(o)));
    console.log('全部按钮数:', r.all.length, ' | 最靠右下:', JSON.stringify(r.all.sort((a,b)=>(b.y+b.h)-(a.y+a.h)||(b.x+b.w)-(a.x+a.w)).slice(0,3)));
    await c.close();
  }
  await b.close();
})();
