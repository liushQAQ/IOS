// 🔴 决定性实验：真机 env(safe-area-inset-top)=59，沙箱恒 0 —— 这就是闸门永远测不出顶栏问题的根因。
// 做法：注入 App CSS（模拟真机注入通道）后，把页面里**所有** <style> 中的
// env(safe-area-inset-top) 文本替换成 59px，完整复刻真机级联条件，再逐级归因标题行空隙。
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
const ENV = 59;

const MEASURE = () => {
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const dhdr = document.querySelector('header.ank0OG_header') || document.querySelector('[data-phase] header');
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const title = document.querySelector('[class*="titleRow"]');
  const cs = el => { try { return getComputedStyle(el); } catch (e) { return {}; } };
  const g = el => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
  const chain = [];
  let el = title || dhdr || col;
  for (let n = el, d = 0; n && d < 10; n = n.parentElement, d++) {
    const c = cs(n);
    chain.push({
      tag: n.tagName, cls: String(n.className || '').slice(0, 30), top: g(n),
      pt: c.paddingTop, mt: c.marginTop, pos: c.position,
    });
  }
  return {
    frameExists: !!frame,
    framePt: frame ? cs(frame).paddingTop : null,
    frameInlinePt: frame ? frame.style.paddingTop || '' : null,
    colTop: g(col), colMt: col ? cs(col).marginTop : null, colInlineMt: col ? col.style.marginTop || '' : null,
    hdrTop: g(dhdr), hdrPt: dhdr ? cs(dhdr).paddingTop : null,
    leadingH: (() => { const l = dhdr && dhdr.querySelector('[class*="headerLeading"]'); return l ? cs(l).height : null; })(),
    titleTop: g(title),
    envVar: cs(document.documentElement).getPropertyValue('env-sb') || '',
    sbNative: getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native'),
    chain,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const base = await p.evaluate(MEASURE);
  console.log('### 基线（env=0，未注入 App CSS）titleTop(pt)=', base.titleTop === null ? null : (base.titleTop / 3).toFixed(1));
  console.log(JSON.stringify(base, null, 1));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/env_base.png' });

  await p.evaluate(({ css, sb, shift }) => {
    window.__dshNativeStatusBar = sb;
    document.documentElement.style.setProperty('--dsh-sb-native', sb + 'px');
    document.documentElement.style.setProperty('--dsh-statusbar', sb + 'px');
    window.__dshTopShift = shift;
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS, sb: ENV, shift: 18 });
  await p.waitForTimeout(1200);
  const afterCss = await p.evaluate(MEASURE);
  console.log('\n### App CSS 注入后（env 仍=0）titleTop(pt)=', afterCss.titleTop === null ? null : (afterCss.titleTop / 3).toFixed(1));
  console.log(JSON.stringify(afterCss, null, 1));

  const rew = await p.evaluate((env) => {
    const out = { styles: 0 };
    document.querySelectorAll('style').forEach(st => {
      if (st.id === '__app_css') return;
      if (st.textContent.indexOf('env(safe-area-inset-top)') >= 0) {
        st.textContent = st.textContent.split('env(safe-area-inset-top)').join(env + 'px');
        out.styles++;
      }
    });
    return out;
  }, ENV);
  console.log('\n### env 改写：', JSON.stringify(rew));
  await p.waitForTimeout(1500);
  const afterEnv = await p.evaluate(MEASURE);
  console.log('### env=59 复现后（真机等价条件）titleTop(pt)=', afterEnv.titleTop === null ? null : (afterEnv.titleTop / 3).toFixed(1));
  console.log(JSON.stringify(afterEnv, null, 1));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/env59_after.png' });
  console.log('\n真机实测：标题行顶 114.7pt；复现值 =', afterEnv.titleTop === null ? '?' : (afterEnv.titleTop / 3).toFixed(1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
