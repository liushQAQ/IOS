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
    /// 记录进入后台/锁屏的时间戳，用于精准判断锁屏时长并秒级自愈恢复联通
    private var lastEnterBackgroundTime: Date = Date()

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
          return JSON.stringify({ rootLen: len, rootKids: kids, withResolvers: hasBR, at: hasAt, hasOwn: hasOwn, toSorted: hasTS });
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
                let details = [
                    "#root 文本长度=\(info["rootLen"] ?? "?") 子节点数=\(info["rootKids"] ?? "?")",
                    "API: withResolvers=\(info["withResolvers"] ?? "?") at=\(info["at"] ?? "?") hasOwn=\(info["hasOwn"] ?? "?") toSorted=\(info["toSorted"] ?? "?")"
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

    private var webErrors: [String] = []
    /// Web 内容进程被系统回收的次数（内存压力导致白屏的重要嫌疑指标）。
    private var terminateCount = 0

    /// 默认加载地址：DSH Pocket（桌面端 LAN 代理，明文 HTTP，免密码）。
    /// 桌面端主控运行在 3083（DSH Desktop GUI 进程，持有全量活会话）。
    #if PUBLIC_BUILD
    private let defaultURL = "http://192.168.1.100:3083/"
    #else
    private let defaultURL = "http://192.168.215.218:3083/"
    #endif

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
            '  padding-left: 42px !important;',
            '  padding-right: 0 !important;',
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
            '.ank0OG_titleCluster,',
            '[data-phase] header [class*="titleCluster"] {',
            '  flex: 0 0 auto !important;',
            '  width: auto !important;',
            '  margin-left: auto !important;',
            '  min-width: 0 !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  gap: 6px !important;',
            '  height: 32px !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '  box-sizing: border-box !important;',
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
            '  min-width: 0 !important;',
            '  max-width: 120px !important;',
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
            '  max-width: 110px !important;',
            '  overflow: hidden !important;',
            '  padding: 0 4px !important;',
            '}',
            '._1Ihh1G_count {',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  font-size: 11px !important;',
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
            /* 2. 修复右侧边栏(文件/终端/浏览器/文档预览)在移动端展开后遮挡且缺乏快捷退出按钮 */
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
            '/* 4. 修复底部 token 用量及统计胶囊在手机端过宽溢出、需要横向滑动的严重体验问题 */',
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

              // 如果用户点击的是 + 号按钮或命令弹窗菜单内部，严禁唤起虚拟键盘
              if (target.closest('.uWtHQG_add') || target.closest('[data-trigger-menu]') || target.closest('.bqwvaa_menu')) {
                allowUserTouchFocus = false;
                return;
              }

              var inputEl = target.closest('.uWtHQG_input') ||
                            target.closest('[contenteditable="true"]') ||
                            target.closest('textarea') ||
                            target.closest('.VYXhfG_search') ||
                            target.closest('input[role="searchbox"]') ||
                            target.closest('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"])');

              // v1.0.86：豆包验证码是点外层格子，再由页面自己调用 focus()。
              // 点的位置附近有输入框，也算用户主动要输入，放行随后的聚焦，键盘才能弹。
              if (!inputEl && e.touches && e.touches.length) {
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

            // 自动为弹出命令/选项菜单右上角挂载明显的 ✕ 关闭按钮，方便随时轻触关闭
            setInterval(function() {
              var menu = document.querySelector('.bqwvaa_menu, [data-trigger-menu]');
              if (!menu) return;
              if (menu.querySelector('.dsh-mobile-menu-close-btn')) return;

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
            }, 150);

            // 监听 blur 事件捕获阶段：当搜索框失去焦点（比如用户轻触关闭软键盘、完成输入）时，
            // 阻止该 blur 冒泡或把 relatedTarget 视作自身容器内部，避免 ModelSelect 触发 onBlur -> close()
            window.addEventListener('blur', function(e) {
              if (e.target && e.target.classList && (e.target.classList.contains('VYXhfG_search') || e.target.getAttribute('role') === 'searchbox')) {
                e.stopImmediatePropagation();
              }
            }, true);

            // 同时监听 focusout 事件
            document.addEventListener('focusout', function(e) {
              if (e.target && e.target.classList && (e.target.classList.contains('VYXhfG_search') || e.target.getAttribute('role') === 'searchbox')) {
                // 如果菜单依然在屏幕上，阻止冒泡以防止外部组件认为点击了菜单外部而全部关闭
                var menu = e.target.closest('.VYXhfG_menu') || document.querySelector('.VYXhfG_menu');
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

              var observer = new MutationObserver(function() {
                scanAndAdjust();
              });
              // documentStart 时 document.body 可能尚未创建，等待就绪后再观察（v1.0.70 修复）
              function observeBodyForWatchdog() {
                if (!document.body) { setTimeout(observeBodyForWatchdog, 16); return; }
                observer.observe(document.body, { childList: true, subtree: true });
              }
              observeBodyForWatchdog();

              window.addEventListener('resize', scanAndAdjust, { passive: true });
              window.addEventListener('scroll', scanAndAdjust, { passive: true, capture: true });
              setInterval(scanAndAdjust, 200);
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
        // 2. 正则先行/后行断言 RegExp Lookbehind 容错，防止 iOS 15 解析 ES2022+ 正则时抛 SyntaxError
        // 3. String.prototype.replaceAll, Array.prototype.at 补齐
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
            window.__dshReportError('未处理Promise拒绝: ' + (r && r.message ? r.message : String(r)));
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
              shareBtn.style.cssText = 'height:24px;padding:0 8px;font-size:12px;display:inline-flex;align-items:center;gap:4px;border-radius:6px;border:none;background:var(--dsw-alias-interactive-bg-hover, rgba(125,125,125,0.18));color:var(--dsw-alias-brand-primary, #007aff);font-weight:500;cursor:pointer;margin-left:auto;flex-shrink:0;';
              shareBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg><span>分享</span>';

              shareBtn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                // 优先取卡片上关联的绝对路径
                var currentPath = previewBtn ? (previewBtn.getAttribute('title') || '') : filePath;
                shareFileByPath(currentPath, fileName);
              });

              // 将按钮添加到卡片头部或尾部操作区
              var fileBody = card.querySelector('.JZoinq_fileBody');
              if (fileBody) {
                fileBody.appendChild(shareBtn);
              } else {
                card.appendChild(shareBtn);
              }
            });
          }

          // 动态注入 2：向工作区文档预览工具栏（.YdIzba_header）追加「分享」按钮
          function enrichPreviewHeader() {
            var headers = document.querySelectorAll('.YdIzba_header');
            headers.forEach(function(header) {
              if (header.querySelector('.dsh-mobile-download-btn')) return;
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'dsh-mobile-download-btn';
              btn.setAttribute('title', '分享 / 保存到手机');
              btn.style.cssText = 'height:26px;padding:0 9px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:5px;border-radius:6px;border:none;background:var(--dsw-alias-brand-primary, #007aff);color:#ffffff;cursor:pointer;margin-left:auto;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.15);';
              btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg><span>分享到手机</span>';
              
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var pathLabel = header.querySelector('.YdIzba_path') || document.querySelector('[data-textpreview-path]');
                var rawPath = pathLabel ? (pathLabel.getAttribute('title') || pathLabel.innerText || '').trim() : '';
                if (!rawPath) {
                  var textPreviewEl = document.querySelector('[data-textpreview-url]');
                  var resourceUrl = textPreviewEl ? textPreviewEl.getAttribute('data-textpreview-url') : '';
                  if (resourceUrl && resourceUrl.startsWith('dsh-resource://file/')) {
                    var prefix = 'dsh-resource://file/session/';
                    var idx = resourceUrl.indexOf(prefix);
                    if (idx !== -1) {
                      var rest = resourceUrl.substring(idx + prefix.length);
                      var slashIdx = rest.indexOf('/');
                      if (slashIdx !== -1) {
                        var encodedPath = rest.substring(slashIdx + 1);
                        try { rawPath = decodeURIComponent(encodedPath); } catch (e) { rawPath = encodedPath; }
                      }
                    }
                  }
                }
                var fname = rawPath ? rawPath.split(/[\\\\/]/).pop() : 'file_' + Date.now();

                if (rawPath) {
                  shareFileByPath(rawPath, fname);
                }
              });
              header.appendChild(btn);
            });
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
            '  /* v1.0.82：iPhone 14 Pro Max 状态栏 54pt。之前用下发值再加一截，',
            '     顶栏被顶得离状态栏很远。这里只留 6px，状态栏那一截由 --dsh-statusbar 单独撑。 */',
            '  padding: 6px 8px 0 8px !important;',
            '  min-height: 0 !important;',
            '  flex: none !important;',
            '  box-sizing: border-box !important;',
            '  max-width: 100vw !important;',
            '  overflow: hidden !important;',
            '  /* v1.0.82：顶栏背景透明。之前刷的 #f5f5f7 在新建会话页是一整块灰，用户不要。 */',
            '  background: transparent !important;',
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
            '  margin-left: 4px !important;',
            '}',
            '',
            '/* v1.0.83：打开目录被挪进标题行后也命中了这条，被压成 32px，',
            '   和页面自带的 38px 按钮叠在一起。把它排除，保留原始尺寸。 */',
            '[data-phase] header [class*="titleRow"] button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]),',
            '[data-phase] header [class*="titleRow"] [role="button"]:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]),',
            'button[aria-label="智能体团队"],',
            'button[aria-label="更多操作"],',
            'button[aria-label="打开右侧边栏"],',
            'button[aria-label="收起右侧边栏"],',
            'button[aria-label="文件浏览"],',
            '.ank0OG_headerActions button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]),',
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
            '/* v1.0.74：实测「文件浏览」(data-mobile-nav=files) 与「打开右侧边栏」同在 x=350 完全重叠。',
            '   页面自身用属性选择器把它设成 display:flex，必须用同级属性选择器才能压住。 */',
            'button[aria-label="文件浏览"],',
            '[data-mobile-nav="files"] {',
            '  display: none !important;',
            '}',
            '',
            '/* v1.0.74：实测「智能体团队」x=107 与「打开目录」x=71 互相压住。',
            '   这两个按钮本不在同一个 flex 行里，强制放进标题行并排。 */',
            'button[aria-label="智能体团队"] {',
            '  position: static !important;',
            '  order: 2 !important;',
            '}',
            '',
            '[data-phase] header [class*="crumbs"],',
            '.ank0OG_crumbs {',
            '  flex: 0 1 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: 48vw !important;',
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
            '  margin-top: 2px !important;',
            '  flex: none !important;',
            '  max-width: 100% !important;',
            '}',
            '',
            '/* v1.0.83：左侧侧边栏打开后宽度按 75% 缩放（从 280px 缩放至 210px，舒展适屏） */',
            '[class*="sidebarCol"],',
            '.CZPbNW_sidebarCol,',
            '[class*="WYye1W_root"],',
            '.WYye1W_root {',
            '  width: 210px !important;',
            '  max-width: 210px !important;',
            '  min-width: 0 !important;',
            '  box-sizing: border-box !important;',
            '  overflow-x: hidden !important;',
            '}',
            '[class*="WYye1W_logoRow"],',
            '[class*="WYye1W_newSession"],',
            '[class*="WYye1W_panelList"],',
            '[class*="WYye1W_regionArea"],',
            '[class*="WYye1W_footArea"] {',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  box-sizing: border-box !important;',
            '  overflow-x: hidden !important;',
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
            '/* v1.0.83：会话消息内容区 (viewArea) 底部留足裕量，避免悬浮输入框和键盘上浮遮挡思考中与流式输出 */',
            '[class*="viewArea"],',
            '.ank0OG_viewArea {',
            '  padding-bottom: var(--dsh-viewarea-pb, 90px) !important;',
            '  box-sizing: border-box !important;',
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
          // v1.0.76：原生侧把状态栏高度（CSS 像素）下发到这里。
          // 写成 CSS 变量，顶栏 padding 用它，换机型、转屏都跟着变。
          window.__dshSetStatusBar = function (px) {
            var h = Math.max(0, px || 0);
            document.documentElement.style.setProperty('--dsh-statusbar', h + 'px');
            // v1.0.82：顶栏只在状态栏下面留这一截，不再叠加 padding。
            var headers = document.querySelectorAll('header');
            for (var i = 0; i < headers.length; i++) {
              headers[i].style.setProperty('margin-top', h + 'px', 'important');
              headers[i].style.setProperty('background', 'transparent', 'important');
            }
            // 侧栏同样只让出状态栏高度。
            var cols = document.querySelectorAll('[class*="sidebarCol"]');
            for (var j = 0; j < cols.length; j++) {
              cols[j].style.setProperty('padding-top', h + 'px', 'important');
              cols[j].style.setProperty('background', 'transparent', 'important');
            }
            // v1.0.82：新建会话页的灰是 body 和空标签容器的底色，全部清成透明，不留任何颜色。
            document.body.style.setProperty('background', 'transparent', 'important');
            var hosts = document.querySelectorAll('[class*="_emptyTabHost"], [class*="CZPbNW_frame"], [class*="ank0OG_root"]');
            for (var k = 0; k < hosts.length; k++) {
              hosts[k].style.setProperty('background', 'transparent', 'important');
            }
          };
          // v1.0.77：顶栏顺序固定为
          //   目录按钮（靠最左）— 会话标题（居中）— 智能体按钮 — 右侧边栏按钮（靠最右，不动）。
          // 页面原始顺序是「标题、目录、智能体」且三者都在标题簇里，样式表改不动顺序，
          // 所以直接重排 DOM：目录按钮提到标题行第一个，标题簇只留标题和智能体并居中。
          // 内联 !important 才能压住页面后注入的样式。
          // v1.0.81：侧栏打开时，页面在 overlayLayer 里铺一层 rgba(0,0,0,0.45) 的遮罩，
          // 把侧栏右边的内容盖成发白发灰。清成全透明，让后面的按钮原样露出来。
          function clearSidebarOverlay() {
            var layers = document.querySelectorAll('[class*="overlayLayer"]');
            for (var i = 0; i < layers.length; i++) {
              var nodes = layers[i].querySelectorAll('*');
              for (var j = 0; j < nodes.length; j++) {
                nodes[j].style.setProperty('background', 'transparent', 'important');
                nodes[j].style.setProperty('background-color', 'transparent', 'important');
              }
            }
          }
          function applySidebarInset() {
            clearSidebarOverlay();
            var raw = getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar');
            var h = parseFloat(raw);
            if (!(h > 0)) return;
            var cols = document.querySelectorAll('[class*="sidebarCol"]');
            for (var i = 0; i < cols.length; i++) cols[i].style.setProperty('padding-top', h + 'px', 'important');
          }
          function shiftTitleCluster() {
            try { applySidebarInset(); } catch (e) {}
            var rows = document.querySelectorAll('[class*="titleRow"]');
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              var cluster = row.querySelector('[class*="titleCluster"]');
              var header = row.closest('header') || row;
              var dir = header.querySelector('button[aria-label="打开目录"], button[aria-label="收起目录"], button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
              // v1.0.84：按钮要在会话标题左边。它裹在 headerActions 容器里，容器排在标题后面，
              // 所以按钮跟着跑到了标题右边。把按钮从容器里提出来，放到标题簇第一个。
              if (dir && cluster && cluster.firstChild !== dir) cluster.insertBefore(dir, cluster.firstChild);
              // v1.0.85：滑出屏幕左边的侧栏残留按钮隐藏，避免新建会话页左上角多露一截。
              var stray = document.querySelectorAll('button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
              for (var s = 0; s < stray.length; s++) {
                var off = stray[s].getBoundingClientRect().right < 0;
                stray[s].style.setProperty('visibility', off ? 'hidden' : '', 'important');
              }
              if (dir) {
                dir.style.setProperty('margin-left', '0', 'important');
                dir.style.setProperty('margin-right', '0', 'important');
                dir.style.setProperty('order', '0', 'important');
              }
              if (cluster) {
                cluster.style.setProperty('flex', '1 1 auto', 'important');
                cluster.style.setProperty('width', 'auto', 'important');
                // v1.0.85：标题和智能体往右移，和最左边的目录按钮拉开距离。
                cluster.style.setProperty('padding-left', '56px', 'important');
                // v1.0.84：从左往右排，目录按钮靠最左，标题紧跟在它右边。不再居中。
                cluster.style.setProperty('justify-content', 'flex-start', 'important');
              }
            }
          }
          shiftTitleCluster();
          // 会话页的顶栏是点进会话后才渲染的，加载时跑一次会落空，定时再跑。
          setInterval(shiftTitleCluster, 400);
          var moShift = new MutationObserver(shiftTitleCluster);
          function watchShift() {
            var root = document.body || document.documentElement;
            if (!root) { setTimeout(watchShift, 50); return; }
            moShift.observe(root, { childList: true, subtree: true });
          }
          watchShift();
          // v1.0.74：文件夹按钮（data-mobile-nav=files）与右侧边栏按钮重叠。
          // 页面用运行时样式把它设成 display:flex，!important 都压不住，直接从 DOM 移除，
          // 并用观察器防止页面重渲染时把它加回来。
          function dropFilesButton() {
            var nodes = document.querySelectorAll('[data-mobile-nav="files"]');
            for (var i = 0; i < nodes.length; i++) {
              if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
            }
          }
          dropFilesButton();
          var mo = new MutationObserver(dropFilesButton);
          function watch() {
            var root = document.body || document.documentElement;
            if (!root) { setTimeout(watch, 50); return; }
            mo.observe(root, { childList: true, subtree: true });
          }
          watch();

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
        // v1.0.73 键盘抬升：原生侧把键盘遮挡高度（CSS 像素）下发给这里。
        // 实测 DSH 的输入区不在任何可滚动容器里（外层 centerCol 是 overflow:hidden），
        // 滚不动 —— 所以直接把「输入区 + 正在编辑的输入框」用 transform 上移到键盘正上方。
        // 顶栏不在被移动的元素里，保持原位不动。
        """
        (function () {
          var inset = 0;
          var moved = [];

          function targets() {
            var list = [];
            var box = document.querySelector('[class*="uWtHQG_root"]');
            if (box) list.push(box);
            var ae = document.activeElement;
            if (ae && ae !== document.body &&
                (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
              if (!box || !box.contains(ae)) list.push(ae);
            }
            return list;
          }

          function applyShift(el, shift) {
            if (!el.hasAttribute('data-dsh-kb-base')) {
              el.setAttribute('data-dsh-kb-base', el.style.transform || '');
            }
            var origin = el.getAttribute('data-dsh-kb-base');
            el.style.transform = (origin ? origin + ' ' : '') + 'translateY(' + (-shift) + 'px)';
            el.setAttribute('data-dsh-kb-shift', String(shift));
          }

          function clearShift(el) {
            if (!el.hasAttribute('data-dsh-kb-base')) return;
            el.style.transform = el.getAttribute('data-dsh-kb-base');
            el.removeAttribute('data-dsh-kb-base');
            el.removeAttribute('data-dsh-kb-shift');
          }

          function updateScrollPadding(extraShift) {
            var viewArea = document.querySelector('[class*="viewArea"], .ank0OG_viewArea');
            var scroller = document.querySelector('[class*="scrollBody"], .ank0OG_scrollBody');
            // 重要：padding-bottom 只能加在消息内容区 viewArea 上（绝不能加在 scroller 上，否则会把 sticky bottom:0 的输入框挤到顶部屏幕外！）
            var pb = inset > 0 ? ((extraShift || 0) + 120) : 90;
            if (viewArea) {
              viewArea.style.setProperty('--dsh-viewarea-pb', pb + 'px');
              viewArea.style.setProperty('padding-bottom', pb + 'px', 'important');
            }
            if (scroller && inset > 0) {
              setTimeout(function () {
                scroller.scrollTop = scroller.scrollHeight;
              }, 80);
            }
          }

          function lift() {
            var next = targets();
            if (inset <= 0) {
              moved.forEach(clearShift);
              moved = [];
              updateScrollPadding(0);
              return;
            }
            // 原生层 WKWebView 已通过 webViewBottomConstraint 压缩高度避让键盘，
            // 视口 window.innerHeight 此时已经收缩为（932 - inset）高度；
            // 内部输入框通过 position: sticky; bottom: 0 自动停留在键盘顶边缘！
            // 此时只需要给消息流 viewArea 追加动态 padding-bottom，防止消息被 sticky 贴底的输入框盖住，
            // 绝对不可对输入框自身盲目叠加二次 translateY（否则会直接将输入框推至顶栏外）！
            moved.forEach(clearShift);
            moved = [];
            updateScrollPadding(0);
          }

          window.__dshSetKeyboardInset = function (px) {
            inset = Math.max(0, px || 0);
            lift();
          };
          document.addEventListener('focusin', function () { setTimeout(lift, 60); }, true);
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
    ///
    /// v1.0.73 修正：v1.0.70 只压 WebView 高度，但页内 `html,body{position:fixed;overflow:hidden}`
    /// 把整页钉死、内部滚动容器又用 100vh，压缩后输入框仍停在键盘后面（用户实测「看不到输入了什么」）。
    /// 现在压缩的同时把遮挡高度下发给页内脚本，由脚本把焦点输入框 / 输入区滚到键盘正上方。
    @objc private func keyboardFrameWillChange(_ note: Notification) {
        guard let endFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let kbInView = view.convert(endFrame, from: nil)
        let isHide = note.name == UIResponder.keyboardWillHideNotification || kbInView.minY >= view.bounds.height - 1
        let overlap: CGFloat = isHide ? 0 : max(0, view.bounds.height - kbInView.minY)
        isKeyboardVisible = overlap > 0
        keyboardOverlap = overlap

        let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        let curveRaw = note.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt ?? 7
        let options: UIView.AnimationOptions = [UIView.AnimationOptions(rawValue: curveRaw << 16), .beginFromCurrentState]
        webViewBottomConstraint.constant = -overlap
        view.setNeedsLayout()
        UIView.animate(withDuration: duration, delay: 0, options: options) {
            self.view.layoutIfNeeded()
        }
        notifyKeyboardInset(overlap)
    }

    /// 把键盘遮挡高度（CSS 像素）下发给页内脚本，触发「把输入框滚到键盘上方」。
    /// 键盘动画期间再补一次，避免首帧布局还没稳定时滚动落空。
    private func notifyKeyboardInset(_ overlap: CGFloat) {
        let px = Int((overlap / max(1, UIScreen.main.scale)).rounded())
        let js = "window.__dshSetKeyboardInset && window.__dshSetKeyboardInset(\(px));"
        webView.evaluateJavaScript(js) { _, _ in }
        guard overlap > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self, self.keyboardOverlap > 0 else { return }
            self.webView.evaluateJavaScript(js) { _, _ in }
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
        let px = Int(view.safeAreaInsets.top.rounded())
        let js = "window.__dshSetStatusBar && window.__dshSetStatusBar(\(px));"
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

        let services = ServiceStore.load()
        let currentURL = webView.url?.absoluteString ?? UserDefaults.standard.string(forKey: Keys.lastURL) ?? ""
        let currentComps = URLComponents(string: currentURL)

        for item in services.prefix(6) {
            let isSelected: Bool = {
                if item.url == currentURL { return true }
                if let itemComps = URLComponents(string: item.url), let currentComps {
                    if itemComps.host == currentComps.host && itemComps.port == currentComps.port {
                        return true
                    }
                }
                return false
            }()

            let title = isSelected ? "🔴 \(item.name) (当前)" : item.name
            let action = UIAlertAction(title: title, style: .default) { [weak self] _ in
                guard let self else { return }
                // 外网入口先回局域网换最新 token 再打开，避免用过期 token 撞 401。
                ServiceResolver.resolve(item) { url in
                    // 强制新建连接，彻底切断锁屏后的卡死管道
                    self.loadURLString(url, markAsDSHService: true, forceReconnect: true)
                }
            }
            if isSelected {
                // 如果系统支持，将字体颜色设置为红色强调（利用 responds(to:) 保护防止低版本 iOS KVC 闪退）
                if action.responds(to: NSSelectorFromString("titleTextColor")) {
                    action.setValue(UIColor.systemRed, forKey: "titleTextColor")
                }
            }
            sheet.addAction(action)
        }

        sheet.addAction(UIAlertAction(title: "🌐 免费网页版（主流AI模型）…", style: .default) { [weak self] _ in
            self?.presentFreeWebActionSheet()
        })

        sheet.addAction(UIAlertAction(title: "全部服务…", style: .default) { [weak self] _ in
            self?.openServiceList()
        })
        sheet.addAction(UIAlertAction(title: "连接说明与教程…", style: .default) { [weak self] _ in
            self?.openConnectionGuide()
        })
        sheet.addAction(UIAlertAction(title: "📷 扫码连接（扫二维码自动填地址）", style: .default) { [weak self] _ in
            self?.presentQRScanner()
        })
        sheet.addAction(UIAlertAction(title: "🔳 当前地址二维码（给别人扫）", style: .default) { [weak self] _ in
            self?.showCurrentAddressQRCode()
        })
        sheet.addAction(UIAlertAction(title: "手动输入地址…", style: .default) { [weak self] _ in
            self?.promptForURL()
        })
        sheet.addAction(UIAlertAction(title: "刷新（强制全新重连）", style: .default) { [weak self] _ in
            // 彻底切断任何僵死连接，全新发起 TCP 握手，100% 联通恢复
            self?.forceReconnectCurrentURL()
        })
        sheet.addAction(UIAlertAction(title: "清除缓存并重载", style: .default) { [weak self] _ in
            self?.clearWebCacheAndReload()
        })
        let currentAppVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.83"
        sheet.addAction(UIAlertAction(title: "🚀 检查更新 (当前 v\(currentAppVer))…", style: .default) { [weak self] _ in
            self?.checkForAppUpdates(manual: true)
        })
        #if !PUBLIC_BUILD
        // v1.0.83：布局编辑只在个人版里。公开版编译时带 PUBLIC_BUILD，这段不存在。
        let layoutOn = UserDefaults.standard.bool(forKey: Keys.layoutEdit)
        sheet.addAction(UIAlertAction(title: layoutOn ? "调整布局：开（点此关闭）" : "调整布局…", style: .default) { [weak self] _ in
            guard let self else { return }
            UserDefaults.standard.set(!layoutOn, forKey: Keys.layoutEdit)
            self.applyLayoutEditMode()
        })
        #endif
        sheet.addAction(UIAlertAction(title: "关于", style: .default) { [weak self] _ in
            self?.showAbout()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
    }

    #if !PUBLIC_BUILD
    /// v1.0.83：布局编辑层。给每个按钮描边、标名字，按住拖动，松手记住位置。
    /// 只在个人版里。打开后注入到当前页面，刷新或换页时按开关重新注入。
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
    #endif

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
        let saved = UserDefaults.standard.string(forKey: Keys.lastURL)
        let urlString = (saved?.isEmpty == false) ? saved! : defaultURL
        loadURLString(urlString)
    }

    @objc private func retryTapped() {
        if let current = webView.url?.absoluteString, !current.isEmpty {
            // 重试强行切断旧死通道
            loadURLString(current, markAsDSHService: false, forceReconnect: true)
        } else {
            loadInitialURL()
        }
    }

    @objc private func appDidEnterBackground() {
        lastEnterBackgroundTime = Date()
    }

    /// 强制恢复联通性（终极恢复机制：彻底掐断死连接，100% 联通回来）
    func forceReconnectCurrentURL() {
        let target = webView.url?.absoluteString
            ?? UserDefaults.standard.string(forKey: Keys.lastURL)
            ?? defaultURL
        loadURLString(target, markAsDSHService: true, forceReconnect: true)
    }

    /// - Parameter markAsDSHService: 加载的是 DSH 服务地址时为 true（记录其 host 用于页面归属判定）；
    ///   打开外嵌免费网页对话等第三方站点时必须传 false，避免把第三方 host 误认成 DSH。
    /// - Parameter forceReconnect: 是否强行切断旧通道重新建立全新网络握手
    private func loadURLString(_ raw: String, markAsDSHService: Bool = true, forceReconnect: Bool = false) {
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

        UserDefaults.standard.set(trimmed, forKey: Keys.lastURL)
        hideError()
        stopWhiteScreenDiagnostics()
        webErrors = []
        terminateCount = 0
        hasLoadedOnce = false
        isTokenRetryInFlight = false
        if !trimmed.contains("dsh-pocket-retry=1") { isPocketRetryInFlight = false }

        // 1. 彻底掐断之前的旧网络连接与挂起任务，防止卡死在底层请求队列中
        webView.stopLoading()
        activityIndicator.startAnimating()
        startNavigationTimeout()

        // 2. 避免暴力全黑导致假死死锁，仅轻微半透明并增加 2.5 秒安全兜底显形
        UIView.animate(withDuration: 0.1) {
            self.webView.alpha = 0.4
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            self?.revealWebView()
        }

        // 3. 构建全新连接请求：忽略任何本地与远程缓存，超时锁死在 8 秒，绝不卡死
        let cachePolicy: URLRequest.CachePolicy = forceReconnect ? .reloadIgnoringLocalAndRemoteCacheData : .reloadIgnoringLocalCacheData
        var request = URLRequest(url: url, cachePolicy: cachePolicy, timeoutInterval: 8)
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        webView.load(request)
    }

    // MARK: - 联网与锁屏切回毫秒级自愈 (Fast-Resume)

    @objc private func appDidBecomeActive() {
        setMenuExpanded(false, animated: false)

        let awaySeconds = Date().timeIntervalSince(lastEnterBackgroundTime)

        // 若当前处于连接失败态或尚未有内容，立刻尝试重连
        if !errorOverlay.isHidden || webView.url == nil || !hasLoadedOnce {
            forceReconnectCurrentURL()
            return
        }

        // v1.0.83 锁屏假死彻底自愈：
        // 如果离开/锁屏超过 15 秒（锁屏一两分钟），底层连接往往已被 iOS 挂起切断：
        // 先发送极速探针；若 0.35 秒内未收到正常回应，直接自动执行 forceReconnectCurrentURL() 全新建立连接！
        var isResponsive = false
        webView.evaluateJavaScript("1+1") { [weak self] result, error in
            if error == nil, let val = result as? Int, val == 2 {
                isResponsive = true
            }
        }

        let probeDelay = awaySeconds > 15 ? 0.35 : 0.6
        DispatchQueue.main.asyncAfter(deadline: .now() + probeDelay) { [weak self] in
            guard let self = self else { return }
            if !isResponsive || awaySeconds > 90 {
                // 确凿判定 WebProcess 挂起或通信中断：强行自动全新重连
                self.recordWebError("检测到锁屏切回后通信中断，已自动执行全新连接自愈")
                self.forceReconnectCurrentURL()
            } else {
                // 存活状态：主动派发 visibilitychange 与 focus，唤醒页面 WebSocket 重连
                self.webView.evaluateJavaScript("""
                    (function() {
                      try {
                        window.dispatchEvent(new Event('focus'));
                        document.dispatchEvent(new Event('visibilitychange'));
                        if (window.__dshFastResume) { window.__dshFastResume(); }
                        if (window.__dshSyncActiveSession) { window.__dshSyncActiveSession(); }
                      } catch(e) {}
                    })();
                """, completionHandler: nil)
            }
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
        // 白屏诊断路径已把标题设成「页面白屏」，这里不要覆盖它；其余一律回到默认标题。
        if errorTitleLabel.text != "页面白屏" {
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

    /// 导航超时保护：服务端无响应时 WKWebView 默认要等很久，这里 20 秒兜底提示。
    private func startNavigationTimeout() {
        navigationTimer?.invalidate()
        navigationTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
            guard let self, self.errorOverlay.isHidden else { return }
            self.activityIndicator.stopAnimating()
            self.showError(detail: "连接超时：20 秒内未收到响应，请确认电脑端 DSH 在线")
        }
    }

    private func stopNavigationTimeout() {
        navigationTimer?.invalidate()
        navigationTimer = nil
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    /// v1.0.74：只允许留在当前服务地址内。
    /// 侧滑返回、页内 `history.back()` 都会发起 back-forward 导航，这里直接取消，
    /// 避免退回上一个 URL。页面内的抽屉、会话切换是前端路由，不走这里，不受影响。
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .backForward {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

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
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        activityIndicator.startAnimating()
        startNavigationTimeout()
    }

    /// v1.0.70：导航已提交（此时 webView.url 已是新页面）——
    /// 外部网页（免费网页对话等第三方站点）顶部避开 iOS 状态栏/灵动岛；DSH 页面保持全屏。
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        updateTopSafeAreaFor(url: webView.url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        stopNavigationTimeout()
        // 完成即隐藏错误层（meta-refresh 握手页二跳也会走到这里）
        hideError()
        hasLoadedOnce = true
        // 首屏下发一次状态栏高度：safeAreaInsets 可能在页面脚本注入之前就定了，
        // 不补这一次，顶栏会一直停在默认留白上。
        publishStatusBarHeight()
        #if !PUBLIC_BUILD
        // 布局编辑开着时，每次页面加载完成重新挂上编辑层。
        if UserDefaults.standard.bool(forKey: Keys.layoutEdit) {
            applyLayoutEditMode()
        }
        #endif
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
        guard isKeyboardVisible else { return }
        guard !scrollView.isTracking, !scrollView.isDragging, !scrollView.isDecelerating else { return }
        if scrollView.contentOffset.y < 0 {
            scrollView.contentOffset = CGPoint(x: scrollView.contentOffset.x, y: 0)
        }
    }
}

// MARK: - 远程仓库自动/手动检查更新与巨魔(TrollStore)自动安装 (v1.0.83)

extension ViewController: UIDocumentInteractionControllerDelegate {
    func documentInteractionControllerViewControllerForPreview(_ controller: UIDocumentInteractionController) -> UIViewController {
        return self
    }

    private struct AppReleaseInfo: Decodable {
        let version: String
        let build: Int?
        let title: String?
        let changelog: String?
        let personal_tipa_url: String?
        let public_tipa_url: String?
        let release_url: String?
    }

    func checkForAppUpdates(manual: Bool = false) {
        let currentVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.83"
        let currentBuildStr = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        let currentBuild = Int(currentBuildStr) ?? 0

        var loadingAlert: UIAlertController?
        if manual {
            let alert = UIAlertController(title: "正在检查更新", message: "正在从远程仓库检查最新打包…", preferredStyle: .alert)
            present(alert, animated: true)
            loadingAlert = alert
        }

        let updateURLStr = "https://raw.githubusercontent.com/liushQAQ/IOS/personal/releases/latest.json"
        guard let url = URL(string: updateURLStr) else {
            loadingAlert?.dismiss(animated: true)
            return
        }

        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        URLSession.shared.dataTask(with: req) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                let finishBlock = {
                    if let error = error {
                        if manual {
                            let alert = UIAlertController(title: "检查更新失败", message: "无法连接更新源：\(error.localizedDescription)", preferredStyle: .alert)
                            alert.addAction(UIAlertAction(title: "确定", style: .default))
                            self.present(alert, animated: true)
                        }
                        return
                    }

                    guard let data = data,
                          let info = try? JSONDecoder().decode(AppReleaseInfo.self, from: data) else {
                        if manual {
                            let alert = UIAlertController(title: "检查更新失败", message: "仓库版本信息解析失败。", preferredStyle: .alert)
                            alert.addAction(UIAlertAction(title: "确定", style: .default))
                            self.present(alert, animated: true)
                        }
                        return
                    }

                    let remoteVer = info.version
                    let remoteBuild = info.build ?? 0

                    let hasNewVersion: Bool = {
                        if remoteBuild > currentBuild { return true }
                        if remoteBuild == currentBuild && remoteVer.compare(currentVer, options: .numeric) == .orderedDescending {
                            return true
                        }
                        return remoteVer.compare(currentVer, options: .numeric) == .orderedDescending
                    }()

                    if hasNewVersion {
                        self.presentNewVersionPrompt(info: info, currentVer: currentVer, currentBuild: currentBuild)
                    } else if manual {
                        let alert = UIAlertController(
                            title: "✅ 当前已是最新版本",
                            message: "当前版本：v\(currentVer) (Build \(currentBuild))\n仓库最新：v\(remoteVer) (Build \(remoteBuild))\n\n如有强制重装需求，也可直接通过巨魔重装最新包。",
                            preferredStyle: .alert)
                        #if PUBLIC_BUILD
                        let tipaURL = info.public_tipa_url ?? info.personal_tipa_url ?? ""
                        #else
                        let tipaURL = info.personal_tipa_url ?? info.public_tipa_url ?? ""
                        #endif
                        if !tipaURL.isEmpty {
                            alert.addAction(UIAlertAction(title: "🚀 重新下载并用巨魔安装", style: .default) { [weak self] _ in
                                self?.installViaTrollStore(remoteURLString: tipaURL)
                            })
                        }
                        alert.addAction(UIAlertAction(title: "好", style: .cancel))
                        self.present(alert, animated: true)
                    }
                }

                if let loading = loadingAlert {
                    loading.dismiss(animated: true, completion: finishBlock)
                } else {
                    finishBlock()
                }
            }
        }.resume()
    }

    private func presentNewVersionPrompt(info: AppReleaseInfo, currentVer: String, currentBuild: Int) {
        #if PUBLIC_BUILD
        let targetTipaURL = info.public_tipa_url ?? info.personal_tipa_url ?? ""
        #else
        let targetTipaURL = info.personal_tipa_url ?? info.public_tipa_url ?? ""
        #endif

        let remoteVer = info.version
        let remoteBuild = info.build ?? 0
        let notes = info.changelog ?? info.title ?? "包含最新的移动端布局优化与功能修复。"

        let alert = UIAlertController(
            title: "🎉 发现新版本 v\(remoteVer) (Build \(remoteBuild))",
            message: "当前版本：v\(currentVer) (Build \(currentBuild))\n\n【更新说明】\n\(notes)\n\n点击下方按钮即可自动拉取仓库最新 TIPA 包并唤起巨魔 (TrollStore) 完成覆盖更新。",
            preferredStyle: .alert
        )

        if !targetTipaURL.isEmpty {
            alert.addAction(UIAlertAction(title: "🚀 巨魔一键自动安装 (推荐)", style: .default) { [weak self] _ in
                self?.installViaTrollStore(remoteURLString: targetTipaURL)
            })
            alert.addAction(UIAlertAction(title: "📥 App内下载后调用巨魔安装", style: .default) { [weak self] _ in
                self?.downloadAndInstallTIPA(remoteURLString: targetTipaURL, filename: "DSHios-\(remoteVer)-\(remoteBuild).tipa")
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
        guard let encoded = remoteURLString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }
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

        group.notify(queue: .main) { [weak self] in
            if !didOpen {
                self?.downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: "DSHios-latest.tipa")
            }
        }
    }

    private func downloadAndInstallTIPA(remoteURLString: String, filename: String) {
        guard let url = URL(string: remoteURLString) else { return }

        let progressAlert = UIAlertController(title: "正在下载最新安装包", message: "正在从仓库下载 \(filename)…\n进度：0%", preferredStyle: .alert)
        present(progressAlert, animated: true)

        let destURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: destURL)

        var observation: NSKeyValueObservation?
        let task = URLSession.shared.downloadTask(with: url) { [weak self] localURL, _, error in
            observation?.invalidate()
            DispatchQueue.main.async {
                progressAlert.dismiss(animated: true) {
                    guard let self else { return }
                    if let error = error {
                        let alert = UIAlertController(title: "下载失败", message: error.localizedDescription, preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "好", style: .default))
                        self.present(alert, animated: true)
                        return
                    }
                    guard let localURL = localURL else { return }
                    do {
                        try FileManager.default.moveItem(at: localURL, to: destURL)
                        self.openDownloadedTIPA(fileURL: destURL)
                    } catch {
                        let alert = UIAlertController(title: "保存失败", message: error.localizedDescription, preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "好", style: .default))
                        self.present(alert, animated: true)
                    }
                }
            }
        }

        observation = task.progress.observe(\.fractionCompleted) { progress, _ in
            DispatchQueue.main.async {
                let pct = Int(progress.fractionCompleted * 100)
                progressAlert.message = "正在从仓库下载 \(filename)…\n进度：\(pct)%"
            }
        }
        task.resume()
    }

    private func openDownloadedTIPA(fileURL: URL) {
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

