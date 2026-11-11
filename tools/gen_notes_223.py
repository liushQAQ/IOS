# -*- coding: utf-8 -*-
import os
R = r"E:\desktop\所有skill\deepseek-harness-ios"
out = os.path.join(R, "_dl_tmp_2.2.3", "notes.md")
txt = """## v2.2.3 (158)

### 修复
- **安装后打开就闪退（R74 根修）**：上版把键盘必弹开关写成了该机型 WKWebView 上不存在的属性，启动即抛 NSUnknownKeyException 崩溃。本版改为先检查属性是否存在、存在才设置，不存在安全跳过。
- **键盘必弹**（R72/R73 延续）：排队发送完再点会话框，键盘照样弹得出；拆掉键盘上方系统辅助条（↑↓完成），正文多出约一行。

### 兼容
- iOS 14.0+ / 基准机 iOS 16.3。

### 校验
- 回归闸门 112 绿 / 0 红（sourceHash 与现场一致）
- 产物：DSHios-public-2.2.3-158.tipa，4928609 B，md5 6f5ffae33f1062790390ad2f48d8cc2c
"""
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(txt)
print("written", os.path.getsize(out), "bytes")
