const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  await p.evaluate((css) => {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }, CSS);
  await p.waitForTimeout(600);

  const r = await p.evaluate(() => {
    // uWtHQG 是否还存在
    const hits = {};
    ['uWtHQG_add', 'uWtHQG_row', 'uWtHQG_tools', 'uWtHQG_trailing', 'uWtHQG_standardControls', 'uWtHQG_root', 'ank0OG_composerSeat']
      .forEach(k => { hits[k] = document.querySelectorAll('[class*="' + k + '"]').length; });

    // 找底部输入区：含 textarea 或 contenteditable 的最近容器
    let host = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
    let box = host;
    for (let i = 0; i < 6 && box; i++) box = box.parentElement;
    // 再往上找能覆盖整个输入卡片的
    const vh = innerHeight;
    let seat = null;
    document.querySelectorAll('div').forEach(d => {
      const q = d.getBoundingClientRect();
      if (q.height > 60 && q.height < 260 && q.width > 360 && q.bottom > vh - 200 && q.top > vh - 400) seat = d;
    });

    const region = seat || box;
    const out = [];
    if (region) {
      const rc = region.className;
      region.querySelectorAll('button, [role="button"], span, div').forEach(el => {
        const q = el.getBoundingClientRect();
        if (q.width < 10 || q.width > 90 || q.height < 10 || q.height > 90) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') return;
        const txt = (el.textContent || '').trim().slice(0, 6);
        const hasSvg = !!el.querySelector(':scope > svg');
        if (!hasSvg && !txt && !el.className) return;
        out.push({
          tag: el.tagName, cls: String(el.className || '').slice(0, 40),
          x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
          disp: cs.display, ai: cs.alignItems, jc: cs.justifyContent, pad: cs.padding, svg: hasSvg, txt,
        });
      });
    }
    return { hits, regionCls: region ? String(region.className).slice(0, 60) : null, count: out.length, items: out.slice(0, 40) };
  });

  console.log('=== uWtHQG / ank0OG 类名命中数 ===');
  Object.entries(r.hits).forEach(([k, v]) => console.log('  ' + k + ': ' + v + (v === 0 ? '  ← 已失效（换版）' : '')));
  console.log('\n=== 输入区容器 === ' + r.regionCls);
  console.log('  子元素 ' + r.count + ' 个（宽高 10~90 的图标元素）');
  r.items.forEach(o => console.log('  ' + o.x + ',' + o.y + ' ' + o.w + 'x' + o.h + ' disp=' + o.disp + ' ai=' + o.ai + ' jc=' + o.jc + ' pad=' + o.pad + ' svg=' + o.svg + (o.txt ? ' "' + o.txt + '"' : '') + ' ' + o.tag + '.' + o.cls));

  await p.screenshot({ path: 'composer_430.png' });
  await b.close();
})();
