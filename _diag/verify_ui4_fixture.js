// 合成夹具验证：老总 4 条 UI 微调（居中 / 间距收缩防裁 / 模型选择器补位 / dock 缩字）
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; width:430px; height:932px; background:#10151d; font-family:Arial; }
  #root { width:430px; }
  [data-mobile-nav="frame"] { padding-top:59px; box-sizing:border-box; height:932px; }
  .composerStack { position:absolute; left:0; right:0; bottom:40px; }
  .VERcba_card { position:relative; margin:0 16px; height:130px; background:#1a2130; border-radius:14px; }
  .VERcba_strip { position:absolute; top:4px; left:0; right:0; height:36px; background:rgba(127,127,127,0.10); border-radius:10px; }
  .cm-stat-entry { position:absolute; width:64px; height:22px; color:#8a8f99; font-size:12px; }
  .dsh-po-capsule { position:absolute; width:83px; height:24px; }
  .dcc-root { position:absolute; width:96px; height:24px; }
  .VERcba_row { position:absolute; left:16px; right:16px; top:48px; height:40px; display:flex; align-items:center; }
  .VERcba_standardControls { width:120px; }
  .ofTiQG_trigger { width:152px; height:34px; background:#243049; border-radius:8px; color:#e9effb; display:inline-block; }
  .uWtHQG_primary { position:absolute; right:26px; width:34px; height:34px; background:#5b9bff; border-radius:17px; }
  .VERcba_dock { margin:2px 10px 6px; background:rgba(127,127,127,0.14); border-radius:12px; padding:8px 10px; font-size:16px; color:#e9effb; line-height:2.0; }
</style></head><body>
<div id="root"><div data-mobile-nav="frame">
  <div class="composerStack">
    <div class="VERcba_card">
      <div class="VERcba_strip"></div>
      <div class="dcc-root"></div>
      <div class="dsh-po-capsule"></div>
      <div class="cm-stat-entry"></div>
      <div class="VERcba_row">
        <div class="VERcba_standardControls"><button class="ofTiQG_trigger">Lob…</button></div>
      </div>
      <button class="uWtHQG_primary"></button>
    </div>
    <div class="VERcba_dock">
      <div>本轮统计 运行中 19%</div>
      <div>本会话费用 输入 12.4k 输出 3.2k 累计 ¥0.42</div>
    </div>
  </div>
</div></div>
</body></html>`;

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route('**/_fixture.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
  await p.goto('http://127.0.0.1:3083/_fixture.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR', e.message); } }, { js: APP_JS });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const out = {};
    const card = document.querySelector('.VERcba_card');
    const cr = card.getBoundingClientRect();
    // ① 队列居中 + ④ 不裁末项
    const items = ['.dcc-root', '.dsh-po-capsule', '.cm-stat-entry'].map(s => {
      const e = document.querySelector(s); const r2 = e.getBoundingClientRect();
      return { s, left: Math.round(r2.left * 10) / 10, right: Math.round(r2.right * 10) / 10 };
    });
    out.items = items;
    const gapL = items[1].left - items[0].right, gapR = items[2].left - items[1].right;
    out.gaps = [gapL, gapR];
    out.stripSpan = { first: items[0].left, last: items[2].right };
    out.cardL = Math.round(cr.left * 10) / 10; out.cardR = Math.round(cr.right * 10) / 10;
    const mid = (items[0].left + items[2].right) / 2;
    out.stripMid = Math.round(mid * 10) / 10;
    out.cardMid = Math.round(((cr.left + cr.right) / 2) * 10) / 10;
    out.noClip = items[2].right <= cr.right - 8;
    // ② 模型选择器补位
    const tg = document.querySelector('.ofTiQG_trigger');
    const prim = document.querySelector('.uWtHQG_primary');
    const tr = tg.getBoundingClientRect(), pr = prim.getBoundingClientRect();
    out.trig = { left: Math.round(tr.left), right: Math.round(tr.right), w: Math.round(tr.width) };
    out.primLeft = Math.round(pr.left);
    out.trigFill = tr.right <= pr.left - 8;
    // ③ dock 字号
    const dock = document.querySelector('.VERcba_dock');
    out.dockFs = getComputedStyle(dock).fontSize;
    out.dockKidFs = getComputedStyle(dock.firstElementChild).fontSize;
    out.dockGap = getComputedStyle(dock).rowGap;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // 断言
  const okMid = Math.abs(r.stripMid - r.cardMid) <= 2;
  const okGap = r.gaps.every(g => g >= 4 && g <= 15);
  console.log('A_居中:', okMid ? 'PASS' : 'FAIL', `(stripMid=${r.stripMid} cardMid=${r.cardMid})`);
  console.log('A_间距:', okGap ? 'PASS' : 'FAIL', `(${r.gaps.join(',')})`);
  console.log('A_不裁末项:', r.noClip ? 'PASS' : 'FAIL', `(末项右缘 ${r.stripSpan.last} vs 卡右 ${r.cardR})`);
  console.log('A_模型补位:', (r.trigFill && r.trig.w > 160) ? 'PASS' : 'FAIL', `(w=${r.trig.w} 右缘${r.trig.right} vs 发送左${r.primLeft})`);
  console.log('A_dock缩字:', (r.dockFs === '11px' && r.dockKidFs === '11px') ? 'PASS' : 'FAIL', `(容器${r.dockFs}/子${r.dockKidFs} rowGap=${r.dockGap})`);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
