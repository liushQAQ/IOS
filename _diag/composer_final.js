const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

// 与 Swift 里 v1.0.124 完全一致的两段：CSS + alignComposerButtons
const FIX_CSS = `
[class*="composerStack"] [class*="_add"],
[class*="composerStack"] [class*="_primary"],
[class*="composerStack"] [class*="_send"],
[class*="composerStack"] [class*="_stop"],
[class*="composerStack"] [class*="_attach"],
[class*="composerStack"] [class*="_voice"],
[class*="composerStack"] [class*="_mic"],
[class*="composerStack"] .dsh-po-btn-gear,
[class*="composerStack"] .dsh-po-btn-opt {
  display: flex !important; align-items: center !important; justify-content: center !important;
  padding: 0 !important; box-sizing: border-box !important;
}
[class*="composerStack"] [class*="_add"] > svg,
[class*="composerStack"] [class*="_primary"] > svg,
[class*="composerStack"] [class*="_send"] > svg,
[class*="composerStack"] [class*="_stop"] > svg,
[class*="composerStack"] [class*="_attach"] > svg,
[class*="composerStack"] [class*="_voice"] > svg,
[class*="composerStack"] [class*="_mic"] > svg,
[class*="composerStack"] .dsh-po-btn-gear > svg,
[class*="composerStack"] .dsh-po-btn-opt > svg {
  display: block !important; margin: auto !important; flex: 0 0 auto !important;
}
[class*="composerStack"] [class*="_row"] { align-items: center !important; }
`;

function ALIGN() {
  var host = document.querySelector('[class*="composerStack"]');
  if (!host) return 0;
  var n = 0;
  var rows = host.querySelectorAll('[class*="_row"]');
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var list = [];
    var bs = row.getElementsByTagName('button');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var bcs = getComputedStyle(b);
      if (bcs.display === 'none' || bcs.visibility === 'hidden') continue;
      var q = b.getBoundingClientRect();
      if (q.width < 14 || q.width > 80 || q.height < 14 || q.height > 80) continue;
      list.push([b, q]);
    }
    if (list.length < 2) continue;
    var cys = [];
    for (var j = 0; j < list.length; j++) cys.push(list[j][1].y + list[j][1].height / 2);
    cys.sort(function (x, y) { return x - y; });
    var target = cys[Math.floor(cys.length / 2)];
    for (var k = 0; k < list.length; k++) {
      var el = list[k][0], eq = list[k][1];
      var d = Math.round((eq.y + eq.height / 2 - target) * 10) / 10;
      if (Math.abs(d) < 0.5) {
        if (el.style.getPropertyValue('transform') && el.style.getPropertyValue('transform').indexOf('translateY') >= 0) {
          el.style.removeProperty('transform');
        }
        continue;
      }
      el.style.setProperty('transform', 'translateY(' + (-d) + 'px)', 'important');
      n++;
    }
  }
  return n;
}

const MEASURE = () => {
  const host = document.querySelector('[class*="composerStack"]');
  if (!host) return { err: 'no host' };
  const out = [];
  host.querySelectorAll('[class*="_row"] button').forEach(btn => {
    const q = btn.getBoundingClientRect();
    if (q.width < 14 || q.width > 80 || q.height < 14 || q.height > 80) return;
    const svg = btn.querySelector('svg');
    const sq = svg ? svg.getBoundingClientRect() : null;
    out.push({
      cls: String(btn.className || '').slice(0, 22),
      w: Math.round(q.width), h: Math.round(q.height),
      cy: Math.round((q.y + q.height / 2) * 10) / 10,
      dSvg: sq ? Math.round(((sq.y + sq.height / 2) - (q.y + q.height / 2)) * 10) / 10 : null,
    });
  });
  const cys = out.map(o => o.cy);
  return { items: out, spread: cys.length ? Math.round((Math.max(...cys) - Math.min(...cys)) * 10) / 10 : null };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const before = await p.evaluate(MEASURE);
  console.log('=== 修复前 ===');
  console.log('  按钮中心离散度 ' + before.spread + 'px');
  before.items.forEach(o => console.log('   ' + o.cls.padEnd(24) + o.w + 'x' + o.h + ' cy=' + o.cy + ' 图标Δy=' + o.dSvg));

  await p.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, FIX_CSS);
  await p.waitForTimeout(500);
  const c1 = await p.evaluate(ALIGN);
  await p.waitForTimeout(300);
  const c2 = await p.evaluate(ALIGN);
  await p.waitForTimeout(300);

  const after = await p.evaluate(MEASURE);
  console.log('\n=== 修复后（第1轮校准 ' + c1 + ' 个，第2轮 ' + c2 + ' 个 → 幂等应为0）===');
  console.log('  按钮中心离散度 ' + after.spread + 'px');
  after.items.forEach(o => console.log('   ' + o.cls.padEnd(24) + o.w + 'x' + o.h + ' cy=' + o.cy + ' 图标Δy=' + o.dSvg));

  await p.screenshot({ path: 'composer_final_430.png' });
  await b.close();
})();
