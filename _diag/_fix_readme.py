import io, re

p = 'E:/desktop/所有skill/packages/dsh-anywhere/README.md'
s = io.open(p, encoding='utf-8').read()

old1 = '中更靠内的那个为基准**（，再左移 26+8px）。'
new1 = '中更靠内的那个为基准**（`anchor = min(ar.right, drawerRight)`，再左移 26+8px）。'
old2 = '旧算法  让齿轮 right=266 —— 超出抽屉、被  裁掉右半边。'
new2 = '旧算法 `ar.right - 30` 让齿轮 right=266 —— 超出抽屉、被 `overflow:hidden` 裁掉右半边。'

n = 0
if old1 in s:
    s = s.replace(old1, new1); n += 1
if old2 in s:
    s = s.replace(old2, new2); n += 1

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('修复行数:', n)
