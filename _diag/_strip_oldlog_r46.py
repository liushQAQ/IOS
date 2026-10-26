# -*- coding: utf-8 -*-
"""删除 SettingsViewController.swift 中旧更新日志正文（新闭合\"\"\"之后到旧闭合\"\"\"），二进制读写保 CRLF。"""
p = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/SettingsViewController.swift'
raw = open(p, 'rb').read()
text = raw.decode('utf-8')
lines = text.split('\r\n')

# 新块尾锚：18. 全系机型安全区自动适配 (105) 之后的下一个 """ 行
i18 = next(i for i, l in enumerate(lines) if '18. 全系机型安全区自动适配 (105)' in l)
i_new_close = next(i for i in range(i18, len(lines)) if lines[i].strip() == '"""')
# 旧正文起点 = 新闭合后第一行（🥇 开头）
i_old_start = i_new_close + 1
assert '🥇' in lines[i_old_start], lines[i_old_start][:60]
# 旧闭合 """ = contentLabel 之前的最后一个 """ 行
i_content = next(i for i in range(i_old_start, len(lines)) if 'let contentLabel = UILabel()' in lines[i])
i_old_close = max(i for i in range(i_old_start, i_content) if lines[i].strip() == '"""')
print('delete lines', i_old_start + 1, '..', i_old_close + 1, '(1-based)')
print('first:', lines[i_old_start][:60])
print('last :', lines[i_old_close][:60], '| next:', lines[i_old_close + 1][:60])
new_lines = lines[:i_new_close + 1] + lines[i_old_close + 1:]
out = '\r\n'.join(new_lines)
open(p, 'wb').write(out.encode('utf-8'))
print('saved, lines', len(lines), '->', len(new_lines))
