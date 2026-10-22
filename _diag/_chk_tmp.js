const fs = require('fs');
const src = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/_fn_tmp.js', 'utf8');
try { new Function(src); console.log('语法 OK  (' + src.split('\n').length + ' 行)'); }
catch (e) { console.log('语法错误: ' + e.message); }
for (const n of ["translateX", "overflow-x: clip", "__dsh-xclip", "window.innerWidth"]) console.log((src.includes(n) ? 'OK   ' : 'MISS ') + n);
console.log(src.includes('margin-right') ? 'WARN 仍有 margin-right' : 'OK   已无 margin-right');
