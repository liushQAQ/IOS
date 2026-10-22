/* 复现「闸门红 / 实验绿」的差异：闸门只注入 app_inject.js（内含 CSS 字符串），
   实验则是另外 append 一份 app_inject.css。此处三态对照，定位谁没生效。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const INJECT_FAKE = () => {
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  if (!sc) return 'no-sc';
  const cap = sc.querySelector(':scope > div > div');
  if (!cap) return 'no-cap';
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
  const cs = cap ? getComputedStyle(cap) : null;
  const btns = [];
  if (comp) comp.querySelectorAll('button').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4) return;
    btns.push({ t: (b.textContent || '').trim().slice(0, 7) || 'btn', x: Math.round(r.x), right: Math.round(r.right) });
  });
  return {
    vw, over: btns.filter(b => b.right > vw + 0.5),
    capFlexWrap: cs ? cs.flexWrap : null,
    capShrink: cs ? cs.flexShrink : null,
    capMaxW: cs ? cs.maxWidth : null,
    capW: cap ? Math.round(cap.getBoundingClientRect().width) : null,
    scW: sc ? Math.round(sc.getBoundingClientRect().width) : null,
    styleTags: document.querySelectorAll('style').length,
    hasRule: Array.from(document.querySelectorAll('style')).some(s => /VERcba_standardControls/.test(s.textContent || ''))
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // 状态 0：什么都不注
  console.log('S0 裸页面 ' + JSON.stringify(await p.evaluate(MEASURE)));

  // 状态 1：只注 app_inject.js（闸门做法）
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) { console.log('js err ' + e); } }, { js: APP_JS });
  await p.waitForTimeout(2500);
  console.log('S1 注JS  ' + JSON.stringify(await p.evaluate(MEASURE)));

  // 状态 2：塞假按钮（闸门做法）
  console.log('S2 塞爆  fake=' + (await p.evaluate(INJECT_FAKE)) + ' ' + JSON.stringify(await p.evaluate(MEASURE)));
  await p.waitForTimeout(600);
  console.log('S2b +600ms ' + JSON.stringify(await p.evaluate(MEASURE)));

  // 状态 3：再补一份 app_inject.css（实验做法）
  await p.evaluate((css) => { const s = document.createElement('style'); s.id = '__css2'; s.textContent = css; document.head.appendChild(s); }, APP_CSS);
  await p.waitForTimeout(900);
  console.log('S3 补CSS ' + JSON.stringify(await p.evaluate(MEASURE)));

  await p.screenshot({ path: path.join(DIR, 'wrap6.png'), clip: { x: 0, y: 632, width: 430, height: 300 } });
  await b.close();
})();
