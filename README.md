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
- 图标已内置一张占位图（`AppIcon1024.png`，深色底 + "DSH" 字样），出包即用；正式图标直接替换同目录下这张 1024×1024 PNG 即可。
