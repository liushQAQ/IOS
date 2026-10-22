/* 逐条抽取 iosCompatShims 里的多行字符串，做 Swift 反转义后用 new Function 全部 parse，
   任何一条语法错都会点名。绝不写死行号。 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'DSHios', 'ViewController.swift');
const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

function unescape(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\\') { out += '\\'; i += 2; continue; }
      if (n === '"') { out += '"'; i += 2; continue; }
      if (n === 'n') { out += '\n'; i += 2; continue; }
      if (n === 't') { out += '\t'; i += 2; continue; }
      if (n === '(') { out += '\\('; i += 2; continue; }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const shims = [];
let inBlock = false, buf = [], start = 0;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (!inBlock && t === '"""') { inBlock = true; buf = []; start = i + 2; continue; }
  if (inBlock) {
    if (t === '""",' || t === '"""') { shims.push({ start, code: unescape(buf.join('\n')) }); inBlock = false; continue; }
    buf.push(lines[i]);
  }
}
console.log('抽取 shim 数量:', shims.length);
let bad = 0;
shims.forEach((s, idx) => {
  try { new Function(s.code); console.log(`  [${idx}] ✅ L${s.start} ${s.code.length}B`); }
  catch (e) { bad++; console.log(`  [${idx}] ❌ L${s.start} ${e.message}`); }
});
console.log(bad === 0 ? 'ALL OK' : 'FAILED: ' + bad);
