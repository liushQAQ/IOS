const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { window.__dshNativeStatusBar = 59; window.__dshTopShift = 18; document.documentElement.style.setProperty('--dsh-sb-native', '59px'); document.documentElement.style.setProperty('--dsh-topshift', '18px'); });
  await p.addScriptTag({ path: require('path').join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    let chip = document.querySelector('[class*="dshp-hero-chip"]'); if (!chip) chip = document.querySelector('[class*="heroWorkspaceRow"] button:last-child');
    if (!chip) { const row = document.querySelector('[class*="heroWorkspaceRow"]'); return { noChip: true, rowDump: row ? String(row.className) + ' kids=' + Array.from(row.children).map(k => String(k.className).slice(0,26)).join('|') : 'no-row' }; }
    const cs = getComputedStyle(chip);
    // 枚举所有命中该元素且带 min-width 的规则
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const walk = (list) => {
        for (const r of list) {
          if (r.cssRules) { walk(r.cssRules); continue; }
          if (!r.selectorText || !r.style) continue;
          const mw = r.style.getPropertyValue('min-width');
          const fx = r.style.getPropertyValue('flex');
          if (!mw && !fx) continue;
          let m = false;
          try { m = chip.matches(r.selectorText); } catch (e) {}
          if (m) hits.push({ sel: r.selectorText.slice(0, 80), mw: mw || '-', flex: fx || '-', imp: r.style.getPropertyPriority('min-width') });
        }
      };
      walk(rules);
    }
    // 祖先链验证 composerStack
    let inStack = false, e = chip;
    while (e) { if (String(e.className).indexOf('composerStack') >= 0) { inStack = true; break; } e = e.parentElement; }
    return {
      chipCls: String(chip.className).slice(0, 40),
      computedMinW: cs.minWidth, computedFlex: cs.flex, inlineMinW: chip.style.minWidth || '(none)',
      rect: [Math.round(chip.getBoundingClientRect().left), Math.round(chip.getBoundingClientRect().right)],
      inStack, hits: hits.slice(0, 12),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
