/* ============================================================================
 * R34 取证探针：会话图片「放大查看」秒关（老总 2026-10-24：图片闪退、App 不退、无日志）
 * 官方 ImageLightbox（dsh-client-ui-primitives）结构：
 *   body-portal > div.backdrop[role=dialog][aria-modal][aria-label=图片预览]
 *     > div.stage > (div.mask[mousedown=onClose] + img + button.close)
 * 假设：
 *   ① shim_00 watchdog 命中 role=dialog → 强制不透明背景 + left/top 挪位 → 遮罩死区；
 *   ② iOS 幽灵点击：tap 缩略图 → 预览层瞬时挂载 → 同位置合成 mousedown 落在
 *      mask 上 → 挂载瞬间 onClose → 「图片闪退」。
 * 用法：node _probe_r34_lightbox.js [with|no]   with=注入 shim / no=零注入对照
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const MODE = process.argv[2] || 'with';
const APP_JS = MODE === 'with' ? fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8') : '';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = 430, H = 932;

/* 页面侧：安装与官方 ImageLightbox 同构的最小复刻 + 会话消息里的缩略图 */
const INJECT_FIXTURE = () => {
  /* 1×1 红点 png 数据 URL，2x2 摆在消息区 */
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const holder = document.querySelector('[class*="scrollBody"]') || document.body;
  const wrap = document.createElement('div');
  wrap.setAttribute('data-r34-thumb', '1');
  wrap.style.cssText = 'position:relative;margin:80px 0 0 120px;width:120px;height:90px;cursor:zoom-in;background:#334;padding:6px;border-radius:8px';
  const thumb = document.createElement('img');
  thumb.src = px;
  thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
  wrap.appendChild(thumb);
  holder.insertBefore(wrap, holder.firstChild);
  wrap.addEventListener('click', () => {
    if (document.querySelector('[data-r34-lb]')) return;
    const backdrop = document.createElement('div');
    backdrop.setAttribute('data-r34-lb', '1');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', '图片预览');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:1000';
    const stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;inset:0 0 0;display:flex;align-items:center;justify-content:center;padding:40px';
    const mask = document.createElement('div');
    mask.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.6)';
    mask.addEventListener('mousedown', () => { backdrop.dataset.r34ClosedBy = 'mask-mousedown'; backdrop.remove(); });
    const big = document.createElement('img');
    big.src = px;
    big.style.cssText = 'position:relative;max-width:min(100%,1600px);max-height:100%;object-fit:contain;width:300px;height:220px';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;z-index:1;width:36px;height:36px';
    closeBtn.addEventListener('click', () => { backdrop.dataset.r34ClosedBy = 'close-btn'; backdrop.remove(); });
    stage.appendChild(mask); stage.appendChild(big); stage.appendChild(closeBtn);
    backdrop.appendChild(stage);
    /* 抓写手：记录 style 属性每一次变化的完整序列 */
    backdrop.__log = [];
    try {
      new MutationObserver(function (muts) {
        for (var mi = 0; mi < muts.length; mi++) {
          backdrop.__log.push({ t: Math.round(performance.now()), css: (backdrop.getAttribute('style') || '').slice(0, 160) });
        }
      }).observe(backdrop, { attributes: true, attributeFilter: ['style'] });
    } catch (e) {}
    document.body.appendChild(backdrop);
  });
  return 'fixture-ok';
};

const SAMPLE = () => {
  const all = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
  const dialogs = all.map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      mine: el.hasAttribute('data-r34-lb'),
      label: (el.getAttribute('aria-label') || '').slice(0, 14),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      pos: cs.position, disp: cs.display,
      bg: cs.backgroundColor.slice(0, 22),
      inline: (el.getAttribute('style') || '').slice(0, 90)
    };
  });
  return { dialogs, live: !!document.querySelector('[data-r34-lb]') };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 100)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  if (APP_JS) {
    await p.evaluate(({ js }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', '59px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      const fe = document.createElement('style');
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
      try { (0, eval)(js); } catch (e) {}
      window.__regTick = function () {
        try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      };
      window.__regTick();
    }, { js: APP_JS });
    await p.waitForTimeout(1500);
  }
  console.log('== 模式:', MODE, '==');
  await p.evaluate(INJECT_FIXTURE);

  /* 用真实触屏 tap 点缩略图中心 —— 复现 iOS tap 事件序列（含幽灵点击窗口） */
  const thumb = await p.evaluate(() => {
    const r = document.querySelector('[data-r34-thumb]').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  console.log('缩略图中心:', thumb);
  await p.touchscreen.tap(thumb.x, thumb.y);
  await p.waitForTimeout(120);
  const s1 = await p.evaluate(SAMPLE);
  console.log('tap+120ms:', JSON.stringify(s1, null, 0));
  await p.waitForTimeout(280);
  await p.waitForTimeout(900);
  const s3 = await p.evaluate(SAMPLE);
  console.log('tap+1s   :', JSON.stringify(s3, null, 0));
  const log = await p.evaluate(() => document.querySelector('[data-r34-lb]').__log);
  console.log('== style 写入序列 ==');
  log.forEach((l, i) => console.log(` [${i}] t=${l.t}ms  ${l.css}`));

  /* 第二次：开→等稳→再 tap 一次大图边缘外（点遮罩应正常关闭 = 关闭通道仍可用） */
  await p.waitForTimeout(300);
  await p.evaluate(INJECT_FIXTURE);
  await p.touchscreen.tap(30, 700);   // 视口左下角：远离图，应落在 mask 上
  await p.waitForTimeout(150);
  const s4 = await p.evaluate(SAMPLE);
  console.log('点遮罩后:', JSON.stringify(s4, null, 0));

  await p.screenshot({ path: path.join(DIR, `_r34_${MODE}.png`) });
  await b.close();
  console.log('探针完成');
})().catch((e) => { console.error('探针失败:', e); process.exit(1); });
