/* 快速试参：row-gap × align-content 组合，看稳态（t+8s）优化行与模型行的间距 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const VARIANTS = {
  gap8: '',
  gap8_acStart: '[class*="composerStack"] [class*="VERcba_standardControls"] { align-content: start !important; }',
  gap12: '',
  gap12_acStart: '[class*="composerStack"] [class*="VERcba_standardControls"] { align-content: start !important; }',
  aiStart: '[class*="composerStack"] [class*="VERcba_standardControls"] { align-items: flex-start !important; }'
};

const MEAS = () => {
  const g = (t) => {
    const el = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(x => (x.textContent || '').trim().startsWith(t));
    if (!el) return null;
    const q = el.getBoundingClientRect();
    return { y: Math.round(q.y), h: Math.round(q.height) };
  };
  const opt = g('优化');
  const selEl = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(x => (x.textContent || '').trim().startsWith('选择模型') || (x.textContent || '').trim().startsWith('gemini'));
  const sel = selEl ? (q => ({ y: Math.round(q.y), h: Math.round(q.height) }))(selEl.getBoundingClientRect()) : null;
  const optEl = Array.from(document.querySelectorAll('[class*="composerStack"] button')).find(x => (x.textContent || '').trim().startsWith('优化'));
  const cs = optEl ? getComputedStyle(optEl) : null;
  const scEl = document.querySelector('[class*="VERcba_standardControls"]');
  const parent = optEl ? optEl.parentElement : null;
  const pcs = parent ? getComputedStyle(parent) : null;
  return { gap: opt && sel ? sel.y - (opt.y + opt.h) : null,
    opt: optEl ? { y: Math.round(optEl.getBoundingClientRect().y), transform: cs.transform, mt: cs.marginTop, mb: cs.marginBottom, h: cs.height, pos: cs.position, top: cs.top } : null,
    parent: parent ? { h: Math.round(parent.getBoundingClientRect().height), ai: pcs.alignItems, ac: pcs.alignContent, wrap: pcs.flexWrap, disp: pcs.display } : null,
    sc: scEl ? { y: Math.round(scEl.getBoundingClientRect().y), h: Math.round(scEl.getBoundingClientRect().height) } : null };
};

(async () => {
  for (const [name, extra] of Object.entries(VARIANTS)) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6000);
    await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
    await p.evaluate((css) => {
      const base = Array.from(document.querySelectorAll('style')).find(s => /VERcba_standardControls/.test(s.textContent || ''));
      if (base) base.textContent = (base.textContent || '').replace(/row-gap:\s*\d+px !important/g, m => m);
      if (css) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
      if (name === 'gap12') {
        const st = document.createElement('style');
        st.textContent = '[class*="composerStack"] [class*="VERcba_standardControls"], [class*="composerStack"] [class*="VERcba_standardControls"] > div > div { row-gap: 12px !important; }';
        document.head.appendChild(st);
      }
    }, extra);
    await p.waitForTimeout(8000);
    console.log(name + ' 稳态 ' + JSON.stringify(await p.evaluate(MEAS)));
    await b.close();
  }
})();
