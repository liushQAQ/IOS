// R51 复现探针：真身 shim 注入 + 流式扰动下开抽屉 → 面板是否被 bleed guard 推左滞留
const path = require('path');
const fs = require('fs');
const { webkit } = require('playwright');
const W = 430, H = 932;
const INJECT = path.join(__dirname, 'app_inject.js');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);

  // 模拟原生下发（闸门同款）
  await p.evaluate(() => {
    window.__dshNativeStatusBar = 59; window.__dshTopShift = 18;
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click();
  });
  // 注入真身 shim
  await p.addScriptTag({ path: INJECT });
  await p.waitForTimeout(1500);

  const rect = sel => p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1), width: +r.width.toFixed(1), inlineTf: el.style.transform || null, inline: (el.getAttribute('style') || '').slice(0, 160) };
  }, sel);

  console.log('A 基线 rightbarCol:', JSON.stringify(await rect('[class*="rightbarCol"]')));

  // 点开抽屉 + 动画期（0~240ms）高频扰动 DOM，模拟真机流式输出触发 MutationObserver
  await p.evaluate(() => {
    const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]');
    if (b) b.click();
    // 扰动器：动画窗内每 60ms 改一次 body 尾部文本节点，唤醒 observer 链
    const t = document.createElement('span'); t.id = '__r51stir'; document.body.appendChild(t);
    let i = 0; window.__r51stirTimer = setInterval(() => { t.textContent = 'stir' + (i++); }, 60);
    setTimeout(() => { clearInterval(window.__r51stirTimer); t.remove(); }, 1200);
  });
  await p.waitForTimeout(300);
  console.log('B 动画中(300ms) rightbarCol:', JSON.stringify(await rect('[class*="rightbarCol"]')));
  await p.waitForTimeout(700);
  console.log('C 开后1s rightbarCol:', JSON.stringify(await rect('[class*="rightbarCol"]')));
  await p.waitForTimeout(2500);
  const dState = await rect('[class*="rightbarCol"]');
  console.log('D 开后3.5s rightbarCol:', JSON.stringify(dState));
  const bleedN = await p.evaluate(() => window.__dshBleedN);
  console.log('bleed 命中数(最后一次):', bleedN);
  await p.screenshot({ path: path.join(__dirname, '_r51_repro_end.png') });

  // 面板内容左缘检查（可见内容是否出左屏）
  const inner = await p.evaluate(() => {
    const vw = innerWidth; let worst = null;
    document.querySelectorAll('[class*="rightbarCol"] *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 20 && r.left < -2) {
        if (!worst || r.left < worst.left) worst = { cls: String(el.className).slice(0, 50), left: Math.round(r.left), w: Math.round(r.width) };
      }
    });
    return { vw, worst };
  });
  console.log('面板内左出屏元素:', JSON.stringify(inner));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
