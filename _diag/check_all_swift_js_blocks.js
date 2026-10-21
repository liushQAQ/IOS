// 全量校验：ViewController.swift 每个 """ 多行字符串块按 Swift 规则反转义后 node --check
const fs = require('fs');
const vm = require('vm');
const path = 'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split(/\r?\n/);
let blocks = [];
let cur = null;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '"""') {
    if (cur === null) { cur = { start: i + 1, body: [] }; }
    else { cur.end = i + 1; blocks.push(cur); cur = null; }
    continue;
  }
  if (cur !== null) cur.body.push(lines[i]);
}
console.log('共发现', blocks.length, '个多行字符串块');
let fail = 0;
for (const b of blocks) {
  // Swift 多行字符串反转义：\n → 换行, \\n → \n, \" → ", \\( → \(, \t → tab
  let js = b.body.join('\n');
  // 逐字符反转义（铁律：绝不链式 replace）
  let out = '';
  for (let i = 0; i < js.length; i++) {
    const c = js[i];
    if (c === '\\' && i + 1 < js.length) {
      const n = js[i + 1];
      if (n === 'n') { out += '\n'; i++; }
      else if (n === 't') { out += '\t'; i++; }
      else if (n === '"') { out += '"'; i++; }
      else if (n === '\\') { out += '\\'; i++; }
      else if (n === '(') { out += '\\('; i++; } // 插值起点，语法校验按字面 \( 处理
      else { out += c; }
    } else out += c;
  }
  try {
    new vm.Script(out, { filename: `block_L${b.start}-${b.end}` });
    console.log(`✅ L${b.start}~${b.end} (${b.body.length} 行)`);
  } catch (e) {
    fail++;
    console.log(`❌ L${b.start}~${b.end} (${b.body.length} 行): ${e.message}`);
    // 打印出错行附近
    const m = e.stack.match(/block_L[\s\S]*:(\d+)/);
    if (m) {
      const ln = parseInt(m[1]);
      console.log('   出错行内容:', JSON.stringify(out.split('\n')[ln - 1]).slice(0, 120));
    }
  }
}
console.log(fail === 0 ? '全部通过' : `${fail} 个块失败`);
process.exit(fail === 0 ? 0 : 1);
