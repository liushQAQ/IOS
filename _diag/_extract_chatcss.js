const fs = require('fs');
const src = fs.readFileSync('C:/Program Files/DSH Desktop/resources/app/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js', 'utf8');
// 抓所有 const css$N = "...."; （JS 字符串字面量，可能含 \. 转义）
const re = /const css\$\d+ = ("(?:[^"\\]|\\.)*")/g;
let m, out = [], i = 0;
while ((m = re.exec(src)) !== null) {
  try { const s = JSON.parse(m[1]); out.push('/* css$' + i + ' */\n' + s); } catch (e) { console.error('parse fail at', m.index); }
  i++;
}
fs.writeFileSync('chat_all_css.css', out.join('\n\n'));
console.log('extracted', out.length, 'css blocks,', out.join('').length, 'chars');
// 顺带抽 primitives 的 TextShimmer CSS 也可能在外部包
