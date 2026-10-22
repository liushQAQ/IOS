const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
(async () => {
  const html = `<html><head><meta charset="utf-8"><style>
    body{margin:0;background:#16161a;font-family:-apple-system,'Segoe UI',sans-serif;padding:14px}
    .row{display:flex;gap:14px;margin-bottom:6px}
    .half{flex:1;min-width:0}
    .lab{font-size:15px;font-weight:600;margin-bottom:6px}
    .bad{color:#ff7a7a}.good{color:#7ddf8e}
    img{width:100%;border-radius:8px;border:1px solid #333;display:block}
    h1{color:#eee;font-size:18px;margin:0 0 12px}
    .note{color:#9a9aa5;font-size:12.5px;line-height:1.7;margin-top:6px}
    .k{color:#ffd479;font-weight:600}
  </style></head><body>
  <h1>顶栏大空档 · 修复前后对拍（v1.0.128 · 真机最坏条件：缓存旧 client env=59 + JS 几何通道全死，仅 CSS 兜底）</h1>
  <div class="row">
    <div class="half"><div class="lab bad">修复前 · 顶栏掉在 59pt 漂移线下方（老总截图同款）</div><img src="${b64('v128_before_sess.png')}"></div>
    <div class="half"><div class="lab good">修复后 v1.0.128 · 顶栏上收，标题压回漂移线（收敛 39pt）</div><img src="${b64('v128_after_sess.png')}"></div>
  </div>
  <div class="note">
    红线 = 真机实测旧漂移位 y=59pt；绿线 = 目标位 y=39pt。实测几何：frame padding <span class="k">59px → 0px</span>，
    列顶 colTop <span class="k">59 → 39</span>，36px 占位行 <span class="k">36px → 0px</span>（主页/会话页两组完全一致）。
    本组截图<b>只注入 CSS、零 JS</b>——模拟真机里 JS 几何 shim 整体死亡的最坏情况，CSS 单独兜底即可钉死顶栏，这正是 v1.0.128 的第三重保险。
  </div>
  </body></html>`;
  const b = await webkit.launch();
  const p = await b.newPage({ viewport: { width: 1160, height: 560 } });
  await p.setContent(html);
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(DIR, 'v128_cmp.png'), fullPage: true });
  await b.close();
  console.log('saved v128_cmp.png');
})();
