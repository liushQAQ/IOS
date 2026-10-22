/* 底排防挤爆第二版实验（v1.0.129 补丁）
   闸门实锤：塞入 撤回/重优 后仍剩 gemini-3.8 模型选择器越界 +41px。
   推演：trailing(166) 里 standardControls 被胶囊撑到 209（最宽一行），wrap 只换行不改最宽项宽度。
   候选：给 standardControls / 中间 wrapper 也加可收缩约束，让胶囊真正被压进 166 内换行。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const CAND = {
  none: '',
  // 当前线上版本（只有第三层 wrap）
  cur: `[class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    flex-wrap: wrap !important; flex-shrink: 1 !important; min-width: 0 !important;
    max-width: 100% !important; row-gap: 4px !important; }`,
  // A：再加 standardControls 自身 + 中间 wrapper 可收缩
  A: `[class*="composerStack"] [class*="VERcba_standardControls"],
   [class*="composerStack"] [class*="VERcba_standardControls"] > div,
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    min-width: 0 !important; flex-shrink: 1 !important; max-width: 100% !important; }
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    flex-wrap: wrap !important; row-gap: 4px !important; }`,
  // B：A + 让胶囊内部（孙层）也能换行
  B: `[class*="composerStack"] [class*="VERcba_standardControls"],
   [class*="composerStack"] [class*="VERcba_standardControls"] > div,
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    min-width: 0 !important; flex-shrink: 1 !important; max-width: 100% !important; }
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div,
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div > div {
    flex-wrap: wrap !important; row-gap: 4px !important; min-width: 0 !important; }`,
  // C：A + 模型选择器文字省略号截断
  C: `[class*="composerStack"] [class*="VERcba_standardControls"],
   [class*="composerStack"] [class*="VERcba_standardControls"] > div,
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    min-width: 0 !important; flex-shrink: 1 !important; max-width: 100% !important; }
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div {
    flex-wrap: wrap !important; row-gap: 4px !important; }
   [class*="composerStack"] [class*="VERcba_standardControls"] > div > div > * {
    min-width: 0 !important; flex-shrink: 1 !important; overflow: hidden !important; }
   [class*="composerStack"] [class*="VERcba_standardControls"] button {
    min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }`
};

const INJECT_FAKE = () => {
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  if (!sc) return 'no-sc';
  const cap = sc.querySelector(':scope > div > div');
  if (!cap) return 'no-cap';
  if (document.getElementById('__fakeCapsuleBtns')) return 'already';
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
  return 'ok';
};

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const comp = document.querySelector('[class*="composerStack"]');
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  const tr = comp ? comp.querySelector('[class*="VERcba_trailing"]') : null;
  const send = comp ? Array.from(comp.querySelectorAll('button')).find(b => (b.className || '').toString().includes('VERcba_primary')) : null;
  const btns = [];
  if (comp) comp.querySelectorAll('button').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4) return;
    btns.push({ t: (b.textContent || '').trim().slice(0, 8) || 'btn', x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), w: Math.round(r.width) });
  });
  const over = btns.filter(b => b.right > vw + 0.5);
  const box = (el) => el ? (r => ({ x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) }))(el.getBoundingClientRect()) : null;
  const compRect = comp ? comp.getBoundingClientRect() : null;
  return {
    vw, over: over.length, overList: over.slice(0, 4),
    send: box(send), trailing: box(tr), sc: box(sc),
    compH: compRect ? Math.round(compRect.height) : null,
    btns
  };
};

(async () => {
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
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(1200);

  // 先把线上已有规则摘掉（重测基线用），再按候选注入
  await p.evaluate(() => { document.querySelectorAll('style').forEach(s => { if (/VERcba_standardControls/.test(s.textContent || '')) s.setAttribute('data-appcss', '1'); }); });

  for (const [tag, cssText] of Object.entries(CAND)) {
    // 清掉旧候选
    await p.evaluate(() => { const o = document.getElementById('__cand'); if (o) o.remove(); });
    await p.evaluate(({ cssText, base }) => {
      // 关掉 App CSS 里那条旧规则（用更高优先级覆盖即可，这里直接改旧 style 内容）
      document.querySelectorAll('style[data-appcss="1"]').forEach(s => {
        if (!s.__orig) s.__orig = s.textContent;
        s.textContent = (s.__orig || '').replace(/\[class\*="composerStack"\] \[class\*="VERcba_standardControls"\][\s\S]*?row-gap:\s*4px !important;\s*\}/g, '');
      });
      const st = document.createElement('style'); st.id = '__cand'; st.textContent = cssText; document.head.appendChild(st);
    }, { cssText, base: CAND.cur });
    const r = await p.evaluate(INJECT_FAKE);
    await p.waitForTimeout(900);
    const m = await p.evaluate(MEASURE);
    console.log('== ' + tag + ' (fake=' + r + ')');
    console.log('   over=' + m.over + ' send=' + JSON.stringify(m.send) + ' trailing=' + JSON.stringify(m.trailing) + ' sc=' + JSON.stringify(m.sc) + ' compH=' + m.compH);
    console.log('   overList=' + JSON.stringify(m.overList));
    if (tag === 'none' || tag === 'A' || tag === 'B') console.log('   btns=' + JSON.stringify(m.btns));
    await p.screenshot({ path: path.join(DIR, 'wrap5_' + tag + '.png'), clip: { x: 0, y: Math.max(0, 932 - 300), width: 430, height: 300 } });
    // 复原注入的假按钮，下一轮重新塞
    await p.evaluate(() => { const b2 = document.getElementById('__fakeCapsuleBtns'); if (b2) b2.remove(); });
    // 还原 App CSS
    await p.evaluate(() => { document.querySelectorAll('style[data-appcss="1"]').forEach(s => { if (s.__orig) s.textContent = s.__orig; }); });
    await p.waitForTimeout(400);
  }

  await b.close();
})();
