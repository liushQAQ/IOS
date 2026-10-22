const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = 252;

const OLD = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject_old.css', 'utf8');
const NEW = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

const BOTTOM_PROBE = () => {
  const sb = document.querySelector('[class*="sidebarCol"]');
  const sq = sb.getBoundingClientRect();
  const items = [];
  sb.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 8 || q.height < 6) return;
    if (q.bottom < 760) return;
    items.push({
      el,
      tag: el.tagName,
      cls: String(el.className || '').slice(0, 34),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14),
      x: q.x, right: q.right, y: q.y, bottom: q.bottom, w: q.width, h: q.height,
      ovr: q.right - sq.right,
    });
  });

  // 只保留「自己不是别人的祖先」的叶子层，找同一水平带上 x 重叠的兄弟
  const overlaps = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const yOv = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      const xOv = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      if (yOv > 4 && xOv > 4) {
        overlaps.push({
          yOv: Math.round(yOv), xOv: Math.round(xOv),
          a: a.tag + '.' + a.cls + (a.text ? ' "' + a.text + '"' : ''),
          b: b.tag + '.' + b.cls + (b.text ? ' "' + b.text + '"' : ''),
        });
      }
    }
  }
  const overflow = items.filter(o => o.ovr > 0.5)
    .map(o => ({ ovr: Math.round(o.ovr * 10) / 10, tag: o.tag, cls: o.cls, right: Math.round(o.right), w: Math.round(o.w), text: o.text }))
    .sort((p, q) => q.ovr - p.ovr);

  return {
    drawer: { right: Math.round(sq.right), w: Math.round(sq.width), h: Math.round(sq.height) },
    bottomCount: items.length,
    overflowCount: overflow.length, overflowTop: overflow.slice(0, 10),
    overlapCount: overlaps.length, overlapTop: overlaps.slice(0, 12),
  };
};

async function run(b, mode, css) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  const clamp = (w) => {
    document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol').forEach(el => {
      el.style.setProperty('width', w + 'px', 'important');
      el.style.setProperty('min-width', w + 'px', 'important');
      el.style.setProperty('max-width', w + 'px', 'important');
    });
  };
  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css });
  await p.waitForTimeout(400);
  await p.evaluate(clamp, W);
  await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) x.click();
  });
  await p.waitForTimeout(2000);
  await p.evaluate(clamp, W);
  await p.waitForTimeout(1200);

  const r = await p.evaluate(BOTTOM_PROBE);
  console.log('\n=== ' + mode.toUpperCase() + ' ===');
  console.log('抽屉 right=' + r.drawer.right + ' w=' + r.drawer.w + '  底部元素 ' + r.bottomCount + ' 个');
  console.log('底部超出抽屉右界: ' + r.overflowCount + ' 个');
  r.overflowTop.forEach(o => console.log('   +' + o.ovr + 'px  right=' + o.right + ' w=' + o.w + '  ' + o.tag + '.' + o.cls + (o.text ? '  "' + o.text + '"' : '')));
  console.log('底部互相重叠(非父子): ' + r.overlapCount + ' 对');
  r.overlapTop.forEach(o => console.log('   y重叠' + o.yOv + ' x重叠' + o.xOv + '  ' + o.a + '  ×  ' + o.b));

  await p.screenshot({ path: 'bottom_' + mode + '.png' });
  await c.close();
}

(async () => {
  const b = await webkit.launch({ headless: true });
  await run(b, 'before', OLD);
  await run(b, 'after', NEW);
  await b.close();
})();
