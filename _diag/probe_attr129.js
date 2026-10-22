/* 两个归因：
   1) idle 态 composer 各按钮精确矩形（430 档，带 App 注入）—— 查「优化×选择模型 2px 重叠」
   2) 不注入任何 App 脚本，点进会话页，看 webkit 是否照样死循环 —— 归因 DSH 自身 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const DUMP = () => {
  const comp = document.querySelector('[class*="composerStack"]');
  const out = [];
  if (comp) comp.querySelectorAll('button').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4) return;
    out.push({ t: (b.textContent || '').trim().slice(0, 14) || 'btn', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  });
  const sc = document.querySelector('[class*="VERcba_standardControls"]');
  return { btns: out, scW: sc ? Math.round(sc.getBoundingClientRect().width) : null, compH: comp ? Math.round(comp.getBoundingClientRect().height) : null };
};

(async () => {
  // —— ① idle 几何 ——
  let b = await webkit.launch({ headless: true });
  let c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  let p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2500);
  console.log('① idle几何 ' + JSON.stringify(await p.evaluate(DUMP)));
  await b.close();

  // —— ② 裸 DSH 点会话页（零注入）——
  b = await webkit.launch({ headless: true });
  c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(8000);
  const st = await p.evaluate(() => ({ url: location.href.slice(0, 80), nodes: document.querySelectorAll('*').length, hasDock: !!document.querySelector('.cm-stat-entry'), body: (document.body.innerText || '').slice(0, 80).replace(/\n/g, ' ') })).catch(e => ({ err: e.message.split('\n')[0] }));
  console.log('② 裸DSH进会话页(零注入) ' + JSON.stringify(st));
  await p.waitForTimeout(5000);
  const st2 = await p.evaluate(() => ({ nodes: document.querySelectorAll('*').length, hasDock: !!document.querySelector('.cm-stat-entry') })).catch(e => ({ err: e.message.split('\n')[0] }));
  console.log('②b 再等5秒 ' + JSON.stringify(st2));
  await b.close();
})();
