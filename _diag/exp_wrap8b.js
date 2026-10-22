/* v1.0.129 底排防挤爆 最终验收：不注入任何额外 CSS，只跑 App 自己的 shim。
   断言：① 静止态布局零变化（capsule nowrap、发送钮 x370..404）
        ② 塞入 撤回/重优 后 shim 自动换行、零越界、发送钮不动、全部可点
        ③ 撤掉状态按钮后自动还原 */
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
  return cap.getBoundingClientRect().width;
};

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const comp = document.querySelector('[class*="composerStack"]');
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  const cap = sc ? sc.querySelector(':scope > div > div') : null;
  const send = comp ? Array.from(comp.querySelectorAll('button')).find(b => (b.className || '').toString().includes('VERcba_primary')) : null;
  const rect = (el) => el ? (r => ({ x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height) }))(el.getBoundingClientRect()) : null;
  const btns = [];
  comp.querySelectorAll('button').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4) return;
    const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    btns.push({ t: (b.textContent || '').trim().slice(0, 6) || 'btn', x: Math.round(r.x), right: Math.round(r.right),
      over: r.right > vw + 0.5, click: !!(hit && (hit === b || b.contains(hit))) });
  });
  return { vw, over: btns.filter(b => b.over).map(b => b.t + '+' + (b.right - vw)), send: rect(send), cap: rect(cap),
    compH: comp ? Math.round(comp.getBoundingClientRect().height) : null,
    capWrap: cap ? getComputedStyle(cap).flexWrap : null, scWrap: sc ? getComputedStyle(sc).flexWrap : null,
    dead: btns.filter(b => !b.click).map(b => b.t),
    all: btns, capHTML: cap ? cap.children.length : null };
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

  console.log('A 静止态 ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.screenshot({ path: path.join(DIR, 'wrap8_idle.png'), clip: { x: 0, y: 632, width: 430, height: 300 } });

  console.log('注入假按钮前宽=' + (await p.evaluate(FAKE)) + 'px');
  await p.waitForTimeout(2600); // MutationObserver 600ms 去抖 + 定时器
  console.log('B 撑爆态 ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.screenshot({ path: path.join(DIR, 'wrap8_blown.png'), clip: { x: 0, y: 632, width: 430, height: 300 } });

  await p.evaluate(() => { const f = document.getElementById('__fakeCapsuleBtns'); if (f) f.remove(); });
  await p.waitForTimeout(2600);
  console.log('C 还原态 ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.screenshot({ path: path.join(DIR, 'wrap8_restore.png'), clip: { x: 0, y: 632, width: 430, height: 300 } });
  await b.close();
})();
