# DeepSeek Harness iOS

从零开发的 DeepSeek Harness 移动客户端（iOS 16+）。采用与 Hermes Studio 一致的方案：**原生 Swift + WKWebView 薄壳**，加载 DSH 的 web UI，不重写任何客户端业务逻辑。

> 证书、签名、Apple Developer 账号由你自己搞定，本工程只提供完整源码 + 在线编译配置。

## 工作原理

App 是一个带地址栏的 WKWebView，加载你正在运行的 DeepSeek Harness web 服务：

```
http://<host>:<port>/dsh/?password=<密码>&token=<token>
```

- 局域网直连：`http://192.168.x.x:3081/dsh/`
- 公网/隧道：`http://cn-hk-bgp-4.ofalias.net:47027/dsh/?password=...&token=...`
- 已内置 ATS 豁免（明文 HTTP + WKWebView 均允许任意加载），iOS 16 下可直接访问 http。

## 目录结构

```
deepseek-harness-ios/
├── DSHios.xcodeproj/          # Xcode 工程（含共享 scheme）
├── DSHios/
│   ├── AppDelegate.swift      # @main 入口
│   ├── SceneDelegate.swift    # Scene 生命周期，根为 UINavigationController
│   ├── ViewController.swift   # WKWebView 壳 + 地址栏 + 加载指示器
│   ├── SettingsViewController.swift  # 设置页（保存服务地址）
│   ├── Info.plist             # ATS 豁免 / 权限描述 / iOS 16
│   ├── Assets.xcassets/       # 图标与主题色
│   └── Base.lproj/LaunchScreen.storyboard
├── codemagic.yaml             # Codemagic 在线编译【未签名 IPA】配置
├── exportOptions.plist        # 手动 xcodebuild 导出 IPA 的备用配置
├── build_ipa.sh               # macOS 一键打包【未签名 IPA】（本机 Windows 无法跑）
├── .github/workflows/build-ipa.yml  # GitHub Actions 在线打包【未签名 IPA】
├── .gitignore
└── README.md
```

## 关键配置

| 项 | 值 |
|---|---|
| Bundle ID | `com.deepseek.harness.ios` |
| Target | `DSHios` |
| iOS 部署目标 | `16.0` |
| Swift | 5.0 |
| 设备 | iPhone + iPad (`1,2`) |
| 默认地址 | `http://192.168.1.100:3081/dsh/`（`ViewController.swift` 中 `defaultURL`，可按需改） |

首次启动后，地址栏输入你的 DSH 服务地址即可；设置页可保存并复用它（存于 `UserDefaults`）。

## 本地编译（macOS / Xcode 14+）

1. 用 Xcode 打开 `DSHios.xcodeproj`。
2. 在 Signing & Capabilities 选择你的 Team（个人 Apple ID 即可）。
3. 连接 iPhone（iOS 16+）运行，或 Archive 出 IPA。

## 打包 IPA（你只要出 IPA，证书自己签）

本机是 Windows，**没有 iOS 编译工具链**（无 Xcode/swift/zsign，WSL 也未装 Linux 发行版），无法在本地把 Swift 编成 iOS-arm64 的 `.app`。要拿到 IPA 只有一条路：**用一台能编 iOS 的机器（Mac 或云端 macOS）跑一次编译打包**。已备好三种方式，都是产出**未签名 IPA**，交给你用爱思助手 / Sideloadly / AltStore / zsign 自己签：

### 方式 A — GitHub Actions（最省事，免费）
1. 把本目录推到 GitHub。
2. 推送到 `main`/`master` 分支，或在 Actions 页手动触发 `Build unsigned IPA`。
3. 跑完后在 workflow 的 **Artifacts** 里下载 `DSHios-unsigned-ipa`。
4. 解压得到 `DSHios-unsigned.ipa`，用你自己的证书签名侧载。

### 方式 B — Codemagic（免费额度）
1. 把本目录推到 GitHub/GitLab/Bitbucket，在 [codemagic.io](https://codemagic.io) 添加仓库。
2. 走 `codemagic.yaml` 的 `dsh-ios-build` workflow（已改为出**未签名 IPA**，不再需要证书）。
3. 构建完成后在 Artifacts 下载 `DSHios-unsigned.ipa`。

### 方式 C — 任意 macOS + Xcode 本机
在 Mac 上进入本目录，运行：
```bash
./build_ipa.sh
```
产出一键未签名 IPA：`dist/DSHios-unsigned.ipa`。

> 无论哪种方式，产物都是**未签名 IPA**；签名（你的 `.p12` + `.mobileprovision`）用爱思助手「IPA 签名」或 zsign 完成，然后侧载安装。

## 说明

- App 本身不内置任何 DSH 后端，需先有一个可访问的 DSH web 服务（本机 3081 端口 / 公网隧道均可）。
- 明文 HTTP 已通过 ATS 豁免放行；若服务是 HTTPS 则直接填 https 地址即可。
- 图标已内置官方鲸鱼图标（`AppIcon1024.png`）。

## 更新日志 (Changelog)

### v1.0.37 (Build 50)
- **通用全级别菜单/弹窗/二级三级插件浮层自适应防溢出**：
  - 全局内置移动端布局安全看门狗与媒体查询约束，所有插件浮层、多级下拉菜单、设置弹窗自动识别屏幕宽度并安全贴边；
  - 彻底杜绝水平超出视口、撑爆屏幕边界或无法点击的问题，自适应居中并支持内部平滑触摸滚动。
- **提示词优化与思考强度设置浮层移动端专属适配**：
  - 提示词优化与思考强度配置浮层针对移动端全面重构定位，居中排版与弹性最大宽高支持。
- **原生输入法与键盘弹窗防误唤起**：
  - 彻底解决切换会话与选择模型时未经用户点击自动唤出 iOS 软键盘的体验 Bug。
- **标题栏防碰撞与布局优化**：
  - 修复左侧抽屉开关与会话标题文本的重叠冲突。
- **工作区文件与交付物原生分享**：
  - 支持会话交付物卡片与文档预览一键调起 iOS 原生分享（存储到文件、微信、AirDrop）。

### v1.0.30 (Build 42)
- **新增工作区文件/交付物原生分享与保存到手机**：
  - 交付物卡片右侧注入原生「分享」按钮，点击调起 iOS 原生 `UIActivityViewController`；
  - 支持直接选择「存储到“文件”」、微信分享、隔空投送 (AirDrop)；
  - 文档预览顶部常驻「分享到手机」高亮按钮，边栏文件树支持一键分享单个文件。
- **界面层次与防遮挡优化**：
  - 底部 Token 统计自适应折行，告别滑动条；
  - 右侧边栏增加半透明遮罩与退出把手，轻触任意区域即可收起；
  - 修复模型快捷选择弹窗调起虚拟键盘或关闭软键盘时误关的冲突。
- **服务地址状态高亮与双版本机制**：
  - 浮窗与服务列表红点标明当前选中的服务地址；
  - 构建流程自动产出个人专属版与适合分发给他人使用的公开纯净版。
- **App 内置图文说明与更新日志**：
  - 「关于」弹窗与「连接教程与更新说明」界面均内嵌详细功能特性与更新日志。

