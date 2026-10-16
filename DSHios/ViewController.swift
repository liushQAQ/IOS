import UIKit
import WebKit
import Network
import AudioToolbox
import Speech
import AVFoundation

/// 主界面：全屏 WKWebView，与电脑桌面端 DSH 布局完全一致（无任何原生地址栏/工具栏遮挡）。
/// 原生只在「连不上」时接管：错误浮层 + 重试；右下角一个半透明小按钮用于换地址/看版本。
final class ViewController: UIViewController {

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!
    private var errorOverlay: UIView!
    private var errorTitleLabel: UILabel!
    private var errorDetailLabel: UILabel!
    private var menuButton: UIButton!
    /// 悬浮按钮的右缘约束：constant 越小越靠右，收起态为负值（把按钮推出屏幕外）。
    private var menuTrailingConstraint: NSLayoutConstraint!
    private var navigationTimer: Timer?
    private var pathMonitor: NWPathMonitor?
    private var hasLoadedOnce = false
    /// 401 token 页自动换票重试的防重入标志（防止 didFinish→重载→didFinish 死循环）。
    private var isTokenRetryInFlight = false
    /// 3083 Pocket 握手自动重试防重入（503 握手页 → 清 cookie 重载一次）。
    private var isPocketRetryInFlight = false
    /// 白屏自诊断采样计时器（多次采样把 JS 崩溃画到浮层，而不是留一个纯白屏）。
    private var diagnoseTimers: [Timer] = []

    // MARK: 键盘避让与安全区（v1.0.70）
    /// WebView 顶部约束：DSH 页面 = 0（顶栏自绘背景延伸到状态栏后），外部网页 = safeAreaInsets.top
    private var webViewTopConstraint: NSLayoutConstraint!
    /// WebView 底部约束：键盘弹出时 = 键盘高度（压缩视口让输入框始终可见，顶栏纹丝不动）
    private var webViewBottomConstraint: NSLayoutConstraint!
    /// DSH 服务的 host:port（用于区分 DSH 页面与外嵌免费网页对话等第三方页面）
    private var dshServiceHost: String?
    /// 键盘当前是否可见
    private var isKeyboardVisible = false
    /// 键盘遮挡高度（pt）。下发给页内脚本，让输入框滚到键盘正上方。
    private var keyboardOverlap: CGFloat = 0

    /// 语音听写识别器与音频引擎（调用 iOS 原生语音听写）
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var isDictating = false
    private var lastRecognizedText = ""

    /// 悬浮菜单按钮：收起时只从右缘露出一条把手，展开后完整可见。
    private var menuButtonExpanded = false
    /// 展开后的自动收起计时器（「不用了自动隐藏」）。
    private var menuAutoHideTimer: Timer?

    /// 悬浮按钮边长（44pt 精致小巧圆形）。
    private static let menuButtonSide: CGFloat = 44
    /// 收起时从右缘露出的宽度。
    /// v1.0.74：v1.0.73 改成整颗露出，用户反馈「悬浮按钮没有隐藏了」。
    /// 收起态只留 14pt 一条细把手贴在右缘（不再是被裁掉的半个圆，也不再整颗占屏）。
    private static let menuCollapsedPeek: CGFloat = 14
    /// 展开态距右缘的间距。
    private static let menuTrailingInset: CGFloat = 10
    /// 展开后静置多久自动半隐藏（3 秒后自动隐藏一半）。
    private static let menuAutoHideDelay: TimeInterval = 3.0

    /// 收起态右缘约束值：正值把按钮推出屏幕，只留 `menuCollapsedPeek` 宽在屏内。
    /// 约束语义是 `button.trailing = safeArea.trailing + constant`，
    /// 所以正值 = 往屏幕右外侧推，负值 = 从右缘往内缩。
    private static var menuCollapsedConstant: CGFloat {
        menuButtonSide - menuCollapsedPeek
    }
    /// 展开态右缘约束值。
    private static var menuExpandedConstant: CGFloat {
        -menuTrailingInset
    }

    private static func makeErrorBridge(owner: ViewController) -> WKScriptMessageHandler {
        return ErrorBridge { [weak owner] message in
            owner?.recordWebError(message)
        }
    }

    private final class ErrorBridge: NSObject, WKScriptMessageHandler {
        let onMessage: (String) -> Void
        init(onMessage: @escaping (String) -> Void) { self.onMessage = onMessage }
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if let text = message.body as? String { onMessage(text) }
        }
    }

    private static func makeFileTransferBridge(owner: ViewController) -> WKScriptMessageHandler {
        return FileTransferBridge { [weak owner] info in
            owner?.handleIncomingFile(info)
        }
    }

    private final class FileTransferBridge: NSObject, WKScriptMessageHandler {
        let onFile: ([String: Any]) -> Void
        init(onFile: @escaping ([String: Any]) -> Void) { self.onFile = onFile }
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if let dict = message.body as? [String: Any] {
                onFile(dict)
            }
        }
    }

    /// 接收前端导出的文件并唤起系统级保存与分享（ShareSheet / 保存到文件）
    private func handleIncomingFile(_ info: [String: Any]) {
        guard let name = info["name"] as? String,
              let base64 = info["base64"] as? String,
              let data = Data(base64Encoded: base64) else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let tempDir = FileManager.default.temporaryDirectory
            let targetURL = tempDir.appendingPathComponent(name)
            do {
                try data.write(to: targetURL)
                let activityVC = UIActivityViewController(activityItems: [targetURL], applicationActivities: nil)
                if let popover = activityVC.popoverPresentationController {
                    popover.sourceView = self.menuButton ?? self.view
                    popover.sourceRect = self.menuButton?.bounds ?? CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 0, height: 0)
                }
                self.present(activityVC, animated: true)
            } catch {
                let alert = UIAlertController(title: "保存失败", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "好", style: .default))
                self.present(alert, animated: true)
            }
        }
    }

    private static func makeVoiceInputBridge(owner: ViewController) -> WKScriptMessageHandler {
        VoiceInputBridge { [weak owner] dict in
            guard let self = owner,
                  let action = dict["action"] as? String else { return }
            if action == "toggle" {
                DispatchQueue.main.async {
                    self.toggleVoiceDictation()
                }
            } else if action == "stop" {
                DispatchQueue.main.async {
                    self.stopVoiceDictation()
                }
            }
        }
    }

    private final class VoiceInputBridge: NSObject, WKScriptMessageHandler {
        let onAction: ([String: Any]) -> Void
        init(onAction: @escaping ([String: Any]) -> Void) { self.onAction = onAction }
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if let dict = message.body as? [String: Any] {
                onAction(dict)
            }
        }
    }

    private static func makeAppUpdateBridge(owner: ViewController) -> WKScriptMessageHandler {
        VoiceInputBridge { [weak owner] dict in
            guard let self = owner else { return }
            let action = dict["action"] as? String ?? "check"
            DispatchQueue.main.async {
                if action == "install", let urlStr = dict["url"] as? String, !urlStr.isEmpty {
                    self.installViaTrollStore(remoteURLString: urlStr)
                } else {
                    self.checkForAppUpdates(manual: true)
                }
            }
        }
    }

    /// 累积 Web 侧异常，最多保留最近 4 条，供自诊断浮层展示。
    private func recordWebError(_ text: String) {
        let line = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces)
        guard !line.isEmpty else { return }
        DispatchQueue.main.async {
            if self.webErrors.count >= 8 { self.webErrors.removeFirst() }
            if self.webErrors.last != line { self.webErrors.append(line) }
        }
    }

    /// didFinish 后多次延时采样 #root。
    /// 注意：didFinish 只代表 HTML 解析完，插件 bundle（约 14MB）还要再加载十几秒，
    /// 因此前几次采样允许为空——只有最后一次（约 25 秒后）仍空才判定白屏，避免误报。
    private func startWhiteScreenDiagnostics() {
        diagnoseTimers.forEach { $0.invalidate() }
        let delays: [TimeInterval] = [10.0, 18.0, 28.0]
        diagnoseTimers = delays.enumerated().map { index, delay in
            Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
                // 最后一次采样才允许报警；前几次只负责提前确认页面已渲染。
                self?.sampleRoot(report: index == delays.count - 1)
            }
        }
    }

    private func stopWhiteScreenDiagnostics() {
        diagnoseTimers.forEach { $0.invalidate() }
        diagnoseTimers = []
    }

    private func sampleRoot(report: Bool) {
        guard isViewLoaded, view.window != nil else { return }
        let check = """
        (function () {
          var root = document.getElementById('root');
          var len = root ? (root.innerText || '').trim().length : -1;
          var kids = root ? root.children.length : -1;
          var hasBR = typeof Promise.withResolvers === 'function';
          var hasAt = typeof Array.prototype.at === 'function';
          var hasOwn = typeof Object.hasOwn === 'function';
          var hasTS = typeof Array.prototype.toSorted === 'function';
          // v1.0.105：DSH 官方前端（vendor 包）内含 RegExp 后行断言 lookbehind 正则字面量，
          // 而 lookbehind 需 Safari / iOS 16.4+ 才支持。必须用 new RegExp(字符串) 运行期探测——
          // 若写成正则字面量，在旧 WebKit 上本段诊断脚本自身会解析失败，什么都探不到。
          var hasLB = true;
          try { new RegExp('(?<=a)b'); } catch (e) { hasLB = false; }
          return JSON.stringify({ rootLen: len, rootKids: kids, withResolvers: hasBR, at: hasAt, hasOwn: hasOwn, toSorted: hasTS, lookbehind: hasLB });
        })()
        """
        webView.evaluateJavaScript(check) { [weak self] result, error in
            guard let self else { return }
            if let json = result as? String,
               let data = json.data(using: .utf8),
               let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let rootLen = info["rootLen"] as? Int ?? -1
                // 页面已经渲染出内容：撤掉诊断，正常显示。
                if rootLen > 0 {
                    self.stopWhiteScreenDiagnostics()
                    self.hideError()
                    self.hasLoadedOnce = true
                    self.revealWebView()
                    return
                }
                // 尚未到判定时刻：插件可能还在加载，不打扰。
                guard report else { return }
                // v1.0.105：白屏根因若是系统 WebKit 太旧（不支持 RegExp lookbehind），
                // 不再甩一句"页面白屏"让人猜，直接给出版本门槛与可执行动作。
                // 说明：DSH 官方前端自身就要求 iOS 16.4+，这不是 App 引入的限制，
                // 所以正确做法是"把官方的能力边界讲清楚"，而不是去改 DSH 官方文件。
                if (info["lookbehind"] as? Bool) == false {
                    self.errorTitleLabel.text = "系统版本过低"
                    self.showError(detail: """
                    当前 iOS 版本过低，无法运行 DSH 网页端。

                    DSH 官方前端使用了 RegExp 后行断言（lookbehind），
                    该语法需要 iOS 16.4 或更高版本（Safari / WebKit 16.4+）。

                    本机检测：lookbehind = 不支持
                    解决办法：设置 → 通用 → 软件更新，升级到 iOS 16.4 及以上后再试。
                    """)
                    return
                }
                let details = [
                    "#root 文本长度=\(info["rootLen"] ?? "?") 子节点数=\(info["rootKids"] ?? "?")",
                    "API: withResolvers=\(info["withResolvers"] ?? "?") at=\(info["at"] ?? "?") hasOwn=\(info["hasOwn"] ?? "?") toSorted=\(info["toSorted"] ?? "?") lookbehind=\(info["lookbehind"] ?? "?")"
                ]
                var parts = details
                if !self.webErrors.isEmpty { parts.append("JS 异常：" + self.webErrors.joined(separator: " ｜ ")) }
                self.errorTitleLabel.text = "页面白屏"
                self.showError(detail: "页面加载后未渲染（白屏）。\n" + parts.joined(separator: "\n"))
            } else if let error {
                self.showError(detail: "页面无响应，无法读取内容：\(error.localizedDescription)")
            }
        }
    }

    // MARK: - 首屏提前显形（v1.0.106）

    /// DSH 官方前端启动时要同步解析执行「已安装插件」的 client bundle。
    /// 实测本机两个 bundle 分别约 5.87MB / 5.60MB（合计 11.5MB，装的插件越多越胖），
    /// 全部下载只要 30ms（局域网），但**解析执行**在桌面 CPU 上约 3 秒，
    /// 在 iPhone（尤其巨魔 TrollStore 冻结在 iOS 16.3 的老机型，单核约为桌面 1/6~1/10）
    /// 上线性放大到 20~40 秒 —— 而 `window.load`（= didFinish）正好落在这之后。
    ///
    /// 实测时间线（10x CPU 降频，430x932 iPhone 视口）：
    ///   +0.73s readyState=interactive → +1.59s DOMContentLoaded
    ///   → 主线程连续阻塞 28s（就是那 11.5MB 插件的解析执行）
    ///   → +37.5s readyState=complete / window.load
    /// 也就是说页面早就画出来了，却被 `alpha=0` 遮住干等 didFinish。
    ///
    /// 这里改为「探测到 #root 有子节点（React 已挂载并出首帧）就立刻显形」，
    /// 不再死等 didFinish。真正白屏（#root 空）时依旧不显形，由白屏诊断报错。
    private var earlyRevealTimer: Timer?
    private var earlyRevealTicks = 0
    /// 探测在途标记：WebContent 进程被长任务占住时回包会延迟，期间不再重复下发，
    /// 避免积压上百个跨进程调用。
    private var earlyRevealInFlight = false

    /// 每 250ms 轻量探测 #root 是否已有子节点；一旦有就立刻显形。
    /// 探测脚本极短（单次 querySelector + children.length），不会和主线程长任务抢资源。
    private func startEarlyRevealProbe() {
        stopEarlyRevealProbe()
        earlyRevealTicks = 0
        earlyRevealTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self, self.isViewLoaded, self.view.window != nil else { return }
            self.earlyRevealTicks += 1
            // 硬上限 4 分钟：真正异常时由导航超时 / 白屏诊断负责报错，这里只负责"能显就早显"。
            if self.earlyRevealTicks > 960 {
                self.stopEarlyRevealProbe()
                return
            }
            guard !self.earlyRevealInFlight else { return }
            self.earlyRevealInFlight = true
            self.webView.evaluateJavaScript(
                "(function(){var r=document.getElementById('root');return r?r.children.length:-1;})()"
            ) { [weak self] result, _ in
                guard let self else { return }
                self.earlyRevealInFlight = false
                let kids: Int
                if let n = result as? NSNumber { kids = n.intValue }
                else if let i = result as? Int { kids = i }
                else { kids = -1 }
                if kids > 0 { self.finishEarlyReveal() }
            }
        }
    }

    /// 首次发现页面已出首帧：停探测、停转圈、显形。幂等，重复调用无副作用。
    private func finishEarlyReveal() {
        stopEarlyRevealProbe()
        hideError()
        hasLoadedOnce = true
        activityIndicator.stopAnimating()
        revealWebView()
    }

    private func stopEarlyRevealProbe() {
        earlyRevealTimer?.invalidate()
        earlyRevealTimer = nil
        earlyRevealInFlight = false
    }

    private var webErrors: [String] = []
    /// Web 内容进程被系统回收的次数（内存压力导致白屏的重要嫌疑指标）。
    private var terminateCount = 0

    /// 默认加载地址（纯净公开版占位示例，个人地址由用户在 App 内添加并持久化在本地沙盒）：
    private let defaultURL = "http://192.168.1.100:3083/"

    private struct Keys {
        static let lastURL = "DSHios.lastURL"
        static let urlVersion = "DSHios.urlVersion"
        static let currentURLVersion = 4
        static let layoutEdit = "DSHios.layoutEdit"
    }

    /// iOS 16 缺失的关键 Web API 兜底。页面构建目标定得比 16 高，
    /// 缺失任一都会导致启动脚本抛错白屏。每条只在原生不存在时补齐。
    static let iosCompatShims: [String] = [
        // 移动端视觉与对比度增强：
        // 1. 消除所有浮层/弹窗（包括Token用量弹窗、模型选择、右键菜单、设置面板）过透导致的文字重叠与背景干扰，
        //    提升至 98% 接近纯色的高对比度背景（浅色模式白底 / 深色模式沉浸黑底），并辅以柔和阴影，字迹清晰锐利。
        // 2. 修复 iOS 键盘弹窗与模型选择菜单冲突问题：
        //    - 移动端点击模型选择时，输入框自动 focus 会调起虚拟软键盘；
        //    - 用户关闭软键盘或在虚拟键盘收起时，input 触发 blur，导致整个弹窗被误关。
        //    - 解决方案：在移动端/触摸环境下，屏蔽对 .VYXhfG_search 的脚本自动聚焦（需用户主动触摸点击才聚焦输入）；
        //    - 拦截输入框失焦事件（blur），防止关闭软键盘时级联关闭整个菜单。
        """
        (function() {
          var style = document.createElement('style');
          style.id = 'dsh-ios-glass-enhancement';
          style.textContent = [
            ':root {',
            '  --dsw-menu-surface-fill: rgba(255, 255, 255, 0.98) !important;',
            '  --dsw-specific-menu: rgba(255, 255, 255, 0.98) !important;',
            '  --dsw-menu-backdrop-filter: blur(20px) saturate(140%) !important;',
            '}',
            'body[data-ds-dark-theme] {',
            '  --dsw-menu-surface-fill: rgba(20, 22, 26, 0.98) !important;',
            '  --dsw-specific-menu: rgba(20, 22, 26, 0.98) !important;',
            '  --dsw-menu-backdrop-filter: blur(20px) saturate(140%) !important;',
            '}',
            '/* 覆盖所有弹窗、Token用量面板、模型选择、会话列表、设置浮层，彻底告别半透明重叠 */',
            '._7aoaqW_panel,',
            '.lHqH9G_panel,',
            '.fxu7oq_panel,',
            '.VYXhfG_menu,',
            '[data-menu-material="translucent"],',
            '[data-menu-material],',
            '[role="menu"],',
            '[role="listbox"],',
            '[role="dialog"],',
            '.ZiQlkq_panel,',
            '.ZKHwIG_dialog {',
            '  background-color: var(--dsw-menu-surface-fill) !important;',
            '  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--dsw-elevation-stroke-color, rgba(255, 255, 255, 0.12)) !important;',
            '}',
            '/* Token用量弹层(_7aoaqW_panel)内部文字与进度条增强 */',
            '._7aoaqW_panel {',
            '  z-index: 10060 !important;',
            '  color: var(--dsw-alias-label-primary) !important;',
            '}',
            '._7aoaqW_panel:before, .lHqH9G_panel:before, .fxu7oq_panel:before {',
            '  background: var(--dsw-menu-surface-fill) !important;',
            '}',
            '.VYXhfG_modelName,',
            '.VYXhfG_cellLabel,',
            '.VYXhfG_cellValue {',
            '  font-weight: 500 !important;',
            '  opacity: 1 !important;',
            '}',
            '/* 全局触控与滚动平滑加速（对齐原生体验） */',
            '* {',
            '  -webkit-tap-highlight-color: transparent;',
            '}',
            '.scrollable, [data-scrollable], [role="menu"], [role="listbox"], pre, code {',
            '  -webkit-overflow-scrolling: touch !important;',
            '}',
            '/* 保证模型选择弹层、视图选项（工作区/时间排序菜单）在软键盘弹出与收起时拥有固定层级与平滑交互，并且支持触摸滚动 */',
            '.VYXhfG_menu,',
            '[role="menu"],',
            '[data-menu-material],',
            '.tPVXea_viewOptionsMenu,',
            '[class*="viewOptionsMenu"],',
            '[class*="_portal_"] {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  z-index: 10050 !important;',
            '  max-height: min(480px, 85vh) !important;',
            '  transform: translateZ(0);',
            '}',
            '.VYXhfG_groups {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  max-height: min(380px, 72vh) !important;',
            '  transform: translateZ(0);',
            '}',
            '/* 提示词优化与思考强度设置浮层弹窗移动端适配，防止超出屏幕 */',
            '.dsh-po-modal-container {',
            '  max-height: 80vh !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  box-sizing: border-box !important;',
            '}',
            '@media (max-width: 600px) {',
            '  .dsh-po-modal-container {',
            '    position: fixed !important;',
            '    left: 12px !important;',
            '    right: 12px !important;',
            '    bottom: 60px !important;',
            '    width: auto !important;',
            '    max-width: calc(100vw - 24px) !important;',
            '    max-height: calc(85vh - 70px) !important;',
            '    z-index: 10050 !important;',
            '  }',
            '}',
            '/* 移动端全级别菜单、弹窗、二级/三级插件浮层通用防溢出与自适应安全边界约束 */',
            '@media (max-width: 768px) {',
            '  [role="menu"],',
            '  [role="listbox"],',
            '  [role="dialog"],',
            '  [data-menu-material],',
            '  [data-menu-surface],',
            '  .VYXhfG_menu,',
            '  [class*="menu"],',
            '  [class*="modal"],',
            '  [class*="Modal"],',
            '  [class*="popup"],',
            '  [class*="Popup"],',
            '  [class*="dropdown"],',
            '  [class*="Dropdown"],',
            '  [class*="dialog"],',
            '  [class*="Dialog"] {',
            '    max-width: calc(100vw - 20px) !important;',
            '    max-height: calc(100vh - 40px) !important;',
            '    box-sizing: border-box !important;',
            '    overflow-y: auto !important;',
            '    -webkit-overflow-scrolling: touch !important;',
            '  }',
            '  /* 原生 HTML5 <dialog>（如费用明细、会话统计弹窗）严格遵守 iOS 顶部状态栏与底部安全区，严禁超高压顶 */',
            '  dialog,',
            '  dialog[open],',
            '  dialog[role="dialog"] {',
            '    position: fixed !important;',
            '    top: max(56px, calc(env(safe-area-inset-top, 0px) + 16px)) !important;',
            '    bottom: max(16px, env(safe-area-inset-bottom, 0px)) !important;',
            '    left: 12px !important;',
            '    right: 12px !important;',
            '    margin: 0 !important;',
            '    width: calc(100vw - 24px) !important;',
            '    max-width: calc(100vw - 24px) !important;',
            '    max-height: calc(100vh - max(56px, calc(env(safe-area-inset-top, 0px) + 16px)) - max(16px, env(safe-area-inset-bottom, 0px))) !important;',
            '    box-sizing: border-box !important;',
            '    overflow-y: auto !important;',
            '    -webkit-overflow-scrolling: touch !important;',
            '  }',
            '}',
            '/* 优化一级、二级、三级菜单与弹层移动端层叠排版，消除相互遮挡 */',
            '.VYXhfG_cell {',
            '  min-height: 40px !important;',
            '  padding: 8px 12px !important;',
            '}',
            '.VYXhfG_option {',
            '  min-height: 38px !important;',
            '}',
            '/* 二级与三级侧边/抽屉菜单适配 */',
            '[data-slot="sidebar.right"], [data-slot="sidebar.left"] {',
            '  z-index: 10040 !important;',
            '}',
            '/* 大图预览弹窗 (ImageLightbox) 关闭按钮严格固定在屏幕安全视口右上角，严禁被缩放图片移出屏外 */',
            '[role="dialog"][aria-modal="true"] button[class*="close"],',
            '.ImageLightbox_close,',
            '[class*="ImageLightbox"] button {',
            '  position: fixed !important;',
            '  top: max(20px, calc(env(safe-area-inset-top, 0px) + 12px)) !important;',
            '  right: max(20px, calc(env(safe-area-inset-right, 0px) + 12px)) !important;',
            '  z-index: 100000 !important;',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  background: rgba(0, 0, 0, 0.65) !important;',
            '  color: #ffffff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.3) !important;',
            '  border-radius: 999px !important;',
            '  backdrop-filter: blur(10px) !important;',
            '  -webkit-backdrop-filter: blur(10px) !important;',
            '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;',
            '}',
            '/* 顶部导航栏：完全采用统一 Flex 居中流，并在虚拟键盘弹出或页面滚动时 Sticky 吸顶固定不动 */',
            'html, body {',
            '  overflow: hidden !important;',
            '  overscroll-behavior: none !important;',
            '  position: fixed !important;',
            '  inset: 0 !important;',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '}',
            '[data-phase] header,',
            '.ank0OG_header {',
            '  position: sticky !important;',
            '  top: 0 !important;',
            '  z-index: 1020 !important;',
            '  background: var(--dsw-alias-bg-base, #ffffff) !important;',
            '  box-sizing: border-box !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  min-height: 0 !important;',
            '  padding: 8px 10px 0 10px !important;',
            '  flex: none !important;',
            '}',
            'body[data-ds-dark-theme] [data-phase] header,',
            'body[data-ds-dark-theme] .ank0OG_header {',
            '  background: var(--dsw-alias-bg-base, #151517) !important;',
            '}',
            '.ank0OG_headerLeading {',
            '  display: none !important;',
            '}',
            '/* 隐藏顶栏 Windows/桌面系统文件资源管理器打开图标 */',
            '.ank0OG_header .PPCmka_menuAnchor,',
            '.ank0OG_header .PPCmka_split,',
            '[data-slot="conversation.session.header.utilities"] {',
            '  display: none !important;',
            '}',
            '/* 彻底隐藏所有运行命令/执行步骤/文件路径后面的“复制”按钮 */',
            '[data-mobile-nav="copy-file"],',
            'button[data-mobile-nav="copy-file"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '}',
            '[data-phase] header .ank0OG_titleRow,',
            '.ank0OG_titleRow {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  padding: 0 2px !important;',
            '  margin: 0 !important;',
            '  box-sizing: border-box !important;',
            '  width: 100% !important;',
            '  gap: 6px !important;',
            '}',
            '/* v1.0.83：不再把左侧目录按钮钉成 28px。页面自带 38px，钉小后进了具体会话就变小，',
            '   还和另一颗叠在一起。尺寸交给页面自己，位置回归正常排列。 */',
            '[data-mobile-nav="toggle"] {',
            '  position: static !important;',
            '  transform: none !important;',
            '  top: auto !important;',
            '  left: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  border-radius: var(--dsw-radius-sm, 6px) !important;',
            '  z-index: 100 !important;',
            '}',
            '[data-mobile-nav="toggle"] svg {',
            '  width: 16px !important;',
            '  height: 16px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '[data-mobile-nav="files"] {',
            '  display: none !important;',
            '}',
            '/* 顶栏会话标题与成员按钮同步右移，严禁与左侧侧边栏按钮重叠 */',
            '/* v1.0.75：flex:1 会把标题簇拉满整行，标题文字仍贴在最左边、右边空出两百多像素。',
            '   改成按内容收缩并用 margin-left:auto 把空位吃到左边，整组靠右贴近右侧边栏按钮。 */',
            '/* 顶栏会话标题居中排布（老总定版）：',
            '   左侧目录按钮靠左，会话标题在屏幕正中居中显示并平滑截断，右侧操作组靠右排列！ */',
            '.ank0OG_titleRow,',
            '[data-phase] header [class*="titleRow"] {',
            '  position: relative !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  justify-content: space-between !important;',
            '  width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.ank0OG_crumbs,',
            '[data-phase] header [class*="crumbs"],',
            '[data-phase] header [class$="_crumbs"] {',
            '  position: absolute !important;',
            '  left: 54px !important;',
            '  right: 96px !important;',
            '  margin: 0 auto !important;',
            '  display: flex !important;',
            '  justify-content: center !important;',
            '  align-items: center !important;',
            '  text-align: center !important;',
            '  max-width: calc(100% - 150px) !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  pointer-events: auto !important;',
            '}',
            '.ank0OG_crumbs *,',
            '[data-phase] header [class*="crumbs"] *,',
            '.ank0OG_crumb,',
            '.ank0OG_crumbCurrent,',
            '.ank0OG_crumbSeg {',
            '  text-align: center !important;',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  word-break: keep-all !important;',
            '  font-weight: 600 !important;',
            '  font-size: 15px !important;',
            '  line-height: 22px !important;',
            '  padding: 2px 4px !important;',
            '}',
            '.ank0OG_titleCluster,',
            '[data-phase] header [class*="titleCluster"],',
            '.ank0OG_headerActions {',
            '  margin-left: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  gap: 6px !important;',
            '}',
            '/* 智能体团队及顶栏操作按钮：强制绝对抗挤压、不收缩、不折行、完整保持横排药丸 */',
            '[class*="titleCluster"] > :not([class*="crumbs"]):not([class$="_crumbs"]),',
            '[class*="titleCluster"] button,',
            '.ank0OG_titleCluster button,',
            'button[aria-label="智能体团队"],',
            'button[aria-label*="智能体团队"],',
            'button[title*="智能体团队"],',
            '[class*="agentTeam"],',
            '[data-agent-team-button] {',
            '  flex: 0 0 auto !important;',
            '  flex-shrink: 0 !important;',
            '  white-space: nowrap !important;',
            '  min-width: max-content !important;',
            '  word-break: keep-all !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '}',
            '.ank0OG_headerActions {',
            '  height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '}',
            '.ank0OG_headerCorner {',
            '  height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  margin-left: auto !important;',
            '}',
            '/* 统一右侧按钮尺寸为 32x32。v1.0.83：目录按钮也在 headerActions 里，',
            '   排除它，保留页面自带的 38px，避免进了具体会话就变小。 */',
            '.ank0OG_headerCorner button,',
            '.ank0OG_headerCorner [role="button"],',
            '.ank0OG_headerActions button:not([data-mobile-nav="toggle"]),',
            '.ank0OG_headerActions [role="button"]:not([data-mobile-nav="toggle"]) {',
            '  height: 32px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '.ank0OG_crumbs,',
            '[data-phase] header [class*="crumbs"] {',
            '  flex: 0 1 auto !important;',
            '  flex-shrink: 1 !important;',
            '  min-width: 0 !important;',
            '  max-width: 22vw !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  height: 32px !important;',
            '}',
            '.ank0OG_crumbSeg {',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '.ank0OG_crumb,',
            '.ank0OG_crumbCurrent {',
            '  max-width: 100% !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  word-break: keep-all !important;',
            '  font-weight: 600 !important;',
            '  font-size: 15px !important;',
            '  line-height: 22px !important;',
            '  padding: 2px 4px !important;',
            '}',
            '/* 调整标签页切换行 */',
            '.ank0OG_tabs {',
            '  margin-top: 4px !important;',
            '}',
            '/* 思考块(ReasoningRow)在移动端流式输出时单行自适应省略，防止文字折行溢出碰撞下方命令与步骤 */',
            '.w_X3iW_root {',
            '  overflow: hidden !important;',
            '}',
            '.w_X3iW_row {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  flex-wrap: nowrap !important;',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '}',
            '.w_X3iW_summary,',
            '.w_X3iW_summaryText {',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  display: inline-block !important;',
            '  max-width: 100% !important;',
            '}',
            '/* 保证对话消息流内边距舒适居中与滚动自适应 */',
            '.X6jxGq_scroll {',
            '  padding: 16px 16px 24px 16px !important;',
            '}',
            '.X6jxGq_column {',
            '  max-width: 100% !important;',
            '  width: 100% !important;',
            '  margin: 0 auto !important;',
            '}',
            '.ank0OG_headerActions {',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '}',
            '._1Ihh1G_root,',
            '._1Ihh1G_trigger {',
            '  max-width: none !important;',
            '  overflow: visible !important;',
            '  white-space: nowrap !important;',
            '  padding: 0 4px !important;',
            '}',
            '/* 移动端顶栏隐藏智能体按钮右侧孤立的数字徽标(如数字 1)，消除视觉杂音，保持纯净图标 */',
            '._1Ihh1G_count,',
            '[class*="_1Ihh1G_count"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '}',
            '.ank0OG_headerCorner {',
            '  margin-left: 2px !important;',
            '  margin-right: 0px !important;',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '}',
            '.ank0OG_headerCorner button,',
            'button[aria-label="打开右侧边栏"],',
            '.iFjIhq_button {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '.ank0OG_headerCorner button svg,',
            'button[aria-label="打开右侧边栏"] svg,',
            '.iFjIhq_button svg {',
            '  width: 16px !important;',
            '  height: 16px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '.dMHGga_iconButton,',
            'button[aria-label="收起右侧边栏"] {',
            '  top: 12px !important;',
            '  height: 28px !important;',
            '  width: 28px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            /* 2. 修复右侧边栏(文件/终端/浏览器/文档预览/Diff代码对比)在移动端展开后遮挡且缺乏状态栏避让 */
            '[class*="rightbarCol"],',
            '.CZPbNW_rightbarCol,',
            '[data-slot="sidebar.right"],',
            '.dMHGga_session,',
            '[class*="dMHGga_root"],',
            '.dMHGga_panel,',
            '.YdIzba_header,',
            '[class*="YdIzba_root"],',
            '[data-dockkit-surface],',
            '[data-dockkit-strip],',
            '[data-aionui-preview-col] {',
            '  padding-top: calc(var(--dsh-statusbar, 54px) + 6px - var(--dsh-topshift, 0px)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="rightbarCol"],',
            '.CZPbNW_rightbarCol {',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  height: 100vh !important;',
            '  height: 100dvh !important;',
            '  max-height: 100vh !important;',
            '  max-height: 100dvh !important;',
            '  overflow: hidden !important;',
            '}',
            '@media (max-width: 1023px) {',
            '  .CZPbNW_rightbarCol, [class*="rightbarCol"] {',
            '    position: fixed !important;',
            '    inset: 0 !important;',
            '    width: 100vw !important;',
            '    max-width: 100vw !important;',
            '    height: 100vh !important;',
            '    height: 100dvh !important;',
            '    z-index: 10040 !important;',
            '    background: var(--dsw-alias-bg-base, #18181b) !important;',
            '    box-sizing: border-box !important;',
            '    transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease !important;',
            '    transform: translateX(105%) !important;',
            '    opacity: 0 !important;',
            '    pointer-events: none !important;',
            '  }',
            '  .CZPbNW_rightbarCol:has([data-sidebar-right-open="true"]),',
            '  [class*="rightbarCol"]:has([data-sidebar-right-open="true"]) {',
            '    transform: none !important;',
            '    opacity: 1 !important;',
            '    pointer-events: auto !important;',
            '  }',
            '  .dMHGga_panel {',
            '    width: 100% !important;',
            '    height: 100% !important;',
            '    display: flex !important;',
            '    flex-direction: column !important;',
            '  }',
            '}',
            '.dMHGga_panel[data-sidebar-right-open] {',
            '  pointer-events: auto !important;',
            '  z-index: 10040 !important;',
            '}',
            '/* 右侧边栏展开时移动端半透明背景遮罩（点击即可收起退出） */',
            '.dsh-mobile-sidebar-backdrop {',
            '  position: fixed;',
            '  inset: 0;',
            '  background: rgba(0, 0, 0, 0.45);',
            '  backdrop-filter: blur(4px);',
            '  -webkit-backdrop-filter: blur(4px);',
            '  z-index: 10035;',
            '  opacity: 0;',
            '  pointer-events: none;',
            '  transition: opacity 0.2s ease;',
            '}',
            '.dsh-mobile-sidebar-backdrop.active {',
            '  opacity: 1;',
            '  pointer-events: auto;',
            '}',
            '/* v1.0.78：不再注入「返回对话」蓝按钮和右上角「✕」，旧版本残留的直接隐藏 */',
            '.dsh-mobile-back-to-chat-btn,',
            '.dsh-mobile-panel-close-btn,',
            '.dsh-mobile-panel-nav {',
            '  display: none !important;',
            '}',
            '/* 全面排查：图片大图灯箱预览（ImageLightbox）、模态弹窗与所有全屏浮层的关闭按钮，严禁插入 iOS 系统状态栏 */',
            '._close_1hos8_29,',
            'button[aria-label="关闭"]._close_1hos8_29,',
            '[class*="_close_1hos8_"],',
            '._close_o6lrb_87,',
            '[class*="_close_o6lrb_"] {',
            '  top: max(54px, calc(env(safe-area-inset-top) + 12px)) !important;',
            '  right: max(16px, calc(env(safe-area-inset-right) + 12px)) !important;',
            '  z-index: 20050 !important;',
            '}',
            '/* v1.0.78：返回按钮已移除，面板标题栏不再为其让出左右内边距 */',
            '/* 移动端文件预览【保存/分享到手机】高亮主按钮与电脑端打开降级 */',
            '.dsh-mobile-save-file-btn {',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  gap: 6px !important;',
            '  height: 36px !important;',
            '  padding: 0 16px !important;',
            '  border-radius: 18px !important;',
            '  background: #007aff !important;',
            '  color: #ffffff !important;',
            '  font-size: 14px !important;',
            '  font-weight: 600 !important;',
            '  border: none !important;',
            '  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.35) !important;',
            '  cursor: pointer !important;',
            '  margin-bottom: 8px !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-save-file-btn {',
            '  background: #0a84ff !important;',
            '  color: #ffffff !important;',
            '  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.4) !important;',
            '}',
            '/* 暗黑模式下精细化适配新增的分享、下载与关闭按钮，彻底杜绝泛白 */',
            'body[data-ds-dark-theme] .dsh-mobile-share-btn {',
            '  background: rgba(255, 255, 255, 0.12) !important;',
            '  color: #64d2ff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.1) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-download-btn {',
            '  background: #0a84ff !important;',
            '  color: #ffffff !important;',
            '  border: none !important;',
            '  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-menu-close-btn {',
            '  background: rgba(255, 255, 255, 0.18) !important;',
            '  color: rgba(255, 255, 255, 0.85) !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-panel-close-btn {',
            '  background: rgba(40, 40, 44, 0.75) !important;',
            '  color: #ffffff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
            '}',
            '/* 电脑端打开按钮在移动端降级为次要轮廓样式并标注来源 */',
            '.PPCmka_split[data-open-target="file"] .PPCmka_main {',
            '  font-size: 12px !important;',
            '  opacity: 0.8 !important;',
            '}',
            '/* 暗黑模式高对比度强化 */',
            'body[data-ds-dark-theme] .YdIzba_empty,',
            'body[data-ds-dark-theme] [data-textpreview-unsupported] {',
            '  color: #e5e7eb !important;',
            '}',
            'body[data-ds-dark-theme] .YdIzba_emptyLine {',
            '  color: #e5e7eb !important;',
            '  font-size: 14px !important;',
            '  font-weight: 500 !important;',
            '}',
            '/* 3. 修复设置主弹层与二/三级弹层(API Key、模型配置、二次确认)的层级深度冲突 */',
            '.ZiQlkq_overlay {',
            '  z-index: 10000 !important;',
            '}',
            '.ZiQlkq_panel {',
            '  z-index: 10001 !important;',
            '}',
            '/* 确保下级模态弹窗、确认框、快捷选择框永远压在设置面板之上，不再被遮挡在底部 */',
            '[role="dialog"]:not(.ZiQlkq_panel),',
            '[aria-modal="true"]:not(.ZiQlkq_panel),',
            '.ZKHwIG_dialog,',
            '.p2h2LG_card,',
            '.bqwvaa_menu,',
            '[data-portal-menu],',
            '[data-floating-ui-portal] > * {',
            '  z-index: 10050 !important;',
            '}',
            '/* 3.1 移动端软键盘弹出时，约束 @ / / / + 候选菜单高度与滚动，顶部留出充足安全边距，绝不顶出屏幕之外 */',
            '.bqwvaa_menu,',
            '[data-trigger-menu] {',
            '  max-height: min(180px, 38vh) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.25) !important;',
            '  z-index: 10050 !important;',
            '}',
            '.bqwvaa_viewport {',
            '  max-height: calc(min(180px, 38vh) - 8px) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '}',
            '/* 3.2 全局模态弹窗、确认框、AI问答/选择题卡片、下拉菜单全局安全规范：',
            '   1. 严格避让状态栏与灵动岛（top >= var(--dsh-statusbar, 54px) + 8px）；',
            '   2. 严格避让底部安全区（bottom >= env(safe-area-inset-bottom, 16px) + 8px）；',
            '   3. 限制最大高度（最大不超过 calc(100vh - var(--dsh-statusbar, 54px) - 80px)），内部强制开启平滑惯性滚动，绝不顶出状态栏、绝不超出底栏！ */',
            '[class*="NwyCaq_card"],',
            '.NwyCaq_card,',
            '[class*="QuestionComposer_card"],',
            '[data-choice-dialog],',
            '[class*="questionDialog"],',
            '[class*="questionCard"],',
            '[class*="choiceDialog"],',
            '[class*="choicePanel"],',
            '[class*="optionsPanel"],',
            '[class*="choiceContainer"],',
            '[class*="PlanReviewPanel_card"] {',
            '  max-height: calc(100vh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  max-height: calc(100dvh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  overflow: hidden !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="NwyCaq_body"],',
            '.NwyCaq_body,',
            '[class*="NwyCaq_options"],',
            '.NwyCaq_options,',
            '[class*="questionBody"],',
            '[class*="choiceBody"] {',
            '  flex: 1 1 auto !important;',
            '  min-height: 0 !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '/* 浮动菜单与弹出层（@ / / / + / 模型选择 / 更多操作等）：同样绝不冲破状态栏与底栏 */',
            '.bqwvaa_menu,',
            '[data-trigger-menu],',
            '[data-portal-menu],',
            '.p2h2LG_card,',
            '.ZKHwIG_dialog,',
            '[role="dialog"]:not(.ZiQlkq_panel) {',
            '  max-height: calc(100vh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  max-height: calc(100dvh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '  box-sizing: border-box !important;',
            '}',
            '/* 4. 暗黑模式按钮与交互控件对比度强化（老总铁律：杜绝灰白底+白字看不清） */',
            'body[data-ds-dark-theme] .NwyCaq_option,',
            'body[data-ds-dark-theme] [class*="NwyCaq_option"],',
            '@media (prefers-color-scheme: dark) {',
            '  .NwyCaq_option, [class*="NwyCaq_option"] {',
            '    background: #1c1c1e !important;',
            '    border: 1px solid rgba(255, 255, 255, 0.12) !important;',
            '    color: #f2f2f7 !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_number, [class*="NwyCaq_option"] [class*="NwyCaq_number"] {',
            '    background: #2c2c2e !important;',
            '    color: #e5e5ea !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_optionLabel, [class*="NwyCaq_option"] [class*="NwyCaq_optionLabel"] {',
            '    color: #ffffff !important;',
            '    font-weight: 500 !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_description, [class*="NwyCaq_option"] [class*="NwyCaq_description"] {',
            '    color: #a1a1a6 !important;',
            '  }',
            '  .NwyCaq_optionSelected, [class*="NwyCaq_optionSelected"],',
            '  .NwyCaq_option:hover:not(:disabled) {',
            '    background: #0a84ff !important;',
            '    border-color: #0a84ff !important;',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_optionSelected .NwyCaq_number, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_number"] {',
            '    background: rgba(255, 255, 255, 0.25) !important;',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_optionSelected .NwyCaq_optionLabel, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_optionLabel"],',
            '  .NwyCaq_optionSelected .NwyCaq_description, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_description"] {',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_customRow, [class*="NwyCaq_customRow"], [class*="NwyCaq_customBlock"] {',
            '    background: #1c1c1e !important;',
            '    border: 1px dashed rgba(255, 255, 255, 0.25) !important;',
            '  }',
            '  .NwyCaq_customRow input, [class*="NwyCaq_customRow"] input,',
            '  .NwyCaq_fieldInput, [class*="NwyCaq_fieldInput"] {',
            '    color: #ffffff !important;',
            '    background: transparent !important;',
            '  }',
            '  [data-mobile-nav="session-log"], button[data-mobile-nav="session-log"] {',
            '    background: #242426 !important;',
            '    color: #e5e5ea !important;',
            '    border: 1px solid rgba(255, 255, 255, 0.12) !important;',
            '  }',
            '  [data-mobile-nav="session-log"]:hover {',
            '    background: #2c2c2e !important;',
            '    color: #ffffff !important;',
            '  }',
            '  button.NwyCaq_waitButton, [class*="NwyCaq_waitButton"],',
            '  .PlanReviewPanel_card button, [class*="PlanReviewPanel_card"] button {',
            '    border-color: rgba(255, 255, 255, 0.2) !important;',
            '    color: #ffffff !important;',
            '  }',
            '}',
            '/* 5. 修复底部 token 用量及统计胶囊在手机端过宽溢出、需要横向滑动的严重体验问题 */',
            '/* 支持自动折行/多行展示，字体与边距精细化自适应，保证所有指标 100% 完整可见无需滑块 */',
            '.uWtHQG_dock {',
            '  flex-wrap: wrap !important;',
            '  gap: 3px 6px !important;',
            '  justify-content: center !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  overflow: visible !important;',
            '  padding: 2px 8px !important;',
            '}',
            '.z4IYsq_root, [data-composer-stats] {',
            '  flex-wrap: wrap !important;',
            '  gap: 3px 6px !important;',
            '  justify-content: center !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  overflow: visible !important;',
            '}',
            '.z4IYsq_anchor {',
            '  max-width: 100% !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '.z4IYsq_pill {',
            '  font-size: 11px !important;',
            '  padding: 2px 6px !important;',
            '  gap: 4px !important;',
            '  max-width: 100% !important;',
            '  white-space: normal !important;',
            '  word-break: break-all !important;',
            '  text-align: center !important;',
            '  line-height: 15px !important;',
            '  display: inline-block !important;',
            '}',
            '.z4IYsq_pill svg {',
            '  width: 12px !important;',
            '  height: 12px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '._7aoaqW_root {',
            '  max-width: 100% !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '._7aoaqW_trigger {',
            '  font-size: 11px !important;',
            '  padding: 2px 6px !important;',
            '  gap: 4px !important;',
            '  line-height: 15px !important;',
            '  white-space: normal !important;',
            '}',
            '._7aoaqW_trigger svg {',
            '  width: 12px !important;',
            '  height: 12px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '/* 底部对话输入框与会话流留出移动端底部操作与安全区边距，紧凑贴合底部 */',
            ':root {',
            '  --dsh-composer-dock-inset: 2px !important;',
            '}',
            '.uWtHQG_root {',
            '  padding-bottom: max(6px, env(safe-area-inset-bottom)) !important;',
            '}',
            '.ank0OG_composerSeat {',
            '  padding-bottom: 2px !important;',
            '}',
            '/* 会话框 + 号对齐居中，防止图标偏下或未居中 */',
            '.uWtHQG_add {',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_add svg {',
            '  display: block !important;',
            '  margin: auto !important;',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '}',
            '/* 原生语音输入按钮样式与动画 */',
            '.dsh-mobile-voice-btn {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  border: none !important;',
            '  background: transparent !important;',
            '  color: var(--dsw-alias-label-secondary, #666) !important;',
            '  cursor: pointer !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  flex: 0 0 28px !important;',
            '  transition: all 0.2s ease !important;',
            '}',
            '.dsh-mobile-voice-btn.recording {',
            '  background: #ff3b30 !important;',
            '  color: #ffffff !important;',
            '  box-shadow: 0 0 10px rgba(255, 59, 48, 0.6) !important;',
            '  animation: dshVoicePulse 1.2s infinite ease-in-out !important;',
            '}',
            '@keyframes dshVoicePulse {',
            '  0% { transform: scale(1); }',
            '  50% { transform: scale(1.12); }',
            '  100% { transform: scale(1); }',
            '}',
            '/* 移动端底部操作行防挤压重叠与紧凑布局 */',
            '.uWtHQG_row {',
            '  display: flex !important;',
            '  justify-content: space-between !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex-wrap: nowrap !important;',
            '  width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_tools {',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 3px !important;',
            '}',
            '.uWtHQG_trailing {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '  justify-content: flex-end !important;',
            '}',
            '.uWtHQG_standardControls {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  min-width: 0 !important;',
            '  flex: 0 1 auto !important;',
            '  overflow: hidden !important;',
            '}',
            '.dsh-po-capsule {',
            '  flex-shrink: 1 !important;',
            '  min-width: 0 !important;',
            '}',
            '.VYXhfG_trigger {',
            '  max-width: min(115px, 28vw) !important;',
            '  min-width: 0 !important;',
            '  flex-shrink: 1 !important;',
            '  padding: 0 4px !important;',
            '}',
            '.VYXhfG_triggerLabel {',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '  min-width: 0 !important;',
            '}',
            '/* 发送/停止/暂停圆形按钮纯正几何居中（消除文字/下箭头重叠穿透与偏移歪斜） */',
            '.uWtHQG_primary {',
            '  flex: 0 0 28px !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  transform: none !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_primary svg {',
            '  display: block !important;',
            '  margin: 0 !important;',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '  flex-shrink: 0 !important;',
            '}'
          ].join('\\n');
          function attach() {
            if (!document.head) { setTimeout(attach, 10); return; }
            if (!document.getElementById('dsh-ios-glass-enhancement')) {
              document.head.appendChild(style);
            }
          }
          attach();

          // 修复 iOS 移动端输入框与搜索框自动聚焦导致键盘弹窗问题：
          // 1. 切换会话时，Lexical 编辑器会自动调用 focusDraftEditor，导致切换会话直接弹出虚拟键盘；
          // 2. 模型快捷选择面板打开时，搜索框会自动 focus，导致软键盘遮挡弹层并引发 blur 误关；
          // 3. 点击会话框 + 号展开命令/文件弹窗时，禁止自动聚焦输入框弹出虚拟键盘；并为命令菜单右上角添加快捷 ✕ 关闭按钮；
          // 4. 保护移动端文本光标与选择自由：严禁在用户点击、滑动或打字时强行重置 Selection，
          //    让用户可以在输入框内任意滑动光标、选择文字、移动插入点！
          (function fixMobileInputAndSearchFocus() {
            var origFocus = HTMLElement.prototype.focus;
            var allowUserTouchFocus = false;
            var touchResetTimer = null;

            function handleUserTouch(e) {
              var target = e.target;
              if (!target) return;

              // 如果用户点击的是 + 号按钮、命令弹窗菜单内部、或者模型快捷选择按钮/菜单，严禁唤起虚拟键盘
              if (target.closest('.uWtHQG_add') || target.closest('[data-trigger-menu]') || target.closest('.bqwvaa_menu') || target.closest('.VYXhfG_trigger') || target.closest('.VYXhfG_root')) {
                // 特殊：只有真正直接点在模型搜索框 input 本身上才允许键盘，点外层/触发按钮绝对不准唤醒输入框
                if (!target.classList.contains('VYXhfG_search') && target.getAttribute('role') !== 'searchbox') {
                  allowUserTouchFocus = false;
                  return;
                }
              }

              var inputEl = target.closest('.uWtHQG_input') ||
                            target.closest('[contenteditable="true"]') ||
                            target.closest('textarea') ||
                            target.closest('.VYXhfG_search') ||
                            target.closest('input[role="searchbox"]') ||
                            target.closest('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"])');

              // 如果正在显示模型选择菜单，严禁将附近的会话输入框误判为触碰目标！
              if (document.querySelector('.VYXhfG_menu')) {
                if (!target.classList.contains('VYXhfG_search') && target.getAttribute('role') !== 'searchbox') {
                  allowUserTouchFocus = false;
                  return;
                }
              }

              // v1.0.86：豆包验证码是点外层格子，再由页面自己调用 focus()。
              // 点的位置附近有输入框，也算用户主动要输入，放行随后的聚焦，键盘才能弹。
              if (!inputEl && e.touches && e.touches.length && !document.querySelector('.VYXhfG_menu')) {
                var touch = e.touches[0];
                var near = document.elementsFromPoint(touch.clientX, touch.clientY) || [];
                for (var k = 0; k < near.length && k < 8; k++) {
                  var node = near[k];
                  if (!node || !node.querySelector) continue;
                  if (node.matches && node.matches('input, textarea, [contenteditable="true"]')) { inputEl = node; break; }
                  var inner = node.querySelector('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]');
                  if (inner) {
                    var r = inner.getBoundingClientRect();
                    if (Math.abs(r.top + r.height / 2 - touch.clientY) < 80) { inputEl = inner; break; }
                  }
                }
              }

              if (inputEl) {
                allowUserTouchFocus = true;
                clearTimeout(touchResetTimer);
                touchResetTimer = setTimeout(function() {
                  allowUserTouchFocus = false;
                }, 1500);
              }
            }

            // 监听用户真人的手指触摸与点击
            document.addEventListener('touchstart', handleUserTouch, true);
            document.addEventListener('touchend', handleUserTouch, true);
            document.addEventListener('click', handleUserTouch, true);

            // 拦截一切未经用户主动点击文本区域的自动化 .focus() 调用
            HTMLElement.prototype.focus = function(options) {
              var isSearchBox = this && (
                (this.classList && this.classList.contains('VYXhfG_search')) ||
                this.getAttribute('role') === 'searchbox' ||
                this.closest('.VYXhfG_menu') ||
                this.closest('.VYXhfG_root')
              );
              if (isSearchBox) {
                // 模型选择弹窗内部的搜索框绝对禁止程序自动调用 focus() 弹起软键盘！
                // 只有当用户用手指真切点击该搜索框时，才由原生 click 事件自然唤起输入。
                if (!allowUserTouchFocus) {
                  return;
                }
              }

              var isTextInput = this && (
                (this.classList && (this.classList.contains('uWtHQG_input') || this.classList.contains('VYXhfG_search'))) ||
                this.getAttribute('role') === 'searchbox' ||
                this.getAttribute('contenteditable') === 'true' ||
                this.isContentEditable ||
                this.tagName === 'TEXTAREA' ||
                (this.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'range', 'file'].includes(this.type))
              );

              if (isTextInput) {
                if (!allowUserTouchFocus) {
                  // 严禁脚本自动化弹起虚拟键盘（尤其是切换会话、打开模型菜单、点击+号展开选项时）
                  return;
                }
              }
              return origFocus.apply(this, arguments);
            };

            // 全局关闭命令/选项弹窗辅助函数
            window.__dshDismissCommandMenu = function() {
              if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
              }
              var menu = document.querySelector('.bqwvaa_menu, [data-trigger-menu]');
              if (menu) {
                var fiberKey = Object.keys(menu).find(function(k) { return k.startsWith('__reactFiber$'); });
                var fiber = fiberKey ? menu[fiberKey] : null;
                while (fiber) {
                  if (fiber.memoizedProps && typeof fiber.memoizedProps.onDismiss === 'function') {
                    fiber.memoizedProps.onDismiss();
                    return true;
                  }
                  fiber = fiber.return;
                }
              }
              return false;
            };

            // 自动为弹出命令/选项菜单以及模型快捷选择面板右上角挂载明显的 ✕ 关闭按钮
            setInterval(function() {
              var menu = document.querySelector('.bqwvaa_menu, [data-trigger-menu]');
              if (menu && !menu.querySelector('.dsh-mobile-menu-close-btn')) {
                var closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'dsh-mobile-menu-close-btn';
                closeBtn.setAttribute('aria-label', '关闭选项菜单');
                closeBtn.innerHTML = '✕';
                closeBtn.style.cssText = 'position:absolute; top:8px; right:8px; z-index:120; width:26px; height:26px; border-radius:50%; background:rgba(120,120,128,0.2); border:none; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:var(--dsw-alias-label-secondary, #666); cursor:pointer; padding:0;';

                function handleCloseClick(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.__dshDismissCommandMenu();
                }
                closeBtn.addEventListener('click', handleCloseClick, true);
                closeBtn.addEventListener('touchend', handleCloseClick, true);
                menu.appendChild(closeBtn);
              }

              // 为模型快捷选择弹窗 (.VYXhfG_menu) 也挂载顶部显式关闭按钮
              var modelMenu = document.querySelector('.VYXhfG_menu');
              if (modelMenu && !modelMenu.querySelector('.dsh-mobile-model-close-btn')) {
                var modelCloseBtn = document.createElement('button');
                modelCloseBtn.type = 'button';
                modelCloseBtn.className = 'dsh-mobile-model-close-btn';
                modelCloseBtn.setAttribute('aria-label', '关闭模型选择');
                modelCloseBtn.innerHTML = '✕';
                modelCloseBtn.style.cssText = 'position:absolute; top:10px; right:12px; z-index:9999; width:28px; height:28px; border-radius:50%; background:rgba(120,120,128,0.25); border:none; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; color:var(--dsw-alias-label-secondary, #888); cursor:pointer; padding:0; -webkit-tap-highlight-color:transparent;';

                function handleModelClose(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  var trigger = document.querySelector('.VYXhfG_trigger');
                  if (trigger) {
                    trigger.click();
                  } else {
                    modelMenu.remove();
                  }
                }
                modelCloseBtn.addEventListener('click', handleModelClose, true);
                modelCloseBtn.addEventListener('touchend', handleModelClose, true);
                modelMenu.appendChild(modelCloseBtn);
              }
            }, 150);

            // 监听 blur 事件捕获阶段：当搜索框失去焦点（比如用户轻触关闭软键盘、完成输入）时，
            // 阻止该 blur 冒泡，避免 React 的 ModelSelect 组件触发 onBlur -> close() 将整个面板关闭！
            window.addEventListener('blur', function(e) {
              if (e.target && (
                (e.target.classList && e.target.classList.contains('VYXhfG_search')) ||
                e.target.getAttribute('role') === 'searchbox' ||
                (e.target.closest && e.target.closest('.VYXhfG_menu'))
              )) {
                e.stopImmediatePropagation();
              }
            }, true);

            // 同时监听 focusout 事件：键盘收起时 target.blur() 会派发 focusout，
            // 拦截它使其不冒泡到 document / window，确保模型选择面板稳固留在屏幕上！
            document.addEventListener('focusout', function(e) {
              var target = e.target;
              if (target && (
                (target.classList && target.classList.contains('VYXhfG_search')) ||
                target.getAttribute('role') === 'searchbox' ||
                (target.closest && target.closest('.VYXhfG_menu'))
              )) {
                var menu = target.closest('.VYXhfG_menu') || document.querySelector('.VYXhfG_menu');
                if (menu) {
                  e.stopImmediatePropagation();
                }
              }
            }, true);
          })();

          // 全局禁止双击网页意外缩放（保留图片预览灯箱内的正常缩放）
          (function setupDisableDoubleTapZoom() {
            var lastTouchEnd = 0;
            document.addEventListener('touchend', function(event) {
              var now = Date.now();
              if (now - lastTouchEnd <= 300) {
                // 如果在图片灯箱或预览区域内，允许双击缩放图片
                var inImageLightbox = event.target && event.target.closest && (
                  event.target.closest('[role="dialog"][aria-modal="true"]') ||
                  event.target.closest('[data-image-preview]') ||
                  event.target.closest('[data-document-zoom-surface]')
                );
                if (!inImageLightbox) {
                  event.preventDefault();
                }
              }
              lastTouchEnd = now;
            }, { passive: false });
          })();

          // 移动端图片预览支持双指无极放大缩小、单指平移拖拽与双击缩放重置
          (function setupMobileImagePinchZoom() {
            function bindImageZoom(imgEl, containerEl) {
              if (!imgEl || imgEl.dataset.dshPinchBound === '1') return;
              imgEl.dataset.dshPinchBound = '1';

              var scale = 1;
              var minScale = 1;
              var maxScale = 6;
              var tx = 0;
              var ty = 0;

              var startDist = 0;
              var startScale = 1;
              var startMidX = 0;
              var startMidY = 0;
              var startTx = 0;
              var startTy = 0;

              var isPanning = false;
              var panStartX = 0;
              var panStartY = 0;
              var lastTapTime = 0;

              imgEl.style.touchAction = 'none';
              imgEl.style.userSelect = 'none';
              imgEl.style.webkitUserSelect = 'none';
              imgEl.style.transformOrigin = 'center center';
              imgEl.style.willChange = 'transform';
              if (containerEl) {
                containerEl.style.touchAction = 'none';
                containerEl.style.overflow = 'hidden';
              }

              function applyTransform(animated) {
                imgEl.style.transition = animated ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
                if (scale <= 1.01) {
                  scale = 1;
                  tx = 0;
                  ty = 0;
                }
                imgEl.style.transform = 'translate3d(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px, 0) scale(' + scale.toFixed(3) + ')';
              }

              function getDistance(t1, t2) {
                var dx = t2.clientX - t1.clientX;
                var dy = t2.clientY - t1.clientY;
                return Math.sqrt(dx * dx + dy * dy);
              }

              var target = containerEl || imgEl;

              target.addEventListener('touchstart', function(e) {
                if (e.target && e.target.closest('button')) return;
                if (e.touches.length === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                  isPanning = false;
                  startDist = getDistance(e.touches[0], e.touches[1]);
                  startScale = scale;
                  startMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  startMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  startTx = tx;
                  startTy = ty;
                } else if (e.touches.length === 1) {
                  var now = Date.now();
                  if (now - lastTapTime < 280) {
                    // 双击快速切换 1x <-> 2.5x 缩放
                    e.preventDefault();
                    e.stopPropagation();
                    if (scale > 1.05) {
                      scale = 1;
                      tx = 0;
                      ty = 0;
                    } else {
                      scale = 2.5;
                      tx = 0;
                      ty = 0;
                    }
                    applyTransform(true);
                    lastTapTime = 0;
                    return;
                  }
                  lastTapTime = now;

                  if (scale > 1.01) {
                    e.preventDefault();
                    e.stopPropagation();
                    isPanning = true;
                    panStartX = e.touches[0].clientX;
                    panStartY = e.touches[0].clientY;
                    startTx = tx;
                    startTy = ty;
                  }
                }
              }, { passive: false });

              target.addEventListener('touchmove', function(e) {
                if (e.touches.length === 2 && startDist > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  var dist = getDistance(e.touches[0], e.touches[1]);
                  var newScale = startScale * (dist / startDist);
                  if (newScale < 0.7) newScale = 0.7;
                  if (newScale > maxScale) newScale = maxScale;
                  scale = newScale;

                  var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  tx = startTx + (midX - startMidX);
                  ty = startTy + (midY - startMidY);
                  applyTransform(false);
                } else if (e.touches.length === 1 && isPanning && scale > 1.01) {
                  e.preventDefault();
                  e.stopPropagation();
                  tx = startTx + (e.touches[0].clientX - panStartX);
                  ty = startTy + (e.touches[0].clientY - panStartY);
                  applyTransform(false);
                }
              }, { passive: false });

              target.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                  isPanning = false;
                  startDist = 0;
                  if (scale < minScale) {
                    scale = 1;
                    tx = 0;
                    ty = 0;
                    applyTransform(true);
                  }
                } else if (e.touches.length === 1) {
                  startDist = 0;
                  if (scale > 1.01) {
                    isPanning = true;
                    panStartX = e.touches[0].clientX;
                    panStartY = e.touches[0].clientY;
                    startTx = tx;
                    startTy = ty;
                  }
                }
              }, { passive: false });
            }

            setInterval(function() {
              // 1. 对话流点击图片弹出的全屏 ImageLightbox (role="dialog" + img)
              var dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
              dialogs.forEach(function(dlg) {
                var img = dlg.querySelector('img');
                if (img && dlg.children.length <= 4) {
                  bindImageZoom(img, dlg);
                }
              });
              // 2. 右侧栏文件图片预览区的原图
              var docImgs = document.querySelectorAll('[data-image-preview] img, [data-document-zoom-surface] img');
              docImgs.forEach(function(img) {
                var container = img.closest('[data-image-preview]') || img.parentElement;
                bindImageZoom(img, container);
              });
            }, 250);
          })();

          // 移动端会话输入框原生语音输入按钮注入与文本流式输入处理
          (function setupMobileVoiceInputBridge() {
            function updateVoiceButtonState(active) {
              var btn = document.querySelector('.dsh-mobile-voice-btn');
              if (!btn) return;
              if (active) {
                btn.classList.add('recording');
                btn.setAttribute('title', '正在录音...再次点击停止');
              } else {
                btn.classList.remove('recording');
                btn.setAttribute('title', '点击进行语音输入');
              }
            }

            window.__dshVoiceStateUpdate = function(active, text) {
              updateVoiceButtonState(active);
              if (text && text.length > 0) {
                var inputEl = document.querySelector('.uWtHQG_input') ||
                              document.querySelector('[contenteditable="true"]') ||
                              document.querySelector('textarea');
                if (inputEl) {
                  inputEl.focus();
                  if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
                    document.execCommand('insertText', false, text);
                  } else {
                    var start = inputEl.selectionStart || inputEl.value.length;
                    var end = inputEl.selectionEnd || inputEl.value.length;
                    var val = inputEl.value || '';
                    inputEl.value = val.substring(0, start) + text + val.substring(end);
                    inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }
              }
            };

            function ensureVoiceButton() {
              var tools = document.querySelector('.uWtHQG_tools');
              if (!tools) return;
              if (tools.querySelector('.dsh-mobile-voice-btn')) return;

              var voiceBtn = document.createElement('button');
              voiceBtn.type = 'button';
              voiceBtn.className = 'dsh-mobile-voice-btn';
              voiceBtn.setAttribute('title', '点击进行语音输入');
              voiceBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';

              voiceBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dshVoiceInput) {
                  window.webkit.messageHandlers.dshVoiceInput.postMessage({ action: 'toggle' });
                }
              });

              var addBtn = tools.querySelector('.uWtHQG_add');
              if (addBtn && addBtn.nextSibling) {
                tools.insertBefore(voiceBtn, addBtn.nextSibling);
              } else {
                tools.appendChild(voiceBtn);
              }
            }

            setInterval(ensureVoiceButton, 600);
          })();

          // 移动端右侧边栏智能关闭辅助（遮罩与退出逻辑）
          (function setupMobileSidebarRightWatcher() {
              var backdrop = document.createElement('div');
              backdrop.className = 'dsh-mobile-sidebar-backdrop';
              // documentStart 时 body 可能尚未创建（null → TypeError 会连带杀死后续全部功能），
              // 改为等待 body 就绪后再挂载（v1.0.70 修复）
              function attachBackdrop() {
                if (!document.body) { setTimeout(attachBackdrop, 16); return; }
                document.body.appendChild(backdrop);
              }
              attachBackdrop();

            function toggleBackdrop(open) {
              if (open) {
                backdrop.classList.add('active');
              } else {
                backdrop.classList.remove('active');
              }
            }

            backdrop.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              // 触发侧边栏折叠按钮
              var toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('.dMHGga_iconButton');
              if (toggle) {
                toggle.click();
              } else {
                // 模拟按下 Escape
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
              }
            });

            // 移动端全级别菜单、弹窗与插件浮层自适应贴边、高对比度与防溢出看门狗
            (function installMobileLayoutWatchdog() {
              if (window.__dshMobileLayoutWatchdog) return;
              window.__dshMobileLayoutWatchdog = true;

              var PADDING = 10;

              function adjustElement(el) {
                if (!el || !(el instanceof HTMLElement)) return;
                if (el.offsetParent === null && el.style.display === 'none') return;

                var winW = window.innerWidth;
                var winH = window.innerHeight;
                if (winW > 768) return;

                // 1. 宽度与高度安全限制与多级插件通用规范
                el.style.maxWidth = (winW - PADDING * 2) + 'px';
                el.style.boxSizing = 'border-box';
                el.style.maxHeight = (winH - PADDING * 2) + 'px';
                el.style.overflowY = 'auto';
                el.style.webkitOverflowScrolling = 'touch';

                // 2. 保证通用透明度规范：高对比度不透明背景（杜绝任何插件透明度过高导致文字穿透重叠）
                var isDark = document.body && document.body.hasAttribute('data-ds-dark-theme');
                if (!el.style.backgroundColor || el.style.backgroundColor === 'transparent' || el.style.backgroundColor.indexOf('rgba') !== -1) {
                  el.style.setProperty('background-color', isDark ? 'rgba(22, 24, 29, 0.98)' : 'rgba(255, 255, 255, 0.98)', 'important');
                  el.style.setProperty('backdrop-filter', 'blur(28px) saturate(180%)', 'important');
                  el.style.setProperty('-webkit-backdrop-filter', 'blur(28px) saturate(180%)', 'important');
                }

                var rect = el.getBoundingClientRect();

                // 3. 水平方向越界自动拉回安全区内
                if (rect.right > winW - PADDING) {
                  var overflowX = rect.right - (winW - PADDING);
                  var currentLeft = parseFloat(el.style.left) || rect.left;
                  var newLeft = Math.max(PADDING, currentLeft - overflowX);
                  el.style.left = newLeft + 'px';
                  el.style.right = 'auto';
                }
                if (rect.left < PADDING) {
                  el.style.left = PADDING + 'px';
                  el.style.right = 'auto';
                }

                // 4. v1.0.86：弹层垂直居中。之前把超出底部的弹层往上推、再把顶部锁死在 54px，
                //    验证码这类弹层的输入框被顶出屏幕，既不居中也点不到，键盘弹不出来。
                //    改为：比屏幕高的限制高度放进安全区，其余的居中。不再改写 top 把内容推出屏幕。
                var TOP_SAFE = Math.max(54, PADDING);
                var usable = winH - TOP_SAFE - PADDING;
                if (rect.height > usable) {
                  el.style.maxHeight = usable + 'px';
                  el.style.top = TOP_SAFE + 'px';
                  el.style.bottom = 'auto';
                } else if (rect.top < TOP_SAFE || rect.bottom > winH - PADDING) {
                  var centered = Math.max(TOP_SAFE, Math.round((winH - rect.height) / 2));
                  el.style.top = centered + 'px';
                  el.style.bottom = 'auto';
                }
              }

              var TARGET_SELECTOR = [
                '[role="menu"]',
                '[role="listbox"]',
                '[role="dialog"]',
                '[data-menu-material]',
                '[data-menu-surface]',
                '.VYXhfG_menu',
                '[class*="menu"]',
                '[class*="modal"]',
                '[class*="Modal"]',
                '[class*="popup"]',
                '[class*="Popup"]',
                '[class*="dropdown"]',
                '[class*="Dropdown"]',
                '[class*="dialog"]',
                '[class*="Dialog"]',
                '[class*="_portal_"] > div',
                '.dsh-po-modal-container'
              ].join(',');

              function scanAndAdjust() {
                if (window.innerWidth > 768) return;
                var candidates = document.querySelectorAll(TARGET_SELECTOR);
                for (var i = 0; i < candidates.length; i++) {
                  var node = candidates[i];
                  var style = window.getComputedStyle(node);
                  if (style.position === 'absolute' || style.position === 'fixed') {
                    adjustElement(node);
                  }
                }
              }

              var debounceTimer = null;
              function scheduleAdjust() {
                if (window.innerWidth > 768) return;
                if (debounceTimer) return;
                debounceTimer = setTimeout(function() {
                  debounceTimer = null;
                  scanAndAdjust();
                }, 100);
              }

              var observer = new MutationObserver(function() {
                scheduleAdjust();
              });
              // documentStart 时 document.body 可能尚未创建，等待就绪后再观察（v1.0.70 修复）
              function observeBodyForWatchdog() {
                if (!document.body) { setTimeout(observeBodyForWatchdog, 16); return; }
                observer.observe(document.body, { childList: true, subtree: true });
              }
              observeBodyForWatchdog();

              window.addEventListener('resize', scheduleAdjust, { passive: true });
              window.addEventListener('scroll', scheduleAdjust, { passive: true, capture: true });
            })();

            // 移动端聊天输入框回车/换行行为深度优化：
            // 解决 iOS 软键盘在聊天输入框长按或轻点“确定/换行”无法正常换行的问题。
            // 移动端交互铁律：手机软键盘上的 Return/换行键 专职负责文本插入换行；右侧独立的圆形蓝色发送按钮负责提交发送。
            (function setupMobileEnterKeyNewline() {
              window.addEventListener('keydown', function(e) {
                var target = e.target;
                if (!target) return;
                var input = target.closest ? target.closest('.uWtHQG_input') : null;
                if (input) {
                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    // 将纯 Enter 事件无缝转换为 Shift+Enter 语义，通知 Lexical 编辑器执行段落换行而非发送提交！
                    try {
                      Object.defineProperty(e, 'shiftKey', { get: function() { return true; } });
                    } catch (err) {}
                  }
                }
              }, true);

              // 自动为输入框设置 enterkeyhint="enter"，指示 iOS 虚拟键盘直接呈现标准的“换行”按键
              function setInputEnterKeyHint() {
                var inputs = document.querySelectorAll('.uWtHQG_input, [contenteditable="true"]');
                inputs.forEach(function(el) {
                  if (el.getAttribute('enterkeyhint') !== 'enter') {
                    el.setAttribute('enterkeyhint', 'enter');
                  }
                });
              }
              setInputEnterKeyHint();
              setInterval(setInputEnterKeyHint, 500);
            })();

            // 关闭右侧面板函数
            window.__dshCloseRightPanel = function() {
              var toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('button[aria-label="收起右侧边栏"]');
              if (toggle) {
                toggle.click();
                return;
              }
              var closeTab = document.querySelector('[data-dockkit-strip] [aria-label*="关闭"]') || document.querySelector('[data-dockkit-strip] button[aria-label="关闭"]');
              if (closeTab) {
                closeTab.click();
              }
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            };

            // 监听 DOM 树中的 data-sidebar-right-open 变化
            function syncPanelNav() {
              var panel = document.querySelector('.dMHGga_panel');
              var isOpen = panel && panel.hasAttribute('data-sidebar-right-open');
              toggleBackdrop(!!isOpen);

              if (panel && isOpen) {
                // v1.0.78：不再注入「返回对话」蓝按钮和右上角「✕」。
                // 面板自带的返回和关闭已经够用，这两颗是重复的，用户反馈画蛇添足。
                // 旧版本注入过的，这里顺手清掉。
                var stale = panel.querySelectorAll('.dsh-mobile-panel-nav, .dsh-mobile-back-to-chat-btn, .dsh-mobile-panel-close-btn');
                for (var si = 0; si < stale.length; si++) {
                  if (stale[si].parentNode) stale[si].parentNode.removeChild(stale[si]);
                }

                // 优化文件不可预览页面的操作按钮（将手机端无感的“电脑打开”改造为手机“保存/分享”+明确标注电脑端）
                var emptyContainer = panel.querySelector('[data-textpreview-unsupported]');
                if (emptyContainer) {
                  var mobileSaveBtn = emptyContainer.querySelector('.dsh-mobile-save-file-btn');
                  if (!mobileSaveBtn) {
                    var pathEl = panel.querySelector('[data-textpreview-path]');
                    var fullPath = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';
                    
                    mobileSaveBtn = document.createElement('button');
                    mobileSaveBtn.className = 'dsh-mobile-save-file-btn';
                    mobileSaveBtn.setAttribute('type', 'button');
                    mobileSaveBtn.innerHTML = '📥 保存 / 分享到手机';
                    mobileSaveBtn.addEventListener('click', function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (fullPath && window.__dshFetchAndShareFile) {
                        window.__dshFetchAndShareFile(fullPath);
                      } else {
                        // 触发通用文件传输
                        var down = document.querySelector('.dsh-mobile-download-btn');
                        if (down) down.click();
                      }
                    });

                    // 插入到 slot 容器前面，作为最醒目的主按钮
                    var slot = emptyContainer.querySelector('[data-slot*="unpreviewable"]');
                    if (slot) {
                      emptyContainer.insertBefore(mobileSaveBtn, slot);
                    } else {
                      emptyContainer.appendChild(mobileSaveBtn);
                    }
                  }

                  // 给原有的电脑端打开按钮增加明确的提示
                  var pcBtn = emptyContainer.querySelector('.PPCmka_main');
                  if (pcBtn && !pcBtn.dataset.dshPcAnnotated) {
                    pcBtn.dataset.dshPcAnnotated = 'true';
                    pcBtn.innerHTML = '🖥️ 在电脑端打开';
                    pcBtn.addEventListener('click', function() {
                      // 轻提示
                      if (window.__dshToast) window.__dshToast('已通知电脑端打开该文件');
                    }, true);
                  }
                }
              }
            }

            var obs = new MutationObserver(syncPanelNav);
            // document.body 此刻可能尚未创建，同样需要等待就绪（v1.0.70 修复）
            function observeBody() {
              if (!document.body) { setTimeout(observeBody, 16); return; }
              obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'] });
            }
            observeBody();
            setInterval(syncPanelNav, 300);
          })();
        })();
        """,
        // 针对 iOS 15 的系统级兼容补丁（解决 iOS 15 白屏问题）：
        // 1. crypto.randomUUID 兜底（在局域网明文 HTTP 环境下 iOS 15 WebKit 会禁用原生 crypto.randomUUID，引发脚本崩溃白屏）
        // 2. String.prototype.replaceAll 补齐
        // ⚠️ v1.0.105 更正：本段历史上曾被注释为"正则先行/后行断言 RegExp Lookbehind 容错"，
        //    但实际代码从来没有、也不可能兜住 lookbehind——它是**语法层**特性，
        //    正则在解析期就抛 SyntaxError，任何运行期 polyfill 都救不了。
        //    lookbehind 需 iOS 16.4+（Safari/WebKit 16.4）。官方 DSH 前端自身即以此为门槛，
        //    App 侧的应对是"探测到不支持就给出版本提示"，见 sampleRoot()，而不是假装已兼容。
        """
        (function () {
          if (typeof window !== 'undefined') {
            if (!window.crypto) window.crypto = {};
            if (typeof window.crypto.randomUUID !== 'function') {
              window.crypto.randomUUID = function () {
                return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c) {
                  return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
                });
              };
            }
          }
          if (typeof String.prototype.replaceAll !== 'function') {
            String.prototype.replaceAll = function (search, replace) {
              if (search instanceof RegExp) {
                if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
                return this.replace(search, replace);
              }
              return this.split(search).join(replace);
            };
          }
        })();
        """,
        // Promise.withResolvers（iOS 17+）：页面用它发布 __DSH_BOOT_READY__。
        """
        if (typeof Promise.withResolvers !== 'function') {
          Promise.withResolvers = function () {
            var resolve, reject;
            var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
            return { promise: promise, resolve: resolve, reject: reject };
          };
        }
        """,
        // Array.prototype.at（iOS 15.4+）。
        """
        if (typeof Array.prototype.at !== 'function') {
          Object.defineProperty(Array.prototype, 'at', {
            value: function (i) {
              var n = this.length, k = Number(i) || 0;
              k = k < 0 ? n + k : k;
              return (k >= 0 && k < n) ? this[k] : undefined;
            },
            writable: true, configurable: true
          });
        }
        """,
        // Object.hasOwn（iOS 15.4+）。
        """
        if (typeof Object.hasOwn !== 'function') {
          Object.defineProperty(Object, 'hasOwn', {
            value: function (o, p) { return Object.prototype.hasOwnProperty.call(o, p); },
            writable: true, configurable: true
          });
        }
        """,
        // structuredClone（iOS 15.4+）：回退到 JSON 深拷贝。
        """
        if (typeof structuredClone !== 'function') {
          globalThis.structuredClone = function (v) {
            if (v === undefined) return undefined;
            return JSON.parse(JSON.stringify(v));
          };
        }
        """,
        // Array.prototype.flat / flatMap（iOS 12+ 通常存在，保险补齐）。
        """
        if (typeof Array.prototype.flatMap !== 'function') {
          Object.defineProperty(Array.prototype, 'flatMap', {
            value: function (fn, thisArg) {
              return this.reduce(function (acc, it, i, arr) {
                var v = fn.call(thisArg, it, i, arr);
                return acc.concat(Array.isArray(v) ? v : [v]);
              }, []);
            },
            writable: true, configurable: true
          });
        }
        """,
        // Array.prototype.toSorted/toReversed/toSpliced/with、findLast/findLastIndex
        // （ES2023，iOS 16.4 才进 Safari）。真机实证 iOS 16_3：
        // 插件 bundle 里 `groups.toSorted(...)` / `rows.toSorted(...)` 直接抛
        // "toSorted is not a function" → 插件树加载失败 → #root 空 = 白屏。
        """
        (function () {
          function def(target, name, fn) {
            if (typeof target[name] === 'function') return;
            try { Object.defineProperty(target, name, { value: fn, writable: true, configurable: true }); } catch (e) {}
          }
          def(Array.prototype, 'toSorted', function (cmp) {
            var a = Array.prototype.slice.call(this); return a.sort(cmp);
          });
          def(Array.prototype, 'toReversed', function () {
            return Array.prototype.slice.call(this).reverse();
          });
          def(Array.prototype, 'toSpliced', function () {
            var a = Array.prototype.slice.call(this);
            a.splice.apply(a, Array.prototype.slice.call(arguments)); return a;
          });
          def(Array.prototype, 'with', function (i, v) {
            var a = Array.prototype.slice.call(this), k = Number(i) || 0;
            k = k < 0 ? a.length + k : k;
            if (k < 0 || k >= a.length) throw new RangeError('Invalid index');
            a[k] = v; return a;
          });
          def(Array.prototype, 'findLast', function (fn, t) {
            for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return this[i];
          });
          def(Array.prototype, 'findLastIndex', function (fn, t) {
            for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return i;
            return -1;
          });
          def(Set.prototype, 'union', function (o) {
            var r = new Set(this), s = o[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) r.add(n.value);
            return r;
          });
          def(Set.prototype, 'intersection', function (o) {
            var r = new Set(), s = this[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) if (o.has(n.value)) r.add(n.value);
            return r;
          });
          def(Set.prototype, 'difference', function (o) {
            var r = new Set(), s = this[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) if (!o.has(n.value)) r.add(n.value);
            return r;
          });
          if (typeof Object.groupBy !== 'function') {
            Object.groupBy = function (it, fn) {
              var r = Object.create(null), i = 0, s = it[Symbol.iterator]();
              for (var n = s.next(); !n.done; n = s.next()) {
                var k = fn(n.value, i++); (r[k] || (r[k] = [])).push(n.value);
              }
              return r;
            };
          }
          if (typeof URL.canParse !== 'function') {
            URL.canParse = function (u, b) { try { new URL(u, b); return true; } catch (e) { return false; } };
          }
        })();
        """,
        // 把 Web 内容的异常具名带到原生侧并浮到错误浮层，白屏不再是哑的。
        """
        (function () {
          window.__dshReportError = function (parts) {
            try {
              window.webkit.messageHandlers.dshErrors.postMessage(String(parts));
            } catch (e) {}
          };
          window.addEventListener('error', function (e) {
            window.__dshReportError('JS错误: ' + (e.message || e) + ' @ ' + (e.filename || '').slice(-40) + ':' + (e.lineno || 0));
          });
          window.addEventListener('unhandledrejection', function (e) {
            var r = e.reason;
            var msg = (r && r.message ? r.message : String(r));
            // 拦截不可预览文件触发的 sidebarRight tab 注册缺失报错，杜绝弹窗
            if (msg.indexOf('no registered tab type claims') !== -1) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            window.__dshReportError('未处理Promise拒绝: ' + msg);
          });
        })();
        """,
        // 关键探针：DSH 前端唯一数据通道是 ws(s)://.../api/remote.mux。
        // 若它在 iOS 上握手失败（401/挂起），页面就永远拿不到数据 = 白屏。
        // 这里把每一次 WebSocket 的建连结果与关闭码上报原生，用于判定真因。
        // 只上报，不改变任何行为。
        """
        (function () {
          if (window.__dshWsProbe) return;
          window.__dshWsProbe = true;
          var report = function (s) {
            try { window.webkit.messageHandlers.dshErrors.postMessage('WS ' + s); } catch (e) {}
          };
          var Native = window.WebSocket;
          if (typeof Native !== 'function') return;
          function Patched(url, protocols) {
            var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
            var shortUrl = String(url).replace(/^wss?:\\/\\//, '');
            report('连接中 ' + shortUrl);
            ws.addEventListener('open', function () { report('已连接 ' + shortUrl); });
            ws.addEventListener('error', function () { report('连接失败 ' + shortUrl); });
            ws.addEventListener('close', function (ev) {
              report('关闭 code=' + ev.code + ' reason=' + (ev.reason || '') + ' ' + shortUrl);
            });
            return ws;
          }
          Patched.prototype = Native.prototype;
          Patched.CONNECTING = Native.CONNECTING;
          Patched.OPEN = Native.OPEN;
          Patched.CLOSING = Native.CLOSING;
          Patched.CLOSED = Native.CLOSED;
          window.WebSocket = Patched;
        })();
        """,
        // 移动端工作台文件传输、原生分享与下载桥接：
        // 1. 拦截 `<a download="...">` 与 Blob/DataURL 点击，将二进制文件转送给原生保存/分享；
        // 2. 在交付物卡片（.JZoinq_file / [data-presented-files-row]）、文档预览栏（.YdIzba_header）、
        //    会话文件树（[data-files-entry="file"]）与正文文件链接旁，一键注入「分享」按钮；
        // 3. 点击「分享」按钮直接调起 iOS 本地原生 UIActivityViewController（存储到“文件”、隔空投送 AirDrop、微信分享等）；
        // 4. 支持直接请求服务端 /api/file?path=... 获取工作区任意文件的无损原始二进制数据。
        """
        (function () {
          if (window.__dshDownloadBridgeInjected) return;
          window.__dshDownloadBridgeInjected = true;

          function sendFileToNative(name, mime, base64) {
            try {
              window.webkit.messageHandlers.dshFileTransfer.postMessage({
                name: name || 'file.dat',
                mime: mime || 'application/octet-stream',
                base64: base64
              });
            } catch (err) {
              console.warn('[DSHios] File transfer bridge error:', err);
            }
          }

          // 核心工具：通过绝对路径直接从 DSH 服务端 /api/file 拉取原文件并转送原生分享
          function shareFileByPath(filePath, fileName) {
            if (!filePath) return;
            var name = fileName || filePath.split(/[\\\\/]/).pop() || 'file_' + Date.now();
            var apiUrl = new URL('api/file?path=' + encodeURIComponent(filePath), window.location.href).href;

            fetch(apiUrl).then(function(res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              var mime = res.headers.get('content-type') || 'application/octet-stream';
              return res.blob().then(function(blob) {
                var reader = new FileReader();
                reader.onloadend = function() {
                  var b64 = (reader.result || '').split(',')[1] || '';
                  sendFileToNative(name, mime, b64);
                };
                reader.readAsDataURL(blob);
              });
            }).catch(function(err) {
              console.warn('[DSHios] Failed to fetch via /api/file:', err);
              // 如果是通过 dsh-resource:// 或相对路径，尝试反解真实路径重试
              if (filePath.startsWith('dsh-resource://file/')) {
                var prefix = 'dsh-resource://file/session/';
                var idx = filePath.indexOf(prefix);
                if (idx !== -1) {
                  var rest = filePath.substring(idx + prefix.length);
                  var slashIdx = rest.indexOf('/');
                  if (slashIdx !== -1) {
                    var encodedPath = rest.substring(slashIdx + 1);
                    var decoded = '';
                    try { decoded = decodeURIComponent(encodedPath); } catch(e) { decoded = encodedPath; }
                    if (decoded && decoded !== filePath) {
                      shareFileByPath(decoded, name);
                      return;
                    }
                  }
                }
              }
              // 严禁将界面上的「该格式文件暂时无法预览」等说明文字作为回退内容发送！
            });
          }

          // 拦截标准链接点击（包含 download 属性，或 blob: / data: 协议的下载）
          document.addEventListener('click', function (e) {
            var target = e.target && e.target.closest ? e.target.closest('a') : null;
            if (!target) return;
            var href = target.getAttribute('href') || '';
            var hasDownload = target.hasAttribute('download');
            var downloadName = target.getAttribute('download') || '';

            if (hasDownload || href.startsWith('blob:') || href.startsWith('data:')) {
              if (href.startsWith('data:')) {
                e.preventDefault();
                e.stopPropagation();
                var parts = href.split(',');
                var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
                var b64 = parts[1] || '';
                var fname = downloadName || 'download_' + Date.now();
                sendFileToNative(fname, mime, b64);
              } else if (href.startsWith('blob:')) {
                e.preventDefault();
                e.stopPropagation();
                fetch(href).then(function(res) {
                  var mime = res.headers.get('content-type') || 'application/octet-stream';
                  return res.blob().then(function(b) {
                    var reader = new FileReader();
                    reader.onloadend = function() {
                      var b64 = (reader.result || '').split(',')[1] || '';
                      var fname = downloadName || 'file_' + Date.now();
                      sendFileToNative(fname, mime, b64);
                    };
                    reader.readAsDataURL(b);
                  });
                }).catch(function(err) {
                  console.error('[DSHios] blob download error:', err);
                });
              }
            }
          }, true);

          // 动态注入 1：为每一张交付物卡片（.JZoinq_file / PresentedFileCard）注入原生「分享」按钮
          function enrichDeliverableCards() {
            var cards = document.querySelectorAll('.JZoinq_file');
            cards.forEach(function(card) {
              if (card.querySelector('.dsh-mobile-share-btn')) return;

              // 尝试从卡片中提取文件绝对路径与文件名
              var previewBtn = card.querySelector('button.JZoinq_cardPreview');
              var nameEl = card.querySelector('.JZoinq_fileName');
              var fileName = nameEl ? (nameEl.innerText || '').trim() : '';
              var filePath = previewBtn ? (previewBtn.getAttribute('title') || '') : '';
              if (!filePath && fileName) filePath = fileName;

              var shareBtn = document.createElement('button');
              shareBtn.type = 'button';
              shareBtn.className = 'dsh-mobile-share-btn';
              shareBtn.setAttribute('title', '分享 / 保存到手机');
              shareBtn.style.cssText = 'height:26px;padding:0 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;border-radius:13px;border:none;background:#007aff;color:#ffffff;font-weight:600;cursor:pointer;margin-left:auto;flex-shrink:0;z-index:10;position:relative;box-shadow:0 2px 6px rgba(0,122,255,0.35);';
              shareBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg><span>保存</span>';

              shareBtn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                // 优先取卡片上关联的绝对路径
                var currentPath = previewBtn ? (previewBtn.getAttribute('title') || '') : filePath;
                shareFileByPath(currentPath, fileName);
              });

              // 拦截整张卡片点击：如果文件是二进制/非文本（如 ipa, tipa, zip, exe, dmg, tar, gz 等），点击整张卡片直接触发保存/下载，
              // 彻底阻断 sidebarRight 侧栏打不开非文本文件的报错模态框！
              if (previewBtn) {
                previewBtn.addEventListener('click', function(e) {
                  var currentPath = previewBtn.getAttribute('title') || filePath || fileName;
                  var lower = (currentPath || '').toLowerCase();
                  var binExts = ['.ipa', '.tipa', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dmg', '.apk', '.bin', '.iso', '.pkg', '.deb', '.pdf', '.mp4', '.mov', '.mp3'];
                  var isBinary = binExts.some(function(ext) { return lower.endsWith(ext); });
                  if (isBinary) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    shareFileByPath(currentPath, fileName);
                  }
                }, true); // 捕获阶段拦截
              }

              // 将按钮添加到卡片头部或尾部操作区
              var fileBody = card.querySelector('.JZoinq_fileBody');
              if (fileBody) {
                fileBody.appendChild(shareBtn);
              } else {
                card.appendChild(shareBtn);
              }
            });
          }

          // 动态注入 2：在不可预览文件页面（如 tipa/zip/exe/ipa）注入醒目的【📥 保存 / 分享到手机】按钮
          function enrichPreviewHeader() {
            var emptyContainer = document.querySelector('[data-textpreview-unsupported], [class*="unsupportedPreview"], [class*="unpreviewable"]');
            if (emptyContainer && !emptyContainer.querySelector('.dsh-mobile-save-file-btn')) {
              var pathEl = document.querySelector('[data-textpreview-path], [class*="previewPath"]');
              var fullPath = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';
              if (!fullPath) {
                var titleTab = document.querySelector('[data-dockkit-strip] [aria-selected="true"], [data-dockkit-strip] [class*="active"]');
                fullPath = titleTab ? (titleTab.getAttribute('title') || titleTab.textContent || '') : '';
              }
              var btn = document.createElement('button');
              btn.className = 'dsh-mobile-save-file-btn';
              btn.type = 'button';
              btn.innerHTML = '📥 保存 / 分享到手机';
              btn.style.cssText = 'display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;height:38px!important;padding:0 20px!important;border-radius:19px!important;background:#007aff!important;color:#fff!important;font-size:15px!important;font-weight:600!important;border:none!important;box-shadow:0 4px 12px rgba(0,122,255,0.35)!important;cursor:pointer!important;margin:16px auto!important;';
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (fullPath) {
                  var cleanName = fullPath.split(/[\\\\/]/).pop() || fullPath;
                  shareFileByPath(fullPath, cleanName);
                }
              });
              emptyContainer.appendChild(btn);
            }
          }

          // 动态注入 3：向右侧边栏文件树的列表项追加轻量的分享图标
          function enrichFilesTree() {
            var fileRows = document.querySelectorAll('li[data-files-entry="file"]');
            fileRows.forEach(function(row) {
              if (row.querySelector('.dsh-mobile-tree-share')) return;
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'dsh-mobile-tree-share';
              btn.setAttribute('title', '分享该文件');
              btn.style.cssText = 'width:24px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary, #888);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:auto;flex-shrink:0;';
              btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>';

              btn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var labelEl = row.querySelector('[data-files-name]') || row.querySelector('span') || row;
                var fileName = labelEl ? (labelEl.innerText || '').trim() : '';
                var pathAttr = row.getAttribute('data-files-path') || row.getAttribute('title') || fileName;
                shareFileByPath(pathAttr, fileName);
              });

              var container = row.querySelector('button') || row;
              container.appendChild(btn);
            });
          }

          // 核心修复（问题 1）：在事件捕获阶段拦截点击二进制交付物卡片，直接调起手机分享/保存，杜绝 sidebarRight 报错弹窗
          document.addEventListener('click', function(e) {
            var card = e.target && e.target.closest ? e.target.closest('.JZoinq_file, [data-presented-file]') : null;
            if (!card) return;
            if (e.target.closest('.dsh-mobile-share-btn')) return;

            var previewBtn = card.querySelector('button.JZoinq_cardPreview');
            var nameEl = card.querySelector('.JZoinq_fileName');
            var fileName = nameEl ? (nameEl.innerText || '').trim() : '';
            var filePath = previewBtn ? (previewBtn.getAttribute('title') || '') : '';
            if (!filePath && fileName) filePath = fileName;

            var ext = (filePath.split('.').pop() || '').toLowerCase();
            var binaryExts = ['tipa', 'ipa', 'zip', 'exe', 'tar', 'gz', 'apk', 'dmg', 'bin', '7z', 'rar', 'iso'];
            if (binaryExts.indexOf(ext) !== -1 || ext === 'tipa' || ext === 'ipa') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              var cleanName = fileName || filePath.split(/[\\\\/]/).pop() || filePath;
              shareFileByPath(filePath, cleanName);
            }
          }, true);

          setInterval(function() {
            enrichDeliverableCards();
            enrichPreviewHeader();
            enrichFilesTree();
          }, 800);

          // 拦截试图在宿主电脑上打开外部程序/链接的操作（如在电脑端打开、WPS、浏览器、终端等），弹窗提醒用户在手机端禁止此操作
          (function interceptExternalDesktopLaunches() {
            function showMobileRestrictedAlert(toolName) {
              var name = toolName ? '【' + toolName + '】' : '';
              var msg = '手机端禁止打开电脑端外链或程序 ' + name + '，请在电脑端操作！';
              if (window.__dshToast) {
                window.__dshToast(msg);
              }
              alert(msg);
            }

            // 1. 拦截前端发起的 /open-in-app/open 请求
            var origFetch = window.fetch;
            if (origFetch) {
              window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (url && (url.includes('/open-in-app/open') || url.includes('/open-in-terminal'))) {
                  showMobileRestrictedAlert('电脑外部程序');
                  return Promise.reject(new Error('Mobile access restricted'));
                }
                return origFetch.apply(this, arguments);
              };
            }

            // 2. 监听点击事件，拦截电脑端打开、新建终端、浏览网页等外链/外发按钮
            document.addEventListener('click', function(e) {
              var target = e.target;
              if (!target) return;

              // 检查是否是“在电脑端打开”分列按钮（.PPCmka_split、.PPCmka_main、.PPCmka_chevron）
              var pcSplitBtn = target.closest('.PPCmka_split, .PPCmka_main, .PPCmka_chevron, [data-open-target]');
              if (pcSplitBtn) {
                // 如果这是手机端的“保存/分享”自定义按钮，则允许正常执行
                if (target.closest('.dsh-mobile-save-file-btn') || target.closest('.dsh-mobile-share-btn') || target.closest('.dsh-mobile-download-btn')) {
                  return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                showMobileRestrictedAlert('电脑外部应用');
                return;
              }

              // 检查新建终端、系统浏览器等按钮
              var btn = target.closest('button, a');
              if (btn) {
                var text = (btn.innerText || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
                if (text === '新建终端' || text === '在系统浏览器中打开' || text.includes('在电脑端打开') || text === '浏览网页') {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  showMobileRestrictedAlert(text);
                  return;
                }
              }
            }, true);
          })();
        })();
        """,
        // v1.0.70 顶栏对齐与状态栏安全区修复（基于 2026-10-11 实测 DOM，追加在数组末尾以最高优先级生效）：
        // 1. 顶栏 padding-top 让出 iOS 状态栏/灵动岛，顶栏永远在状态栏以下；
        // 2. 左侧抽屉开关绝对定位钉在顶栏左上角 28x28，标题行全员 28px 同一水平线；
        // 3. 标题起点与左侧按钮之间保留 18px 间距，绝不重叠；右侧角落恢复 margin-left:auto 靠最右；
        // 4. 免费网页对话等第三方页面由原生侧顶部约束避让（见 updateTopSafeAreaFor）。
        """
        (function () {
          var css = [
            '/* ===== v1.0.73 顶栏修复：flex 自然排布（替换 v1.0.70 的绝对定位方案） ===== */',
            '/* v1.0.70 把左侧按钮 position:absolute 钉死坐标，只按「会话页」量测过；',
            '   首页/新会话页 DOM 结构不同，被钉到屏幕边缘外 → 顶栏消失、左右各卡半个按钮。',
            '   现在全部回到文档流，用 flex 对齐，两种页面共用同一套规则。 */',
            '',
            'html body [data-phase] header,',
            'html body .ank0OG_header {',
            '  position: sticky !important;',
            '  top: 0 !important;',
            '  z-index: 1020 !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  /* v1.0.104：顶栏纵向位置绝不再用固定像素猜。DSH 自带移动端样式表里',
            '     [data-mobile-nav="frame"]{padding-top:env(safe-area-inset-top)} 之类的规则',
            '     权重比注入样式高，且真机 env() 有值、本地为 0，猜像素必然出错。',
            '     这里只保留结构，纵向位置统一交给运行时几何校正 __dshLayoutFix 实测修正。 */',
            '  padding: 2px 8px 0 8px !important;',
            '  min-height: 0 !important;',
            '  flex: none !important;',
            '  box-sizing: border-box !important;',
            '  max-width: 100vw !important;',
            '  overflow: visible !important;',
            '  background: transparent !important;',
            '}',
            '',
            '/* v1.0.104：顶部 36px 首行内部住着左右两个抽屉开关，绝对不能整块 display:none，',
            '   也不能给 pointer-events:none（会连带把开关点不动）。纵向压缩改由',
            '   __dshLayoutFix 用「标题行负 margin 上提」实现，这里只保证开关可点、无多余外边距。 */',
            'header .ank0OG_headerLeading,',
            '.ank0OG_headerLeading,',
            '[data-conversation-header-leading] {',
            '  pointer-events: auto !important;',
            '  margin: 0 !important;',
            '}',
            '',
            '/* 确保 overlayLayer 挂载层本身透明，杜绝首页与主界面全局发灰变暗 */',
            '.CZPbNW_overlayLayer,',
            '[class*="overlayLayer"] {',
            '  background: transparent !important;',
            '  background-color: transparent !important;',
            '}',
            '',
            '/* 新建会话首页目录按钮（问题 4 彻底修复）：精准位于状态栏下方安全区（54px + 8px = 62px，v1.0.109 起再上移 --dsh-topshift），饱满居中不被截断 */',
            '[data-mobile-nav="fab"] {',
            '  display: inline-flex !important;',
            '  visibility: visible !important;',
            '  opacity: 1 !important;',
            '  position: fixed !important;',
            '  top: calc(var(--dsh-statusbar, 54px) + 8px - var(--dsh-topshift, 0px)) !important;',
            '  left: 14px !important;',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  padding: 0 !important;',
            '  border: none !important;',
            '  border-radius: 8px !important;',
            '  background: var(--dsw-alias-interactive-bg-hover, rgba(125, 125, 125, 0.16)) !important;',
            '  color: var(--dsw-alias-label-primary, currentColor) !important;',
            '  box-shadow: none !important;',
            '  z-index: 99 !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '',
            '/* 会话页时隐藏 fallback 浮动按钮，把空间交给顶栏内置侧栏按钮 */',
            '[data-phase="active"] [data-mobile-nav="fab"] {',
            '  display: none !important;',
            '}',
            '',
            '/* 侧栏收起时彻底隐藏抽屉内部残留的切换按钮，杜绝屏幕左边缘天上露出半个多余小按钮 */',
            '[data-sidebar-collapsed] [class*="WYye1W_toggle"],',
            '[data-sidebar-collapsed] button[aria-label="打开侧边栏"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '}',
            '',
            '[data-phase] header [class*="titleRow"],',
            '.ank0OG_titleRow {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  height: auto !important;',
            '  min-height: 32px !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  gap: 6px !important;',
            '  overflow: hidden !important;',
            '}',
            '',
            '/* 左侧抽屉开关回到文档流：不再绝对定位，与标题同一行自然排列 */',
            'header button[aria-label="打开目录"],',
            'header button[aria-label="收起目录"],',
            'header button[aria-label="打开侧边栏"],',
            'header button[aria-label="收起侧边栏"],',
            '[data-mobile-nav="toggle"] {',
            '  /* v1.0.83：页面在具体会话里把这颗按钮收成 28px，新建会话页是 38px，两个页面大小不一致。',
            '     统一成页面自带的 38px。 */',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  min-width: 38px !important;',
            '  min-height: 38px !important;',
            '  position: static !important;',
            '  transform: none !important;',
            '  top: auto !important;',
            '  left: auto !important;',
            '  right: auto !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  flex: none !important;',
            '  order: -1 !important;',
            '  margin-left: 0 !important;',
            '  z-index: auto !important;',
            '}',
            '/* v1.0.85：侧栏收起后残留的开关按钮滑到屏幕左边外，还露一截。滑出屏幕的隐藏。 */',
            '',
            'html body [data-phase] header [class*="titleCluster"],',
            'html body .ank0OG_titleCluster {',
            '  /* v1.0.75：原来 flex:1 把标题簇拉成 326px，标题只占左边 57px，右边空两百多像素。',
            '     按内容收缩后，margin-left:auto 把空位吃到左边，',
            '     标题、目录、智能体按钮整组靠右，贴近右侧边栏按钮。 */',
            '  flex: 0 1 auto !important;',
            '  width: auto !important;',
            '  margin-left: auto !important;',
            '  min-width: 0 !important;',
            '  height: auto !important;',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  gap: 6px !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '}',
            '',
            '[data-phase] header [class*="headerUtilities"],',
            '.ank0OG_headerUtilities {',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex: none !important;',
            '  margin-left: 0 !important;',
            '}',
            '[data-phase] header [class*="headerCorner"],',
            '.ank0OG_headerCorner {',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex: none !important;',
            '  margin-left: auto !important;',
            '}',
            '/* 新建会话首页无需打开右侧边栏，隐藏右上角无用占位按钮 */',
            'header.ank0OG_headerBlank [class*="headerCorner"],',
            'header.ank0OG_headerBlank .ank0OG_headerCorner {',
            '  display: none !important;',
            '}',
            '',
            '/* v1.0.83：打开目录被挪进标题行后也命中了这条，被压成 32px，',
            '   和页面自带的 38px 按钮叠在一起。把它排除，保留原始尺寸。 */',
            '[data-phase] header [class*="titleRow"] button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            '[data-phase] header [class*="titleRow"] [role="button"]:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            'button[aria-label="更多操作"],',
            'button[aria-label="打开右侧边栏"],',
            'button[aria-label="收起右侧边栏"],',
            'button[aria-label="文件浏览"],',
            '.ank0OG_headerActions button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            '.ank0OG_headerCorner button {',
            '  width: 32px !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  min-width: 32px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  flex: none !important;',
            '}',
            '',
            '/* 彻底消灭与右侧抽屉开关重叠的文件夹图标（包括文件浏览、工作区文件） */',
            'button[aria-label="文件浏览"],',
            'button[title="文件浏览"],',
            'button[aria-label="工作区文件"],',
            'button[aria-label*="文件树"],',
            'button[aria-label*="浏览文件"],',
            '[data-mobile-nav="files"],',
            '.ank0OG_headerCorner button:has(svg path[d*="M20 20a2"]),',
            '.ank0OG_headerCorner button:has(svg path[d*="M4 4h16"]),',
            '.ank0OG_headerCorner button:has(svg [d*="M3 7v10"]),',
            '.ank0OG_headerCorner > button:not([data-sidebar-right-expand]):not([aria-label="打开右侧边栏"]):not([aria-label="收起右侧边栏"]) {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '}',
            '',
            '/* 智能体团队：左侧留足间距，杜绝最左侧数字被手机屏幕边缘切断，单行水平并排（老总铁律） */',
            'button[aria-label="智能体团队"],',
            'button[aria-label*="智能体团队"] {',
            '  margin-left: 6px !important;',
            '  width: auto !important;',
            '  min-width: max-content !important;',
            '  max-width: none !important;',
            '  white-space: nowrap !important;',
            '  flex: 0 0 auto !important;',
            '  display: inline-flex !important;',
            '  flex-direction: row !important;',
            '  align-items: center !important;',
            '  gap: 5px !important;',
            '  height: 28px !important;',
            '  padding: 0 10px !important;',
            '  position: static !important;',
            '  border-radius: 14px !important;',
            '  word-break: keep-all !important;',
            '}',
            'button[aria-label="智能体团队"] *,',
            'button[aria-label*="智能体团队"] * {',
            '  white-space: nowrap !important;',
            '  overflow: visible !important;',
            '  word-break: keep-all !important;',
            '}',
            '',
            '/* 后台任务胶囊指示器：允许自适应宽度，确保完整显示数字（如 1）杜绝截断为省略号 */',
            'button[aria-label*="后台任务"],',
            '[data-job-indicator] button {',
            '  width: auto !important;',
            '  min-width: 28px !important;',
            '  padding: 0 6px !important;',
            '  white-space: nowrap !important;',
            '}',
            '',
            '[data-phase] header [class*="crumbs"],',
            '.ank0OG_crumbs {',
            '  flex: 0 1 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: 24vw !important;',
            '  min-height: 32px !important;',
            '  height: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '',
            '[data-phase] header [class*="tabs"],',
            '.ank0OG_tabs {',
            '  margin-top: 4px !important;',
            '  margin-bottom: 6px !important;',
            '  flex: none !important;',
            '  max-width: 100% !important;',
            '}',
            '',
            '/* 侧栏抽屉三段式布局（老总铁律）：',
            '   1. 顶部顶栏（图片 + deepseek HARNESS 字样 + 新会话 + 插件列表）固定内容；',
            '   2. 底部（余额/今日/柱状图/导出日志 + 齿轮【设置】按钮）固定吸底；',
            '   3. 中间会话列表内容区（regionArea）根据滑块纵向滚动！ */',
            '[class*="sidebarCol"],',
            '.CZPbNW_sidebarCol {',
            '  width: 280px !important;',
            '  max-width: 85vw !important;',
            '  min-width: 260px !important;',
            '  padding-top: calc(var(--dsh-statusbar, 54px) + 6px - var(--dsh-topshift, 0px)) !important;',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  height: 100vh !important;',
            '  height: 100dvh !important;',
            '  max-height: 100vh !important;',
            '  max-height: 100dvh !important;',
            '  box-sizing: border-box !important;',
            '  overflow: hidden !important;',
            '  background: var(--dsw-alias-bg-base, #ffffff) !important;',
            '  z-index: 1200 !important;',
            '}',
            '@media (prefers-color-scheme: dark) {',
            '  [class*="sidebarCol"],',
            '  .CZPbNW_sidebarCol,',
            '  [class*="WYye1W_root"],',
            '  .WYye1W_root {',
            '    background: #18181b !important;',
            '  }',
            '}',
            '[class*="WYye1W_root"],',
            '.WYye1W_root {',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '  max-height: 100% !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  overflow: hidden !important;',
            '  padding: 0 !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="WYye1W_logoRow"],',
            '.WYye1W_logoRow {',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '  padding: 0 10px 10px 10px !important;',
            '  position: static !important;',
            '}',
            '[class*="WYye1W_newSession"],',
            '.WYye1W_newSession {',
            '  flex: none !important;',
            '  margin-bottom: 6px !important;',
            '}',
            '[class*="WYye1W_panelList"],',
            '.WYye1W_panelList {',
            '  flex: none !important;',
            '}',
            '/* 中间会话列表内容区：独立纵向惯性滑动 */',
            '[class*="WYye1W_regionArea"],',
            '.WYye1W_regionArea {',
            '  flex: 1 1 auto !important;',
            '  min-height: 0 !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '}',
            '/* 底部操作区与设置：固定吸底，绝不溢出屏幕外 */',
            '[class*="WYye1W_footArea"],',
            '.WYye1W_footArea {',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '  padding: 10px 10px 0 10px !important;',
            '  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.08)) !important;',
            '  position: static !important;',
            '  background: inherit !important;',
            '}',
            '[class*="WYye1W_newSession"],',
            '[class*="WYye1W_panelRow"] {',
            '  padding-left: 10px !important;',
            '  padding-right: 10px !important;',
            '  font-size: 13px !important;',
            '}',
            '/* 移动端触摸屏隐藏电脑端键盘快捷键 Ctrl+Alt+N，彻底释放“新会话”按钮文字空间 */',
            '[class*="WYye1W_newSessionShortcut"] {',
            '  display: none !important;',
            '}',
            '[class*="WYye1W_newSessionLabelMask"],',
            '[class*="WYye1W_newSessionContent"] {',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 8px !important;',
            '}',
            '[class*="WYye1W_newSessionLabel"] {',
            '  display: inline-block !important;',
            '  opacity: 1 !important;',
            '  font-size: 13px !important;',
            '  font-weight: 500 !important;',
            '}',
            '[class*="WYye1W_logoRow"] {',
            '  padding: 0 8px !important;',
            '}',
            '',
            '/* 会话消息内容区 (viewArea) 底部常驻充足裕量，避免输入框遮挡 */',
            '[class*="viewArea"],',
            '.ank0OG_viewArea {',
            '  padding-bottom: 160px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '',
            '/* 底部 dock 统计条与操作栏：UI 页面布局不改，保持原有自然结构，随整页上移自然完整呈现 */',
            '[data-slot="conversation.composer.dock"],',
            '.z4IYsq_root,',
            '[data-composer-stats="true"] {',
            '  margin-bottom: 8px !important;',
            '}',
            '',
            '/* 输入框底栏容器：底栏紧随整体上移，下方保留充足舒适的两行呼吸空间 */',
            '[class*="ank0OG_footArea"],',
            '[class*="footArea"],',
            '.ank0OG_footArea,',
            '[data-conversation-footer],',
            '[class*="inputContainer"],',
            '[class*="promptInputArea"] {',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '',
            '/* 键盘弹起时或移动端模式下：费用明细与多余超长统计条弱化/隐藏，杜绝穿透键盘完成条 */',
            'body[data-keyboard-open="true"] [class*="costMeter"],',
            'body[data-keyboard-open="true"] [class*="billing"],',
            'body[data-keyboard-open="true"] [class*="footerStats"],',
            'body[data-keyboard-open="true"] [data-slot="conversation.composer.dock"],',
            'body[data-keyboard-open="true"] .z4IYsq_root,',
            '[class*="costMeter"][class*="detail"],',
            '.dsh-cost-meter-bar button {',
            '  display: none !important;',
            '}',
            '/* 聊天主界面底栏（输入框外层容器）：适度紧凑上移，消除多余虚假空白 */',
            '.ank0OG_inputRoot,',
            '[class*="ank0OG_inputRoot"],',
            '[class*="inputRoot"] {',
            '  margin-bottom: max(6px, calc(env(safe-area-inset-bottom) + 2px)) !important;',
            '}',
            '',
            '/* ===== v1.0.108 会话页「底栏床垫」（老总 2026-10-16：会话记录穿过聊天框从底部露出）=====',
            '   会话页 seat 下沿到屏幕底那 46pt 必须有实心底色，否则滚动的消息就从缝里顶出来。',
            '   底色/厚度都由 shim_14 的 fixBottom 运行时实测写入（--dsh-pagebg 取 DSH 自己的页面底色，',
            '   亮/暗主题自动跟随），这里只留一条属性选择器做兜底：',
            '   React 重渲染会把 seat 的内联样式整条抹掉，而 data-dsh-bed 属性 + CSS 变量不会 ——',
            '   有这条规则，抹掉之后到下一趟校正（≤320ms）之间也不会突然漏光。 */',
            '[data-dsh-bed="1"] {',
            '  bottom: 0 !important;',
            '  padding-bottom: var(--dsh-bed, 46px) !important;',
            '  background-color: var(--dsh-pagebg, transparent) !important;',
            '}',
          ].join('\\n');
          function inject() {
            var root = document.head || document.documentElement;
            if (!root) { setTimeout(inject, 30); return; }
            var old = document.getElementById('dsh-ios-header-fix');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            var style = document.createElement('style');
            style.id = 'dsh-ios-header-fix';
            style.textContent = css;
            root.appendChild(style);
          }
          inject();
          // 🔴 v1.0.109：老总 2026-10-16「顶栏距离 iOS 系统状态栏还有空间，整体 UI 从顶栏开始上移一格文字间距」。
          //   量测依据（老总真机截图 1290x2796 = 430x932@3x，逐行像素剖面 _prof.cjs / _linepitch.cjs）：
          //     · 安全区 top = 59pt；他的系统状态栏（状态栏增强主题）文字最下沿 = y45.0pt
          //       （「周五 10/16 九月初七」那一行，实测带 y105..135px）；
          //     · 我们的顶栏顶 = 57pt → 中间空出 12pt 纯色带（亮色主题下是一条肉眼明显的白富余）。
          //   取值 12pt：正好吃掉这段空白；顶栏内图标（x 11.7..38.3pt）落到 48..71pt，
          //   与状态栏文字（止于 45pt）仍留 3pt 呼吸、零重叠。
          //   ⚠️ 不能取「一整格正文行距」的 22pt（实测正文行距 = 22.0pt）—— 那会把顶栏图标
          //      直接压到「周五 10/16 九月初七」上（对照图已附）。
          //   值定义在这里（而不是 shim_14）：因为 __dshSetStatusBar 给抽屉/面板写的是**内联**
          //   padding-top，样式表压不过它，必须在这一处统一扣减，shim_14 再从全局读。
          window.__dshTopShift = 12;
          // v1.0.76：原生侧把状态栏高度（CSS 像素）下发到这里。
          // 写成 CSS 变量，顶栏 padding 用它，换机型、转屏都跟着变。
          window.__dshSetStatusBar = function (px) {
            var h = Math.max(0, px || 0);
            document.documentElement.style.setProperty('--dsh-statusbar', h + 'px');
            // v1.0.109：把整体上移量也广播成 CSS 变量，让样式表那几处 calc() 一起跟随。
            var shift = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 0;
            document.documentElement.style.setProperty('--dsh-topshift', shift + 'px');
            // 原生下发的才是真·安全区高度（iPhone 14 Pro Max = 59）。DSH 自己也会写同名
            // 变量、而且写得比我们大（实测 75），会把几何校正的目标带偏，所以这里单独存一份。
            window.__dshNativeStatusBar = h;
            // v1.0.104：顶栏纵向位置禁止在这里写死（旧版写 margin-top:4px 会覆盖运行时几何校正，
            // 而且真机多出来的那段空白根本不是 header 撑的，写死必然对不上）。
            var headers = document.querySelectorAll('header');
            for (var i = 0; i < headers.length; i++) {
              headers[i].style.setProperty('background', 'transparent', 'important');
            }
            if (window.__dshLayoutFix) { try { window.__dshLayoutFix(); } catch (e) {} }
            // 侧栏外层让出状态栏高度，内部子容器（.dMHGga_panel、.YdIzba_header 等）严禁重复叠加 padding-top，保持顶栏高度不变！
            var cols = document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol, [class*="rightbarCol"], .CZPbNW_rightbarCol');
            for (var j = 0; j < cols.length; j++) {
              cols[j].style.setProperty('padding-top', (h + 6 - shift) + 'px', 'important');
            }
            // 清理子容器可能叠加的多余 padding-top，保证打开文件页面时顶栏与主会话绝对平齐！
            var subCols = document.querySelectorAll('.dMHGga_session, .dMHGga_panel, .YdIzba_header');
            for (var sj = 0; sj < subCols.length; sj++) {
              subCols[sj].style.setProperty('padding-top', '0px', 'important');
            }
            // 🔴 v1.0.108 撤销「把 body / 空标签容器 / frame / root 全部清成透明」这条老逻辑。
            //    A/B 实测（2026-10-16，430x932 dsf3 iPhone UA，暗色）：
            //      官方原版：body / [data-mobile-nav=frame] / .ank0OG_root / .CZPbNW_frame 四层**都自带
            //                rgb(21,21,23)**（页面底色由 DSH 自己铺），全屏均匀、无接缝；
            //      我们的构建：这四层被清成 rgba(0,0,0,0)，而顶栏几何校正把 .ank0OG_root 整体下推 57px
            //                （fixTop 的 margin-top），于是 0..57 那条（状态栏下方）没有任何元素铺色，
            //                直接透出 WebView 自身的底色 → 本机 Edge 是 #121212、真机 iOS 是近纯黑，
            //                与页面底色 #151517 之间出现一条**横向色阶断层**。
            //                实测实拍：老总截图 y0..55 = #010103（纯黑）、y60 起 = #16151a（DSH 页面底）。
            //    这正是老总 2026-10-16 报的「暗黑模式下颜色灰色不是和背景一致的黑色，有分层，不好看」。
            //    结论：这几层的底色是 DSH 的原生皮肤，**绝不能替它清掉**；一律交还 DSH 自己管。
            //    （历史遗留注释说「新建会话页的灰是 body 和空标签容器的底色」——真凶不是这几层，
            //      已由 A/B 证伪：官方同处就是同一个灰，属 DSH 皮肤色。）
          };
          // 确保 overlayLayer 挂载层全透明，杜绝首页全局暗淡发灰
          function ensureSidebarOverlay() {
            var layers = document.querySelectorAll('[class*="overlayLayer"]');
            for (var i = 0; i < layers.length; i++) {
              layers[i].style.setProperty('background', 'transparent', 'important');
              layers[i].style.setProperty('background-color', 'transparent', 'important');
            }
          }
          function applySidebarInset() {
            ensureSidebarOverlay();
            var raw = getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar');
            var h = parseFloat(raw);
            if (!(h > 0)) return;
            var cols = document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol, [class*="rightbarCol"], .CZPbNW_rightbarCol');
            for (var i = 0; i < cols.length; i++) {
              if (cols[i].dataset.dshInsetApplied !== String(h)) {
                cols[i].dataset.dshInsetApplied = String(h);
                cols[i].style.setProperty('padding-top', (h + 6) + 'px', 'important');
              }
            }
            var subCols = document.querySelectorAll('.dMHGga_session, .dMHGga_panel, .YdIzba_header');
            for (var si = 0; si < subCols.length; si++) {
              subCols[si].style.setProperty('padding-top', '0px', 'important');
            }
          }
          function shiftTitleCluster() {
            try { applySidebarInset(); } catch (e) {}
            // v1.0.104：绝不能再隐藏顶部首行（leading）——左右两个抽屉开关就住在里面，
            // 隐藏它等于把"打开侧边栏/文件"的入口一起干掉。纵向压缩交给 __dshLayoutFix 的负 margin。
            var rows = document.querySelectorAll('[class*="titleRow"]');
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              var cluster = row.querySelector('[class*="titleCluster"]');
              var header = row.closest('header') || row;
              var dir = header.querySelector('button[aria-label="打开目录"], button[aria-label="收起目录"], button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
              // 目录按钮保持在顶栏左侧最前，不插入到 cluster 内部挤压标题与智能体团队
              if (dir && row && row.firstChild !== dir && dir.parentNode !== cluster) {
                row.insertBefore(dir, row.firstChild);
              }
              if (dir && dir.dataset.dshDirStyled !== '1') {
                dir.dataset.dshDirStyled = '1';
                dir.style.setProperty('margin-left', '0', 'important');
                dir.style.setProperty('margin-right', '6px', 'important');
                dir.style.setProperty('flex', 'none', 'important');
              }
              if (cluster && cluster.dataset.dshClusterStyled !== '1') {
                cluster.dataset.dshClusterStyled = '1';
                cluster.style.setProperty('flex', '1 1 auto', 'important');
                cluster.style.setProperty('width', 'auto', 'important');
                cluster.style.setProperty('padding-left', '0', 'important');
                cluster.style.setProperty('display', 'flex', 'important');
                cluster.style.setProperty('align-items', 'center', 'important');
                cluster.style.setProperty('justify-content', 'center', 'important');
                cluster.style.setProperty('margin', '0 auto', 'important');
                cluster.style.setProperty('gap', '6px', 'important');
              }
            }
            var stray = document.querySelectorAll('button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
            for (var s = 0; s < stray.length; s++) {
              var off = stray[s].getBoundingClientRect().right < 0;
              var targetVis = off ? 'hidden' : '';
              if (stray[s].dataset.dshVis !== targetVis) {
                stray[s].dataset.dshVis = targetVis;
                stray[s].style.setProperty('visibility', targetVis, 'important');
              }
            }
            var filesBtns = document.querySelectorAll('[data-mobile-nav="files"], button[aria-label="工作区文件"], button[aria-label="文件浏览"]');
            for (var f = 0; f < filesBtns.length; f++) {
              if (filesBtns[f].parentNode) filesBtns[f].parentNode.removeChild(filesBtns[f]);
            }
            // 确保右上角区域内只有唯一右侧抽屉开关，移除其它重叠子节点
            var corners = document.querySelectorAll('.ank0OG_headerCorner, [class*="headerCorner"]');
            for (var c = 0; c < corners.length; c++) {
              var btns = corners[c].querySelectorAll('button');
              if (btns.length > 1) {
                for (var b = 0; b < btns.length - 1; b++) {
                  btns[b].style.setProperty('display', 'none', 'important');
                }
              }
            }
          }
          shiftTitleCluster();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', shiftTitleCluster, { once: true });
          }

          // v1.0.83：锁屏与后台切回毫秒级自愈支持 (搭配 dsh-anywhere)
          window.__dshFastResume = function () {
            try {
              // 触发一次合成点击与按键事件，打通挂起的微任务队列
              window.dispatchEvent(new Event('pageshow'));
              window.dispatchEvent(new Event('focus'));
              document.dispatchEvent(new Event('visibilitychange'));
            } catch (e) {}
          };
        })();

        // ===== v1.0.106 顶栏「智能体」按钮与标题重叠修复 =====
        // 实测（430x932 iPhone 视口 + 真机 UA，会话页）：DSH 官方把标题 .ank0OG_crumbs 绝对定位到
        // left:54px、横跨 256px（实测 x66~322），而左侧那排图标按钮排在 x56~180 ——
        // 标题直接把「1 个子智能体」徽标（容器仅 32px，内部文字实测 70px 溢出到 x35~105）
        // 和「智能体团队」按钮（x94~134）整排压住，视觉上一团糊。
        // 老总方案：标题不动；智能体按钮右移；「智能体」三个字隐藏。
        // 一律用内联 !important —— DSH 原生样式权重更高，写在 <style> 里打不过。
        (function () {
          if (window.__dshHeaderAgentFix) return;
          window.__dshHeaderAgentFix = 1;

          // 「智能体」三个字隐藏：顶栏动作区里那个 "1 个子智能体" 徽标，容器只有 32px，
          // 文字却要 70px → 溢出到标题底下。藏掉文字（保留徽标与其中箭头，不影响点击）。
          function hideAgentBadgeText() {
            try {
              var header = document.querySelector('header');
              if (!header) return;
              var acts = header.querySelector('[class*="headerActions"]');
              if (!acts) return;
              var spans = acts.querySelectorAll('button > span');
              for (var i = 0; i < spans.length; i++) {
                var sp = spans[i];
                var t = (sp.textContent || '').trim();
                if (!t || t.indexOf('子智能体') === -1) continue;
                if (sp.dataset.dshAgentTxtHidden === '1') continue;
                sp.dataset.dshAgentTxtHidden = '1';
                sp.style.setProperty('display', 'none', 'important');
              }
            } catch (e) {}
          }

          // 智能体按钮右移：脱离标题行文档流，落到标题右侧（实测标题文字止于 x293），
          // 紧贴右侧抽屉开关（32px）左边并留 10px 间距。
          function shiftAgentButtonRight() {
            try {
              var header = document.querySelector('header');
              if (!header) return;
              var btns = header.querySelectorAll('button[aria-label*="智能体团队"]');
              for (var j = 0; j < btns.length; j++) {
            var wrap = btns[j].parentElement;
              if (!wrap) continue;
              if (window.__dshMobilePolish) return;   // shim_16 已接管顶栏摆位，避免两边互相覆盖
              if (wrap.dataset.dshAgentMoved === '1') continue;
                wrap.dataset.dshAgentMoved = '1';
                wrap.style.setProperty('position', 'absolute', 'important');
                wrap.style.setProperty('left', 'auto', 'important');
                wrap.style.setProperty('right', '44px', 'important');
                wrap.style.setProperty('top', '50%', 'important');
                wrap.style.setProperty('transform', 'translateY(-50%)', 'important');
                wrap.style.setProperty('margin', '0', 'important');
                wrap.style.setProperty('z-index', '6', 'important');
              }
            } catch (e) {}
          }

          function fixHeaderAgent() {
            hideAgentBadgeText();
            shiftAgentButtonRight();
          }

          fixHeaderAgent();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fixHeaderAgent);
          }
          window.addEventListener('load', fixHeaderAgent);

          // DSH 是 React 应用，切换会话时 header 会被整棵重建（内联样式一并丢失），
          // 因此必须持续兜底：MutationObserver 去抖 + 启动阶段额外补 30 秒。
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          var pending = 0;
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try {
              new MutationObserver(function () {
                if (pending) return;
                pending = setTimeout(function () { pending = 0; fixHeaderAgent(); }, 300);
              }).observe(document.documentElement, { childList: true, subtree: true });
            } catch (e) {}
          })();
          var ticks = 0;
          var iv = setInterval(function () {
            fixHeaderAgent();
            if (++ticks >= 30) clearInterval(iv);
          }, 1000);
        })();
""",
        // v1.0.72 页面分流补丁（必须放在数组最后，优先级最高）：
        // A. DSH 自身页面：补上原来常驻的「全屏固定布局」CSS（html/body 固定 + 隐藏滚动）；
        // B. 内嵌第三方网页（豆包等）：把这些强干预全部撤掉，恢复浏览器原生滚动/聚焦行为，
        //    并补一个真实手势聚焦兜底 —— 解决第三方短信登录页「点输入框弹不出键盘」。
        """
        (function () {
          var OWN_CSS = 'html, body { overflow: hidden !important; overscroll-behavior: none !important; position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; }';
          var THIRD_CSS = 'html, body { position: static !important; inset: auto !important; overflow: visible !important; overscroll-behavior: auto !important; height: auto !important; width: auto !important; }';
          var appliedOwn = false;
          var appliedThird = false;

          function isOwnPage() {
            try {
              if (typeof window.__dshIsOwnPage === 'function') return window.__dshIsOwnPage();
            } catch (e) {}
            return true;
          }

          function attach(id, css) {
            var root = document.head || document.documentElement;
            if (!root) return false;
            if (document.getElementById(id)) return true;
            var style = document.createElement('style');
            style.id = id;
            style.textContent = css;
            root.appendChild(style);
            return !!document.getElementById(id);
          }

          function relaxViewport() {
            var meta = document.querySelector('meta[name="viewport"]');
            if (meta) meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
          }

          function installTouchFocusFallback() {
            if (window.__dshTouchFocusInstalled) return;
            window.__dshTouchFocusInstalled = true;
            // 页面自身在 touchstart 里 preventDefault 会导致输入框不聚焦、iOS 不弹键盘：
            // 在真实手指手势内补一次 focus（必须是同步调用，异步会失去用户手势上下文）。
            document.addEventListener('touchstart', function (e) {
              var t = e.target;
              if (!t || !t.closest) return;
              var el = t.closest('input, textarea, [contenteditable="true"]');
              if (!el || el.disabled) return;
              try { if (el.readOnly) return; } catch (err) {}
              if (document.activeElement === el) return;
              try { el.focus(); } catch (err) {}
            }, true);
          }

          function apply() {
            if (isOwnPage()) {
              if (!appliedOwn) appliedOwn = attach('dsh-ios-v1072-ownpage-css', OWN_CSS);
            } else if (!appliedThird) {
              appliedThird = attach('dsh-ios-v1072-thirdparty-css', THIRD_CSS);
              if (appliedThird) {
                relaxViewport();
                installTouchFocusFallback();
              }
            }
          }

          apply();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', apply, { once: true });
          }
          var tries = 0;
          var timer = setInterval(function () {
            tries++;
            apply();
            if (appliedOwn || appliedThird || tries > 100) clearInterval(timer);
          }, 100);
        })();
        """,
        // 键盘避让统一由原生 webViewBottomConstraint 丝滑驱动，绝不在 JS 层面触发额外重排与跳动
        """
        (function () {
          window.__dshSetKeyboardInset = function (px) {};
        })();
        """,
        // ================= v1.0.104：运行时几何校正（顶栏紧贴状态栏 / 底栏留两行空白）=================
        // 踩过的坑（必须记住）：
        //  1. DSH 自带的移动端样式表（data-mobile-nav 那套）用的是 !important，而且选择器权重比
        //     注入样式高，例如：
        //       [data-mobile-nav="frame"]{ padding-top: env(safe-area-inset-top,0px) !important }
        //       [data-phase] header > :first-child { min-height: 36px !important }
        //       html body [data-phase] header { padding: 8px 12px 0 !important }
        //     结果：注入样式里写 padding-top/margin-top/display 全被压掉，改了等于没改。
        //  2. env(safe-area-inset-top) 在真机 iPhone 上有值（14 Pro Max = 59），
        //     而本机桌面 Chromium 恒为 0 —— 所以「本地截图看着好了」是假象，真机必然还差一大截。
        // 结论：不再猜任何固定像素。本段直接读真实 DOM 几何，算出偏差，用「内联 !important」
        //       修正（内联 !important 优先级高于任何样式表 !important，谁也压不掉），
        //       无论那段空白是哪个容器撑出来的，都能被拉回正确位置。
        """
        (function () {
          if (window.__dshLayoutFix) { try { window.__dshLayoutFix(); } catch (e) {} return; }
          var TOP_BREATH = 6;    // 顶栏标题行与状态栏下沿之间的呼吸间距（CSS px = pt）
          // 🔴 v1.0.109：「整体 UI 从顶栏起再上移一格文字间距」（老总 2026-10-16）。
          //   取值与完整量测依据见 shim_11 里的 window.__dshTopShift（定义在那边，因为
          //   __dshSetStatusBar 给抽屉/面板写的是内联 padding-top，必须由它统一扣减）。
          var TOP_SHIFT = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 12;
          // v1.0.105：底栏留白改为「按机型安全区自适应」= Home Indicator 安全区 + 固定呼吸间距。
          // 安全区由原生按机型下发（iPhone 全面屏 34 / iPad 全面屏 20 / 有 Home 键机型 0，
          // 见文件末尾 iOSSafeArea 对照表）；取不到时兜底 34，
          // 保证 34 + 12 = 46，与历史验证过的结果完全一致，不改变现有 iPhone 表现。
          var SAFE_BOTTOM_FALLBACK = 34;
          var BOT_BREATH_EXTRA = 12;
          function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
          function sbHeight() {
            // 优先用原生下发的真实安全区高度；其次读 CSS 变量；最后兜底 54。
            var n = num(window.__dshNativeStatusBar);
            if (n > 0) return n;
            var v = num(getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar'));
            return v > 0 ? v : 54;
          }
          // 底栏距屏幕底部的留白（自适应）：优先原生下发的真实底部安全区，
          // 其次读 CSS 变量，最后兜底 34（全面屏 iPhone 主流值）。
          //   ⚠️ 必须用 __dshSafeAreaReady 区分「原生还没下发」和「原生下发的就是 0」——
          //      有 Home 键机型（iPhone SE / 6s~8）底部安全区**就是 0**，
          //      若按 `b > 0` 判断会把 0 当成"没值"，错误套用全面屏的 34，SE 上凭空多出 34px 空白。
          function botBreath() {
            try {
              if (window.__dshSafeAreaReady === 1 && window.__dshSafeArea) {
                var sb = window.__dshSafeArea.bottom;
                if (typeof sb === 'number' && isFinite(sb) && sb >= 0) return sb + BOT_BREATH_EXTRA;
              }
            } catch (e) {}
            var v = num(getComputedStyle(document.documentElement).getPropertyValue('--dsh-safe-bottom'));
            return (v > 0 ? v : SAFE_BOTTOM_FALLBACK) + BOT_BREATH_EXTRA;
          }
          function setP(el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} }
          // 取「DSH 自己的页面底色」：从底栏座位往上找第一个**不透明**的祖先底色。
          // 实测链路：composerSeat(透明) → scrollBody(透明) → centerCol(透明) → .ank0OG_root(rgb(21,21,23))。
          // 亮色主题自动拿到 DSH 的浅底，不需要我们猜颜色。
          function opaqueBg(el) {
            var bg = '';
            try { bg = getComputedStyle(el).backgroundColor || ''; } catch (e) { return ''; }
            if (!bg || bg === 'transparent') return '';
            var m = bg.match(/^rgba?\\(([^)]+)\\)$/);
            if (!m) return '';
            var p = m[1].split(',').map(function (s) { return parseFloat(s); });
            if (p.length >= 4 && !(p[3] >= 0.999)) return '';   // 半透明不能当底色，会继续透
            return bg;
          }
          function pageBg() {
            try {
              var n = document.querySelector('.ank0OG_composerSeat, [class*="composerSeat"]');
              for (var i = 0; n && i < 8; i++) {
                var bg = opaqueBg(n);
                if (bg) return bg;
                n = n.parentElement;
              }
            } catch (e) {}
            return 'transparent';
          }
          function pickHeader() {
            return document.querySelector('[data-phase] header')
              || document.querySelector('header.ank0OG_header')
              || document.querySelector('header');
          }
          function fixTop() {
            var header = pickHeader();
            if (!header) return;
            // 真凶就在这：[data-mobile-nav="frame"] 被 DSH 塞了 padding-top: env(safe-area-inset-top)
            // （真机 59~75px）。它只把内容整体往下推，却不缩减自身高度，
            // 于是整列比屏幕高出 75px —— 顶栏下方多一大段空白 + 输入框整块被顶出屏幕底部，
            // 两个毛病是同一个原因。这里直接清零，状态栏高度改由我们自己按真实几何预留。
            var frame = header.closest('[data-mobile-nav="frame"]');
            if (frame) {
              setP(frame, 'padding-top', '0px');
              setP(frame, 'box-sizing', 'border-box');
              setP(frame, 'overflow', 'hidden');
            }
            setP(header, 'position', 'sticky');
            setP(header, 'top', '0px');
            // 🔴 v1.0.108：顶栏 z-index 是「新建会话左上角按钮点不动」的元凶，必须分页处置。
            //    实测（2026-10-16，430x932 暗色，elementFromPoint + 真点实验）：
            //      官方原版：顶栏 z-index 是 auto（不建层叠上下文）；fab 是 position:absolute + z-index:21，
            //                且 fab 住在 DSH 自己的 [class*="overlayLayer"] 里（该层 position:absolute + z-index:20）
            //                → 官方层序 = overlayLayer(20) 在顶栏(auto)之上，**官方本来就要求 fab 压在顶栏之上**；
            //                点 fab 中心 (31,49) 命中 svg/BUTTON，抽屉正常打开（实测 sbX -150 → 0）。
            //      我们的构建：把顶栏钉成 sticky + z-index:1020，把 fab 那 38x38 整块罩住
            //                （顶栏 y57..97，fab y65..103，重叠 32px），标题行 .ank0OG_titleRow 正好盖住按钮中心
            //                → 点击被标题行吞掉，抽屉纹丝不动（实测点前点后 sbX 都是 -150）。
            //    修法：**只降顶栏，绝不动 fab**（fab 保持官方 z-index:21 —— 抬它会让它冒到各种
            //         弹出层之上，那是另一种错）。fab 可见的页面（首页/新会话页等）把顶栏压到
            //         overlayLayer 之下；会话页（fab 被 display:none 隐藏）保持历史验证过的 1020，
            //          行为一字不变。目标值动态取「overlayLayer 的 z-index - 1」，DSH 改了我们也跟着走。
            var zTarget = '1020';
            try {
              var fabEl = document.querySelector('[data-mobile-nav="fab"]');
              var fabVisible = !!fabEl && getComputedStyle(fabEl).display !== 'none' && getComputedStyle(fabEl).visibility !== 'hidden';
              if (fabVisible) {
                var ol = document.querySelector('[class*="overlayLayer"]');
                var olZ = ol ? parseInt(getComputedStyle(ol).zIndex, 10) : NaN;
                zTarget = (isFinite(olZ) && olZ > 0) ? String(Math.max(1, olZ - 1)) : '10';
              }
            } catch (e) {}
            setP(header, 'z-index', zTarget);
            setP(header, 'display', 'flex');
            setP(header, 'flex-direction', 'column');
            setP(header, 'min-height', '0px');
            setP(header, 'max-width', '100vw');
            setP(header, 'box-sizing', 'border-box');
            setP(header, 'background', 'transparent');
            // 顶栏 padding-top 必须钉成 8px：几何目标就是按「顶栏顶 + 8 = 标题行顶」算的，
            // 左右内边距仍保留 DSH 自己的 12px。
            setP(header, 'padding-top', '8px');
            // 顶部首行（36px 占位层）里住着左右两个抽屉开关，绝不可隐藏；
            // 直接把首行高度压成 0（内联 !important 能压过 DSH 样式表里的 min-height:36px），
            // 标题行随即上提到「顶栏顶 + padding-top」，而两个开关是绝对定位挂在顶栏上的，
            // 位置完全不受影响 —— 比用标题行负 margin 更确定、也不会被 React 重渲染冲掉。
            var leading = header.querySelector('.ank0OG_headerLeading, [data-conversation-header-leading], [class*="headerLeading"]');
            if (leading) {
              setP(leading, 'min-height', '0px');
              setP(leading, 'height', '0px');
              setP(leading, 'max-height', '0px');
              setP(leading, 'overflow', 'visible');
              setP(leading, 'pointer-events', 'auto');
            }
            // 几何校正（实测 → 修正）：
            // 注意两个坑：
            //   1. 不能用 offsetTop —— 顶栏的 offsetParent 是 .ank0OG_root，
            //      外层 frame 的 padding 撑不动它，测出来永远是常数，校正必然失效；
            //      必须用 getBoundingClientRect().top 拿真实视口坐标。
            //   2. 不能给 header 加负 margin —— 顶栏所在整列 .CZPbNW_centerCol 带
            //      overflow:hidden，负 margin 会把顶栏（连同左右两个抽屉开关）裁掉。
            //      正确做法是把位移加在「整列」上，列的裁剪框跟着一起上移，既不裁切，
            //      也不影响绝对定位的侧栏。
            var col = header;
            while (col && col.parentElement) {
              if (frame && col.parentElement === frame) break;
              if (col.parentElement === document.body || col.parentElement === document.documentElement) break;
              col = col.parentElement;
            }
            if (!col) col = header;
            var want = sbHeight() - 2 - TOP_SHIFT;
            var delta = want - header.getBoundingClientRect().top;
            if (Math.abs(delta) > 0.5 && Math.abs(delta) < 600) {
              var mt = num(getComputedStyle(col).marginTop);
              if (Math.abs(mt + delta) < 600) setP(col, 'margin-top', (mt + delta) + 'px');
            }
            // 钉死整列高度：列顶确定后，列高 = 视口高 - 列顶，
            // 保证底栏（吸在列底）绝不越出屏幕，同时给底栏留白打好地基。
            var vh = window.innerHeight || document.documentElement.clientHeight || 0;
            var colTop = col.getBoundingClientRect().top;
            if (vh > 0 && colTop >= 0 && colTop < vh) {
              var hpx = (vh - colTop) + 'px';
              if (col.style.height !== hpx) {
                setP(col, 'height', hpx);
                setP(col, 'max-height', hpx);
                setP(col, 'box-sizing', 'border-box');
                setP(col, 'overflow', 'hidden');
              }
            }
          }
          function fixBottom() {
            var seat = document.querySelector('.ank0OG_composerSeat, [class*="composerSeat"]');
            if (!seat) return;
            var vh = window.innerHeight || document.documentElement.clientHeight || 0;
            if (!vh) return;
            // 🔴 绝不能再用「增量公式」mb = mb + delta —— 2026-10-16 实测锁定两条致命后果：
            //   ① 键盘弹起时 vh 突变（932→592），sticky 底栏那一帧读到的 bottom 还是旧值，
            //      算出 +46 假偏差写死 margin-bottom（46→92），此后无人纠正 → 输入框一直悬空 92px。
            //   ② 更狠：会话页滚到中间时，margin-bottom 对该元素位置**毫无影响**（它不在滚动内容末端），
            //      于是每一趟校正都读回同一个 delta=+46 并再累加一次 ——
            //      实测连跑 6 趟 mb 46 → 322，而输入框位置纹丝不动；
            //      真实使用中每次滚动/流式输出引发的 DOM 变动都会触发一趟 → 
            //      **输入框会一路往天上爬**，这正是老总报的「聊天框可以一直上下滑到天上」。
            // 正解 = 幂等写入：值对了就不写，写多少次结果都一样，与滚动位置无关。
            var need = botBreath();
            var sbx = seat.parentElement;
            var room = (sbx && sbx.scrollHeight - sbx.clientHeight > 4) ? 1 : 0;
            var mb = num(getComputedStyle(seat).marginBottom);
            if (room) {
              // 有滚动余量（会话页）：用 sticky 自身的 inset 定位 —— 绝对值，天然幂等，
              // 🔴 v1.0.108「底栏床垫」—— 老总 2026-10-16 报的「会话记录翻阅，穿过聊天框模块从底部露出」。
              //    A/B 实测（同一会话页、同一滚动位置）：
              //      官方原版：seat 自己 bottom:0 贴死滚动容器底（rect y761..932），座位下沿到屏底没有任何裸区；
              //      我们的构建：seat bottom:46px → rect y638..886，886..932 这 46pt 成为**没被任何元素铺色的裸带**，
              //                滚动中的消息就从这个缝里露出来（实测座位下缘往下逐点命中 = DIV.ank0OG_scrollBody；
              //                老总实拍：「费用明细」下面那一大块就是一条完整的气泡从底部顶出来）。
              //    修法（**不改任何可见布局**）：sticky inset 由 46px 收到 0，把这 46px 改成 seat 自己的
              //    padding-bottom —— 盒子底边贴到滚动容器底、内容框仍止于原处（638..886 一寸不动），
              //    只是那 46px 由「透明」变成「DSH 页面底色」的实心垫子；再给 seat 本身补同色底，
              //    顺带盖掉座位内部残留的透光区。
              //    ⚠️ 依旧必须是幂等写入（值对了就不写），与上面「绝不增量」是同一条铁律。
              var pbg = pageBg();
              // ⚠️ 必须**保留 DSH 自己的 padding-bottom**（实测 = 2px），不能拿 need 直接顶掉它：
              //    否则内容框整体下移 2px（实测 卡片 675→677、统计条 769→771、费用条 856→858、
              //    屏幕最底部那行文字 932→934 被顶出屏），凭空多出一个 2px 位移。
              //    先记一次「DSH 原值」，之后每趟都按 need + 原值 幂等写入。
              if (seat.dataset.dshOwnPadB === undefined) {
                seat.dataset.dshOwnPadB = String(num(getComputedStyle(seat).paddingBottom));
              }
              var bedPad = need + num(seat.dataset.dshOwnPadB);
              try { document.documentElement.style.setProperty('--dsh-pagebg', pbg); } catch (e) {}
              try { document.documentElement.style.setProperty('--dsh-bed', bedPad + 'px'); } catch (e) {}
              if (seat.dataset.dshBed !== '1') seat.dataset.dshBed = '1';
              if (seat.style.bottom !== '0px') setP(seat, 'bottom', '0px');
              if (seat.style.paddingBottom !== bedPad + 'px') setP(seat, 'padding-bottom', bedPad + 'px');
              if (seat.dataset.dshBedBg !== pbg) { seat.dataset.dshBedBg = pbg; setP(seat, 'background', pbg); }
              if (mb !== 0) setP(seat, 'margin-bottom', '0px');
            } else {
              // 无滚动余量（首页/新会话页）：sticky 失效（内容不满一屏），只能用 margin 撑；
              // 此处 margin 与位置是 1:1 的，绝对赋值同样收敛安全。
              if (mb !== need) setP(seat, 'margin-bottom', need + 'px');
              if (seat.style.bottom !== '0px') setP(seat, 'bottom', '0px');
              // 床垫只属于「有滚动余量」的会话页；切到首页/新会话页要原样撤掉，
              // 用 removeProperty 交还 DSH 自己的值（不硬写 transparent，免得多留一道我们自己的痕迹）。
              if (seat.dataset.dshBed === '1') {
                delete seat.dataset.dshBed;
                delete seat.dataset.dshOwnPadB;
                try { seat.style.removeProperty('padding-bottom'); } catch (e) {}
                try { seat.style.removeProperty('background'); } catch (e) {}
                seat.dataset.dshBedBg = '';
              }
            }
          }
          function fixFab() {
            // 首页左上角目录按钮：DSH 自带规则是 top: calc(var(--dsh-statusbar,54px) - 24px)，
            // 正好压进状态栏里被切掉半截。改为状态栏下沿 + TOP_BREATH，饱满完整呈现。
            // v1.0.109：必须与 fixTop 的 TOP_SHIFT 同步上移，否则顶栏上去了、目录按钮留在原地 → 错位。
            var fabs = document.querySelectorAll('[data-mobile-nav="fab"]');
            for (var i = 0; i < fabs.length; i++) {
              setP(fabs[i], 'top', (sbHeight() + TOP_BREATH - TOP_SHIFT) + 'px');
              setP(fabs[i], 'border-radius', '8px');
              setP(fabs[i], 'background', 'var(--dsw-alias-interactive-bg-hover, rgba(125,125,125,0.16))');
            }
          }
          // 单趟：只跑一次，绝不循环。
          // 血的教训：底栏是 position:sticky 吸在滚动容器底部，在同一段同步 JS 里改完
          // margin-bottom 后立刻重测量，浏览器还没重算 sticky 位置，读到的仍是旧值，
          // 循环三次就等于把同一个偏差加了三次（46 → 92 → 138），底栏被顶到屏幕中间。
          // 必须跨帧收敛。
          function passOnce() {
            // v1.0.109：把「整体上移量」广播成 CSS 变量，供 shim_00 / shim_11 的抽屉、面板顶部留白一起跟随。
            // documentStart 阶段 documentElement 还是 null → 必须判空（§10.3 的老坑，漏判会被 catch 吞掉）。
            try { if (document.documentElement) document.documentElement.style.setProperty('--dsh-topshift', TOP_SHIFT + 'px'); } catch (e) {}
            try { fixFab(); } catch (e) {}
            try { fixTop(); } catch (e) {}
            try { fixBottom(); } catch (e) {}
          }
          var settleTimer = null;
          function settle(left) {
            passOnce();
            if (left > 0) {
              if (settleTimer) clearTimeout(settleTimer);
              settleTimer = setTimeout(function () { settle(left - 1); }, 90);
            }
          }
          window.__dshLayoutFix = function () { settle(5); };
          // 频率闸：几何校正要读 rect（会强制重排），流式输出期间 DOM 变动极密，
          // 必须限流，绝不允许变成每帧一次重排。250ms 内最多跑一趟，页面不可见时直接跳过。
          var lastRun = 0;
          function run() {
            if (document.hidden) return;
            var now = Date.now();
            if (now - lastRun < 250) return;
            lastRun = now;
            passOnce();
          }
          run();
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
          window.addEventListener('load', run);
          // 🔴 resize 必须走「跨帧收敛」，不能只跑单趟 passOnce —— 与上面 fixBottom 注释是同一个坑：
          //    键盘弹出/收起会让 window.innerHeight 突变（932 → 592）。在 vh 突变那一帧，
          //    sticky 底栏的 getBoundingClientRect().bottom 读到的还是旧值，
          //    单趟的增量公式会算出 +46 的假偏差并写死 margin-bottom（46 → 92），
          //    此后再没人纠正它 —— 实测键盘弹起后 7 秒纹丝不动，输入框一直悬空 92px。
          //    改为 settle(3) 后：+50ms 内即收敛回 46px。
          //    连发保护 60ms：键盘弹出动画期间 resize 可能连发多次，交已在跑的那串 settle 收敛，
          //    避免同一瞬间堆多趟同步校正（每趟都要读 rect 强制重排）。
          var lastResizeSettle = 0;
          window.addEventListener('resize', function () {
            var now = Date.now();
            if (now - lastResizeSettle < 60) return;
            lastResizeSettle = now;
            settle(3);
          });
          window.addEventListener('orientationchange', function () { setTimeout(run, 260); });
          var ticks = 0;
          var timer = setInterval(function () { ticks++; run(); if (ticks >= 30) clearInterval(timer); }, 400);
          // SPA 切换路由/面板时自动重算；只监听子节点变化（我们只改内联样式，不会自触发）
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try {
              var pending = false;
              var mo = new MutationObserver(function () {
                if (pending) return;
                pending = true;
                setTimeout(function () { pending = false; run(); }, 320);
              });
              mo.observe(document.documentElement, { childList: true, subtree: true });
            } catch (e) {}
          })();
          // 点进会话/换路由时 React 会把 composerSeat 的内联样式整条抹掉（实测变成「(空)」），
          // 单等下一次 DOM 变动不保险（安静页面可以十几秒没有任何变动）→ 输入框会停在 0pt 贴着屏底。
          // 「点进会话」这条路本身就是一次点击，所以在点击后补一趟（settle 已幂等，重复触发零副作用）。
          try { document.addEventListener('click', function () { setTimeout(function () { settle(2); }, 320); }, true); } catch (e) {}
        })();
        """,
        // ===== shim_15（v1.0.104 引入，v1.0.106 性能重写）：窄屏长文本溢出自动降级（DSH-MOBILE-FIT v1）=====
        // 症状：iPhone 430 宽下会话里的长文件路径显示成 "E:\desktop\所有skill\deepseek-harn..."、
        //       错误信息被截断 —— DSH 前端在窄屏下对长文本不做换行/省略，撑破后被
        //       祖先的 overflow:hidden 裁掉。
        // 设计原则：**通用**。DSH 用 CSS Modules，类名带哈希且随版本变，硬编码类名就是
        //       "改几十遍"的根源；这里改为运行时读真实几何，自动给溢出元素打
        //       data-dsh-fit 标记，再由注入的 CSS 让它们换行。对任何 DSH 实例
        //       （本机 / 官方 / 他人）都有效，找不到目标时静默跳过，绝不报错。
        // 与 shim_14 的分工：shim_14 管 safe-area（顶栏/底栏留白），本 shim 管横向文本溢出，
        //       两者改的是不同属性，实测共存无冲突。
        """
        (function () {
          if (window.__dshMobileFit) return;
          window.__dshMobileFit = 1;
          var LIMIT = 760;
          // 故意藏在屏外的浮层不参与标记，避免把抽屉/菜单误判成溢出
          var SKIP = /rightbar|drawer|Drawer|portal|Portal|overlay|Overlay|popover|Popover|menu|Menu|tooltip|Tooltip|lightbox|Lightbox|dialog|Dialog|modal|Modal/;
          var CSS = '@media (max-width: ' + LIMIT + 'px) {'
            + 'html,body{max-width:100% !important;overflow-x:clip !important}'
            + '[data-dsh-fit="1"],pre,code,kbd,samp,textarea,'
            + '[class*="_text_"],[class*="_fileLink"],[class*="_filePath"],[class*="_path"],'
            + '[class*="_summary"],[class*="_rowText"],[class*="_rowSub"],[class*="_rowDesc"],'
            + '[class*="_desc"],[class*="_tips"],[class*="_hint"],[class*="_error"]{'
            + 'overflow-wrap:anywhere !important;word-break:break-word !important;'
            + 'min-width:0 !important;max-width:100% !important}'
            + 'pre,[class*="_text_"],[class*="_summary"]{white-space:pre-wrap !important}'
            + '[class*="header"],[class*="Header"],[class*="row"],[class*="Row"],'
            + '[class*="body"],[class*="Body"],[class*="content"],[class*="Content"],'
            + '[class*="col"],[class*="Col"],[class*="_main"],[class*="_inner"]{min-width:0 !important}'
            + '[data-dsh-fit="1"] *{overflow-wrap:anywhere !important}'
            + '}';
          function injectCss() {
            try {
              if (document.querySelector('style[data-dsh-mobile-fit]')) return;
              var st = document.createElement('style');
              st.setAttribute('data-dsh-mobile-fit', '1');
              st.textContent = CSS;
              (document.head || document.documentElement).appendChild(st);
            } catch (e) {}
          }
          // ===== v1.0.106 性能重写（老总反馈「切换会话几乎没响应」）=====
          // 旧实现两个致命点：
          //   ① 「边扫边 setAttribute」——每写一个属性就把布局打脏，下一个 getBoundingClientRect()
          //      又强制整页重排（布局抖动）。首页约 400 节点无所谓，会话页实测 9344 个节点 →
          //      单次 mark() 冷调用实测：1x CPU 1291ms（longtask 峰值 1366ms）、
          //      6x CPU 14820ms（longtask 峰值 15624ms）—— 这就是「切换会话几乎没响应」。
          //   ② 触发器是「整文档 MutationObserver（260ms 去抖）+ 600ms×30 次轮询」——
          //      切换会话时 DOM 连续大变更，mark 被连续叫起，卡顿叠加。
          // 现改为：
          //   ① 只扫「直接含文字节点」的叶子元素（真正会溢出的是文字盒），跳过绝大多数布局包装层，
          //      实测待测元素从 9344 降到 2052；再对 pre/code/img/video/canvas/table 等无文字
          //      子节点的原生标签兜底放行，避免漏掉代码块与媒体。
          //   ② 按时间预算切片：每片最多占用主线程约 8ms 就交还（用 rAF 摊到多帧），
          //      任何单帧都不会产生长任务，主线程始终能响应触摸。
          //   ③ 先收集 hits、扫完再统一写入（消除布局抖动，这是最大的一笔开销）。
          //   ④ 不再逐元素 getComputedStyle（display:none 的元素 rect 本就是 0，用尺寸判断足够）。
          //   ⑤ 触发改为「DOM 安静 600ms 后」的停留式去抖 + 执行次数硬上限，取消 600ms×30 轮询。
          // A/B 实测（同一会话页 9344 节点，残留越界元素两边同为 38 = 修复效果等价）：
          //   单次同步阻塞  1x: 1291ms → 33ms     6x: 14820ms → 102ms
          //   longtask 峰值 1x: 1366ms → 167ms    6x: 15624ms → 796ms
          var BUDGET = 8;     // 每片最多占用主线程毫秒数
          var DWELL = 600;    // DOM 安静多久后才开始扫（停留式去抖）
          var MAX_RUNS = 8;   // 全生命周期最多执行次数
          var HARD_CAP = 40000; // 尺寸保护：节点数异常膨胀时放弃（正常会话页 ~9k）
          var NATIVE = /^(PRE|CODE|KBD|SAMP|TEXTAREA|IMG|VIDEO|CANVAS|SVG|TABLE|INPUT|SELECT)$/;

          var raf = window.requestAnimationFrame || function (f) { setTimeout(f, 16); };

          function scan() {
            try {
              if (window.innerWidth > LIMIT) return;
              var vw = document.documentElement.clientWidth || window.innerWidth;
              var all = document.querySelectorAll('body *:not([data-dsh-fit])');
              var n = all.length;
              if (!n || n > HARD_CAP) return;
              var hits = [];
              var i = 0, probed = 0, frames = 0;
              function now() { try { return performance.now(); } catch (x) { return Date.now(); } }
              function slice() {
                frames++;
                var t0 = now();
                try {
                  for (; i < n; i++) {
                    var e = all[i];
                    var cn = (typeof e.className === 'string') ? e.className : '';
                    if (cn && SKIP.test(cn)) continue;
                    // 只关心「直接含文字节点」的元素（真正会溢出的文字盒）；
                    // 少数无文字子节点的原生媒体/代码标签兜底放行。
                    if (!NATIVE.test(e.tagName)) {
                      var hasText = false;
                      for (var c = e.firstChild; c; c = c.nextSibling) {
                        if (c.nodeType === 3) { hasText = true; break; }
                      }
                      if (!hasText) continue;
                    }
                    probed++;
                    var r = e.getBoundingClientRect();
                    // display:none / visibility:hidden 的元素尺寸为 0，一并跳过
                    if (r.width < 8 || r.height < 4) continue;
                    if (Math.round(r.right - vw) > 2) hits.push(e);
                    else if (e.scrollWidth > e.clientWidth + 4 && e.clientWidth > 60) hits.push(e);
                    if ((i & 31) === 31 && now() - t0 > BUDGET) { i++; break; }
                  }
                } catch (x) {}
                window.__dshFitStat = { total: n, probed: probed, frames: frames, hits: hits.length };
                if (i < n) { raf(slice); return; }
                // 扫完统一写入：一次重排搞定，杜绝逐元素写属性导致的抖动
                for (var k = 0; k < hits.length; k++) {
                  try { hits[k].setAttribute('data-dsh-fit', '1'); } catch (x) {}
                }
              }
              slice();
            } catch (err) {}
          }

          var timer = 0, runs = 0;
          function schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { timer = 0; run(); }, DWELL);
          }
          function run() {
            if (runs >= MAX_RUNS) return;
            runs++;
            scan();
          }
          function boot() { injectCss(); schedule(); }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
          else boot();
          window.addEventListener('load', boot);
          window.addEventListener('resize', schedule, { passive: true });
          window.addEventListener('orientationchange', function () { setTimeout(schedule, 300); });
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
          })();
          // 首屏只补两次（旧实现 600ms×30 = 连跑 18 秒，是切换会话卡顿的主因之一）
          setTimeout(run, 1500);
          setTimeout(run, 5000);
          window.__dshMobileFitMark = scan;
        })();
        """,
        // ===== shim_16（v1.0.107）：老总 2026-10-16 反馈的四个界面问题 =====
        // ① 设置 → 插件市场，更新弹出界面超出屏幕范围
        //    根因：窄屏下 DSH 仍会渲染按桌面宽度计算的浮层，某些 popover 被定位到视口之外
        //    （left 为负 / right 超过 100vw）被裁掉。而 shim_00 的 installMobileLayoutWatchdog()
        //    只覆盖 menu/modal/popup/dropdown/dialog/_portal_ 关键词，**popover/tooltip/sheet/
        //    overlay/layer/picker/popper 这一类它根本不管** → 越界后无人回收（实测已确认）。
        //    修法：在**不越过 watchdog 管辖**的前提下，把「部分可见但越界」的浮层强制收回视口内
        //    （写 left/right，无效时再用 margin-left 硬拽）。完全在屏外的（抽屉、右侧边栏、
        //    屏外隐藏层）一律不碰 —— 判据是「纵向与视口有交集 + 横向部分越界」。
        // ② 「优化」按钮与齿轮图标没有上下居中对齐
        //    注：这两个按钮（.dsh-po-btn-opt / .dsh-po-btn-gear）来自 DSH 插件，不属本 App 代码，
        //    只能在注入层做布局矫正。修法：强制同一行 + 同高 + 垂直中心对齐；若已被换行，
        //    直接把齿轮钉回「优化」右侧同一水平线。
        // ③ 会话聊天框能一直上下滑到天上
        //    根因：composerSeat 是 scrollBody（display:flex;column）里的 sticky;bottom:0 元素。
        //    当会话内容不足一屏时容器没有滚动余量，sticky 失效 → composer 紧跟内容停在中间/上方。
        //    实测新会话页 composer 在 y=399..625（屏高 932），下方空 307px。
        //    修法：内容不足一屏时给 composerSeat 加 margin-top:auto，把它推到底部；
        //    并给滚动容器加 overscroll-behavior:contain。键盘弹出时的位置仍由 DSH 自己处理。
        // ④ 标题左侧的「⌄」（= 子智能体徽标，文字已隐藏只剩箭头）应移到智能体按钮旁
        //    修法：把它收成紧凑图标，绝对定位到智能体团队按钮左侧（right:82px），标题完全不动。
        // 全部走内联 !important；DSH 是 React 应用，切会话/开面板会重建 DOM 并丢掉内联样式，
        // 故统一用 MutationObserver（600ms 停留去抖）持续兜底。
        """
        (function () {
          if (window.__dshMobilePolish) return;
          window.__dshMobilePolish = 1;
          var LIMIT = 760;
          function nowMs() { try { return performance.now(); } catch (e) { return Date.now(); } }
          function vw() { return document.documentElement.clientWidth || window.innerWidth; }
          function vh() { return document.documentElement.clientHeight || window.innerHeight; }
          function isSmall() { return vw() <= LIMIT; }
          function S(el, k, v) { try { el.style.setProperty(k, v, 'important'); } catch (e) {} }

          // ---------- ② 「优化」与齿轮：同一行 + 同高 + 垂直中心对齐 ----------
          function alignOptGear() {
            try {
              var opt = document.querySelector('.dsh-po-btn-opt');
              var gear = document.querySelector('.dsh-po-btn-gear');
              if (!opt || !gear) return;
              var a = opt.getBoundingClientRect();
              var b = gear.getBoundingClientRect();
              if (a.width < 6 || b.width < 6) return;
              var sameRow = Math.abs(a.top - b.top) < 1.5;
              var sameH = Math.abs(a.height - b.height) < 1.5;
              // 已钉过的情况不能提前返回 —— 必须每轮复查，跟着「优化」走
              if (sameRow && sameH && opt.dataset.dshPoOk === '1' && gear.dataset.dshGearPinned !== '1') return;
              var h = Math.round(Math.max(a.height, b.height, 22));
              var list = [opt, gear];
              for (var i = 0; i < list.length; i++) {
                var el = list[i];
                S(el, 'display', 'inline-flex');
                S(el, 'align-items', 'center');
                S(el, 'justify-content', 'center');
                S(el, 'box-sizing', 'border-box');
                S(el, 'height', h + 'px');
                S(el, 'min-height', h + 'px');
                S(el, 'line-height', '1');
                S(el, 'vertical-align', 'middle');
                S(el, 'margin-top', '0');
                S(el, 'margin-bottom', '0');
              }
              // 让「胶囊」永不换行：真机反馈齿轮会掉到第二行，元凶是 opt→上溯某一层 flex-wrap:wrap，
              // 逐层压成 nowrap（限定 4 层，避免影响 composer 整体布局）
              var up = opt.parentElement;
              for (var k2 = 0; up && k2 < 4; k2++) {
                S(up, 'flex-wrap', 'nowrap');
                S(up, 'align-items', 'center');
                if (up === gear.parentElement) S(up, 'column-gap', '6px');
                up = up.parentElement;
              }
              // 复查：仍不在同一水平线（确实被换行）→ 把齿轮钉到「优化」右侧同一水平中线。
              // 必须钉「水平中线」（top 取 opt 的垂直中心 + translateY(-50%)），这才叫「上下居中对齐」。
              var a2 = opt.getBoundingClientRect();
              var b2 = gear.getBoundingClientRect();
              if (Math.abs(a2.top - b2.top) > 1.5) {
                var host = gear.offsetParent || opt.parentElement;
                if (host) {
                  var hs = null;
                  try { hs = getComputedStyle(host); } catch (x) {}
                  if (hs && hs.position === 'static') S(host, 'position', 'relative');
                  var hr = host.getBoundingClientRect();
                  S(gear, 'position', 'absolute');
                  S(gear, 'left', Math.round(a2.right - hr.left + 6) + 'px');
                  S(gear, 'top', Math.round(a2.top + a2.height / 2 - hr.top) + 'px');
                  S(gear, 'transform', 'translateY(-50%)');
                  S(gear, 'margin', '0');
                  S(gear, 'z-index', '5');
                  gear.dataset.dshGearPinned = '1';
                }
              } else if (gear.dataset.dshGearPinned === '1') {
                // 排布已恢复正常 → 撤掉之前的绝对定位，交还给 DSH 原生流式布局（避免留下僵死坐标）
                S(gear, 'position', 'static');
                S(gear, 'left', 'auto');
                S(gear, 'top', 'auto');
                S(gear, 'transform', 'none');
                S(gear, 'z-index', 'auto');
                try { delete gear.dataset.dshGearPinned; } catch (x) {}
              }
              opt.dataset.dshPoOk = '1';
            } catch (e) {}
          }

          // ---------- ③ 聊天框贴底（消除「滑到天上」）----------
          function pinComposer() {
            try {
              if (!isSmall()) return;
              var sb = document.querySelector('[class*="scrollBody"]');
              if (!sb) return;
              var seat = document.querySelector('[class*="composerSeat"]');
              if (!seat || seat.parentElement !== sb) return;
              var cs = null;
              try { cs = getComputedStyle(sb); } catch (e) { return; }
              if (cs.display.indexOf('flex') === -1) return;
              // 容器没有滚动余量 = 内容不足一屏 → 此时 sticky 失效，composer 会浮到中间
              if ((sb.scrollHeight - sb.clientHeight) > 4) return;
              var gap = Math.round(sb.getBoundingClientRect().bottom - seat.getBoundingClientRect().bottom);
              var mb = 0;
              try { mb = parseFloat(getComputedStyle(seat).marginBottom) || 0; } catch (e) {}
              if (gap > mb + 4) {
                S(seat, 'margin-top', 'auto');
                seat.dataset.dshPinned = '1';
              }
              S(sb, 'overscroll-behavior', 'contain');
            } catch (e) {}
          }

          // ---------- ④ 子智能体徽标（那个「⌄」）+ 智能体团队按钮：统一精确摆位 ----------
          // 注意：不能用固定 right 值 —— 实测这两个按钮的 offsetParent 只有 418px 宽（视口 430），
          // 固定 right 会系统性偏 12px。所以这里用「先给 0、量出真实位置、再按目标纠偏」的方式。
          function placeAbs(el, targetRight, forceWidth) {
            try {
              S(el, 'position', 'absolute');
              S(el, 'left', 'auto');
              S(el, 'top', '50%');
              S(el, 'transform', 'translateY(-50%)');
              S(el, 'margin', '0');
              S(el, 'z-index', '6');
              if (forceWidth) {
                S(el, 'width', forceWidth + 'px');
                S(el, 'min-width', '0');
                S(el, 'padding', '0');
                S(el, 'box-sizing', 'border-box');
              }
              S(el, 'right', '0px');
              var r = el.getBoundingClientRect();
              if (r.width < 2) return false;
              S(el, 'right', Math.round(r.right - targetRight) + 'px');
              return true;
            } catch (e) { return false; }
          }

          function moveAgentBadge() {
            try {
              if (!isSmall()) return;
              var header = document.querySelector('header');
              if (!header) return;
              var hw = header.getBoundingClientRect().width;
              if (hw < 300) return;
              // 标题容器收窄 28px：实测标题文字只用到 x≈293，容器到 322，收窄不影响标题显示，
              // 但能给右侧那排动作按钮让出位置（否则 430 宽下根本排不下）。
              var nav = header.querySelector('nav');
              if (nav) {
                var nr = nav.getBoundingClientRect();
                if (nr.width > 210) S(nav, 'width', '228px');
              }
              var jobs = header.querySelector('button[aria-label*="后台任务"]');
              var badge = header.querySelector('button[aria-label*="子智能体"]');
              var team = header.querySelector('button[aria-label*="智能体团队"]');
              // ---------- 🔴 老总定版（2026-10-16 20:50）：「③④ 不一样，可以两个下箭头」----------
              // 曾于 20:15 按「去掉 ④」隐藏过它，老总看清两者功能不同后确认保留 → 恢复摆位。
              // 结论：③「N 个子智能体」与 ④「N 个后台任务」是两个不同入口，两个 ⌄ 都保留、都收在标题右侧。
              // 从右往左依次摆：右侧抽屉开关(386..418) | 团队(32) | 徽标(22) | 后台任务(22) | 标题文字(止于 301)
              // 间距账（430 宽，实测）：标题文字右边界 301 → 可用到 386 共 85px，
              // 三个图标 22+22+34=78px，剩 7px 分三段 ⇒ 每段约 2px，刚好不压标题、不互压。
              if (team && team.parentElement && team.parentElement !== header) placeAbs(team.parentElement, hw - 52, 32);
              if (badge && badge.parentElement && badge.parentElement !== header) {
                if (badge.dataset.dshBadgeTight !== '1') {
                  S(badge, 'width', '22px');
                  S(badge, 'min-width', '0');
                  S(badge, 'padding', '0');
                  S(badge, 'box-sizing', 'border-box');
                  badge.dataset.dshBadgeTight = '1';
                }
                placeAbs(badge.parentElement, hw - 80, 22);
              }
              // 「8 个后台任务」在窄屏下只剩一个图标（文字早被隐藏）。它原本被标题 absolute 层压住，
              // 老总看到的就是那个「孤零零的 ⌄」——一并收到右侧同一排，并留出 3px 不压标题文字。
              if (jobs && jobs.parentElement && jobs.parentElement !== header) {
                if (jobs.dataset.dshJobsTight !== '1') {
                  S(jobs, 'width', '22px');
                  S(jobs, 'min-width', '0');
                  S(jobs, 'padding', '0');
                  S(jobs, 'box-sizing', 'border-box');
                  jobs.dataset.dshJobsTight = '1';
                }
                placeAbs(jobs.parentElement, hw - 104, 22);
              }
            } catch (e) {}
          }

          // ---------- ① 越界浮层回收 ----------
          // ⚠️ 管辖划分（关键，避免两处同时写 left/right 互相打架）：
          //   shim_00 的 installMobileLayoutWatchdog() 已负责 [role=menu|listbox|dialog] 与
          //   menu / modal / popup / dropdown / dialog / _portal_ 名单；本函数**只补它漏掉的**浮层类型。
          //   因此下面的 OVER_SEL 里刻意不含上述关键词，WD_SEL 命中则直接跳过。
          var OVER_SEL = '[role="tooltip"],'
            + '[class*="popover" i],[class*="tooltip" i],[class*="sheet" i],[class*="picker" i],'
            + '[class*="overlay" i],[class*="layer" i],[class*="floating" i],'
            + '[class*="popper" i]:not([class*="_portal_"]),'
            + '[data-radix-popper-content-wrapper],[data-floating-ui-portal],[data-popper-placement]';
          // shim_00 watchdog 管辖的名单：元素「自身」命中即跳过（防双写）
          var WD_SEL = '[role="menu"],[role="listbox"],[role="dialog"],[data-menu-material],[data-menu-surface],'
            + '[class*="menu"],[class*="modal"],[class*="popup"],[class*="dropdown"],[class*="dialog"]';

          function clampOverlays() {
            try {
              if (!isSmall()) return;
              var w = vw();
              var hgt = vh();
              if (w < 200 || hgt < 200) return;
              var cands = [];
              var seen = null;
              try { seen = new WeakSet(); } catch (e) { seen = null; }
              function push(e) {
                if (!e || e.nodeType !== 1) return;
                if (seen) { if (seen.has(e)) return; seen.add(e); }
                cands.push(e);
              }
              var list = null;
              try { list = document.querySelectorAll(OVER_SEL); } catch (e) {}
              if (list) { for (var i = 0; i < list.length; i++) push(list[i]); }
              // 浅层兜底：浮层几乎都挂在 portal 容器下（body 浅层）；深挖会白扫几千个正常元素
              (function shallow(root, depth) {
                var kids = root.children;
                for (var j = 0; j < kids.length; j++) {
                  var c = kids[j];
                  push(c);
                  if (depth > 1) shallow(c, depth - 1);
                }
              })(document.body, 7);

              var t0 = nowMs();
              var hits = null;
              var n = cands.length > 3000 ? 3000 : cands.length;
              for (var k = 0; k < n; k++) {
                // 时间预算保护：单次最多占用主线程约 30ms，剩下的交给下一轮
                if ((k & 127) === 127 && nowMs() - t0 > 30) break;
                var e = cands[k];
                if (e.closest && e.closest('[data-mobile-nav]')) continue;   // App 自身 chrome
                var isW = false;
                try { isW = e.matches(WD_SEL); } catch (x) {}
                if (isW) continue;                                          // 归 shim_00 watchdog 管
                if (e.children.length === 0) continue;                      // 空容器不是浮层
                var s = null;
                try { s = getComputedStyle(e); } catch (x) { continue; }
                if (s.position !== 'fixed' && s.position !== 'absolute') continue;
                if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
                if (s.pointerEvents === 'none') continue;
                var b = e.getBoundingClientRect();
                if (b.width < 80 || b.height < 28) continue;
                // 纵向必须与视口有交集（否则是屏外隐藏层，别去动它）
                if (b.bottom <= 8 || b.top >= hgt - 8) continue;
                // 水平方向完全在屏外（抽屉 / 右侧边栏 / 屏外隐藏层）→ 一律不碰
                if (b.right <= 8 || b.left >= w - 8) continue;
                // 未越界（留 4px 容差避开亚像素噪声）→ 不动
                if (b.left >= -4 && b.right <= w + 4) continue;
                (hits || (hits = [])).push(e);
              }
              if (!hits) return;
              // 先收集、后统一写入（避免边读边写造成布局抖动）
              for (var m = 0; m < hits.length; m++) {
                var el = hits[m];
                var r = el.getBoundingClientRect();
                if (r.left >= -4 && r.right <= w + 4) continue;
                S(el, 'box-sizing', 'border-box');
                S(el, 'max-width', (w - 16) + 'px');
                S(el, 'max-height', (hgt - 24) + 'px');
                S(el, 'overflow-y', 'auto');
                if (r.left < -4) {
                  S(el, 'left', '8px');
                  S(el, 'right', 'auto');
                } else {
                  S(el, 'right', '8px');
                  S(el, 'left', 'auto');
                }
                el.dataset.dshClamped = '1';
              }
              // 第二趟：若该浮层其实靠父级 / transform 定位（写 left/right 无效），
              // 用 margin-left 把它硬拽回视口内（margin 位移不会破坏已有 transform）。
              for (var q = 0; q < hits.length; q++) {
                var e2 = hits[q];
                if (e2.dataset.dshClamped !== '1') continue;
                var r2 = e2.getBoundingClientRect();
                var dx = 0;
                if (r2.left < -4) dx = 8 - r2.left;
                else if (r2.right > w + 4) dx = (w - 8) - r2.right;
                if (dx !== 0) S(e2, 'margin-left', Math.round(dx) + 'px');
              }
            } catch (e) {}
          }

          // ---------- 调度 ----------
          // cheap()（②③④）几乎零成本，可以每次都跑，保证 React 重建后立即复位；
          // clampOverlays() 要扫浅层候选，较重，限「每轮交互」内的次数。
          // ⚠️ runs 必须在每次点击时清零：老总是「打开 App 很久之后」才点设置→插件市场，
          //    若总次数一次性用光，弹层出现时回收逻辑已经不跑了。
          var timer = 0, runs = 0, MAX_RUNS = 10, DWELL = 600;
          function cheap() { alignOptGear(); pinComposer(); moveAgentBadge(); }
          function full() { cheap(); if (runs < MAX_RUNS) { runs++; clampOverlays(); } }
          function run() { full(); }
          function schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { timer = 0; run(); }, DWELL);
          }
          function boot() { cheap(); schedule(); }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
          else boot();
          window.addEventListener('load', boot);
          window.addEventListener('resize', schedule, { passive: true });
          window.addEventListener('orientationchange', function () { setTimeout(schedule, 300); });
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
          })();
          // 弹层多数是「点出来的」→ 点击后单独补一次，并重置 clamp 预算（保证弹层出现时它一定在跑）
          try { document.addEventListener('click', function () { runs = 0; setTimeout(schedule, 260); }, true); } catch (e) {}
          setTimeout(run, 1200);
          setTimeout(run, 3500);
          window.__dshMobilePolishRun = full;
        })();
        """
    ]

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .default }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadInitialURL()
        startNetworkWatch()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil)
        // 键盘避让（v1.0.70）：压缩 WebView 高度而不是让 WebKit 把整页顶出屏幕。
        // 效果：顶栏钉在原位不动，会话内容在剩余空间内滚动，输入框始终悬在键盘正上方。
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardFrameWillChange(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardFrameWillChange(_:)),
            name: UIResponder.keyboardWillHideNotification,
            object: nil)

        // 自动检查更新（v1.0.83）：启动 3 秒后静默检查仓库最新构建
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.checkForAppUpdates(manual: false)
        }
    }

    // MARK: - 键盘避让（v1.0.70）

    /// 键盘弹出/收起/移动：把键盘与视图重叠的高度写进底部约束（同步键盘动画曲线）。
    /// 收起键盘时采用 0.32s 弹簧阻尼平滑缓动下降，解决下降太快、太生硬、无过渡的问题！
    @objc private func keyboardFrameWillChange(_ note: Notification) {
        guard let endFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let kbInView = view.convert(endFrame, from: nil)
        let isHide = note.name == UIResponder.keyboardWillHideNotification || kbInView.minY >= view.bounds.height - 1
        let overlap: CGFloat = isHide ? 0 : max(0, view.bounds.height - kbInView.minY)
        isKeyboardVisible = overlap > 0
        keyboardOverlap = overlap

        webViewBottomConstraint.constant = -overlap
        view.setNeedsLayout()

        let kbStatusJS = "document.body && document.body.setAttribute('data-keyboard-open', '\(!isHide)');"
        webView.evaluateJavaScript(kbStatusJS) { _, _ in }

        if isHide {
            // 收起键盘：使用 0.32 秒高质感弹簧阻尼动画，优雅缓动下落，彻底消除骤降与生硬卡顿！
            UIView.animate(
                withDuration: 0.32,
                delay: 0,
                usingSpringWithDamping: 0.88,
                initialSpringVelocity: 0.2,
                options: [.curveEaseInOut, .allowUserInteraction, .beginFromCurrentState],
                animations: {
                    self.view.layoutIfNeeded()
                })
        } else {
            let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
            let curveRaw = note.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt ?? 7
            let options: UIView.AnimationOptions = [UIView.AnimationOptions(rawValue: curveRaw << 16), .beginFromCurrentState]
            UIView.animate(withDuration: duration, delay: 0, options: options) {
                self.view.layoutIfNeeded()
            }
        }
    }

    /// 判定当前页面是不是 DSH 自身页面：与最近一次「标记为 DSH 服务」的地址同主机即为自身页面。
    /// `dshServiceHost` 尚未标记时（冷启动 / 重试 / 清缓存路径不会更新它）默认按自身页面处理，
    /// 避免 DSH 页被当成外部网页、顶部被多推一个安全区（v1.0.70 的「顶部多一块空白」就是这么来的）。
    private func isOwnServicePage(url: URL?) -> Bool {
        guard let host = url?.host?.lowercased(), !host.isEmpty else { return true }
        if let svc = dshServiceHost?.lowercased(), !svc.isEmpty { return host == svc }
        // 尚未标记过服务地址：默认地址 + 最近地址 + 回环地址都算自身页面
        var hosts = ["localhost", "127.0.0.1"]
        for raw in [defaultURL, UserDefaults.standard.string(forKey: Keys.lastURL)] {
            if let h = raw.flatMap({ URL(string: $0)?.host?.lowercased() }), !h.isEmpty { hosts.append(h) }
        }
        return hosts.contains(host)
    }

    /// 外部网页（免费网页对话等第三方站点）顶部避让 iOS 状态栏/灵动岛；
    /// DSH 页面保持全屏，由页内顶栏 CSS 自行让出安全区。
    private func updateTopSafeAreaFor(url: URL?) {
        guard url?.host?.isEmpty == false else { return }
        let target: CGFloat = isOwnServicePage(url: url) ? 0 : view.safeAreaInsets.top
        guard webViewTopConstraint.constant != target else { return }
        webViewTopConstraint.constant = target
        UIView.animate(withDuration: 0.2) { self.view.layoutIfNeeded() }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        // webView 可能尚未创建（viewDidLoad 之前系统就会回调一次）
        guard webView != nil, webViewTopConstraint != nil else { return }
        // 旋转/刘海变化时，外部网页页面的顶部避让量跟着刷新
        updateTopSafeAreaFor(url: webView.url)
        // 状态栏高度随机型变化（无刘海 20pt、刘海 47pt、灵动岛 59pt），
        // 把系统给的真实值下发给页面，顶栏按它留白，不写死像素。
        publishStatusBarHeight()
    }

    /// 把状态栏高度下发给页内脚本。
    /// `env(safe-area-inset-top)` 在这个 WKWebView 里取到的是 0（viewport-fit=cover 不可靠），
    /// 所以改用原生侧的 `safeAreaInsets.top`，它由系统按机型、横竖屏、刘海/灵动岛实时给出。
    ///
    /// v1.0.79 修正：之前除以了 `UIScreen.scale`，把 59pt 缩成约 20px 下发，
    /// 侧栏内容只让出 20px，顶进了状态栏（用户截图：标志被电量图标压住）。
    /// CSS 像素在 viewport width=device-width 下就等于 pt，不能再除。
    private func publishStatusBarHeight() {
        let insets = view.safeAreaInsets
        // 竖屏判断：用视图自身宽高，不依赖已弃用的 statusBarOrientation
        let isPortrait = view.bounds.height >= view.bounds.width
        // v1.0.105：系统值优先；系统值异常为 0 且竖屏时，按「iOS 机型安全区标准值对照表」兜底。
        // 这样即使早期视图未布局完读不到安全区，也能按机型给出正确留白（见文件末尾 iOSSafeArea）。
        let topValue = iOSSafeArea.effectiveTop(systemTop: insets.top, isPortrait: isPortrait)
        let bottomValue = iOSSafeArea.effectiveBottom(systemBottom: insets.bottom)
        let px = Int(topValue.rounded())
        let bp = Int(bottomValue.rounded())
        let deviceId = iOSSafeArea.machineIdentifier
        let summary = iOSSafeArea.debugSummary(systemTop: insets.top, systemBottom: insets.bottom, isPortrait: isPortrait)
        // 保持 __dshSetStatusBar 既有语义不变（页内 shim 依赖它），额外挂 __dshSafeArea 供按需取用。
        // __dshSafeAreaReady 表示"这一次下发是权威值"，页内据此区分「未下发」与「下发为 0」
        // （有 Home 键机型 bottom 合法值就是 0，不能当成缺省）。
        let js = "(function(){try{"
            + "if(window.__dshSetStatusBar)window.__dshSetStatusBar(\(px));"
            + "window.__dshSafeArea={top:\(px),bottom:\(bp),device:\"\(deviceId)\"};"
            + "window.__dshSafeAreaReady=1;"
            + "window.__dshSafeAreaDebug=\"\(summary)\";"
            + "}catch(e){}})();"
        webView.evaluateJavaScript(js) { _, _ in }
    }

    deinit {
        navigationTimer?.invalidate()
        menuAutoHideTimer?.invalidate()
        pathMonitor?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - UI

    private func setupUI() {
        view.backgroundColor = .systemBackground

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        // 兼容 iOS 14 / 15 低版本 WebKit 策略：
        // 显式在 preferences 上允许 JavaScript 与跨域本地网络访问，避免 ITP 隐私策略拦截 http 局域网请求
        config.preferences.javaScriptEnabled = true
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        // 绑定持久化数据存储，确保静态资源磁盘缓存生效
        config.websiteDataStore = WKWebsiteDataStore.default()
        // 电脑端一些老页面（如 8210 TTS）没写 <meta name="viewport">，
        // WKWebView 会按 980px 桌面宽渲染再整体缩小 → UI/按钮比例怪。
        // 在每个页面文档开头注入标准移动端 viewport 修正（仅当页面自己没写时生效）。
        let viewportFix = WKUserScript(source: """
            (function() {
              var meta = document.querySelector('meta[name="viewport"]');
              if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                document.head.appendChild(meta);
              }
              // 彻底禁用全局双击放大与误触放大，锁定视口，确保移动端绝不出现全页面缩放失控
              meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
            })();
            """,
            injectionTime: .atDocumentStart, forMainFrameOnly: false)
        config.userContentController.addUserScript(viewportFix)
        // iOS 16 的 WebKit 缺少桌面端构建默认可用的一部分较新 Web API，
        // 任一缺失都会让首个内联脚本抛错 → #root 永远空 = 白屏。
        // 在文档开始前注入最小语义等价的 polyfill（仅在原生缺失时生效）。
        for src in Self.iosCompatShims {
            config.userContentController.addUserScript(
                WKUserScript(source: src,
                             injectionTime: .atDocumentStart,
                             forMainFrameOnly: false))
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.delegate = self
        // 彻底禁止 WKWebView 原生缩放手势与双击放大页面（除灯箱图片手势由 JS 专属接管）
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.scrollView.bouncesZoom = false
        config.userContentController.add(Self.makeErrorBridge(owner: self), name: "dshErrors")
        config.userContentController.add(Self.makeFileTransferBridge(owner: self), name: "dshFileTransfer")
        config.userContentController.add(Self.makeVoiceInputBridge(owner: self), name: "dshVoiceInput")
        config.userContentController.add(Self.makeAppUpdateBridge(owner: self), name: "dshAppUpdate")
        // v1.0.74：禁止侧滑返回上一个 URL。页面内的返回（抽屉、会话切换）走页面自己的逻辑，
        // WebView 的历史回退会跳出当前服务地址，用户明确不要。
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // 丝滑滚动体验：启用原生惯性加速与回弹（同 Hermes Studio），消除粘滞感
        webView.scrollView.decelerationRate = .fast
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = false
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        // 首帧到达前保持透明：加载期间露出的是原生加载态，不会白屏闪一下。
        webView.alpha = 0
        view.addSubview(webView)
        self.webView = webView

        let activity = UIActivityIndicatorView(style: .large)
        activity.hidesWhenStopped = true
        activity.color = .secondaryLabel
        activity.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activity)
        self.activityIndicator = activity

        // 顶/底约束只创建一次并持有引用：键盘避让（压缩高度）与外部网页安全区都靠动态改它们实现
        webViewTopConstraint = webView.topAnchor.constraint(equalTo: view.topAnchor)
        webViewBottomConstraint = webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        NSLayoutConstraint.activate([
            webViewTopConstraint,
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webViewBottomConstraint,

            activity.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        setupErrorOverlay()
        setupMenuButton()
    }

    /// 加载失败时的错误浮层（白屏根因修复：以前 didFail 只是停转圈，界面空白无提示）。
    private func setupErrorOverlay() {
        let overlay = UIView()
        overlay.backgroundColor = .systemBackground
        overlay.isHidden = true
        overlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlay)

        let container = UIStackView()
        container.axis = .vertical
        container.spacing = 12
        container.alignment = .center
        container.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(container)

        let icon = UIImageView(image: UIImage(systemName: "wifi.exclamationmark"))
        icon.tintColor = .systemRed
        icon.contentMode = .scaleAspectFit
        icon.heightAnchor.constraint(equalToConstant: 44).isActive = true
        icon.widthAnchor.constraint(equalToConstant: 44).isActive = true

        let title = UILabel()
        title.text = "无法连接到 DSH"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textAlignment = .center

        let detail = UILabel()
        detail.numberOfLines = 0
        detail.font = .preferredFont(forTextStyle: .footnote)
        detail.textColor = .secondaryLabel
        detail.textAlignment = .center
        detail.lineBreakMode = .byWordWrapping

        let hint = UILabel()
        hint.numberOfLines = 0
        hint.font = .preferredFont(forTextStyle: .footnote)
        hint.textColor = .secondaryLabel
        hint.textAlignment = .center
        hint.text = """
        请确认：
        1. 电脑端 DSH 正在运行（支持官方原版）
        2. 手机与电脑在同一局域网 WiFi
        3. 电脑端已安装并启用协同插件（dsh-anywhere）
        """

        let retryButton = UIButton(type: .system)
        retryButton.setTitle("重试", for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let changeButton = UIButton(type: .system)
        changeButton.setTitle("换一个地址", for: .normal)
        changeButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        changeButton.addTarget(self, action: #selector(openMenuDirectly), for: .touchUpInside)

        // 连不上时直接扫码：扫电脑端显示的地址二维码，自动填地址并连接（v1.0.71）
        let scanButton = UIButton(type: .system)
        scanButton.setTitle("📷 扫码连接（无需手动输入）", for: .normal)
        scanButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        scanButton.tintColor = .systemBlue
        scanButton.addTarget(self, action: #selector(scanFromErrorOverlay), for: .touchUpInside)

        let guideButton = UIButton(type: .system)
        guideButton.setTitle("📖 查看官方 DSH 连接教程与说明", for: .normal)
        guideButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        guideButton.setImage(UIImage(systemName: "book.pages"), for: .normal)
        guideButton.tintColor = .systemBlue
        guideButton.addTarget(self, action: #selector(openConnectionGuide), for: .touchUpInside)

        container.addArrangedSubview(icon)
        container.addArrangedSubview(title)
        container.addArrangedSubview(detail)
        container.addArrangedSubview(hint)
        container.addArrangedSubview(retryButton)
        container.addArrangedSubview(scanButton)
        container.addArrangedSubview(changeButton)
        container.addArrangedSubview(guideButton)

        // v1.0.86：内容比屏幕高时，纯 centerY 会把整块顶出屏幕上方（真机上提示跑到天上）。
        // 改成上下都挂约束、优先级让位给内容高度：内容少时居中，内容多时贴安全区、不再溢出。
        container.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        let centerY = container.centerYAnchor.constraint(equalTo: overlay.centerYAnchor)
        centerY.priority = .defaultHigh
        let topLimit = container.topAnchor.constraint(greaterThanOrEqualTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 16)
        let bottomLimit = container.bottomAnchor.constraint(lessThanOrEqualTo: overlay.safeAreaLayoutGuide.bottomAnchor, constant: -16)

        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            centerY,
            topLimit,
            bottomLimit,
            container.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 32),
            container.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -32)
        ])

        self.errorOverlay = overlay
        self.errorTitleLabel = title
        self.errorDetailLabel = detail
    }

    /// 加载 16 帧 DeepSeek Q萌小胖鲸动态循环图片（吐水泡泡+呼吸摇摆）
    private static func createAnimatedFatWhaleFrames() -> [UIImage] {
        var frames: [UIImage] = []
        for i in 0..<16 {
            if let img = UIImage(named: "WhaleAnim_\(i)")?.withRenderingMode(.alwaysOriginal) {
                frames.append(img)
            }
        }
        return frames
    }

    /// 优先使用 DeepSeek 萌系小胖鲸圆形切片，回退到原生绘制
    private static func createCuteWhaleImage(size: CGSize, alpha: CGFloat = 1.0) -> UIImage {
        if let firstAnim = UIImage(named: "WhaleAnim_0") {
            return firstAnim.withRenderingMode(.alwaysOriginal)
        }
        if let mascot = UIImage(named: "WhaleMascot") {
            let renderer = UIGraphicsImageRenderer(size: size)
            return renderer.image { ctx in
                let cgCtx = ctx.cgContext
                cgCtx.setAlpha(alpha)
                let rect = CGRect(origin: .zero, size: size)
                // 绘制圆形裁剪
                let circle = UIBezierPath(ovalIn: rect)
                circle.addClip()
                // 填充柔和浅海蓝微质感底色
                UIColor(red: 0.92, green: 0.95, blue: 1.0, alpha: 1.0).setFill()
                circle.fill()
                mascot.draw(in: rect)
                // 绘制细腻的半透明白微边框
                let stroke = UIBezierPath(ovalIn: rect.insetBy(dx: 0.75, dy: 0.75))
                stroke.lineWidth = 1.5
                UIColor.white.withAlphaComponent(0.92).setStroke()
                stroke.stroke()
            }
        }
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let cgCtx = ctx.cgContext
            cgCtx.setAlpha(alpha)

            // 绘制底板与小鲸鱼：可爱圆润身体 + 呆萌小圆眼 + 微笑小嘴 + 翘起的小尾巴
            // 采用 DeepSeek 经典品牌蓝 (#4D6BFE) 与海天蓝渐变
            let w = size.width
            let h = size.height

            // 鲸鱼身体主轮廓
            let bodyPath = UIBezierPath()
            // 从尾巴上方开始
            bodyPath.move(to: CGPoint(x: w * 0.88, y: h * 0.35))
            // 尾巴凹槽
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.95, y: h * 0.22), controlPoint: CGPoint(x: w * 0.92, y: h * 0.26))
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.82, y: h * 0.48), controlPoint: CGPoint(x: w * 0.85, y: h * 0.38))
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.96, y: h * 0.62), controlPoint: CGPoint(x: w * 0.90, y: h * 0.58))
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.80, y: h * 0.55), controlPoint: CGPoint(x: w * 0.88, y: h * 0.64))
            
            // 下腹部（丰满可爱的圆弧肚皮）
            bodyPath.addCurve(to: CGPoint(x: w * 0.16, y: h * 0.60),
                              controlPoint1: CGPoint(x: w * 0.60, y: h * 0.78),
                              controlPoint2: CGPoint(x: w * 0.30, y: h * 0.78))
            
            // 圆滚滚的头部
            bodyPath.addCurve(to: CGPoint(x: w * 0.18, y: h * 0.28),
                              controlPoint1: CGPoint(x: w * 0.04, y: h * 0.50),
                              controlPoint2: CGPoint(x: w * 0.06, y: h * 0.30))
            
            // 萌萌的头顶与背鳍
            bodyPath.addCurve(to: CGPoint(x: w * 0.55, y: h * 0.30),
                              controlPoint1: CGPoint(x: w * 0.30, y: h * 0.24),
                              controlPoint2: CGPoint(x: w * 0.45, y: h * 0.26))
            // 背鳍
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.62, y: h * 0.16), controlPoint: CGPoint(x: w * 0.56, y: h * 0.20))
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.68, y: h * 0.36), controlPoint: CGPoint(x: w * 0.66, y: h * 0.25))
            
            // 连回尾柄
            bodyPath.addQuadCurve(to: CGPoint(x: w * 0.88, y: h * 0.35), controlPoint: CGPoint(x: w * 0.78, y: h * 0.40))
            bodyPath.close()

            // 填充鲸鱼身体主色
            UIColor(red: 0.25, green: 0.45, blue: 0.98, alpha: 1.0).setFill()
            bodyPath.fill()

            // 可爱腮红（粉萌腮红圈）
            let blushPath = UIBezierPath(ovalIn: CGRect(x: w * 0.20, y: h * 0.48, width: w * 0.12, height: h * 0.08))
            UIColor(red: 1.0, green: 0.48, blue: 0.65, alpha: 0.85).setFill()
            blushPath.fill()

            // 灵动大眼睛（黑圆珠 + 亮闪闪高光）
            let eyePath = UIBezierPath(ovalIn: CGRect(x: w * 0.22, y: h * 0.34, width: w * 0.10, height: w * 0.10))
            UIColor(red: 0.08, green: 0.10, blue: 0.18, alpha: 1.0).setFill()
            eyePath.fill()

            // 眼睛白色高光小点
            let sparklePath = UIBezierPath(ovalIn: CGRect(x: w * 0.235, y: h * 0.35, width: w * 0.038, height: w * 0.038))
            UIColor.white.setFill()
            sparklePath.fill()

            // 可爱小鱼鳍（侧胸鳍）
            let finPath = UIBezierPath()
            finPath.move(to: CGPoint(x: w * 0.38, y: h * 0.52))
            finPath.addQuadCurve(to: CGPoint(x: w * 0.48, y: h * 0.68), controlPoint: CGPoint(x: w * 0.46, y: h * 0.56))
            finPath.addQuadCurve(to: CGPoint(x: w * 0.38, y: h * 0.52), controlPoint: CGPoint(x: w * 0.40, y: h * 0.65))
            finPath.close()
            UIColor(red: 0.18, green: 0.36, blue: 0.88, alpha: 0.9).setFill()
            finPath.fill()

            // 喷出的小水花（头顶萌萌的三瓣小水滴）
            let spout1 = UIBezierPath(ovalIn: CGRect(x: w * 0.34, y: h * 0.12, width: w * 0.05, height: h * 0.08))
            let spout2 = UIBezierPath(ovalIn: CGRect(x: w * 0.41, y: h * 0.06, width: w * 0.06, height: h * 0.10))
            let spout3 = UIBezierPath(ovalIn: CGRect(x: w * 0.49, y: h * 0.10, width: w * 0.05, height: h * 0.08))
            UIColor(red: 0.45, green: 0.78, blue: 1.0, alpha: 0.9).setFill()
            spout1.fill()
            spout2.fill()
            spout3.fill()
        }.withRenderingMode(.alwaysOriginal)
    }

    /// 右缘悬浮菜单按钮（半透明、可滑动、不用自动隐藏）。
    ///
    /// 旧实现把它钉死在右下角 40×40，正好压在页面的输入框/发送键上，点不动（用户报障）。
    /// 现在改成「从右缘滑出」：
    /// - 收起态只露出 `menuCollapsedPeek` 宽的一条把手，几乎不占页面热区；
    /// - 手指在按钮上左右拖动可跟手展开/收起（`UIPanGestureRecognizer`），点一下也能切换；
    /// - 展开后静置 `menuAutoHideDelay` 秒自动收起，不遮挡页面；
    /// - 选右缘是因为 iOS 的「侧滑返回」手势占用左缘，放左缘会和系统手势打架。
    private func setupMenuButton() {
        let button = UIButton(type: .custom)
        // 彻底消除任何投影或多重图层错位：单体透明圆角容器，绝不产生双重圆
        button.backgroundColor = .clear
        button.layer.cornerRadius = Self.menuButtonSide / 2
        button.clipsToBounds = true
        button.layer.shadowOpacity = 0.0
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(menuTapped), for: .touchUpInside)
        button.accessibilityLabel = "DSH 菜单"
        button.accessibilityHint = "向左滑出或点击打开菜单"

        // 装载 16 帧 DeepSeek Q 萌小胖鲸高清循环动画
        let animFrames = Self.createAnimatedFatWhaleFrames()
        if !animFrames.isEmpty, let animImage = UIImage.animatedImage(with: animFrames, duration: 1.25) {
            button.setImage(animImage, for: .normal)
        } else {
            let staticImage = Self.createCuteWhaleImage(size: CGSize(width: Self.menuButtonSide, height: Self.menuButtonSide))
            button.setImage(staticImage, for: .normal)
        }
        button.imageView?.contentMode = .scaleAspectFit
        button.contentHorizontalAlignment = .fill
        button.contentVerticalAlignment = .fill

        view.addSubview(button)

        self.menuTrailingConstraint = button.trailingAnchor.constraint(
            equalTo: view.safeAreaLayoutGuide.trailingAnchor,
            constant: Self.menuCollapsedConstant)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: Self.menuButtonSide),
            button.heightAnchor.constraint(equalToConstant: Self.menuButtonSide),
            self.menuTrailingConstraint,
            // 竖直位置比正中略高：首启 hero 页的输入卡大约在 y=410 起，
            // 上移 56pt 后把手完全落在它上方，不与输入框/发送键抢触点。
            button.centerYAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.centerYAnchor, constant: -56)
        ])

        let pan = UIPanGestureRecognizer(target: self, action: #selector(menuPanned(_:)))
        button.addGestureRecognizer(pan)

        // 添加右侧全屏幕边缘滑动手势：屏幕右边缘任何位置向左滑，均可呼出悬浮鲸鱼按钮
        let edgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(rightEdgePanned(_:)))
        edgePan.edges = .right
        edgePan.cancelsTouchesInView = false
        view.addGestureRecognizer(edgePan)

        self.menuButton = button
        self.setMenuExpanded(false, animated: false)
    }

    /// 右屏幕边缘左滑唤醒手势：在屏幕右边缘任意高度向左滑，即可流畅拉出小鲸鱼悬浮按钮
    @objc private func rightEdgePanned(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard let button = menuButton, let constraint = menuTrailingConstraint else { return }
        switch gesture.state {
        case .began:
            menuAutoHideTimer?.invalidate()
            menuAutoHideTimer = nil
            // 随着手指高度略微调整小鲸鱼按钮垂直位置，贴合用户手指，体验极佳
            let touchY = gesture.location(in: view).y
            let safeTop = view.safeAreaInsets.top + 60
            let safeBottom = view.bounds.height - view.safeAreaInsets.bottom - 100
            let clampedY = min(max(touchY, safeTop), safeBottom)
            
            // 找到 centerY 约束并动态更新
            for c in view.constraints {
                if (c.firstItem === button && c.firstAttribute == .centerY) ||
                   (c.secondItem === button && c.secondAttribute == .centerY) {
                    c.constant = clampedY - (view.bounds.height / 2)
                    break
                }
            }
            view.layoutIfNeeded()
        case .changed:
            let translationX = gesture.translation(in: view).x // 向左滑 translationX < 0
            // 从收起态 (menuCollapsedConstant) 逐渐拉向展开态 (menuExpandedConstant)
            let base = Self.menuCollapsedConstant
            let targetConstant = max(Self.menuExpandedConstant, base + translationX)
            constraint.constant = targetConstant
            let progress = min(1.0, max(0.0, -translationX / (Self.menuButtonSide)))
            button.alpha = 0.20 + (progress * 0.70)
            view.layoutIfNeeded()
        case .ended, .cancelled:
            let translationX = gesture.translation(in: view).x
            let velocityX = gesture.velocity(in: view).x
            // 只要向左划过 12pt 或速度大于 200，就完全展开；否则弹回半隐藏态
            if translationX < -12 || velocityX < -200 {
                setMenuExpanded(true, animated: true)
            } else {
                setMenuExpanded(false, animated: true)
            }
        default:
            break
        }
    }

    /// 收起 / 展开悬浮按钮。收起态隐藏一半（22pt 在屏内），透明度 20%，3 秒后自动隐藏。
    private func setMenuExpanded(_ expanded: Bool, animated: Bool) {
        guard let button = menuButton, let constraint = menuTrailingConstraint else { return }
        menuButtonExpanded = expanded
        let constant = expanded
            ? Self.menuExpandedConstant
            : Self.menuCollapsedConstant
        constraint.constant = constant
        // 用户要求：收起态半屏隐藏一半，透明度 20%；展开态清晰可见 0.90
        let targetAlpha: CGFloat = expanded ? 0.90 : 0.20

        let apply = {
            button.alpha = targetAlpha
            self.view.layoutIfNeeded()
        }

        // 保持单体按钮与动画图像 100% 绝对同轴对齐，不再使用单独偏移引入错位
        button.imageEdgeInsets = .zero

        if animated {
            UIView.animate(withDuration: 0.25, delay: 0, usingSpringWithDamping: 0.82, initialSpringVelocity: 0.5, options: [.curveEaseOut], animations: apply)
        } else {
            apply()
        }

        menuAutoHideTimer?.invalidate()
        menuAutoHideTimer = nil
        if expanded {
            // 用户要求：展开后 3 秒自动隐藏一半
            menuAutoHideTimer = Timer.scheduledTimer(
                withTimeInterval: Self.menuAutoHideDelay, repeats: false) { [weak self] _ in
                self?.setMenuExpanded(false, animated: true)
            }
        }
    }

    /// 在按钮上左右拖动：跟手移动，松手后按位置决定展开或收起。
    ///
    /// 注意方向：按钮贴右缘，**向左滑（dx < 0）才是把它拉出来**，向右滑是推回屏外。
    @objc private func menuPanned(_ gesture: UIPanGestureRecognizer) {
        guard let constraint = menuTrailingConstraint else { return }
        let base = menuButtonExpanded
            ? Self.menuExpandedConstant
            : Self.menuCollapsedConstant
        // 约束值的合法区间：[展开值(小), 收起值(大)]。
        let lower = Self.menuExpandedConstant
        let upper = Self.menuCollapsedConstant
        switch gesture.state {
        case .changed:
            let dx = gesture.translation(in: view).x
            constraint.constant = min(max(base + dx, lower), upper)
            menuAutoHideTimer?.invalidate()
            menuAutoHideTimer = nil
            view.layoutIfNeeded()
        case .ended, .cancelled, .failed:
            let dx = gesture.translation(in: view).x
            let velocity = gesture.velocity(in: view).x
            // 左滑过半、或左滑速度够快 → 展开；否则收起。
            let threshold = Self.menuButtonSide / 2
            let expand = (dx < -threshold) || (velocity < -400)
            setMenuExpanded(expand, animated: true)
        default:
            break
        }
    }

    // MARK: - 扫码连接（v1.0.71）

    /// 打开扫码界面：扫到地址二维码后自动填地址并连接，省掉手动输入。
    private func presentQRScanner() {
        let scanner = QRAddressScannerViewController()
        scanner.onResult = { [weak self] address in
            guard let self else { return }
            // 局域网/本机地址：扫到即连（零点击）；公网地址再确认一次，防止误扫到微信等二维码跳到外站
            if QRAddressParser.isTrustedLocalAddress(address) || self.isCurrentServiceAddress(address) {
                self.hideError()
                self.loadURLString(address)
            } else {
                self.confirmConnect(to: address)
            }
        }
        scanner.modalPresentationStyle = .fullScreen
        present(scanner, animated: true)
    }

    /// 扫到的地址与当前 DSH 服务同主机（换端口/换路径也算同一台机器）时视为可信。
    private func isCurrentServiceAddress(_ address: String) -> Bool {
        guard let scannedHost = URL(string: address)?.host?.lowercased() else { return false }
        let known = [dshServiceHost,
                     URL(string: defaultURL)?.host,
                     URL(string: UserDefaults.standard.string(forKey: Keys.lastURL) ?? "")?.host]
            .compactMap { $0?.lowercased() }
            .filter { !$0.isEmpty }
        return known.contains(scannedHost)
    }

    /// 公网地址扫到后的二次确认（防误扫）
    private func confirmConnect(to address: String) {
        let alert = UIAlertController(
            title: "识别到连接地址",
            message: "\(address)\n\n这不是局域网地址，确认连接吗？",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "连接", style: .default) { [weak self] _ in
            self?.hideError()
            self?.loadURLString(address)
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }

    /// 错误浮层上的扫码入口：先收起浮层再扫码，扫到即连。
    @objc private func scanFromErrorOverlay() {
        presentQRScanner()
    }

    /// 展示当前连接地址的二维码，方便用另一台手机扫码自动填地址。
    private func showCurrentAddressQRCode() {
        let address = webView.url?.absoluteString
            ?? UserDefaults.standard.string(forKey: Keys.lastURL)
            ?? defaultURL
        present(QRCodeDisplayViewController(address: address), animated: true)
    }

    /// 错误浮层上的「换一个地址」：不经过悬浮按钮的展开态，直接弹菜单。
    @objc private func openMenuDirectly() {
        presentMenuSheet()
    }

    /// 点一下：无论当前是展开还是收起，直接弹出菜单（避免用户误以为无响应）。
    @objc private func menuTapped() {
        // fisharchive.cc 果冻 Q 弹物理动效 (Jelly Spring Animation)
        UIView.animate(withDuration: 0.12, delay: 0, options: [.curveEaseIn], animations: {
            self.menuButton?.transform = CGAffineTransform(scaleX: 1.25, y: 0.78)
        }) { _ in
            UIView.animate(withDuration: 0.38, delay: 0, usingSpringWithDamping: 0.35, initialSpringVelocity: 1.5, options: [], animations: {
                self.menuButton?.transform = .identity
            })
        }
        if !menuButtonExpanded {
            setMenuExpanded(true, animated: false)
        }
        presentMenuSheet()
    }

    private func presentMenuSheet() {
        let sheet = UIAlertController(title: "DSH", message: nil, preferredStyle: .actionSheet)

        // 1. 切换服务与连接通道（二级菜单）
        sheet.addAction(UIAlertAction(title: "📡 切换服务与连接通道 ›", style: .default) { [weak self] _ in
            self?.presentConnectionsSubmenu()
        })

        // 2. 立即刷新当前页面
        sheet.addAction(UIAlertAction(title: "⚡ 立即刷新当前页面", style: .default) { [weak self] _ in
            self?.webView.reloadFromOrigin()
        })

        // 3. 免费网页版（二级菜单）
        sheet.addAction(UIAlertAction(title: "🌐 免费网页版（主流AI模型）›", style: .default) { [weak self] _ in
            self?.presentFreeWebActionSheet()
        })

        // 4. 邮件反馈与建议（发送到开发者邮箱）
        sheet.addAction(UIAlertAction(title: "✉️ 邮件反馈与建议 (发送到开发者邮箱)…", style: .default) { [weak self] _ in
            self?.presentFeedbackSheet()
        })

        // 5. 维护与工具（二级菜单）
        sheet.addAction(UIAlertAction(title: "⚙️ 维护与工具 (缓存清理/检查更新/教程) ›", style: .default) { [weak self] _ in
            self?.presentToolsSubmenu()
        })

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    /// 二级子菜单：切换服务与连接通道
    private func presentConnectionsSubmenu() {
        let sheet = UIAlertController(title: "选择服务与连接方式", message: nil, preferredStyle: .actionSheet)

        let services = ServiceStore.load()
        let activeURL = UserDefaults.standard.string(forKey: "DSHios.activeServiceURL") ?? ""
        let currentURL = webView.url?.absoluteString ?? UserDefaults.standard.string(forKey: Keys.lastURL) ?? ""
        let activeComps = URLComponents(string: activeURL)
        let currentComps = URLComponents(string: currentURL)

        for item in services.prefix(8) {
            let isSelected: Bool = {
                if !activeURL.isEmpty {
                    if item.url == activeURL { return true }
                    if let itemComps = URLComponents(string: item.url), let activeComps {
                        if itemComps.host == activeComps.host && itemComps.port == activeComps.port && itemComps.path == activeComps.path {
                            return true
                        }
                    }
                }
                if !currentURL.isEmpty {
                    if item.url == currentURL { return true }
                    if let itemComps = URLComponents(string: item.url), let currentComps {
                        if itemComps.host == currentComps.host && itemComps.port == currentComps.port && itemComps.path == currentComps.path {
                            return true
                        }
                    }
                }
                return false
            }()

            let title = isSelected ? "🔴 \(item.name) (当前·点击刷新)" : item.name
            let action = UIAlertAction(title: title, style: .default) { [weak self] _ in
                guard let self else { return }
                UserDefaults.standard.set(item.url, forKey: "DSHios.activeServiceURL")
                if isSelected {
                    self.webView.reloadFromOrigin()
                    return
                }
                ServiceResolver.resolve(item) { url in
                    self.loadURLString(url, markAsDSHService: true)
                }
            }
            if isSelected {
                if action.responds(to: NSSelectorFromString("titleTextColor")) {
                    action.setValue(UIColor.systemRed, forKey: "titleTextColor")
                }
            }
            sheet.addAction(action)
        }

        sheet.addAction(UIAlertAction(title: "📷 扫码连接（扫二维码自动填地址）", style: .default) { [weak self] _ in
            self?.presentQRScanner()
        })
        sheet.addAction(UIAlertAction(title: "🔳 当前地址二维码（给别人扫）", style: .default) { [weak self] _ in
            self?.showCurrentAddressQRCode()
        })
        sheet.addAction(UIAlertAction(title: "手动输入地址…", style: .default) { [weak self] _ in
            self?.promptForURL()
        })
        sheet.addAction(UIAlertAction(title: "全部服务管理…", style: .default) { [weak self] _ in
            self?.openServiceList()
        })
        sheet.addAction(UIAlertAction(title: "‹ 返回主菜单", style: .cancel) { [weak self] _ in
            self?.presentMenuSheet()
        })
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    /// 二级子菜单：维护、教程与工具
    private func presentToolsSubmenu() {
        let sheet = UIAlertController(title: "系统维护与实用工具", message: nil, preferredStyle: .actionSheet)

        sheet.addAction(UIAlertAction(title: "⚡ 立即回源刷新当前页面", style: .default) { [weak self] _ in
            self?.webView.reloadFromOrigin()
        })
        sheet.addAction(UIAlertAction(title: "🧹 清除网页缓存并重载", style: .default) { [weak self] _ in
            self?.clearWebCacheAndReload()
        })
        let currentAppVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.88"
        sheet.addAction(UIAlertAction(title: "🚀 检查更新 (当前 v\(currentAppVer))…", style: .default) { [weak self] _ in
            self?.checkForAppUpdates(manual: true)
        })
        sheet.addAction(UIAlertAction(title: "📖 连接说明与教程…", style: .default) { [weak self] _ in
            self?.openConnectionGuide()
        })
        sheet.addAction(UIAlertAction(title: "ℹ️ 关于 DSHios", style: .default) { [weak self] _ in
            self?.showAbout()
        })
        sheet.addAction(UIAlertAction(title: "‹ 返回主菜单", style: .cancel) { [weak self] _ in
            self?.presentMenuSheet()
        })
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    /// v1.0.83：布局编辑层。给每个按钮描边、标名字，按住拖动，松手记住位置。
    /// 打开后注入到当前页面，刷新或换页时按开关重新注入。
    private func applyLayoutEditMode() {
        let on = UserDefaults.standard.bool(forKey: Keys.layoutEdit)
        let js = on ? Self.layoutEditOnJS : Self.layoutEditOffJS
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private static let layoutEditOffJS = "(function(){var e=document.getElementById('dsh-layout-edit');if(e)e.remove();document.querySelectorAll('[data-dsh-moved]').forEach(function(n){n.style.position='';n.style.left='';n.style.top='';n.style.zIndex='';n.removeAttribute('data-dsh-moved');});})();"

    private static let layoutEditOnJS = """
    (function () {
      if (document.getElementById('dsh-layout-edit')) return;
      var box = document.createElement('div');
      box.id = 'dsh-layout-edit';
      box.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;';
      document.documentElement.appendChild(box);

      function labelOf(el) {
        var t = el.getAttribute('aria-label') || (el.innerText || '').trim();
        return t.replace(/\\s+/g, ' ').slice(0, 10) || el.tagName.toLowerCase();
      }
      function candidates() {
        var sel = 'header, [class*="titleRow"], [class*="composerSeat"], [class*="composerStack"], [class*="uWtHQG_input"], [class*="sidebarCol"], button, [role="button"], a, input, textarea';
        var list = Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
          if (el.closest('#dsh-layout-edit') || el.closest('#dsh-layout-bar')) return false;
          var r = el.getBoundingClientRect();
          return r.width > 8 && r.height > 8 && r.width < window.innerWidth + 4 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
        });
        // 大块在前、小按钮在后：后画的框在上层，按钮不会被整块挡住拖不动。
        list.sort(function (a, b) { return (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height); });
        return list;
      }
      function paint() {
        box.innerHTML = '';
        var idx = 0;
        candidates().forEach(function (el) {
          idx += 1;
          var num = idx;
          var r = el.getBoundingClientRect();
          var f = document.createElement('div');
          f.style.cssText = 'position:fixed;border:1px dashed #ff2d55;border-radius:6px;pointer-events:auto;background:rgba(255,45,85,0.06);';
          f.style.left = r.left + 'px';
          f.style.top = r.top + 'px';
          f.style.width = r.width + 'px';
          f.style.height = r.height + 'px';
          var tag = document.createElement('span');
          tag.textContent = num + ' ' + labelOf(el);
          tag.style.cssText = 'position:absolute;left:0;top:-14px;font:10px sans-serif;color:#fff;background:#ff2d55;padding:0 3px;border-radius:3px;white-space:nowrap;';
          f.appendChild(tag);
          var sx = 0, sy = 0, sl = 0, st = 0, moved = false;
          f.addEventListener('touchstart', function (e) {
            var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
            var er = el.getBoundingClientRect(); sl = er.left; st = er.top; moved = false;
          }, { passive: true });
          f.addEventListener('touchmove', function (e) {
            var t = e.touches[0];
            var dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
            if (!moved) return;
            e.preventDefault();
            el.style.setProperty('position', 'fixed', 'important');
            el.style.setProperty('left', Math.round(sl + dx) + 'px', 'important');
            el.style.setProperty('top', Math.round(st + dy) + 'px', 'important');
            el.style.setProperty('margin', '0', 'important');
            el.style.setProperty('z-index', '2147482000', 'important');
            el.setAttribute('data-dsh-moved', '1');
            f.style.left = Math.round(sl + dx) + 'px';
            f.style.top = Math.round(st + dy) + 'px';
          }, { passive: false });
          f.addEventListener('touchend', function (e) {
            if (moved) { e.preventDefault(); e.stopPropagation(); }
          }, true);
          box.appendChild(f);
        });
      }
      paint();

      var bar = document.createElement('div');
      bar.id = 'dsh-layout-bar';
      bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483646;display:flex;gap:6px;';
      function btn(text, bg) {
        var b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = 'font:13px sans-serif;color:#fff;border:none;border-radius:8px;padding:6px 10px;';
        b.style.background = bg;
        return b;
      }
      var copy = btn('复制位置', '#ff2d55');
      copy.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var lines = ['按钮 左 上 宽 高'];
        candidates().forEach(function (el) {
          var r = el.getBoundingClientRect();
          lines.push(labelOf(el) + ' ' + Math.round(r.left) + ' ' + Math.round(r.top) + ' ' + Math.round(r.width) + ' ' + Math.round(r.height));
        });
        var text = lines.join('\\n');
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
        copy.textContent = '已复制';
        setTimeout(function () { copy.textContent = '复制位置'; }, 1200);
      }, true);
      var refresh = btn('重标', '#444');
      refresh.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); paint(); }, true);
      bar.appendChild(copy); bar.appendChild(refresh);
      document.documentElement.appendChild(bar);
      box.__bar = bar;
    })();
    """

    /// 一级菜单：免费网页版（主流 AI 模型）
    /// 支持二级菜单查看国内主流模型与海外主流模型，用户登录自己账号后，Cookie 与登录态由 WKWebsiteDataStore 永久保持
    private func presentFreeWebActionSheet() {
        let sheet = UIAlertController(
            title: "免费网页版（主流AI模型）",
            message: "登录个人账号即可免费使用。登录态 Cookie 自动持久化保存，除非平台官方过期否则无需重复登录。",
            preferredStyle: .actionSheet)

        sheet.addAction(UIAlertAction(title: "🇨🇳 国内主流模型（手机号即可直接免费用）", style: .default) { [weak self] _ in
            self?.presentDomesticWebActionSheet()
        })

        sheet.addAction(UIAlertAction(title: "🌐 国外主流模型（需海外网络环境+账号）", style: .default) { [weak self] _ in
            self?.presentOverseasWebActionSheet()
        })

        sheet.addAction(UIAlertAction(title: "返回上级菜单", style: .default) { [weak self] _ in
            self?.presentMenuSheet()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    /// 二级菜单：国内主流免费模型
    private func presentDomesticWebActionSheet() {
        let sheet = UIAlertController(
            title: "国内主流模型网页端",
            message: "直接浏览器打开，手机号登录即可免费畅聊：",
            preferredStyle: .actionSheet)

        let items = FreeWebStore.domesticDefaults
        let currentURL = webView.url?.absoluteString ?? ""

        for item in items {
            let isCurrent = currentURL.hasPrefix(item.url)
            let title = isCurrent ? "🔴 \(item.name) (当前)" : item.name
            let action = UIAlertAction(title: title, style: .default) { [weak self] _ in
                self?.loadURLString(item.url, markAsDSHService: false)
            }
            if isCurrent, action.responds(to: NSSelectorFromString("titleTextColor")) {
                action.setValue(UIColor.systemRed, forKey: "titleTextColor")
            }
            sheet.addAction(action)
        }

        sheet.addAction(UIAlertAction(title: "返回免费网页版目录", style: .default) { [weak self] _ in
            self?.presentFreeWebActionSheet()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    /// 二级菜单：国外主流免费模型
    private func presentOverseasWebActionSheet() {
        let sheet = UIAlertController(
            title: "国外主流模型网页端",
            message: "网页免费版，需海外网络环境 + 海外账号登录：",
            preferredStyle: .actionSheet)

        let items = FreeWebStore.overseasDefaults
        let currentURL = webView.url?.absoluteString ?? ""

        for item in items {
            let isCurrent = currentURL.hasPrefix(item.url)
            let title = isCurrent ? "🔴 \(item.name) (当前)" : item.name
            let action = UIAlertAction(title: title, style: .default) { [weak self] _ in
                self?.loadURLString(item.url, markAsDSHService: false)
            }
            if isCurrent, action.responds(to: NSSelectorFromString("titleTextColor")) {
                action.setValue(UIColor.systemRed, forKey: "titleTextColor")
            }
            sheet.addAction(action)
        }

        sheet.addAction(UIAlertAction(title: "返回免费网页版目录", style: .default) { [weak self] _ in
            self?.presentFreeWebActionSheet()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    @objc private func openConnectionGuide() {
        let guide = ConnectionGuideViewController(onOpenInputURL: { [weak self] in
            self?.promptForURL()
        })
        let nav = UINavigationController(rootViewController: guide)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
    }

    /// 清空 WKWebView 的磁盘/内存缓存后重新加载。
    /// 用途：服务端已修好但客户端仍在用缓存里的旧入口包时，一键恢复。
    private func clearWebCacheAndReload() {
        let target = webView.url?.absoluteString
            ?? UserDefaults.standard.string(forKey: Keys.lastURL)
            ?? defaultURL
        let dataStore = webView.configuration.websiteDataStore
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        dataStore.removeData(ofTypes: types, modifiedSince: .distantPast) { [weak self] in
            DispatchQueue.main.async {
                guard let self else { return }
                // cookie 也一并清了，重新走一遍 Pocket 握手（重载不改变页面归属判定）
                self.loadURLString(target, markAsDSHService: false)
            }
        }
    }

    private func openServiceList() {
        let currentURL = webView.url?.absoluteString ?? UserDefaults.standard.string(forKey: Keys.lastURL) ?? defaultURL
        let settings = SettingsViewController(
            currentURL: currentURL,
            onSave: { _ in },
            onSelect: { [weak self] newURL in
                self?.loadURLString(newURL)
            })
        let nav = UINavigationController(rootViewController: settings)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
    }

    private func promptForURL() {
        let alert = UIAlertController(title: "服务地址", message: nil, preferredStyle: .alert)
        alert.addTextField { tf in
            tf.placeholder = "http://192.168.1.100:3083/"
            tf.text = UserDefaults.standard.string(forKey: Keys.lastURL) ?? self.defaultURL
            tf.autocapitalizationType = .none
            tf.autocorrectionType = .no
            tf.keyboardType = .URL
            tf.clearButtonMode = .whileEditing
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "加载", style: .default) { [weak self] _ in
            guard let text = alert.textFields?.first?.text, !text.isEmpty else { return }
            self?.loadURLString(text)
        })
        present(alert, animated: true)
    }

    /// 精确解析 iOS 物理硬件标识符（如 iPhone15,3 -> iPhone 14 Pro Max，iPhone11,8 -> iPhone XR）
    private static func getExactDeviceModel() -> String {
        #if targetEnvironment(simulator)
        let identifier = ProcessInfo().environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "Simulator"
        #else
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }
        #endif

        let modelMap: [String: String] = [
            // iPhone 系列
            "iPhone10,1": "iPhone 8", "iPhone10,4": "iPhone 8",
            "iPhone10,2": "iPhone 8 Plus", "iPhone10,5": "iPhone 8 Plus",
            "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X",
            "iPhone11,2": "iPhone XS",
            "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max",
            "iPhone11,8": "iPhone XR",
            "iPhone12,1": "iPhone 11",
            "iPhone12,3": "iPhone 11 Pro",
            "iPhone12,5": "iPhone 11 Pro Max",
            "iPhone12,8": "iPhone SE (2nd gen)",
            "iPhone13,1": "iPhone 12 mini",
            "iPhone13,2": "iPhone 12",
            "iPhone13,3": "iPhone 12 Pro",
            "iPhone13,4": "iPhone 12 Pro Max",
            "iPhone14,4": "iPhone 13 mini",
            "iPhone14,5": "iPhone 13",
            "iPhone14,2": "iPhone 13 Pro",
            "iPhone14,3": "iPhone 13 Pro Max",
            "iPhone14,6": "iPhone SE (3rd gen)",
            "iPhone14,7": "iPhone 14",
            "iPhone14,8": "iPhone 14 Plus",
            "iPhone15,2": "iPhone 14 Pro",
            "iPhone15,3": "iPhone 14 Pro Max",
            "iPhone15,4": "iPhone 15",
            "iPhone15,5": "iPhone 15 Plus",
            "iPhone16,1": "iPhone 15 Pro",
            "iPhone16,2": "iPhone 15 Pro Max",
            "iPhone17,1": "iPhone 16 Pro",
            "iPhone17,2": "iPhone 16 Pro Max",
            "iPhone17,3": "iPhone 16",
            "iPhone17,4": "iPhone 16 Plus",
            // iPad 系列
            "iPad11,1": "iPad mini (5th gen)", "iPad11,2": "iPad mini (5th gen)",
            "iPad14,1": "iPad mini (6th gen)", "iPad14,2": "iPad mini (6th gen)",
            "iPad11,3": "iPad Air (3rd gen)", "iPad11,4": "iPad Air (3rd gen)",
            "iPad13,1": "iPad Air (4th gen)", "iPad13,2": "iPad Air (4th gen)",
            "iPad13,16": "iPad Air (5th gen)", "iPad13,17": "iPad Air (5th gen)",
            "iPad14,8": "iPad Air 11-inch (M2)", "iPad14,9": "iPad Air 11-inch (M2)",
            "iPad14,10": "iPad Air 13-inch (M2)", "iPad14,11": "iPad Air 13-inch (M2)",
            "iPad8,1": "iPad Pro 11-inch (1st gen)", "iPad8,2": "iPad Pro 11-inch (1st gen)",
            "iPad8,3": "iPad Pro 11-inch (1st gen)", "iPad8,4": "iPad Pro 11-inch (1st gen)",
            "iPad8,9": "iPad Pro 11-inch (2nd gen)", "iPad8,10": "iPad Pro 11-inch (2nd gen)",
            "iPad13,4": "iPad Pro 11-inch (3rd gen)", "iPad13,5": "iPad Pro 11-inch (3rd gen)",
            "iPad13,6": "iPad Pro 11-inch (3rd gen)", "iPad13,7": "iPad Pro 11-inch (3rd gen)",
            "iPad14,3": "iPad Pro 11-inch (4th gen)", "iPad14,4": "iPad Pro 11-inch (4th gen)",
            "iPad16,3": "iPad Pro 11-inch (M4)", "iPad16,4": "iPad Pro 11-inch (M4)",
            "iPad8,5": "iPad Pro 12.9-inch (3rd gen)", "iPad8,6": "iPad Pro 12.9-inch (3rd gen)",
            "iPad8,7": "iPad Pro 12.9-inch (3rd gen)", "iPad8,8": "iPad Pro 12.9-inch (3rd gen)",
            "iPad8,11": "iPad Pro 12.9-inch (4th gen)", "iPad8,12": "iPad Pro 12.9-inch (4th gen)",
            "iPad13,8": "iPad Pro 12.9-inch (5th gen)", "iPad13,9": "iPad Pro 12.9-inch (5th gen)",
            "iPad13,10": "iPad Pro 12.9-inch (5th gen)", "iPad13,11": "iPad Pro 12.9-inch (5th gen)",
            "iPad14,5": "iPad Pro 12.9-inch (6th gen)", "iPad14,6": "iPad Pro 12.9-inch (6th gen)",
            "iPad16,5": "iPad Pro 13-inch (M4)", "iPad16,6": "iPad Pro 13-inch (M4)"
        ]

        if let exactName = modelMap[identifier] {
            return exactName
        }
        if identifier.starts(with: "iPhone") || identifier.starts(with: "iPad") {
            return identifier
        }
        let fallback = UIDevice.current.model
        return fallback.isEmpty ? "iOS 设备" : fallback
    }

    /// 原生设备运行环境信息检测（解决多系统版本诊断与 iOS 15 兼容排查）
    private static func getDeviceInfoSummary() -> String {
        let device = UIDevice.current
        let systemVersion = device.systemVersion
        let exactModel = getExactDeviceModel()
        let name = device.name
        
        var freeDiskGB = "未知"
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()),
           let freeSize = attrs[.systemFreeSize] as? Int64 {
            freeDiskGB = String(format: "%.1f GB", Double(freeSize) / 1024.0 / 1024.0 / 1024.0)
        }
        
        let screen = UIScreen.main
        let bounds = screen.bounds
        let scale = screen.scale
        let res = "\(Int(bounds.width * scale))×\(Int(bounds.height * scale)) (@\(Int(scale))x)"
        
        // 严格只显示精确硬件型号，彻底删除任何括号后缀（如 (iPhone) / (iPad)）
        return "设备: \(exactModel)\n系统: iOS \(systemVersion)\n屏幕: \(res)\n可用存储: \(freeDiskGB)"
    }

    /// 反馈与建议页面入口（严禁收集或传递用户私密访问地址与密码凭据）
    private func presentFeedbackSheet() {
        let feedbackVC = FeedbackViewController()
        let nav = UINavigationController(rootViewController: feedbackVC)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
    }

    /// 关于：版本号原生可见（读 Info.plist，回退到编译期常量）
    private func showAbout() {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? AppDelegate.Version.marketing
        let build = info?["CFBundleVersion"] as? String ?? AppDelegate.Version.build
        let deviceInfo = Self.getDeviceInfoSummary()
        let alert = UIAlertController(
            title: "DeepSeek Harness iOS",
            message: """
            版本：\(version) (\(build))
            开源仓库：https://github.com/liushQAQ/IOS

            【设备环境信息】
            \(deviceInfo)

            【最新特性 (v1.0.83)】
            1. ⚡ 首推插件 dsh-anywhere：支持多台手机、iPad、平板、电脑多设备同时在线访问，实时同屏收发与流式同步打印，无缝切换使用；内置毫秒级锁屏自愈（备选支持 dsh-pocket）；
            2. 🛡 锁屏假死彻底自愈：锁屏 1~2 分钟切回自动恢复联通；手动点击刷新或当前地址 100% 强行恢复连接；
            3. 📐 左侧侧边栏按 75% 缩放舒展展示（210px 宽度），隐藏电脑端快捷键，新会话按钮清爽居中；
            4. 🚀 悬浮按钮内置「检查更新」：支持从 GitHub 仓库自动下载并唤起巨魔 (TrollStore) 一键覆盖安装；
            5. ⌨️ 会话框上浮避让：键盘打开时消息内容区动态增加缓冲，思考中与流式输出最后三行零遮挡。
            """,
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "连接教程与更新说明", style: .default) { [weak self] _ in
            self?.openConnectionGuide()
        })
        alert.addAction(UIAlertAction(title: "好", style: .cancel))
        present(alert, animated: true)
    }

    // MARK: - Loading

    private func loadInitialURL() {
        // 跨版本防覆盖铁律：优先读取本地持久化沙盒中用户已配置/正在使用的地址，绝不覆盖冲掉用户已有 URL！
        let saved = DSHPersistenceCenter.loadLastURL() ?? UserDefaults.standard.string(forKey: Keys.lastURL)
        let urlString = (saved?.isEmpty == false) ? saved! : defaultURL
        loadURLString(urlString)
    }

    @objc private func retryTapped() {
        if let current = webView.url?.absoluteString, !current.isEmpty {
            loadURLString(current, markAsDSHService: false)
        } else {
            loadInitialURL()
        }
    }

    @objc private func appDidEnterBackground() {
        if isDictating {
            stopVoiceDictation()
        }
    }

    /// - Parameter markAsDSHService: 加载的是 DSH 服务地址时为 true（记录其 host 用于页面归属判定）；
    ///   打开外嵌免费网页对话等第三方站点时必须传 false，避免把第三方 host 误认成 DSH。
    private func loadURLString(_ raw: String, markAsDSHService: Bool = true) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        var finalString = trimmed
        if !finalString.lowercased().hasPrefix("http://"),
           !finalString.lowercased().hasPrefix("https://") {
            finalString = "http://" + finalString
        }
        guard let url = URL(string: finalString) else {
            showError(detail: "地址无效：\(finalString)")
            return
        }
        if markAsDSHService {
            dshServiceHost = url.host
        }

        // 双轨固化存储，跨版本覆盖安装升级永不丢失当前使用的 URL
        UserDefaults.standard.set(trimmed, forKey: Keys.lastURL)
        UserDefaults.standard.set(trimmed, forKey: "DSHios.activeServiceURL")
        DSHPersistenceCenter.saveLastURL(trimmed)
        hideError()
        stopWhiteScreenDiagnostics()
        stopEarlyRevealProbe()
        webErrors = []
        terminateCount = 0
        hasLoadedOnce = false
        isTokenRetryInFlight = false
        if !trimmed.contains("dsh-pocket-retry=1") { isPocketRetryInFlight = false }

        // 1.0.70 黄金逻辑：新地址开始加载先隐藏旧内容，由系统原生处理请求与超时
        UIView.animate(withDuration: 0.12) {
            self.webView.alpha = 0
        }
        webView.load(URLRequest(url: url))
        // 注意：这里**不能**武装探测。webView.load 之后旧文档仍留在内存里（直到新响应提交），
        // 此刻探测 #root 会立刻命中旧页面导致提前显形，等于改动了 URL 切换的观感。
        // 正确时机是 didCommit（新文档已提交）——见 webView(_:didCommit:)。
    }

    // MARK: - 联网即加载 (1.0.70 零干扰黄金逻辑)

    @objc private func appDidBecomeActive() {
        if let btn = menuButton {
            view.bringSubviewToFront(btn)
            btn.isUserInteractionEnabled = true
        }
        setMenuExpanded(false, animated: false)

        if !errorOverlay.isHidden || webView.url == nil || !hasLoadedOnce {
            retryTapped()
        }
    }

    /// 网络可达性监听：网络从无到有时自动加载，无需手动点刷新。
    private func startNetworkWatch() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async {
                // 只在「失败态」或「尚未加载」时自动重连，已经正常加载的不打断
                if !self.errorOverlay.isHidden || self.webView.url == nil || !self.hasLoadedOnce {
                    self.retryTapped()
                }
            }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))
        self.pathMonitor = monitor
    }

    // MARK: - Error overlay

    /// webView 只在内容就绪后显形，加载中/失败时露出的是原生加载态或错误提示。
    private func revealWebView() {
        guard webView.alpha < 1 else { return }
        UIView.animate(withDuration: 0.18) {
            self.webView.alpha = 1
        }
    }

    private func showError(detail: String) {
        // v1.0.106：已经明确报错就不必再提前显形探测了。
        stopEarlyRevealProbe()
        // 白屏 / 系统版本诊断路径已显式设过标题，这里不要覆盖；其余一律回到默认标题。
        let presetTitles: Set<String> = ["页面白屏", "系统版本过低"]
        if !presetTitles.contains(errorTitleLabel.text ?? "") {
            errorTitleLabel.text = "无法连接到 DSH"
        }
        errorDetailLabel.text = detail
        errorOverlay.isHidden = false
        errorOverlay.alpha = 0
        UIView.animate(withDuration: 0.2) {
            self.errorOverlay.alpha = 1
        }
    }

    private func hideError() {
        errorOverlay.isHidden = true
        // 回到默认标题，避免下一次连接类错误沿用「页面白屏」。
        errorTitleLabel.text = "无法连接到 DSH"
    }

    /// 把 WKWebView 的 NSError 翻译成用户可读的提示。
    private func readableMessage(for error: Error) -> String {
        let nsError = error as NSError
        let code = nsError.code
        let domain = nsError.domain
        switch (domain, code) {
        case (NSURLErrorDomain, NSURLErrorCannotFindHost):
            return "找不到主机：地址中的 IP/域名无法解析"
        case (NSURLErrorDomain, NSURLErrorCannotConnectToHost):
            return "无法连接：电脑端服务未启动或端口不对（当前地址需电脑端 DSH 在线）"
        case (NSURLErrorDomain, NSURLErrorNetworkConnectionLost):
            return "网络连接中断"
        case (NSURLErrorDomain, NSURLErrorNotConnectedToInternet):
            return "设备未联网或不在同一局域网"
        case (NSURLErrorDomain, NSURLErrorTimedOut):
            return "连接超时：服务无响应"
        case (NSURLErrorDomain, -1200):
            return "TLS/证书错误（本地址为明文 HTTP，一般不会出现）"
        default:
            return "错误 [\(domain) \(code)]：\(nsError.localizedDescription)"
        }
    }

    /// 导航超时保护：服务端无响应时 WKWebView 默认要等很久，这里兜底提示。
    /// v1.0.106：只拦「服务器压根没响应」这一种情况。收到响应头 / 导航提交即取消（见
    /// decidePolicyFor navigationResponse 与 didCommit），不再把慢机上的客户端 JS 解析耗时误判成超时。
    /// 实测 DSH 已装插件 bundle 合计 11.5MB，慢机上解析执行要 20~40 秒，原 20 秒阈值必然误报。
    private func startNavigationTimeout() {
        navigationTimer?.invalidate()
        navigationTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            guard let self, self.errorOverlay.isHidden else { return }
            self.activityIndicator.stopAnimating()
            self.showError(detail: "连接超时：30 秒内未收到任何响应，请确认电脑端 DSH 在线、地址与端口正确")
        }
    }

    private func stopNavigationTimeout() {
        navigationTimer?.invalidate()
        navigationTimer = nil
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // DSH Pocket（3083）在 Safari/WKWebView 的 http://纯IP 源上 cookie 存不进 cookie jar
        // （dsh-pocket issue #91）→ 握手永远完不成 → 503 错误页/白屏。
        // 绕过：手动截获响应的 Set-Cookie，直接塞进 WKHTTPCookieStore ——
        // store 层写入不受 ITP 限制，后续请求会正常携带。
        if let httpRes = navigationResponse.response as? HTTPURLResponse,
           let url = navigationResponse.response.url,
           let fields = httpRes.allHeaderFields as? [String: String] {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
            if !cookies.isEmpty {
                let store = webView.configuration.websiteDataStore.httpCookieStore
                for c in cookies { store.setCookie(c, completionHandler: nil) }
            }
            // 识别 Pocket 握手过渡页（200 + x-dsh-pocket-handshake: transition）：
            // cookie 已手动入库，meta refresh 之前的下一次 GET / 就能带上，无需干预。
            // v1.0.106：服务器已经回了响应头 = 网络这一腿通了，"连接超时"的使命到此结束。
            // 若不在这里取消，慢机上「服务端 30ms 响应、客户端 JS 要跑 30 秒」会被误判成连接超时并弹假错误页。
            stopNavigationTimeout()
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        activityIndicator.startAnimating()
        startNavigationTimeout()
        // v1.0.106：新导航开始——此刻 #root 仍属于上一个文档，先撤掉探测，
        // 待 didCommit 新文档接手后再重新武装，避免把旧页面误判成新页面首帧。
        stopEarlyRevealProbe()
    }

    /// v1.0.70：导航已提交（此时 webView.url 已是新页面）——
    /// 外部网页（免费网页对话等第三方站点）顶部避开 iOS 状态栏/灵动岛；DSH 页面保持全屏。
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        updateTopSafeAreaFor(url: webView.url)
        // v1.0.106：导航已提交（首字节已到、新文档已接手）——网络腿完成，取消连接超时保护，
        // 避免把后续纯客户端 JS 解析耗时（慢机上可达 30 秒）误报成"连接超时"。
        stopNavigationTimeout()
        // v1.0.106：此刻起 #root 一定属于新文档，武装首屏探测，出首帧即显形，不再死等 didFinish。
        startEarlyRevealProbe()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        stopNavigationTimeout()
        stopEarlyRevealProbe()
        // 完成即隐藏错误层（meta-refresh 握手页二跳也会走到这里）
        hideError()
        hasLoadedOnce = true
        // 首屏下发一次状态栏高度：safeAreaInsets 可能在页面脚本注入之前就定了，
        // 不补这一次，顶栏会一直停在默认留白上。
        publishStatusBarHeight()
        // v1.0.105 双保险：首屏可能早于视图完成布局（此时 safeAreaInsets 还是 0），
        // 延迟再补发一次，让页内 shim 无论何时接管都能拿到正确的顶/底安全区。
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.publishStatusBarHeight()
        }
        // 布局编辑开着时，每次页面加载完成重新挂上编辑层。
        if UserDefaults.standard.bool(forKey: Keys.layoutEdit) {
            applyLayoutEditMode()
        }
        // 内容首帧就绪后才显形：加载过程只显示原生加载态，永不白屏
        revealWebView()
        detectStaleTokenPage()
        detectPocketHandshakeBlocked()
        startWhiteScreenDiagnostics()
    }

    /// 3083 Pocket 握手失败兜底：代理重试计数耗尽后回 503「无法完成登录握手」页。
    /// 正常情况下 cookie 已由 decidePolicyFor 手动入库，不应走到这里；若走到
    /// （如 cookie 被系统清理），清计数参数重载一次。官方入口：/?dsh-pocket-retry=1。
    private func detectPocketHandshakeBlocked() {
        guard !isPocketRetryInFlight else { return }
        webView.evaluateJavaScript("document.body ? document.body.innerText.slice(0, 300) : ''") {
            [weak self] result, _ in
            guard let self,
                  let text = result as? String,
                  text.contains("无法完成登录握手") else { return }
            self.isPocketRetryInFlight = true
            if var comps = URLComponents(url: self.webView.url ?? URL(string: self.defaultURL)!, resolvingAgainstBaseURL: false) {
                let items = (comps.queryItems ?? []).filter { $0.name != "dsh-pocket-retry" }
                comps.queryItems = items + [URLQueryItem(name: "dsh-pocket-retry", value: "1")]
                if let retryURL = comps.url { self.loadURLString(retryURL.absoluteString); return }
            }
            self.loadURLString(self.defaultURL)
        }
    }

    /// 电脑端 DSH 重启后 token 会变：外网打开时 3081 直接回 401 文字页
    /// （"dsh web authentication required…"），用户看到的就是白屏。
    /// 这里在页面加载完成后读正文，命中特征就自动换最新 token 重试一次。
    private func detectStaleTokenPage() {
        guard !isTokenRetryInFlight else { return }
        webView.evaluateJavaScript("document.body ? document.body.innerText.slice(0, 300) : ''") {
            [weak self] result, _ in
            guard let self,
                  let text = result as? String,
                  text.contains("dsh web authentication required") else { return }
            self.retryWithFreshToken()
        }
    }

    /// 找到当前地址对应的带 resolver 的服务条目（外网入口），重新换票后重载。
    private func retryWithFreshToken() {
        let current = webView.url?.absoluteString ?? UserDefaults.standard.string(forKey: Keys.lastURL) ?? ""
        guard let item = ServiceStore.load().first(where: {
            $0.resolverURL?.isEmpty == false && current.contains(hostOf($0.url))
        }) else {
            showError(detail: "DSH 已重启，token 失效。请回到局域网打开一次「DSH 外网」自动换票，或重启电脑端 DSH 后重试")
            return
        }
        isTokenRetryInFlight = true
        ServiceResolver.resolve(item) { [weak self] freshURL in
            guard let self else { return }
            self.isTokenRetryInFlight = false
            // 只有换到的地址和当前不一样才值得重载，避免 401 页原地打转
            if freshURL != current {
                self.loadURLString(freshURL)
            } else {
                self.showError(detail: "token 已失效且暂换不到新票（需手机与电脑同一局域网）。回到局域网点开「DSH 外网」即可自动换票")
            }
        }
    }

    private func hostOf(_ urlString: String) -> String {
        URL(string: urlString)?.host ?? urlString
    }

    /// Web 内容进程被系统回收（内存压力/后台）时自动重连，避免只剩空白页。
    /// 插件 bundle 合计十几 MB，iOS 上内存压力大时很容易被回收：
    /// 一旦发生，#root 永远渲染不完 = 白屏。这里计数并上报，便于定位。
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        terminateCount += 1
        recordWebError("内容进程被系统回收（第 \(terminateCount) 次），已自动重载")
        activityIndicator.startAnimating()
        startNavigationTimeout()
        webView.reloadFromOrigin()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        stopNavigationTimeout()
        showError(detail: readableMessage(for: error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        stopNavigationTimeout()
        showError(detail: readableMessage(for: error))
    }

    // MARK: - 原生语音输入（SFSpeechRecognizer + AVAudioEngine）

    private func toggleVoiceDictation() {
        if isDictating {
            stopVoiceDictation()
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard authStatus == .authorized else {
                    self.notifyWebVoiceState(active: false, text: nil)
                    let alert = UIAlertController(title: "未开启语音识别权限", message: "请在 iOS 系统「设置 → 隐私与安全性 → 语音识别」中允许本应用使用语音识别。", preferredStyle: .alert)
                    alert.addAction(UIAlertAction(title: "好", style: .default))
                    self.present(alert, animated: true)
                    return
                }

                AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
                    DispatchQueue.main.async {
                        guard let self = self else { return }
                        if granted {
                            self.startVoiceDictation()
                        } else {
                            self.notifyWebVoiceState(active: false, text: nil)
                            let alert = UIAlertController(title: "未开启麦克风权限", message: "请在 iOS 系统「设置 → 隐私与安全性 → 麦克风」中允许本应用访问麦克风。", preferredStyle: .alert)
                            alert.addAction(UIAlertAction(title: "好", style: .default))
                            self.present(alert, animated: true)
                        }
                    }
                }
            }
        }
    }

    private func startVoiceDictation() {
        if audioEngine.isRunning {
            stopVoiceDictation()
        }

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            notifyWebVoiceState(active: false, text: nil)
            return
        }

        do {
            recognitionTask?.cancel()
            recognitionTask = nil

            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.recognitionRequest = request

            let inputNode = audioEngine.inputNode
            lastRecognizedText = ""
            isDictating = true
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            notifyWebVoiceState(active: true, text: nil)

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self = self else { return }
                if let result = result {
                    let fullText = result.bestTranscription.formattedString
                    if fullText != self.lastRecognizedText {
                        let delta: String
                        if fullText.hasPrefix(self.lastRecognizedText) {
                            delta = String(fullText.dropFirst(self.lastRecognizedText.count))
                        } else {
                            delta = fullText
                        }
                        self.lastRecognizedText = fullText
                        if !delta.isEmpty {
                            DispatchQueue.main.async {
                                self.notifyWebVoiceState(active: self.isDictating, text: delta)
                            }
                        }
                    }
                }

                if error != nil || (result?.isFinal ?? false) {
                    DispatchQueue.main.async {
                        if self.isDictating {
                            self.stopVoiceDictation()
                        }
                    }
                }
            }

            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            stopVoiceDictation()
        }
    }

    private func stopVoiceDictation() {
        isDictating = false
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        notifyWebVoiceState(active: false, text: nil)
    }

    private func notifyWebVoiceState(active: Bool, text: String?) {
        let activeStr = active ? "true" : "false"
        if let text = text,
           let data = try? JSONSerialization.data(withJSONObject: [text]),
           let jsonArr = String(data: data, encoding: .utf8) {
            let js = "if (window.__dshVoiceStateUpdate) { window.__dshVoiceStateUpdate(\(activeStr), \(jsonArr)[0]); }"
            webView.evaluateJavaScript(js, completionHandler: nil)
        } else {
            let js = "if (window.__dshVoiceStateUpdate) { window.__dshVoiceStateUpdate(\(activeStr), null); }"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

// MARK: - WKUIDelegate

extension ViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}

// MARK: - UIScrollViewDelegate (彻底封死 WebView 原生页面缩放)

extension ViewController: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return nil
    }
    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if scrollView.zoomScale != 1.0 {
            scrollView.setZoomScale(1.0, animated: false)
        }
    }
    /// 键盘避让兜底（v1.0.73 重写）。
    ///
    /// v1.0.70 在键盘可见期间把 contentOffset 强制钉回 .zero，本意是防 WebKit 把整页顶出屏幕。
    /// 实测副作用：WebKit 聚焦输入框时本来会自动把输入框滚进可视区，被这里锁死 →
    /// 输入框停在键盘后面，用户看不到自己输入的内容（P1-1）。
    ///
    /// 现在只在「整页被顶到屏幕上方」（contentOffset.y < 0，顶栏被顶出状态栏）时才钳回 0，
    /// 正向滚动一律放行，让输入框能滚到键盘正上方。
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if isOwnServicePage(url: webView?.url) {
            if scrollView.contentOffset.y != 0 {
                scrollView.contentOffset = CGPoint(x: scrollView.contentOffset.x, y: 0)
            }
        } else {
            guard isKeyboardVisible else { return }
            guard !scrollView.isTracking, !scrollView.isDragging, !scrollView.isDecelerating else { return }
            if scrollView.contentOffset.y < 0 {
                scrollView.contentOffset = CGPoint(x: scrollView.contentOffset.x, y: 0)
            }
        }
    }
}

// MARK: - 远程仓库自动/手动检查更新与巨魔(TrollStore)自动安装 (v1.0.87 弹簧缓动与反馈建议版)

extension ViewController: UIDocumentInteractionControllerDelegate {
    func documentInteractionControllerViewControllerForPreview(_ controller: UIDocumentInteractionController) -> UIViewController {
        return self
    }

    private struct AppReleaseInfo: Decodable {
        let version: String
        let build: Int?
        let title: String?
        let changelog: String?
        let tipa_url: String?
        let public_tipa_url: String?
        let release_url: String?
    }

    /// 国内 4G / WiFi 免代理极速实时镜像列表（排除 jsDelivr 等强缓存 CDN，确保获取到最新构建）
    private static let updateMetadataMirrorURLs: [String] = [
        "https://ghfast.top/https://raw.githubusercontent.com/liushQAQ/IOS/personal/releases/latest.json",
        "https://gh-proxy.com/https://raw.githubusercontent.com/liushQAQ/IOS/personal/releases/latest.json",
        "https://raw.gitmirror.com/liushQAQ/IOS/personal/releases/latest.json",
        "https://raw.githubusercontent.com/liushQAQ/IOS/personal/releases/latest.json"
    ]

    /// 将 GitHub 原始 TIPA 下载地址转换为国内免代理高速镜像地址列表
    private static func mirrorCandidates(for rawURL: String) -> [String] {
        guard !rawURL.isEmpty else { return [] }
        // 如果已经是代理地址，直接优先使用
        if rawURL.contains("ghfast.top") || rawURL.contains("gh-proxy.com") {
            return [rawURL]
        }
        let list: [String] = [
            "https://ghfast.top/\(rawURL)",
            "https://gh-proxy.com/\(rawURL)",
            rawURL
        ]
        return list
    }

    func checkForAppUpdates(manual: Bool = false) {
        let currentVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.87"
        let currentBuildStr = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        let currentBuild = Int(currentBuildStr) ?? 0

        var loadingAlert: UIAlertController?
        if manual {
            let alert = UIAlertController(title: "正在检查更新", message: "正在通过国内加速节点检查仓库最新构建…", preferredStyle: .alert)
            present(alert, animated: true)
            loadingAlert = alert
        }

        let mirrorURLs = Self.updateMetadataMirrorURLs
        let lock = NSLock()
        var bestInfo: AppReleaseInfo?
        var completedCount = 0
        var hasDispatched = false
        var lastError: Error?
        let total = mirrorURLs.count
        let ts = Int(Date().timeIntervalSince1970)

        func finishWithResult(info: AppReleaseInfo?) {
            lock.lock()
            if hasDispatched {
                lock.unlock()
                return
            }
            hasDispatched = true
            lock.unlock()

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                let done = {
                    if let valid = info {
                        self.handleFetchedReleaseInfo(valid, currentVer: currentVer, currentBuild: currentBuild, manual: manual)
                    } else if manual {
                        let msg = lastError?.localizedDescription ?? "所有加速节点均未响应，请检查网络连接。"
                        let alert = UIAlertController(title: "检查更新失败", message: "无法连接更新源：\(msg)", preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "确定", style: .default))
                        self.present(alert, animated: true)
                    }
                }
                if let loading = loadingAlert {
                    loading.dismiss(animated: true, completion: done)
                } else {
                    done()
                }
            }
        }

        for urlStr in mirrorURLs {
            let sep = urlStr.contains("?") ? "&" : "?"
            guard let url = URL(string: "\(urlStr)\(sep)_t=\(ts)") else {
                lock.lock()
                completedCount += 1
                if completedCount >= total && !hasDispatched {
                    lock.unlock()
                    finishWithResult(info: bestInfo)
                } else {
                    lock.unlock()
                }
                continue
            }

            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 6)
            req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

            URLSession.shared.dataTask(with: req) { data, resp, error in
                var validInfo: AppReleaseInfo?
                if error == nil,
                   let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode),
                   let data = data,
                   let decoded = try? JSONDecoder().decode(AppReleaseInfo.self, from: data) {
                    validInfo = decoded
                }

                lock.lock()
                completedCount += 1
                if let err = error { lastError = err }

                if let info = validInfo {
                    let incomingBuild = info.build ?? 0
                    let currentBestBuild = bestInfo?.build ?? -1
                    if incomingBuild > currentBestBuild {
                        bestInfo = info
                    }

                    // 如果已经获取到确切高于当前版本的最新版本，立刻完成响应
                    if incomingBuild > currentBuild {
                        lock.unlock()
                        finishWithResult(info: info)
                        return
                    }
                }

                if completedCount >= total {
                    lock.unlock()
                    finishWithResult(info: bestInfo)
                } else {
                    lock.unlock()
                }
            }.resume()
        }
    }

    private func handleFetchedReleaseInfo(_ info: AppReleaseInfo, currentVer: String, currentBuild: Int, manual: Bool) {
        let remoteVer = info.version
        let remoteBuild = info.build ?? 0

        let hasNewVersion: Bool = {
            if remoteBuild > currentBuild { return true }
            if remoteBuild == currentBuild && remoteVer.compare(currentVer, options: .numeric) == .orderedDescending {
                return true
            }
            return remoteVer.compare(currentVer, options: .numeric) == .orderedDescending
        }()

        let tipaURL = info.tipa_url ?? info.public_tipa_url ?? ""

        if hasNewVersion {
            presentNewVersionPrompt(info: info, currentVer: currentVer, currentBuild: currentBuild, tipaURL: tipaURL)
        } else if manual {
            let alert = UIAlertController(
                title: "✅ 当前已是最新版本",
                message: "当前版本：v\(currentVer) (Build \(currentBuild))\n仓库最新：v\(remoteVer) (Build \(remoteBuild))\n\n如有强制重装需求，也可通过国内加速通道重装最新包。",
                preferredStyle: .alert)
            if !tipaURL.isEmpty {
                alert.addAction(UIAlertAction(title: "🚀 重新下载并用巨魔安装 (免代理加速)", style: .default) { [weak self] _ in
                    self?.downloadAndInstallTIPA(remoteURLString: tipaURL, filename: "DSHios-public-\(remoteVer)-\(remoteBuild).tipa")
                })
            }
            alert.addAction(UIAlertAction(title: "好", style: .cancel))
            present(alert, animated: true)
        }
    }

    private func presentNewVersionPrompt(info: AppReleaseInfo, currentVer: String, currentBuild: Int, tipaURL: String) {
        let remoteVer = info.version
        let remoteBuild = info.build ?? 0
        let notes = info.changelog ?? info.title ?? "包含最新的移动端布局优化与功能修复。"

        let alert = UIAlertController(
            title: "🎉 发现新版本 v\(remoteVer) (Build \(remoteBuild))",
            message: "当前版本：v\(currentVer) (Build \(currentBuild))\n\n【更新说明】\n\(notes)\n\n推荐点击下方按钮，App 将通过免代理通道极速下载并自动调起巨魔安装（彻底避免 301 报错）。",
            preferredStyle: .alert
        )

        if !tipaURL.isEmpty {
            alert.addAction(UIAlertAction(title: "🚀 极速下载并用巨魔安装 (推荐·零报错)", style: .default) { [weak self] _ in
                self?.downloadAndInstallTIPA(remoteURLString: tipaURL, filename: "DSHios-public-\(remoteVer)-\(remoteBuild).tipa")
            })
            alert.addAction(UIAlertAction(title: "⚡ 巨魔一键直连安装", style: .default) { [weak self] _ in
                self?.installViaTrollStore(remoteURLString: tipaURL)
            })
        }

        if let rel = info.release_url, let relURL = URL(string: rel) {
            alert.addAction(UIAlertAction(title: "🌐 打开仓库页面", style: .default) { _ in
                UIApplication.shared.open(relURL)
            })
        }

        alert.addAction(UIAlertAction(title: "稍后提醒", style: .cancel))
        present(alert, animated: true)
    }

    func installViaTrollStore(remoteURLString: String) {
        let candidates = Self.mirrorCandidates(for: remoteURLString)
        let acceleratedURL = candidates.first(where: { $0.contains("ghfast.top") || $0.contains("gh-proxy.com") }) ?? candidates.first ?? remoteURLString

        // 巨魔直接打开 URL 遇到 301 重定向时会直接弹错 301；
        // 这里先用 URLSession 做一次 HEAD 预解析，解析出跟随重定向后的真实 200 终点直链
        guard let reqURL = URL(string: acceleratedURL) else {
            downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: "DSHios-public-latest.tipa")
            return
        }

        var req = URLRequest(url: reqURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 4)
        req.httpMethod = "HEAD"

        URLSession.shared.dataTask(with: req) { [weak self] _, resp, error in
            let finalTarget: String = {
                if let http = resp as? HTTPURLResponse, let finalURL = http.url?.absoluteString, !finalURL.isEmpty {
                    return finalURL
                }
                return acceleratedURL
            }()

            DispatchQueue.main.async {
                guard let encoded = finalTarget.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
                    self?.downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: "DSHios-public-latest.tipa")
                    return
                }

                let schemes = [
                    "apple-magnifier://install?url=\(encoded)",
                    "trollstore://install?url=\(encoded)"
                ]

                var didOpen = false
                let group = DispatchGroup()
                for s in schemes {
                    if let u = URL(string: s) {
                        group.enter()
                        UIApplication.shared.open(u, options: [:]) { success in
                            if success { didOpen = true }
                            group.leave()
                        }
                    }
                }

                group.notify(queue: .main) {
                    if !didOpen {
                        self?.downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: "DSHios-public-latest.tipa")
                    }
                }
            }
        }.resume()
    }

    private func downloadAndInstallTIPA(remoteURLString: String, filename: String) {
        let candidates = Self.mirrorCandidates(for: remoteURLString)
        guard !candidates.isEmpty else { return }

        let progressAlert = UIAlertController(title: "正在加速下载最新包", message: "正在通过国内镜像下载 \(filename)…\n进度：0%", preferredStyle: .alert)
        present(progressAlert, animated: true)

        let destURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: destURL)

        func tryDownload(index: Int) {
            guard index < candidates.count, let url = URL(string: candidates[index]) else {
                DispatchQueue.main.async {
                    progressAlert.dismiss(animated: true) { [weak self] in
                        let alert = UIAlertController(title: "下载失败", message: "所有国内加速镜像节点均无法下载，请稍后重试。", preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "好", style: .default))
                        self?.present(alert, animated: true)
                    }
                }
                return
            }

            var observation: NSKeyValueObservation?
            let task = URLSession.shared.downloadTask(with: url) { [weak self] localURL, resp, error in
                observation?.invalidate()
                let statusOK = (resp as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } ?? false
                if error != nil || !statusOK || localURL == nil {
                    // 当前镜像失败，自动无缝切换到下一个备用加速镜像
                    tryDownload(index: index + 1)
                    return
                }
                guard let localURL = localURL else { return }
                do {
                    try? FileManager.default.removeItem(at: destURL)
                    try FileManager.default.moveItem(at: localURL, to: destURL)
                    DispatchQueue.main.async {
                        progressAlert.dismiss(animated: true) {
                            self?.openDownloadedTIPA(fileURL: destURL)
                        }
                    }
                } catch {
                    tryDownload(index: index + 1)
                }
            }

            observation = task.progress.observe(\.fractionCompleted) { progress, _ in
                DispatchQueue.main.async {
                    let pct = Int(progress.fractionCompleted * 100)
                    progressAlert.message = "正在通过国内免代理通道下载最新公开版…\n进度：\(pct)%"
                }
            }
            task.resume()
        }

        tryDownload(index: 0)
    }

    private func openDownloadedTIPA(fileURL: URL) {
        // 先尝试通过本地 URL Scheme 唤起巨魔直接安装
        if let encoded = fileURL.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let tsURL = URL(string: "apple-magnifier://install?url=\(encoded)") {
            UIApplication.shared.open(tsURL, options: [:]) { [weak self] success in
                if !success {
                    self?.presentShareForFile(fileURL)
                }
            }
        } else {
            presentShareForFile(fileURL)
        }
    }

    private func presentShareForFile(_ fileURL: URL) {
        let docController = UIDocumentInteractionController(url: fileURL)
        docController.delegate = self
        if !docController.presentOpenInMenu(from: menuButton?.bounds ?? view.bounds, in: menuButton ?? view, animated: true) {
            let act = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            act.popoverPresentationController?.sourceView = menuButton ?? view
            present(act, animated: true)
        }
    }
}

// MARK: - iOS 设备安全区标准值对照表（Apple 公开规范，v1.0.105）

/// 机型 → 安全区标准值（竖屏，单位 pt）。
///
/// **为什么需要它**：`view.safeAreaInsets` 由系统实时给出、平时最准，但在这些场景会读到 0：
///   ① 页面极早阶段视图尚未完成布局；② 部分 iPad 分屏 / 老旧系统上安全区上报滞后。
/// 读到 0 就会把「顶栏应留 59pt」错算成 0 → 顶栏贴进状态栏（历史截图：标志被电量图标压住）。
///
/// **取值策略（重要，勿改）**：
///   - **系统值 > 0 一律以系统值为准** —— 横屏、分屏、新机型、未来机型都能自动跟上，无需改代码；
///   - **仅在系统值异常为 0 且处于竖屏时**，才按机型查本表兜底；
///   - 横屏 iPhone 状态栏本就隐藏（系统值 0 是正确的），**不做兜底**，否则会凭空多出留白。
///
/// 数据来源：Apple Human Interface Guidelines 与各机型公开实测值。
enum iOSSafeArea {

    struct Inset {
        /// 状态栏 / 刘海 / 灵动岛预留高度
        let top: CGFloat
        /// Home Indicator 预留高度
        let bottom: CGFloat
    }

    /// 当前硬件标识符，如 "iPhone15,3"（iPhone 14 Pro Max）
    static var machineIdentifier: String {
        #if targetEnvironment(simulator)
        return ProcessInfo().environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "Simulator"
        #else
        var info = utsname()
        uname(&info)
        return Mirror(reflecting: info.machine).children.reduce("") { acc, el in
            guard let v = el.value as? Int8, v != 0 else { return acc }
            return acc + String(UnicodeScalar(UInt8(v)))
        }
        #endif
    }

    /// 机型对应的中文名（用于设置页/日志核对；未知机型返回标识符本身）
    static var machineDisplayName: String {
        let id = machineIdentifier
        if let n = displayNames[id] { return n }
        if id.hasPrefix("iPhone") { return "iPhone (未知机型 \(id))" }
        if id.hasPrefix("iPad") { return "iPad (未知机型 \(id))" }
        return id
    }

    /// iPhone 全系竖屏标准安全区
    static let iPhone: [String: Inset] = [
        // ── 有 Home 键：顶 20 / 底 0 ──
        "iPhone8,1": Inset(top: 20, bottom: 0),   // 6s
        "iPhone8,2": Inset(top: 20, bottom: 0),   // 6s Plus
        "iPhone8,4": Inset(top: 20, bottom: 0),   // SE 1
        "iPhone9,1": Inset(top: 20, bottom: 0),   // 7
        "iPhone9,2": Inset(top: 20, bottom: 0),   // 7 Plus
        "iPhone9,3": Inset(top: 20, bottom: 0),   // 7
        "iPhone9,4": Inset(top: 20, bottom: 0),   // 7 Plus
        "iPhone10,1": Inset(top: 20, bottom: 0),  // 8
        "iPhone10,2": Inset(top: 20, bottom: 0),  // 8 Plus
        "iPhone10,4": Inset(top: 20, bottom: 0),  // 8
        "iPhone10,5": Inset(top: 20, bottom: 0),  // 8 Plus
        "iPhone12,8": Inset(top: 20, bottom: 0),  // SE 2
        "iPhone14,6": Inset(top: 20, bottom: 0),  // SE 3
        // ── 刘海屏：底 34 ──
        "iPhone10,3": Inset(top: 44, bottom: 34), // X
        "iPhone10,6": Inset(top: 44, bottom: 34), // X
        "iPhone11,2": Inset(top: 44, bottom: 34), // XS
        "iPhone11,4": Inset(top: 44, bottom: 34), // XS Max
        "iPhone11,6": Inset(top: 44, bottom: 34), // XS Max
        "iPhone11,8": Inset(top: 48, bottom: 34), // XR
        "iPhone12,1": Inset(top: 48, bottom: 34), // 11
        "iPhone12,3": Inset(top: 44, bottom: 34), // 11 Pro
        "iPhone12,5": Inset(top: 44, bottom: 34), // 11 Pro Max
        "iPhone13,1": Inset(top: 50, bottom: 34), // 12 mini
        "iPhone13,2": Inset(top: 47, bottom: 34), // 12
        "iPhone13,3": Inset(top: 47, bottom: 34), // 12 Pro
        "iPhone13,4": Inset(top: 47, bottom: 34), // 12 Pro Max
        "iPhone14,2": Inset(top: 47, bottom: 34), // 13 Pro
        "iPhone14,3": Inset(top: 47, bottom: 34), // 13 Pro Max
        "iPhone14,4": Inset(top: 50, bottom: 34), // 13 mini
        "iPhone14,5": Inset(top: 47, bottom: 34), // 13
        "iPhone14,7": Inset(top: 47, bottom: 34), // 14
        "iPhone14,8": Inset(top: 47, bottom: 34), // 14 Plus
        // ── 灵动岛：顶 59（16 Pro 为 62）/ 底 34 ──
        "iPhone15,2": Inset(top: 59, bottom: 34), // 14 Pro
        "iPhone15,3": Inset(top: 59, bottom: 34), // 14 Pro Max
        "iPhone15,4": Inset(top: 59, bottom: 34), // 15
        "iPhone15,5": Inset(top: 59, bottom: 34), // 15 Plus
        "iPhone16,1": Inset(top: 59, bottom: 34), // 15 Pro
        "iPhone16,2": Inset(top: 59, bottom: 34), // 15 Pro Max
        "iPhone17,1": Inset(top: 62, bottom: 34), // 16 Pro
        "iPhone17,2": Inset(top: 62, bottom: 34), // 16 Pro Max
        "iPhone17,3": Inset(top: 59, bottom: 34), // 16
        "iPhone17,4": Inset(top: 59, bottom: 34), // 16 Plus
        "iPhone17,5": Inset(top: 59, bottom: 34), // 16e
    ]

    /// 带 Home Indicator 的 iPad（2018 年 iPad Pro 及之后的全面屏款）
    static let iPadWithIndicator: Set<String> = [
        "iPad8,1", "iPad8,2", "iPad8,3", "iPad8,4", "iPad8,5", "iPad8,6", "iPad8,7", "iPad8,8",
        "iPad8,9", "iPad8,10", "iPad8,11", "iPad8,12",
        "iPad13,1", "iPad13,2", "iPad13,4", "iPad13,5", "iPad13,6", "iPad13,7",
        "iPad13,8", "iPad13,9", "iPad13,10", "iPad13,11", "iPad13,16", "iPad13,17", "iPad13,18", "iPad13,19",
        "iPad14,1", "iPad14,2", "iPad14,3", "iPad14,4", "iPad14,5", "iPad14,6",
        "iPad14,8", "iPad14,9", "iPad14,10", "iPad14,11",
        "iPad16,3", "iPad16,4", "iPad16,5", "iPad16,6",
    ]

    /// 机型标识 → 展示名（用于核对「检测到的是什么机器」）
    static let displayNames: [String: String] = [
        "iPhone14,6": "iPhone SE (3rd gen)",
        "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus",
        "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus",
        "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max",
        "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,5": "iPhone 16e",
        "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12",
        "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,2": "iPhone 13 Pro", "iPhone14,3": "iPhone 13 Pro Max",
        "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13",
        "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max",
        "iPhone11,2": "iPhone XS", "iPhone11,4": "iPhone XS Max", "iPhone11,8": "iPhone XR",
        "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X",
        "iPhone12,8": "iPhone SE (2nd gen)",
        "iPad14,1": "iPad mini (6th gen)", "iPad14,2": "iPad mini (6th gen)",
        "iPad16,3": "iPad Pro 11-inch (M4)", "iPad16,4": "iPad Pro 11-inch (M4)",
        "iPad16,5": "iPad Pro 13-inch (M4)", "iPad16,6": "iPad Pro 13-inch (M4)",
        "iPad14,3": "iPad Pro 11-inch (4th gen)", "iPad14,4": "iPad Pro 11-inch (4th gen)",
        "iPad14,5": "iPad Pro 12.9-inch (6th gen)", "iPad14,6": "iPad Pro 12.9-inch (6th gen)",
        "iPad13,18": "iPad (10th gen)", "iPad13,19": "iPad (10th gen)",
        "iPad14,8": "iPad Air 11-inch (M2)", "iPad14,9": "iPad Air 11-inch (M2)",
        "iPad14,10": "iPad Air 13-inch (M2)", "iPad14,11": "iPad Air 13-inch (M2)",
    ]

    /// 按机型给出竖屏标准安全区；未知机型返回 nil
    static func standard() -> Inset? {
        let id = machineIdentifier
        if id.hasPrefix("iPhone") { return iPhone[id] }
        if id.hasPrefix("iPad") {
            // 现代 iPad 竖屏：状态栏 24pt；全面屏款底部另有 20pt Home Indicator
            return Inset(top: 24, bottom: iPadWithIndicator.contains(id) ? 20 : 0)
        }
        return nil
    }

    /// 实际生效的顶部预留：系统值优先，系统值异常为 0 且竖屏时用机型表兜底。
    static func effectiveTop(systemTop: CGFloat, isPortrait: Bool) -> CGFloat {
        if systemTop > 1 { return systemTop }
        guard isPortrait else { return systemTop }
        return standard()?.top ?? systemTop
    }

    /// 实际生效的底部预留：系统值优先，异常为 0 时用机型表兜底。
    static func effectiveBottom(systemBottom: CGFloat) -> CGFloat {
        if systemBottom > 1 { return systemBottom }
        return standard()?.bottom ?? systemBottom
    }

    /// 一行摘要，便于在日志 / 设置页核对"检测到什么机型、取到什么值"
    static func debugSummary(systemTop: CGFloat, systemBottom: CGFloat, isPortrait: Bool) -> String {
        let id = machineIdentifier
        let std = standard()
        let effTop = effectiveTop(systemTop: systemTop, isPortrait: isPortrait)
        let effBottom = effectiveBottom(systemBottom: systemBottom)
        return "device=\(id)(\(machineDisplayName)) portrait=\(isPortrait) "
            + "system=(\(Int(systemTop)),\(Int(systemBottom))) "
            + "standard=\(std.map { "(\(Int($0.top)),\(Int($0.bottom)))" } ?? "nil") "
            + "effective=(\(Int(effTop)),\(Int(effBottom)))"
    }

    /// 设置页自检摘要：只讲"检测到啥机型、标准值是多少"，不掺入运行时系统值
    static func selfCheckSummary() -> String {
        let id = machineIdentifier
        guard let s = standard() else {
            return "\(machineDisplayName)（\(id)）· 未知机型，按系统实时安全区自适应"
        }
        return "\(machineDisplayName)（\(id)）· 标准安全区 顶 \(Int(s.top))pt / 底 \(Int(s.bottom))pt"
    }
}

