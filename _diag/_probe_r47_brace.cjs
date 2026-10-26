/* 检查探针抠出的 CSS 是否有花括号失衡（导致规则被 CSSOM 丢弃） */
const fs = require('fs');
const js = fs.readFileSync('app_inject.js', 'utf8');
const lines = js.split('\n');
let css = '';
for (const ln of lines) {
  const m = ln.match(/^\s*'(.*)',?\s*$/);
  if (m && /[{}:;]/.test(m[1])) css += m[1].replace(/\\'/g, "'").replace(/\\"/g, '"') + '\n';
}
const absIdx = css.search(/headerCorner[\s\S]{0,120}position: absolute/);
let bal = 0, firstNeg = -1;
for (let i = 0; i < css.length; i++) {
  if (css[i] === '{') bal++;
  else if (css[i] === '}') { bal--; if (bal < 0 && firstNeg < 0) firstNeg = i; }
}
console.log('absIdx=' + absIdx + ' bracesBefore=' + (firstNeg >= 0 && firstNeg < absIdx ? 'NEG@' + firstNeg : 'ok') + ' finalBal=' + bal);
if (firstNeg >= 0) console.log('firstNeg ctx: ' + JSON.stringify(css.slice(Math.max(0, firstNeg - 150), firstNeg + 10)));
// 找 absIdx 之前最近的未闭合块
let depth = 0, openIdx = -1;
for (let i = 0; i < absIdx; i++) {
  if (css[i] === '{') { depth++; if (openIdx < 0) openIdx = i; }
  else if (css[i] === '}') { depth--; if (depth === 0) openIdx = -1; }
}
if (openIdx >= 0) console.log('unclosed block starts: ' + JSON.stringify(css.slice(Math.max(0, openIdx - 160), openIdx + 40)));
console.log('TAIL: ' + JSON.stringify(css.slice(-300)));
console.log('AROUND: ' + JSON.stringify(css.slice(Math.max(0, absIdx - 300), absIdx + 400)));
