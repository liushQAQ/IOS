const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { window.__dshNativeStatusBar = 59; window.__dshTopShift = 18; document.documentElement.style.setProperty('--dsh-sb-native', '59px'); document.documentElement.style.setProperty('--dsh-topshift', '18px'); });
  await p.addScriptTag({ path: require('path').join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); }).catch(() => {});
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    const vw = window.innerWidth;
    const sc = document.querySelector('[class*="VERcba_standardControls"], [class*="standardControls"], [class*="trailing"]');
    const cap = sc;
    let boxInfo = null;
    if (cap) {
      const box = document.createElement('div');
      box.id = '__gateFakeCapsule';
      box.style.cssText = 'display:flex;gap:6px;flex:0 0 auto;';
      for (const t of ['撤回', '重优']) {
        const btn = document.createElement('button');
        btn.textContent = t;
        btn.style.cssText = 'width:60px;height:30px;flex:0 0 auto;';
        box.appendChild(btn);
      }
      cap.appendChild(box);
      const r = box.getBoundingClientRect();
      boxInfo = { in: String(cap.className).slice(0, 40), rect: [Math.round(r.left), Math.round(r.right)] };
    }
    const comp2 = document.querySelector('[class*="composerStack"]');
    const overs = [];
    comp2.querySelectorAll('button').forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.width < 4) return;
      if (r.right > vw + 0.5) {
        // 上溯到行容器
        let row = b.parentElement, rowCls = '';
        for (let i = 0; i < 4 && row; i++) { if (getComputedStyle(row).display === 'flex' && row.getBoundingClientRect().width > 200) { rowCls = String(row.className).slice(0, 44); break; } row = row.parentElement; }
        overs.push({ text: (b.textContent || '').trim().slice(0, 14), cls: String(b.className).slice(0, 46), rect: [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.width)], minW: getComputedStyle(b).minWidth, ovf: getComputedStyle(b).overflow, row: rowCls, rowRight: row ? Math.round(row.getBoundingClientRect().right) : null, rowW: row ? Math.round(row.getBoundingClientRect().width) : null });
      }
    });
    document.getElementById('__gateFakeCapsule')?.remove();
    return { vw, boxInfo, overs: overs.slice(0, 6) };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
