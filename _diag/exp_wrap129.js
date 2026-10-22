/* 底排防挤爆实验：模拟老总状态（优化胶囊里塞 撤回/重优 两个 60px 按钮），对比 wrap 修复 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const FIX = `
[class*="composerStack"] [class*="VERcba_trailing"] {
  flex-wrap: wrap !important;
  row-gap: 6px !important;
  max-width: 100% !important;
}
[class*="composerStack"] [class*="VERcba_standardControls"] {
  flex-wrap: wrap !important;
  row-gap: 6px !important;
  min-width: 0 !important;
  max-width: 100% !important;
}
`;

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const comp = document.querySelector('[class*="composerStack"]');
  const send = comp ? Array.from(comp.querySelectorAll('button')).find(b => (b.className || '').toString().includes('VERcba_primary')) : null;
  const fake = document.getElementById('__fakeCapsuleBtns');
  const buttons = [];
  if (comp) {
    comp.querySelectorAll('button').forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.width < 4) return;
      buttons.push({ txt: (b.textContent || '').trim().slice(0, 6) || (b.className || '').toString().slice(0, 14), x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y) });
    });
  }
  const over = buttons.filter(b => b.right > vw + 0.5);
  return { vw, send: send ? (r => ({ x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), w: Math.round(r.width) }))(send.getBoundingClientRect()) : null,
    overflowCount: over.length, over: over.slice(0, 4), fakeW: fake ? Math.round(fake.getBoundingClientRect().width) : null,
    nBtn: buttons.length };
};

async function run(tag, withFix) {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js, css }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) {}
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1000);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(1500);
  // 模拟老总状态：往优化胶囊 flexDiv 里塞「撤回」「重优」两个 60px 按钮
  await p.evaluate(() => {
    const sc = document.querySelector('[class*="VERcba_standardControls"]');
    if (!sc) return;
    const cap = sc.querySelector(':scope > div > div');
    if (!cap) return;
    const box = document.createElement('div');
    box.id = '__fakeCapsuleBtns';
    box.style.cssText = 'display:flex;gap:6px;flex:0 0 auto;';
    for (const t of ['撤回', '重优']) {
      const btn = document.createElement('button');
      btn.textContent = t;
      btn.style.cssText = 'width:60px;height:30px;flex:0 0 auto;';
      box.appendChild(btn);
    }
    cap.appendChild(box);
  });
  await p.waitForTimeout(600);
  if (withFix) {
    await p.evaluate((fix) => {
      const st = document.createElement('style'); st.textContent = fix; document.head.appendChild(st);
    }, FIX);
    await p.waitForTimeout(900);
  }
  const m = await p.evaluate(MEASURE);
  console.log(tag + ': ' + JSON.stringify(m));
  await p.screenshot({ path: path.join(DIR, 'wrap_' + tag + '.png'), clip: { x: 0, y: 600, width: 430, height: 332 } });
  await b.close();
}

(async () => {
  await run('before', false);
  await run('after', true);
})();
