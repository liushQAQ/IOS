/* 顶栏离状态栏越来越宽 —— 沙箱取证：
   ① 谁持有这段 gap（headerCorner 及其祖先链的 padding/margin/offsetTop）
   ② 反复进出会话 + 键盘焦点切换后，顶栏位置是否漂移（复现「越来越宽」） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const SNAP = () => {
  const out = { t: Date.now() % 100000 };
  const hd = document.querySelector('[class*="headerCorner"]');
  const col = document.querySelector('[class*="centerCol"]');
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  out.hdTop = hd ? Math.round(hd.getBoundingClientRect().top * 10) / 10 : null;
  out.colTop = col ? Math.round(col.getBoundingClientRect().top * 10) / 10 : null;
  out.colMt = col ? (col.style.marginTop || null) : null;
  out.framePt = frame ? getComputedStyle(frame).paddingTop : null;
  // headerCorner 祖先链上所有不为 0 的 padding/margin
  out.chain = [];
  let el = hd;
  for (let i = 0; el && i < 10; i++) {
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop) || 0, mt = parseFloat(cs.marginTop) || 0;
    if (pt > 0.5 || mt > 0.5) out.chain.push({
      i, cls: (el.className || '').toString().slice(0, 26), pt, mt,
      inline: (el.getAttribute('style') || '').match(/(padding|margin)-top:[^;]+/g)
    });
    el = el.parentElement;
  }
  // 全页找 padding-top 里含 env 的元素（谁还在吃安全区）
  out.envWriters = [];
  document.querySelectorAll('div, header').forEach(e => {
    const st = e.getAttribute && e.getAttribute('style');
    if (st && /env\(/.test(st) && /padding-top/.test(st)) out.envWriters.push((e.className || '').toString().slice(0, 30) + ' | ' + (st.match(/padding-top:[^;]+/) || [''])[0]);
  });
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(1500);
  console.log('S0 主页 ' + JSON.stringify(await p.evaluate(SNAP)));

  for (let round = 1; round <= 4; round++) {
    // 进会话
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1500);
    await p.evaluate((ROWS_IDX) => {
      const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rows[ROWS_IDX % Math.max(1, rows.length)] || rows[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    await p.waitForTimeout(4000);
    console.log('R' + round + ' 进会话 ' + JSON.stringify(await p.evaluate(SNAP)));
    // 键盘焦点两次（弹/收）
    await p.evaluate(() => { const ta = document.querySelector('[class*="composerStack"] textarea') || document.querySelector('textarea'); if (ta) ta.focus(); });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await p.waitForTimeout(1500);
    console.log('R' + round + ' 键盘后 ' + JSON.stringify(await p.evaluate(SNAP)));
    // 回主页
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const home = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '新会话'); if (home) home.click(); });
    await p.waitForTimeout(2500);
  }
  console.log('S9 结束 ' + JSON.stringify(await p.evaluate(SNAP)));
  await b.close();
})();
