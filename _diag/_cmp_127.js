const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
(async () => {
  const rows = ['430', '393', '375'].map(tag => `
    <div class="row">
      <div class="half"><div class="lab bad">${tag}pt · 修复前（压住发送钮）</div><img src="${b64('r127_' + tag + '_before.png')}"></div>
      <div class="half"><div class="lab good">${tag}pt · 修复后 v1.0.127（留 12px）</div><img src="${b64('r127_' + tag + '_after.png')}"></div>
    </div>`);
  const html = `<html><head><meta charset="utf-8"><style>
    body{margin:0;background:#16161a;font-family:-apple-system,'Segoe UI',sans-serif;padding:14px}
    .row{display:flex;gap:14px;margin-bottom:14px}
    .half{flex:1;min-width:0}
    .lab{font-size:15px;font-weight:600;margin-bottom:6px}
    .bad{color:#ff7a7a}.good{color:#7ddf8e}
    img{width:100%;border-radius:8px;border:1px solid #333;display:block}
    h1{color:#eee;font-size:18px;margin:0 0 12px}
  </style></head><body><h1>会话框「模型选择器」压发送按钮 · 修复前后对拍（v1.0.127）</h1>${rows.join('')}</body></html>`;
  const b = await webkit.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  await p.setContent(html);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(DIR, 'r127_cmp_all.png'), fullPage: true });
  await b.close();
  console.log('saved r127_cmp_all.png');
})();
