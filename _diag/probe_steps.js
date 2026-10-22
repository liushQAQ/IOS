const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
const APP_CSS = fs.readFileSync(DIR + '/app_inject.css', 'utf8');
async function clearDialog(p) {
  for (let i = 0; i < 5; i++) {
    const ok = await p.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!ok) return;
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) { await p.waitForTimeout(700); continue; }
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1000);
  }
}
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(css => { const s = document.createElement('style'); s.id = 'app-inject-sim'; s.textContent = css; document.head.appendChild(s); }, APP_CSS);
  await clearDialog(p);
  // 工作区选择
  try { await p.click('text=选择工作区', { timeout: 5000 }); } catch (e) {}
  let item = null;
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(2000);
    item = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, [class*="option"], [class*="popover"] div')).filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 120 && r.height > 24 && r.height < 90 && (e.textContent || '').trim().length > 1 && (e.textContent || '').trim().length < 40 && (e.textContent || '').indexOf('选择') < 0 && (e.textContent || '').indexOf('加载') < 0;
      });
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return { t: (els[0].textContent || '').trim().slice(0, 20), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (item) break;
  }
  console.log('ITEM:', JSON.stringify(item));
  if (item) { await p.mouse.click(item.x, item.y); await p.waitForTimeout(6000); }
  await clearDialog(p);
  // 开抽屉
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2500);
  let sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 22)));
  console.log('SESSIONS:', JSON.stringify(sess.slice(0, 6)));
  for (let i = 0; i < 3 && !sess.length; i++) {
    await p.waitForTimeout(4000);
    sess = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => (e.textContent || '').trim().slice(0, 22)));
  }
  const hit = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('0815') >= 0) || rows[0];
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { t: (t.textContent || '').trim().slice(0, 20), x: r.x + 60, y: r.y + r.height / 2 };
  });
  console.log('HIT:', JSON.stringify(hit));
  if (hit) { await p.mouse.click(hit.x, hit.y); }
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => document.querySelectorAll('[class*="VmGLcq_root"], [class*="Os3hAG_root"]').length > 0)) break;
  }
  await p.waitForTimeout(3000);
  await clearDialog(p);
  const stepInfo = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="VmGLcq_root"], [class*="Os3hAG_root"]'));
    const out = { count: rows.length, rows: [] };
    for (const r of rows.slice(0, 8)) {
      const summ = r.querySelector('[class*="summary"]');
      const rowEl = r.querySelector('[class*="_row"]');
      const rootR = r.getBoundingClientRect();
      const rowR = rowEl ? rowEl.getBoundingClientRect() : null;
      const sR = summ ? summ.getBoundingClientRect() : null;
      out.rows.push({
        rootH: Math.round(rootR.height),
        rowH: rowR ? Math.round(rowR.height) : null,
        sumH: sR ? Math.round(sR.height) : null,
        streaming: summ ? summ.getAttribute('data-streaming') : null,
        sumWS: summ ? getComputedStyle(summ).whiteSpace : null,
        sumOH: summ ? getComputedStyle(summ).overflow : null,
        sumLH: summ ? getComputedStyle(summ).lineHeight : null,
        sumDisp: summ ? getComputedStyle(summ).display : null,
        stWS: summ && summ.firstElementChild ? getComputedStyle(summ.firstElementChild).whiteSpace : null,
        stOH: summ && summ.firstElementChild ? getComputedStyle(summ.firstElementChild).overflow : null,
        txt: (summ ? summ.textContent : '').trim().slice(0, 40)
      });
    }
    return out;
  });
  console.log('STEPS:', JSON.stringify(stepInfo, null, 1));
  await p.screenshot({ path: DIR + '/_steps.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
