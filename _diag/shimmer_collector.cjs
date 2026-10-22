// 本地收集器：收 probe 外传的 DOM 诊断
const http = require('http');
const fs = require('fs');
const out = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shimmer_exfil.jsonl';
try { fs.unlinkSync(out); } catch (e) {}
const srv = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      fs.appendFileSync(out, body + '\n');
      res.writeHead(200); res.end('ok');
    });
  } else { res.writeHead(200); res.end('ok'); }
});
srv.listen(31899, '127.0.0.1', () => console.log('collector on 31899'));
setTimeout(() => { console.log('collector exit'); process.exit(0); }, 150000);
