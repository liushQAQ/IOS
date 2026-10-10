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

    /// App 内顶部通知浮条（当后台会话完成时弹出 3 秒通知，并伴随系统提示音）
    private var taskBannerView: UIView?
    private var taskBannerDismissTimer: Timer?

    /// 语音听写识别器与音频引擎（调用 iOS 原生语音听写）
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var isDictating = false

    /// 悬浮菜单按钮：收起时只从右缘露出一条把手，展开后完整可见。
    private var menuButtonExpanded = false
    /// 展开后的自动收起计时器（「不用了自动隐藏」）。
    private var menuAutoHideTimer: Timer?

    /// 悬浮按钮边长（44pt 精致小巧圆形）。
    private static let menuButtonSide: CGFloat = 44
    /// 收起时从右缘露出的宽度（隐藏一半，留 22pt 在屏内）。
    private static let menuCollapsedPeek: CGFloat = 22
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

    private static func makeTaskNoticeBridge(owner: ViewController) -> WKScriptMessageHandler {
        return TaskNoticeBridge { [weak owner] info in
            owner?.handleTaskNotice(info)
        }
    }

    private final class TaskNoticeBridge: NSObject, WKScriptMessageHandler {
        let onNotice: ([String: Any]) -> Void
        init(onNotice: @escaping ([String: Any]) -> Void) { self.onNotice = onNotice }
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if let dict = message.body as? [String: Any] {
                onNotice(dict)
            }
        }
    }

    /// App 内任务完成顶部胶囊通知弹窗（3 秒自动消失，高保真状态栏矮胶囊，伴随清脆轻微提示音与触感）
    private func handleTaskNotice(_ info: [String: Any]) {
        guard let title = info["title"] as? String, !title.isEmpty else { return }
        let text = "\(title)已完成，请切换会话查看"

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.showTaskCompletionBanner(text: text)
        }
    }

    private func showTaskCompletionBanner(text: String) {
        // 1. 播放系统级清脆完成音效与触感震动（零延迟、最克制不刺耳）
        AudioServicesPlaySystemSound(1001) // Mail received / item sent subtle chime
        let feedback = UINotificationFeedbackGenerator()
        feedback.notificationOccurred(.success)

        // 2. 移除旧的横幅
        taskBannerDismissTimer?.invalidate()
        taskBannerView?.removeFromSuperview()

        // 3. 构建高保真迷你胶囊横幅（与 iOS 灵动岛/状态栏同等精致高度，不遮挡大面积屏幕）
        let banner = UIView()
        banner.backgroundColor = UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 28/255.0, green: 30/255.0, blue: 36/255.0, alpha: 0.96)
                : UIColor(red: 250/255.0, green: 250/255.0, blue: 252/255.0, alpha: 0.96)
        }
        banner.layer.cornerRadius = 18
        banner.layer.shadowColor = UIColor.black.cgColor
        banner.layer.shadowOffset = CGSize(width: 0, height: 4)
        banner.layer.shadowRadius = 12
        banner.layer.shadowOpacity = 0.18
        banner.layer.borderWidth = 0.5
        banner.layer.borderColor = UIColor.separator.cgColor
        banner.translatesAutoresizingMaskIntoConstraints = false

        let iconView = UIImageView()
        let checkConfig = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
        iconView.image = UIImage(systemName: "checkmark.circle.fill", withConfiguration: checkConfig)
        iconView.tintColor = .systemGreen
        iconView.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 12.5, weight: .semibold)
        label.textColor = .label
        label.lineBreakMode = .byTruncatingTail
        label.translatesAutoresizingMaskIntoConstraints = false

        banner.addSubview(iconView)
        banner.addSubview(label)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: banner.leadingAnchor, constant: 12),
            iconView.centerYAnchor.constraint(equalTo: banner.centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 16),

            label.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 6),
            label.trailingAnchor.constraint(equalTo: banner.trailingAnchor, constant: -14),
            label.centerYAnchor.constraint(equalTo: banner.centerYAnchor)
        ])

        view.addSubview(banner)
        self.taskBannerView = banner

        let topInset = view.safeAreaInsets.top > 0 ? view.safeAreaInsets.top : 24
        let initialTop = banner.topAnchor.constraint(equalTo: view.topAnchor, constant: topInset - 40)
        let targetTop = banner.topAnchor.constraint(equalTo: view.topAnchor, constant: topInset + 4)

        NSLayoutConstraint.activate([
            initialTop,
            banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            banner.heightAnchor.constraint(equalToConstant: 36),
            banner.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -32)
        ])

        view.layoutIfNeeded()
        banner.alpha = 0
        banner.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)

        // 4. 平滑弹出动画
        UIView.animate(withDuration: 0.38, delay: 0, usingSpringWithDamping: 0.76, initialSpringVelocity: 0.5, options: [.curveEaseOut]) {
            initialTop.isActive = false
            targetTop.isActive = true
            banner.alpha = 1
            banner.transform = .identity
            self.view.layoutIfNeeded()
        }

        // 5. 3 秒后自动优雅收起消失
        taskBannerDismissTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self, weak banner] _ in
            guard let banner = banner else { return }
            UIView.animate(withDuration: 0.28, animations: {
                banner.alpha = 0
                banner.transform = CGAffineTransform(translationX: 0, y: -20)
            }) { _ in
                banner.removeFromSuperview()
                if self?.taskBannerView === banner {
                    self?.taskBannerView = nil
                }
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
            '/* 顶部导航栏：左侧抽屉按钮与右侧所有操作图标基准高统一在 y=22px，高度28px，达到像素级平齐 */',
            '/* 修复移动端顶部工具栏整体高度与基准线 */',
            '[data-phase] header,',
            '.ank0OG_header {',
            '  min-height: 76px !important;',
            '  height: auto !important;',
            '  padding: 8px 12px 0 12px !important;',
            '  box-sizing: border-box !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  position: relative !important;',
            '}',
            '.ank0OG_headerLeading {',
            '  display: none !important;',
            '}',
            '[data-phase] header .ank0OG_titleRow,',
            '.ank0OG_titleRow {',
            '  display: flex !important;',
            '  flex-direction: row !important;',
            '  align-items: center !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  max-height: 32px !important;',
            '  padding-left: 36px !important;',
            '  padding-right: 0px !important;',
            '  margin: 0 !important;',
            '  box-sizing: border-box !important;',
            '  width: 100% !important;',
            '  position: relative !important;',
            '}',
            '/* 左侧展开目录按钮：统一在 top: 0px, height: 28px, 宽度28px，严格垂直居中并与右侧按钮水平平齐 */',
            '[data-mobile-nav="toggle"] {',
            '  position: absolute !important;',
            '  left: 0px !important;',
            '  top: 0px !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  border-radius: var(--dsw-radius-sm, 6px) !important;',
            '  z-index: 20 !important;',
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
            '/* 手机端隐藏电脑端特有的「在资源管理器打开」组合按钮，防止撑爆移动端顶栏 */',
            '.PPCmka_main,',
            '.PPCmka_chevron {',
            '  display: none !important;',
            '}',
            '/* 首页/未选中会话时的悬浮FAB目录按钮：固定在左上角 (top: 10px, left: 12px, 28x28)，严格与右侧按钮平齐 */',
            '[data-mobile-nav="fab"],',
            'button[data-mobile-nav="fab"] {',
            '  position: fixed !important;',
            '  top: 10px !important;',
            '  left: 12px !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  border-radius: var(--dsw-radius-sm, 6px) !important;',
            '  border: none !important;',
            '  box-shadow: none !important;',
            '  background: transparent !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  color: var(--dsw-alias-label-secondary) !important;',
            '  z-index: 9999 !important;',
            '}',
            '[data-mobile-nav="fab"]:hover {',
            '  background: var(--dsw-alias-interactive-bg-hover) !important;',
            '}',
            '[data-mobile-nav="fab"] svg {',
            '  width: 16px !important;',
            '  height: 16px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '.ank0OG_titleCluster,',
            '[data-phase] header [class*="titleCluster"] {',
            '  flex: 1 1 auto !important;',
            '  min-width: 0 !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  gap: 6px !important;',
            '  height: 28px !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '}',
            '.ank0OG_crumbs,',
            '[data-phase] header [class*="crumbs"] {',
            '  flex: 0 1 auto !important;',
            '  min-width: 40px !important;',
            '  max-width: 140px !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  height: 28px !important;',
            '}',
            '.ank0OG_crumbSeg {',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-flex !important;',
            '}',
            '.ank0OG_crumb,',
            '.ank0OG_crumbCurrent {',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  font-weight: 600 !important;',
            '  font-size: 14px !important;',
            '  line-height: 22px !important;',
            '  padding: 2px 4px !important;',
            '}',
            '/* 右侧操作按钮集合：严格靠右分布，还原到原版右侧位置，高度统一28px */',
            '.ank0OG_headerActions {',
            '  margin-left: auto !important;',
            '  flex: 0 0 auto !important;',
            '  height: 28px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '}',
            '/* 后台任务胶囊宽度约束与横向单行排列 */',
            '._1Ihh1G_root,',
            '._1Ihh1G_trigger {',
            '  max-width: 105px !important;',
            '  height: 24px !important;',
            '  overflow: hidden !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  white-space: nowrap !important;',
            '  padding: 0 4px !important;',
            '}',
            '._1Ihh1G_count {',
            '  font-size: 11px !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '.ank0OG_headerCorner {',
            '  height: 28px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  margin-left: 4px !important;',
            '  flex: 0 0 auto !important;',
            '}',
            '/* 统一顶栏所有操作按钮尺寸为 28x28，绝对水平平齐对齐 (deltaY = 0) */',
            '.ank0OG_headerCorner button,',
            '.ank0OG_headerCorner [role="button"],',
            '.ank0OG_headerActions button,',
            '.ank0OG_headerActions [role="button"],',
            'button[aria-label="打开右侧边栏"],',
            '.iFjIhq_button {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  margin-top: 0 !important;',
            '  margin-bottom: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
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
            '/* 移动端全屏面板顶部固定常驻【返回对话】与【✕】退出按钮（严格避开 iOS 顶部状态栏与灵动岛安全区） */',
            '.dsh-mobile-back-to-chat-btn {',
            '  position: fixed !important;',
            '  top: max(54px, calc(env(safe-area-inset-top) + 10px)) !important;',
            '  left: 12px !important;',
            '  z-index: 20050 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  gap: 5px !important;',
            '  height: 32px !important;',
            '  padding: 0 12px 0 8px !important;',
            '  border-radius: 16px !important;',
            '  background: #007aff !important;',
            '  color: #ffffff !important;',
            '  border: none !important;',
            '  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25) !important;',
            '  font-size: 13px !important;',
            '  font-weight: 600 !important;',
            '  cursor: pointer !important;',
            '}',
            '.dsh-mobile-back-to-chat-btn svg {',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '}',
            '.dsh-mobile-panel-close-btn {',
            '  position: fixed !important;',
            '  top: max(54px, calc(env(safe-area-inset-top) + 10px)) !important;',
            '  right: 12px !important;',
            '  z-index: 20050 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  width: 32px !important;',
            '  height: 32px !important;',
            '  border-radius: 16px !important;',
            '  background: rgba(120, 120, 128, 0.35) !important;',
            '  backdrop-filter: blur(16px) !important;',
            '  -webkit-backdrop-filter: blur(16px) !important;',
            '  color: var(--dsw-alias-label-primary, #ffffff) !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
            '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;',
            '  font-size: 16px !important;',
            '  cursor: pointer !important;',
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
            '/* 右侧面板标题栏内边距，给返回和关闭按钮留出安全空间 */',
            '.dMHGga_panel[data-sidebar-right-open] [data-dockkit-strip],',
            '.dMHGga_panel[data-sidebar-right-open] .YdIzba_header {',
            '  padding-left: 100px !important;',
            '  padding-right: 50px !important;',
            '}',
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
            '  overflow-x: hidden !important;',
            '}',
            '.ZiQlkq_panel {',
            '  z-index: 10001 !important;',
            '  overflow-x: hidden !important;',
            '  width: min(800px, calc(100vw - 16px)) !important;',
            '  max-width: calc(100vw - 16px) !important;',
            '}',
            '.ZiQlkq_content,',
            '.ZiQlkq_options,',
            '.ZiQlkq_navList,',
            '.ZiQlkq_nav {',
            '  overflow-x: hidden !important;',
            '  max-width: 100% !important;',
            '  word-break: break-word !important;',
            '  overflow-wrap: anywhere !important;',
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
            '  gap: 4px 8px !important;',
            '  justify-content: center !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  overflow: visible !important;',
            '  padding: 4px 6px !important;',
            '}',
            '.z4IYsq_root, [data-composer-stats] {',
            '  flex-wrap: wrap !important;',
            '  gap: 4px 6px !important;',
            '  justify-content: center !important;',
            '  max-width: 100% !important;',
            '  overflow: visible !important;',
            '}',
            '.z4IYsq_anchor {',
            '  max-width: 100% !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '.z4IYsq_pill {',
            '  font-size: 11px !important;',
            '  padding: 1px 6px !important;',
            '  gap: 4px !important;',
            '  max-width: 100% !important;',
            '  white-space: normal !important;',
            '  text-align: center !important;',
            '  line-height: 16px !important;',
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
            '  padding: 1px 6px !important;',
            '  gap: 4px !important;',
            '  line-height: 16px !important;',
            '}',
            '._7aoaqW_trigger svg {',
            '  width: 12px !important;',
            '  height: 12px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '/* 底部对话输入框与会话流留出移动端底部操作与安全区边距，避免被悬浮球或虚拟键盘遮挡 */',
            ':root {',
            '  --dsh-composer-dock-inset: 8px !important;',
            '}',
            '.uWtHQG_root {',
            '  padding-bottom: max(14px, env(safe-area-inset-bottom)) !important;',
            '}',
            '/* 移动端底部操作行防挤压重叠与发送/停止按钮绝对几何居中强化 (适配 iPhone XR 及各类小屏) */',
            '.uWtHQG_row {',
            '  display: flex !important;',
            '  justify-content: space-between !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex-wrap: nowrap !important;',
            '  width: 100% !important;',
            '  padding: 4px 6px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '/* 左侧辅助工具容器紧凑化：移动端隐藏文字标签，只保留清晰图标，为核心模型选择腾出空间 */',
            '.uWtHQG_tools {',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 2px !important;',
            '}',
            '.Vg9r4q_triggerLabel {',
            '  display: none !important; /* 隐藏 完全权限 汉字，保留盾牌图标与下拉指示 */',
            '}',
            '.Vg9r4q_trigger {',
            '  padding: 0 4px !important;',
            '  height: 28px !important;',
            '  gap: 2px !important;',
            '}',
            '/* 提示词优化插件紧凑化 */',
            '.dsh-po-btn-opt span {',
            '  display: none !important; /* 隐藏 优化 汉字，保留星星图标 */',
            '}',
            '.dsh-po-btn-opt {',
            '  padding: 3px 5px !important;',
            '}',
            '.dsh-po-capsule {',
            '  flex-shrink: 0 !important;',
            '  margin-right: 2px !important;',
            '}',
            '.uWtHQG_trailing {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 6px !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '  justify-content: flex-end !important;',
            '}',
            '.uWtHQG_standardControls {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '  justify-content: flex-end !important;',
            '}',
            '.VYXhfG_root {',
            '  min-width: 0 !important;',
            '  flex: 0 1 auto !important;',
            '  display: flex !important;',
            '}',
            '/* 模型选择核心按钮：获得充分空间，完整展示模型与思考等级，右侧与发送按钮保持至少 12px 独立间隙 */',
            '.VYXhfG_trigger {',
            '  max-width: min(180px, calc(100vw - 220px)) !important;',
            '  min-width: 0 !important;',
            '  flex: 0 1 auto !important;',
            '  height: 28px !important;',
            '  padding: 0 6px !important;',
            '  gap: 3px !important;',
            '  font-size: 12px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '}',
            '.VYXhfG_triggerLabel {',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '  font-size: 12px !important;',
            '  font-weight: 500 !important;',
            '  min-width: 0 !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '.VYXhfG_triggerEffort {',
            '  font-size: 11px !important;',
            '  flex: 0 0 auto !important;',
            '  opacity: 0.85 !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  margin-left: 2px !important;',
            '}',
            '.VYXhfG_chevron {',
            '  flex: 0 0 auto !important;',
            '}',
            '/* 发送/停止/暂停圆形按钮纯正几何居中（统一 28x28，与 + 号和底栏图标严格水平对齐） */',
            '.uWtHQG_add,',
            'button[aria-label="添加"],',
            'button.uWtHQG_add {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  min-width: 28px !important;',
            '  min-height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  box-sizing: border-box !important;',
            '  line-height: 1 !important;',
            '}',
            '.uWtHQG_add svg,',
            'button[aria-label="添加"] svg {',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '.uWtHQG_primary,',
            'button.uWtHQG_primary {',
            '  flex: 0 0 28px !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  min-width: 28px !important;',
            '  min-height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  transform: none !important;',
            '  box-sizing: border-box !important;',
            '  line-height: 1 !important;',
            '}',
            '.uWtHQG_primary svg,',
            'button.uWtHQG_primary svg {',
            '  display: block !important;',
            '  margin: auto !important;',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '/* 语音听写输入按钮：优雅注入输入框左下角 + 号旁，高度28px，保持整行图标严谨水平对齐 */',
            '.dsh-voice-input-btn {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  min-width: 28px !important;',
            '  min-height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  border: none !important;',
            '  background: transparent !important;',
            '  color: var(--dsw-alias-label-secondary, #6b7280) !important;',
            '  cursor: pointer !important;',
            '  outline: none !important;',
            '  box-sizing: border-box !important;',
            '  transition: all 0.15s ease !important;',
            '}',
            '.dsh-voice-input-btn:active {',
            '  transform: scale(0.92) !important;',
            '  color: var(--dsw-alias-brand-primary, #3b82f6) !important;',
            '}',
            '.dsh-voice-input-btn.is-recording {',
            '  color: #ef4444 !important;',
            '  background: rgba(239, 68, 68, 0.12) !important;',
            '  animation: dshVoicePulse 1.2s infinite ease-in-out !important;',
            '}',
            '@keyframes dshVoicePulse {',
            '  0%, 100% { transform: scale(1); opacity: 1; }',
            '  50% { transform: scale(1.1); opacity: 0.8; }',
            '}',
            '.dsh-voice-input-btn svg {',
            '  width: 15px !important;',
            '  height: 15px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
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
          // 3. 保护移动端文本光标与选择自由：严禁在用户点击、滑动或打字时强行重置 Selection，
          //    让用户可以在输入框内任意滑动光标、选择文字、移动插入点！
          (function fixMobileInputAndSearchFocus() {
            var origFocus = HTMLElement.prototype.focus;
            var allowUserTouchFocus = false;
            var touchResetTimer = null;

            function handleUserTouch(e) {
              var target = e.target;
              if (!target) return;
              var inputEl = target.closest('.uWtHQG_input') ||
                            target.closest('[contenteditable="true"]') ||
                            target.closest('textarea') ||
                            target.closest('.VYXhfG_search') ||
                            target.closest('input[role="searchbox"]') ||
                            target.closest('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"])');

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

            // 拦截一切未经用户主动点击的自动化 .focus() 调用
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
                  // 严禁脚本自动化弹起虚拟键盘（尤其是切换会话、打开模型菜单时）
                  return;
                }
              }
              return origFocus.apply(this, arguments);
            };

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

          // 移动端右侧边栏智能关闭辅助（遮罩与退出逻辑）
          (function setupMobileSidebarRightWatcher() {
            var backdrop = document.createElement('div');
            backdrop.className = 'dsh-mobile-sidebar-backdrop';
            document.body.appendChild(backdrop);

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

                // 4. 垂直方向越界自动拉回安全区内（严格保护 iOS 状态栏/灵动岛高度，避免顶入时间/电量指示区）
                var TOP_SAFE = Math.max(54, PADDING);
                if (rect.bottom > winH - PADDING) {
                  var overflowY = rect.bottom - (winH - PADDING);
                  var currentTop = parseFloat(el.style.top) || rect.top;
                  var newTop = Math.max(TOP_SAFE, currentTop - overflowY);
                  el.style.top = newTop + 'px';
                  el.style.bottom = 'auto';
                }
                if (rect.top < TOP_SAFE) {
                  el.style.top = TOP_SAFE + 'px';
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
              observer.observe(document.body, { childList: true, subtree: true });

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
                // 1. 注入顶部返回对话与关闭按钮
                var nav = panel.querySelector('.dsh-mobile-panel-nav');
                if (!nav) {
                  nav = document.createElement('div');
                  nav.className = 'dsh-mobile-panel-nav';

                  var backBtn = document.createElement('button');
                  backBtn.className = 'dsh-mobile-back-to-chat-btn';
                  backBtn.setAttribute('type', 'button');
                  backBtn.setAttribute('aria-label', '返回对话');
                  backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg> 返回对话';
                  backBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.__dshCloseRightPanel();
                  });

                  var closeBtn = document.createElement('button');
                  closeBtn.className = 'dsh-mobile-panel-close-btn';
                  closeBtn.setAttribute('type', 'button');
                  closeBtn.setAttribute('aria-label', '关闭面板');
                  closeBtn.innerHTML = '✕';
                  closeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.__dshCloseRightPanel();
                  });

                  nav.appendChild(backBtn);
                  nav.appendChild(closeBtn);
                  panel.appendChild(nav);
                }

                // 2. 优化文件不可预览页面的操作按钮（将手机端无感的“电脑打开”改造为手机“保存/分享”+明确标注电脑端）
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
            obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'] });
            setInterval(syncPanelNav, 300);
          })();

          // 核心守护：防止移动端软键盘弹起时网页整体被顶到 iOS 顶部状态栏之上
          (function fixKeyboardViewportScroll() {
            function lockScroll() {
              if (window.scrollY > 0) window.scrollTo(0, 0);
              if (document.documentElement.scrollTop > 0) document.documentElement.scrollTop = 0;
              if (document.body.scrollTop > 0) document.body.scrollTop = 0;
            }

            window.addEventListener('scroll', lockScroll, { passive: false });
            window.addEventListener('resize', lockScroll, { passive: true });

            if (window.visualViewport) {
              window.visualViewport.addEventListener('resize', lockScroll, { passive: true });
              window.visualViewport.addEventListener('scroll', lockScroll, { passive: false });
            }

            document.addEventListener('focusin', function(e) {
              setTimeout(lockScroll, 50);
              setTimeout(lockScroll, 150);
              setTimeout(lockScroll, 300);
            }, true);
          })();

          // 核心监听：后台任务完成通知（当后台会话或任务执行完成时，向 iOS 原生派发弹窗通知与声音）
          (function monitorBackgroundTaskCompletion() {
            var lastLiveCount = null;
            var notifiedSessionMap = {};

            function checkTaskChanges() {
              try {
                // 1. 监测顶部后台任务指示器 (ui-jobs)
                var countEl = document.querySelector('._1Ihh1G_count');
                if (countEl) {
                  var text = countEl.textContent || '';
                  var match = text.match(/(\\d+)/);
                  var currentCount = match ? parseInt(match[1], 10) : 0;
                  if (lastLiveCount !== null && lastLiveCount > 0 && currentCount < lastLiveCount) {
                    // 后台任务计数减少，表示有任务已完成
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dshTaskNotice) {
                      window.webkit.messageHandlers.dshTaskNotice.postMessage({
                        title: '后台任务'
                      });
                    }
                  }
                  lastLiveCount = currentCount;
                }

                // 2. 监测左侧抽屉中其他会话的未读完成状态（状态圆点变成静态完成）
                var sessionItems = document.querySelectorAll('[role="treeitem"]');
                sessionItems.forEach(function(item) {
                  var titleEl = item.querySelector('[class*="label"], [class*="title"]') || item;
                  var title = (titleEl.textContent || '').trim().slice(0, 16);
                  var isRunning = item.querySelector('[data-state="ongoing"], .dsw-state-ongoing, [class*="spinner"]') !== null;
                  var isDone = item.querySelector('[data-state="done"], .dsw-state-done, [class*="Checkmark"]') !== null;

                  if (title && isRunning) {
                    notifiedSessionMap[title] = 'running';
                  } else if (title && isDone && notifiedSessionMap[title] === 'running') {
                    // 该会话由运行中转为已完成！触发通知
                    notifiedSessionMap[title] = 'notified';
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dshTaskNotice) {
                      window.webkit.messageHandlers.dshTaskNotice.postMessage({
                        title: '会话【' + title + '】'
                      });
                    }
                  }
                });
              } catch(e) {}
            }

            setInterval(checkTaskChanges, 1500);
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

          // 动态注入 3：向输入框操作栏（.uWtHQG_tools / +号旁）注入原生语音听写按钮
          function enrichVoiceInputButton() {
            var toolBars = document.querySelectorAll('.uWtHQG_tools');
            toolBars.forEach(function(toolbar) {
              if (toolbar.querySelector('.dsh-voice-input-btn')) return;
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'dsh-voice-input-btn';
              btn.setAttribute('aria-label', '语音输入');
              btn.setAttribute('title', '语音输入（点击开始，再次点击完成）');
              btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';

              btn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dshVoiceInput) {
                  window.webkit.messageHandlers.dshVoiceInput.postMessage({ action: 'toggle' });
                }
              });

              var addBtn = toolbar.querySelector('.uWtHQG_add') || toolbar.querySelector('button');
              if (addBtn && addBtn.nextSibling) {
                toolbar.insertBefore(btn, addBtn.nextSibling);
              } else {
                toolbar.appendChild(btn);
              }
            });
          }

          window.__dshVoiceStateUpdate = function(state, text) {
            var btns = document.querySelectorAll('.dsh-voice-input-btn');
            btns.forEach(function(btn) {
              if (state === 'recording') {
                btn.classList.add('is-recording');
                btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
              } else {
                btn.classList.remove('is-recording');
                btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';
              }
            });
            if (text) {
              var editor = document.querySelector('.uWtHQG_input') ||
                           document.querySelector('[contenteditable="true"]') ||
                           document.querySelector('textarea');
              if (editor) {
                if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
                  editor.value = (editor.value ? editor.value + ' ' : '') + text;
                  editor.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  var p = editor.querySelector('p');
                  if (!p) {
                    p = document.createElement('p');
                    editor.appendChild(p);
                  }
                  var span = p.querySelector('span');
                  if (!span) {
                    span = document.createElement('span');
                    p.appendChild(span);
                  }
                  span.textContent = (span.textContent ? span.textContent + ' ' : '') + text;
                  editor.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
            }
          };

          setInterval(function() {
            enrichDeliverableCards();
            enrichPreviewHeader();
            enrichFilesTree();
            enrichVoiceInputButton();
          }, 800);
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
              if (document.querySelector('meta[name="viewport"]')) return;
              var m = document.createElement('meta');
              m.name = 'viewport';
              m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
              document.head.appendChild(m);
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
        config.userContentController.add(Self.makeErrorBridge(owner: self), name: "dshErrors")
        config.userContentController.add(Self.makeFileTransferBridge(owner: self), name: "dshFileTransfer")
        config.userContentController.add(Self.makeTaskNoticeBridge(owner: self), name: "dshTaskNotice")
        config.userContentController.add(Self.makeVoiceInputBridge(owner: self), name: "dshVoiceInput")
        // 禁止左滑/右滑手势触发 WebView 跨 URL 前进/后退导航，防止用户意外退出当前服务地址
        webView.allowsBackForwardNavigationGestures = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        // 确保 WKWebView 整体滚动视图锁死，防止软键盘弹起时网页整体被顶到状态栏之上
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
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

        NSLayoutConstraint.activate([
            // 全屏，与桌面端一致：不吃掉任何高度给原生控件
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

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
        3. 电脑端已安装并启用手机访问（dsh-pocket）
        """

        let retryButton = UIButton(type: .system)
        retryButton.setTitle("重试", for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let changeButton = UIButton(type: .system)
        changeButton.setTitle("换一个地址", for: .normal)
        changeButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        changeButton.addTarget(self, action: #selector(openMenuDirectly), for: .touchUpInside)

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
        container.addArrangedSubview(changeButton)
        container.addArrangedSubview(guideButton)

        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            container.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            container.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 32),
            container.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -32)
        ])

        self.errorOverlay = overlay
        self.errorTitleLabel = title
        self.errorDetailLabel = detail
    }

    /// 优先使用 fisharchive.cc 超清官方同人二次元鲸鱼娘立绘（圆形精美裁切 + 柔和高质感边框）
    private static func createCuteWhaleImage(size: CGSize, alpha: CGFloat = 1.0) -> UIImage {
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
        button.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.65)
        button.layer.cornerRadius = Self.menuButtonSide / 2
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.22
        button.layer.shadowRadius = 6
        button.layer.shadowOffset = CGSize(width: -1, height: 2)
        button.layer.borderWidth = 1.0
        button.layer.borderColor = UIColor.white.withAlphaComponent(0.35).cgColor
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(menuTapped), for: .touchUpInside)
        button.accessibilityLabel = "DSH 菜单"
        button.accessibilityHint = "向左滑出或点击打开菜单"
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

        // 使用 fisharchive.cc 超清官方同人二次元鲸鱼娘头像：
        // 展开时完整居中显示；收起时只露出一半，鲸鱼头像依然清晰露出半张俏皮脸庞
        let whaleImage = Self.createCuteWhaleImage(size: CGSize(width: Self.menuButtonSide, height: Self.menuButtonSide))
        button.setImage(whaleImage, for: .normal)

        let visible = expanded ? Self.menuButtonSide : Self.menuCollapsedPeek
        let shift = (Self.menuButtonSide - visible) / 2
        button.imageEdgeInsets = UIEdgeInsets(top: 0, left: shift, bottom: 0, right: -shift)

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
                    self.loadURLString(url)
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

        sheet.addAction(UIAlertAction(title: "全部服务…", style: .default) { [weak self] _ in
            self?.openServiceList()
        })
        sheet.addAction(UIAlertAction(title: "连接说明与教程…", style: .default) { [weak self] _ in
            self?.openConnectionGuide()
        })
        sheet.addAction(UIAlertAction(title: "手动输入地址…", style: .default) { [weak self] _ in
            self?.promptForURL()
        })
        sheet.addAction(UIAlertAction(title: "刷新", style: .default) { [weak self] _ in
            // reloadFromOrigin 而不是 reload：后者允许复用 HTTP 缓存。
            // 入口包（index-*.js）名字是构建期哈希、不是内容哈希，一旦被缓存住，
            // 服务端修好了客户端也拿不到（白屏看起来「修不好」）。强制回源。
            self?.webView.reloadFromOrigin()
        })
        sheet.addAction(UIAlertAction(title: "清除缓存并重载", style: .default) { [weak self] _ in
            self?.clearWebCacheAndReload()
        })
        sheet.addAction(UIAlertAction(title: "关于", style: .default) { [weak self] _ in
            self?.showAbout()
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
                // cookie 也一并清了，重新走一遍 Pocket 握手
                self.loadURLString(target)
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
            tf.placeholder = "http://192.168.215.218:3084/"
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

    /// 读取底层精准硬件标识符（如 "iPhone11,8" -> "iPhone XR", "iPhone13,4" -> "iPhone 12 Pro Max"）
    private static func getHardwareModelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }
        return identifier.isEmpty ? UIDevice.current.model : identifier
    }

    /// 将硬件标识符映射为大众熟知的具体商业机型名称
    private static func getMarketingDeviceModel() -> String {
        let id = getHardwareModelIdentifier()
        switch id {
        // iPhone XR / XS / X 系列
        case "iPhone10,3", "iPhone10,6": return "iPhone X"
        case "iPhone11,2": return "iPhone XS"
        case "iPhone11,4", "iPhone11,6": return "iPhone XS Max"
        case "iPhone11,8": return "iPhone XR"
        // iPhone 11 系列
        case "iPhone12,1": return "iPhone 11"
        case "iPhone12,3": return "iPhone 11 Pro"
        case "iPhone12,5": return "iPhone 11 Pro Max"
        // iPhone 12 系列
        case "iPhone13,1": return "iPhone 12 mini"
        case "iPhone13,2": return "iPhone 12"
        case "iPhone13,3": return "iPhone 12 Pro"
        case "iPhone13,4": return "iPhone 12 Pro Max"
        // iPhone 13 系列
        case "iPhone14,4": return "iPhone 13 mini"
        case "iPhone14,5": return "iPhone 13"
        case "iPhone14,2": return "iPhone 13 Pro"
        case "iPhone14,3": return "iPhone 13 Pro Max"
        // iPhone 14 系列
        case "iPhone14,7": return "iPhone 14"
        case "iPhone14,8": return "iPhone 14 Plus"
        case "iPhone15,2": return "iPhone 14 Pro"
        case "iPhone15,3": return "iPhone 14 Pro Max"
        // iPhone 15 系列
        case "iPhone15,4": return "iPhone 15"
        case "iPhone15,5": return "iPhone 15 Plus"
        case "iPhone16,1": return "iPhone 15 Pro"
        case "iPhone16,2": return "iPhone 15 Pro Max"
        // iPhone 16 系列
        case "iPhone17,3": return "iPhone 16"
        case "iPhone17,4": return "iPhone 16 Plus"
        case "iPhone17,1": return "iPhone 16 Pro"
        case "iPhone17,2": return "iPhone 16 Pro Max"
        // iPhone SE 系列
        case "iPhone8,4":  return "iPhone SE (第1代)"
        case "iPhone12,8": return "iPhone SE (第2代)"
        case "iPhone14,6": return "iPhone SE (第3代)"
        // 模拟器
        case "i386", "x86_64", "arm64": return "iOS 模拟器 (\(UIDevice.current.model))"
        default: return id
        }
    }

    /// 原生设备运行环境信息检测（精准识别具体机型如 iPhone XR、12 Pro Max 等）
    private static func getDeviceInfoSummary() -> String {
        let marketingModel = getMarketingDeviceModel()
        let hardwareId = getHardwareModelIdentifier()
        let device = UIDevice.current
        let systemVersion = device.systemVersion
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
        
        return "设备: \(marketingModel) [\(hardwareId)] (\(name))\n系统: iOS \(systemVersion)\n屏幕: \(res)\n可用存储: \(freeDiskGB)"
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
            作者：liush734530963
            开源仓库：
            https://github.com/liush734530963/deepseek-harness-ios

            【设备检测信息】
            \(deviceInfo)

            【更新日志与特性】
            1. 恢复自然会话排版流，消除顶部重叠与思考块碰撞
            2. 注入 iOS 15 系统级兼容补丁（crypto 与正则兜底，杜绝白屏）
            3. 原生集成设备运行环境诊断（机型/iOS版本/存储空间）
            4. 手机软键盘回车键智能换行，点击发送按钮提交
            5. 全级别插件/菜单/弹窗移动端自适应规范（高对比度+防溢出）
            6. 移动端文件预览常驻“返回对话”与“保存到手机”
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
            loadURLString(current)
        } else {
            loadInitialURL()
        }
    }

    private func loadURLString(_ raw: String) {
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

        UserDefaults.standard.set(trimmed, forKey: Keys.lastURL)
        hideError()
        stopWhiteScreenDiagnostics()
        webErrors = []
        terminateCount = 0
        hasLoadedOnce = false
        isTokenRetryInFlight = false
        // 用户/代码显式换地址：解除 Pocket 重试防重入，让新地址能走完整握手
        if !trimmed.contains("dsh-pocket-retry=1") { isPocketRetryInFlight = false }
        // 新地址开始加载：先隐藏旧内容，避免残留上一个服务的画面
        UIView.animate(withDuration: 0.12) {
            self.webView.alpha = 0
        }
        webView.load(URLRequest(url: url))
    }

    // MARK: - 联网即加载

    @objc private func appDidBecomeActive() {
        // 回前台先把悬浮按钮收回右缘，避免它停在上次展开的位置挡住页面。
        setMenuExpanded(false, animated: false)
        // 回到前台：若当前是失败态或还没内容，立刻重连（桌面端会话是实时的）。
        if !errorOverlay.isHidden || webView.url == nil || !hasLoadedOnce {
            retryTapped()
        } else if hasLoadedOnce {
            // 当页面已经加载且从后台切回前台时，主动触发 WebSocket / 数据流唤醒，
            // 确保正在进行的任务、对话执行状态与桌面端 100% 实时同步。
            webView.evaluateJavaScript("""
                (function() {
                  try {
                    window.dispatchEvent(new Event('focus'));
                    document.dispatchEvent(new Event('visibilitychange'));
                    if (window.__dshSyncActiveSession) { window.__dshSyncActiveSession(); }
                  } catch(e) {}
                })();
            """, completionHandler: nil)
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

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        stopNavigationTimeout()
        // 完成即隐藏错误层（meta-refresh 握手页二跳也会走到这里）
        hideError()
        hasLoadedOnce = true
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

// MARK: - 原生语音听写扩展 (SFSpeechRecognizer + AVAudioEngine)

extension ViewController {

    static func makeVoiceInputBridge(owner: ViewController) -> ScriptMessageHandler {
        ScriptMessageHandler { [weak owner] msg in
            guard let self = owner,
                  let dict = msg.body as? [String: Any],
                  let action = dict["action"] as? String else { return }
            if action == "toggle" {
                DispatchQueue.main.async {
                    self.toggleVoiceDictation()
                }
            }
        }
    }

    private func toggleVoiceDictation() {
        if isDictating {
            stopVoiceDictation()
        } else {
            requestSpeechAuthorizationAndStart()
        }
    }

    private func requestSpeechAuthorizationAndStart() {
        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            DispatchQueue.main.async {
                guard let self else { return }
                switch authStatus {
                case .authorized:
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            if granted {
                                self.startVoiceDictation()
                            } else {
                                self.showVoiceNotice("麦克风未授权，请在“设置-隐私”开启麦克风权限")
                            }
                        }
                    }
                case .denied, .restricted:
                    self.showVoiceNotice("语音识别未授权，请在“设置-隐私”中开启语音识别")
                case .notDetermined:
                    break
                @unknown default:
                    break
                }
            }
        }
    }

    private func startVoiceDictation() {
        if audioEngine.isRunning {
            stopVoiceDictation()
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[Voice] AudioSession setup error: \(error)")
            return
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }
            var isFinal = false
            if let result = result {
                let transcription = result.bestTranscription.formattedString
                // 实时将语音文字推送到网页输入框
                if !transcription.isEmpty {
                    let escaped = transcription.replacingOccurrences(of: "\\", with: "\\\\")
                        .replacingOccurrences(of: "\"", with: "\\\"")
                        .replacingOccurrences(of: "\n", with: "\\n")
                        .replacingOccurrences(of: "\r", with: "")
                    self.webView.evaluateJavaScript("window.__dshVoiceStateUpdate && window.__dshVoiceStateUpdate('recording', \"\(escaped)\");", completionHandler: nil)
                }
                isFinal = result.isFinal
            }

            if error != nil || isFinal {
                self.stopVoiceDictation()
            }
        }

        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            isDictating = true
            // 触觉轻微反馈
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
            webView.evaluateJavaScript("window.__dshVoiceStateUpdate && window.__dshVoiceStateUpdate('recording', '');", completionHandler: nil)
        } catch {
            print("[Voice] AudioEngine start failed: \(error)")
            stopVoiceDictation()
        }
    }

    private func stopVoiceDictation() {
        if !isDictating && !audioEngine.isRunning { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        isDictating = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        // 触觉轻微反馈提示停止
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        webView.evaluateJavaScript("window.__dshVoiceStateUpdate && window.__dshVoiceStateUpdate('idle', '');", completionHandler: nil)
    }

    private func showVoiceNotice(_ message: String) {
        let alert = UIAlertController(title: "提示", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
    }
}
