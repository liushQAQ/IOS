const fs = require('fs');
const check = (p) => {
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const Q = String.fromCharCode(34, 34, 34);
  let inBlock = false; const bad = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    let cnt = 0, idx = 0;
    while ((idx = line.indexOf(Q, idx)) >= 0) { cnt++; idx += 3; }
    if (cnt % 2 === 1) { inBlock = !inBlock; continue; }
    if (!inBlock) continue;
    if (/(^|[^\\])\\\(/.test(line)) bad.push('L' + (i + 1));
  }
  return bad;
};
console.log('now :', JSON.stringify(check('E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift')));
// 造一个反例，验证检测器真的会红
const bad1 = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_t_bad.swift';
fs.writeFileSync(bad1, 'let a = """\n  var m = s.match(/matrix\\(x\\)/);\n"""\n');
console.log('fake:', JSON.stringify(check(bad1)));
fs.unlinkSync(bad1);
