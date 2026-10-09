# Apple 官方开发规范与技术标准指南 (iOS 14 - 18)

本文档整理并归档了本项目在开发与维护 iOS 客户端过程中参考并严格遵循的 Apple 官方权威开发规范、技术说明（Technical Notes）以及 Human Interface Guidelines（HIG）。所有代码改动与系统级配置均以此为准绳。

---

## 一、网络与本地局域网权限规范 (Local Network Privacy)

### 1. Apple Technical Note TN3179: Understanding Local Network Privacy
- **官方参考**：[TN3179: Understanding Local Network Privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- **核心要求**：
  - 自 iOS 14 起，应用访问本地局域网（LAN）中的 IP 地址或服务时，受系统本地网络隐私策略保护；
  - `Info.plist` 中必须配置清晰、合规的用户使用说明字段：`NSLocalNetworkUsageDescription`；
  - 声明应用发现或连接的 Bonjour / 本地服务标识类型：`NSBonjourServices`，包括 `_http._tcp`、`_bonjour._tcp` 等。
- **本项目落位**：
  - 已在 `DSHios/Info.plist` 中完整声明 `NSLocalNetworkUsageDescription` 与 `NSBonjourServices`，确保在 iOS 14 ~ 18 设备上首次连接局域网 DSH 服务时弹出原生授权提示，并获得合法内网通信通道。

---

## 二、WKWebView 与安全机制规范 (App Transport Security)

### 1. Apple App Transport Security (ATS) 规范
- **官方参考**：[NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity)
- **核心要求**：
  - 针对开发者与本地自建服务器环境，允许使用明文 HTTP 协议直连本地服务；
  - 配置 `NSAllowsArbitraryLoads` 与 `NSAllowsLocalNetworking: YES`。
- **WebKit 混合内容与本地源安全机制**：
  - 在针对非 HTTPS 的局域网环境下（如 `http://192.168.x.x:3083`），现代 WebKit 会将该源判定为非安全上下文（Insecure Context）；
  - `crypto.subtle` 与原生 `crypto.randomUUID()` 在不安全上下文下可能会被 WebKit 禁用；
  - **规范建议**：对于自建内网客户端，客户端注入层必须提供安全上下文回退垫片（UUID v4 随机数引擎与安全 polyfill），保障网页能在 HTTP 纯内网环境中正常引导。

---

## 三、屏幕安全区与适配规范 (Human Interface Guidelines - Safe Area)

### 1. Apple HIG: Layout and Adaptivity
- **官方参考**：[HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- **核心准则**：
  - **避开系统状态栏与动态岛（Dynamic Island）**：
    所有应用控件、标题栏、交互按钮必须严格限制在系统的安全区（Safe Area）以内；
  - **CSS 环境变量**：
    网页端全屏渲染时，必须通过 `env(safe-area-inset-top)` 与 `env(safe-area-inset-bottom)` 计算留白，杜绝使用死代码写死 `top: 0` 或 `top: 16px`；
  - 对弹出模态窗（`<dialog>`、`.modal`、`.popup`），顶部最小间距不得小于状态栏基准高度（`max(56px, calc(env(safe-area-inset-top) + 16px))`），保证系统时间、电量与信号图标永远不被遮挡。

---

## 四、手势冲突与边缘手势处理规范 (Gestures and System Interactions)

### 1. UIScreenEdgePanGestureRecognizer 与系统返回手势
- **官方参考**：[UIScreenEdgePanGestureRecognizer](https://developer.apple.com/documentation/uikit/uiscreenedgepangesturerecognizer)
- **设计规范**：
  - iOS 系统原生将「屏幕左边缘向右滑动」保留为系统级页面返回手势（Interactive Pop Gesture）；
  - 第三方边缘召唤手势不得占用左侧屏幕边缘，建议使用**右侧屏幕边缘**（`edges = .right`）；
  - 避免手势拦截正常页面滚动：手势识别器需配置 `cancelsTouchesInView = false`。
- **本项目落位**：
  - 小鲸鱼悬浮召唤手势采用 `UIScreenEdgePanGestureRecognizer(edges: .right)`，从右边缘轻扫平滑召唤把手，彻底避开系统侧滑返回。

---

## 五、低版本兼容性标准 (Backward Compatibility iOS 14+)

### 1. 最低部署目标与符号兼容性
- **标准**：`IPHONEOS_DEPLOYMENT_TARGET = 14.0`；
- **API 降级规范**：
  - 严禁盲目使用仅在 iOS 16+ 引入的高版本专有 API（如 `Promise.withResolvers`、ES2023 `Array.prototype.toSorted` 等）；
  - 原生侧针对动态属性访问必须通过 `responds(to:)` 守护；
  - WebKit 侧通过用户脚本（WKUserScript）在文档首部注入标准 ECMAScript 规范垫片，确保 iOS 14 / 15 / 16 / 17 / 18 全版本渲染一致性。
