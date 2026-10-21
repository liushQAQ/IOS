# -*- coding: utf-8 -*-
# v1.0.131 发版文案：AppDelegate.marketing + Info.plist DSHAppVersion + showAbout 特性块
import sys
sys.stdout.reconfigure(encoding='utf-8')
CRLF = b'\r\n'
BASE = r'E:/desktop/所有skill/deepseek-harness-ios/'

def patch(path, old, new, label):
    p = BASE + path
    d = open(p, 'rb').read()
    n = d.count(old)
    assert n == 1, label + ' anchor count=' + str(n)
    out = d.replace(old, new, 1)
    open(p, 'wb').write(out)
    print(label, 'OK', len(out))

# 1. AppDelegate.marketing
patch('DSHios/AppDelegate.swift',
      b'static let marketing = "1.0.130"',
      b'static let marketing = "1.0.131"',
      'AppDelegate')

# 2. Info.plist
patch('DSHios/Info.plist',
      b'<string>1.0.130</string>',
      b'<string>1.0.131</string>',
      'Info.plist')

# 3. showAbout 特性块：换标题 + 在 130 首条前插入 131 新块
v = r'DSHios/ViewController.swift'
p = BASE + v
d = open(p, 'rb').read()
old_head = '            【最新特性 (v1.0.130)】'.encode('utf-8')
assert d.count(old_head) == 1, 'about head'
new_block_lines = [
    '            【最新特性 (v1.0.131)】'.encode('utf-8'),
    '            0. 🥇 玩家通用性大升级 —— App 对 DSH 桌面端新旧版本全兼容（按行为判定，不认版本号）：'.encode('utf-8'),
    '               ① 抽屉收敛加环境守卫：仅浮层式布局（新版前端）收敛 252，推挤式（旧版 / Linux 版桌面端）零干预保持原生，根治「玩家一换服务器版本页面就错乱」（像素实锤：强制 252 与旧前端原生 300 打架，主内容被推出右屏裁 24pt、发送钮切半；Safari 正常而 App 错乱，iOS 15.3 / 27 同中招，与系统版本无关）；'.encode('utf-8'),
    '               ② 插件条自动排队引擎：积分胶囊 / 优化 / 费用明细 / 任意第三方插件在会话框顶部背景模块里自动一行排齐（垂直居中、间距 8px），占位元素自动脱流不再挤压布局，模型选择器自适应宽度永不压发送钮，每 0.9 秒自动重排 —— 不写死任何插件坐标，装任何插件都自动入列；'.encode('utf-8'),
    '               ③ 会话时间线叠行根治（思考 / 运行命令第二行浅色重影压到下一行）：iOS 上禁用 TextShimmer 装饰副本层 + 三重 nowrap 兜底；'.encode('utf-8'),
    '               ④ 插件热重载弹窗 2 秒自动收走 + 全面紧凑化，不再长时间糊在页面上；'.encode('utf-8'),
    '               ⑤ 🎤 语音按钮回归：DSH 换版后旧哈希类名失效导致按钮消失，已改语义化定位 —— 语音文字回填、Enter 换行优化一并修活；'.encode('utf-8'),
]
new_head = CRLF.join(new_block_lines)
d = d.replace(old_head, new_head, 1)
open(p, 'wb').write(d)
print('showAbout OK', len(d))
print('CRLF:', d.count(b'\r\n'), 'LF-only:', d.count(b'\n') - d.count(b'\r\n'), 'triple:', d.count(b'"""'))
