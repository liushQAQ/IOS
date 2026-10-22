/* v1.0.129 底排防挤爆 F2 实验：
   已定位真因——alignOptGear() 给胶囊及上溯 4 层内联写了 flex-wrap:nowrap!important，
   内联 !important 压过样式表，所以 CSS 修法无效（还会把胶囊压成 31px）。
   此处模拟「塞入 撤回/重优」后，逐个候选验证：越界、发送钮位置、composer 高度、按钮可点。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const FAKE = () => {
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  const cap = sc.querySelector(':scope > div > div');
  const box = document.createElement('div');
  box.id = '__fakeCapsuleBtns';
  box.style.cssText = 'display:flex;gap:6px;flex:0 0 auto;';
  for (const t of ['撤回', '重优']) {
    const b = document.createElement('button'); b.textContent = t;
    b.style.cssText = 'width:60px;height:30px;flex:0 0 auto;';
    box.appendChild(b);
  }
  cap.appendChild(box);
  return 'ok';
};

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const comp = document.querySelector('[class*="composerStack"]');
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  const cap = sc ? sc.querySelector(':scope > div > div') : null;
  const send = comp ? Array.from(comp.querySelectorAll('button')).find(b => (b.className || '').toString().includes('VERcba_primary')) : null;
  const box = (el) => el ? (r => ({ x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height) }))(el.getBoundingClientRect()) : null;
  const btns = [];
  comp.querySelectorAll('button').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4) return;
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    btns.push({ t: (b.textContent || '').trim().slice(0, 5) || 'btn', x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), w: Math.round(r.width),
      inView: r.right <= vw + 0.5 && r.x >= -0.5, clickable: !!(hit && (hit === b || b.contains(hit))) });
  });
  return {
    vw, over: btns.filter(b => b.right > vw + 0.5).map(b => b.t + '+' + (b.right - vw)),
    send: box(send), cap: box(cap), sc: box(sc), compH: box(comp).h,
    capWrap: cap ? getComputedStyle(cap).flexWrap : null,
    scWrap: sc ? getComputedStyle(sc).flexWrap : null,
    allClickable: btns.filter(b => !b.clickable).map(b => b.t),
    btns
  };
};

const CAND = {
  // 基线：现状（nowrap，不修）
  S0: () => {},
  // F1：胶囊换行(max-width 100%) + standardControls 换行，trailing 保持 nowrap
  F1: () => {
    const sc = document.querySelector('[class*="VERcba_standardControls"]');
    const cap = sc.querySelector(':scope > div > div');
    cap.style.setProperty('flex-wrap', 'wrap', 'important');
    cap.style.setProperty('max-width', '100%', 'important');
    cap.style.setProperty('row-gap', '4px', 'important');
    sc.style.setProperty('flex-wrap', 'wrap', 'important');
    sc.style.setProperty('row-gap', '4px', 'important');
    sc.style.setProperty('justify-content', 'flex-end', 'important');
  },
  // F2：F1 + 模型选择器允许收缩+省略号
  F2: () => {
    const sc = document.querySelector('[class*="VERcba_standardControls"]');
    const cap = sc.querySelector(':scope > div > div');
    cap.style.setProperty('flex-wrap', 'wrap', 'important');
    cap.style.setProperty('max-width', '100%', 'important');
    cap.style.setProperty('row-gap', '4px', 'important');
    sc.style.setProperty('flex-wrap', 'wrap', 'important');
    sc.style.setProperty('row-gap', '4px', 'important');
    sc.style.setProperty('justify-content', 'flex-end', 'important');
    Array.from(sc.querySelectorAll('button')).forEach(b => {
      if (cap.contains(b)) return;
      b.style.setProperty('max-width', '100%', 'important');
      b.style.setProperty('min-width', '0', 'important');
      b.style.setProperty('overflow', 'hidden', 'important');
      b.style.setProperty('text-overflow', 'ellipsis', 'important');
      b.style.setProperty('white-space', 'nowrap', 'important');
    });
  },
  // F3：F1 + 上溯一层（trailing 内层 wrapper）也换行，让整块（含发送钮）分两行
  F3: () => {
    const sc = document.querySelector('[class*="VERcba_standardControls"]');
    const cap = sc.querySelector(':scope > div > div');
    cap.style.setProperty('flex-wrap', 'wrap', 'important');
    cap.style.setProperty('max-width', '100%', 'important');
    cap.style.setProperty('row-gap', '4px', 'important');
    sc.style.setProperty('flex-wrap', 'wrap', 'important');
    sc.style.setProperty('row-gap', '4px', 'important');
    const tr = document.querySelector('[class*="VERcba_trailing"]');
    tr.style.setProperty('flex-wrap', 'wrap', 'important');
    tr.style.setProperty('justify-content', 'flex-end', 'important');
    tr.style.setProperty('row-gap', '4px', 'important');
  }
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2500);

  for (const [tag, apply] of Object.entries(CAND)) {
    // 每轮重置：移除假按钮 + 清掉上轮 inline
    await p.evaluate(() => {
      const f = document.getElementById('__fakeCapsuleBtns'); if (f) f.remove();
      const sc = document.querySelector('[class*="VERcba_standardControls"]');
      const cap = sc.querySelector(':scope > div > div');
      [cap, sc, document.querySelector('[class*="VERcba_trailing"]')].forEach(el => {
        if (!el) return;
        ['flex-wrap', 'row-gap', 'justify-content'].forEach(k => el.style.removeProperty(k));
        // 复原 shim 原本的 nowrap
        if (el === cap) el.style.setProperty('flex-wrap', 'nowrap', 'important');
      });
      Array.from(sc.querySelectorAll('button')).forEach(b2 => { ['max-width', 'min-width', 'overflow', 'text-overflow', 'white-space'].forEach(k => b2.style.removeProperty(k)); });
    });
    await p.waitForTimeout(500);
    await p.evaluate(FAKE);
    await p.waitForTimeout(500);
    await p.evaluate(apply);
    await p.waitForTimeout(900);
    const m = await p.evaluate(MEASURE);
    console.log('== ' + tag + ' over=' + JSON.stringify(m.over) + ' send=' + JSON.stringify(m.send) + ' cap=' + JSON.stringify(m.cap) + ' sc=' + JSON.stringify(m.sc) + ' compH=' + m.compH + ' capWrap=' + m.capWrap + ' scWrap=' + m.scWrap + ' 不可点=' + JSON.stringify(m.allClickable));
    console.log('   btns=' + JSON.stringify(m.btns));
    await p.screenshot({ path: path.join(DIR, 'wrap7_' + tag + '.png'), clip: { x: 0, y: 632, width: 430, height: 300 } });
  }
  await b.close();
})();
