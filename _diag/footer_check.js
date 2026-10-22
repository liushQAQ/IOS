const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = 252;

const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');

const PROBE = () => {
  const sb = document.querySelector('[class*="sidebarCol"]');
  const sq = sb.getBoundingClientRect();

  // 1) 底部吸底块：从「余额」这行往上找最近的、宽度接近抽屉宽度的容器
  const foot =
    sb.querySelector('[class*="footArea"]') ||
    sb.querySelector('[class*="footerStack"]') ||
    sb.querySelector('[class*="cm-footer-stack"]');

  const out = { drawer: { right: Math.round(sq.right), w: Math.round(sq.width) } };

  if (foot) {
    const fq = foot.getBoundingClientRect();
    out.footBox = { x: Math.round(fq.x), right: Math.round(fq.right), y: Math.round(fq.y), bottom: Math.round(fq.bottom), w: Math.round(fq.width), h: Math.round(fq.height) };
    out.footOver = Math.round((fq.right - sq.right) * 10) / 10;

    // 只取直接可见子元素，成对看垂直重叠
    const kids = [];
    Array.from(foot.children).forEach((el, i) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = el.getBoundingClientRect();
      if (q.height < 4) return;
      kids.push({
        i, tag: el.tagName, cls: String(el.className || '').slice(0, 40),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16),
        y: q.y, bottom: q.bottom, x: q.x, right: q.right, h: q.height,
      });
    });
    const pairs = [];
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        const yOv = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        if (yOv > 2) pairs.push({ yOv: Math.round(yOv), a: a.cls + ' "' + a.text + '"', b: b.cls + ' "' + b.text + '"' });
      }
    }
    out.footKids = kids.map(k => ({ cls: k.cls, text: k.text, y: Math.round(k.y), b: Math.round(k.bottom), x: Math.round(k.x), r: Math.round(k.right) }));
    out.footPairOverlap = pairs.length;
    out.footPairs = pairs.slice(0, 8);
  }

  // 2) 命中测试：沿抽屉纵向中轴逐 6px 采样，看最顶层元素属于谁
  const samples = [];
  const cx = Math.round(sq.x + sq.width / 2);
  const scanFrom = out.footBox ? out.footBox.y - 30 : Math.round(sq.y);
  for (let y = Math.round(scanFrom); y < Math.round(sq.bottom); y += 6) {
    const el = document.elementFromPoint(cx, y);
    if (!el) continue;
    let chain = [], e = el, depth = 0;
    while (e && depth < 4) { chain.push(String(e.className || e.tagName).slice(0, 26)); e = e.parentElement; depth++; }
    samples.push({ y, top: chain[0] });
  }
  // 压缩连续相同结果
  const runs = [];
  samples.forEach(s => {
    const last = runs[runs.length - 1];
    if (last && last.top === s.top) last.end = s.y;
    else runs.push({ top: s.top, start: s.y, end: s.y });
  });
  out.topRuns = runs;

  // 3) 主会话框是否越界压到抽屉上
  const comp = document.querySelector('[class*="composerStack"]');
  if (comp) {
    const cq = comp.getBoundingClientRect();
    out.composer = { x: Math.round(cq.x), right: Math.round(cq.right), y: Math.round(cq.y), bottom: Math.round(cq.bottom), w: Math.round(cq.width) };
    out.composerIntoDrawer = Math.round((sq.right - cq.x) * 10) / 10;
  }

  // 4) 抽屉内是否还有横向溢出
  let over = 0, worst = 0, worstCls = '';
  sb.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 8 || q.height < 6) return;
    const o = q.right - sq.right;
    if (o > 0.5) { over++; if (o > worst) { worst = o; worstCls = String(el.className || '').slice(0, 40); } }
  });
  out.overflowCount = over;
  out.overflowWorst = Math.round(worst * 10) / 10 + 'px ' + worstCls;

  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  const clamp = (w) => {
    document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
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
  }, { css: CSS });
  await p.waitForTimeout(400);
  await p.evaluate(clamp, W);
  await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) x.click();
  });
  await p.waitForTimeout(2000);
  await p.evaluate(clamp, W);
  await p.waitForTimeout(1500);

  const r = await p.evaluate(PROBE);
  console.log(JSON.stringify(r, null, 1));

  await b.close();
})();
