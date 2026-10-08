import UIKit
import WebKit
import Network

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

    /// 悬浮菜单按钮：收起时只从右缘露出一条把手，展开后完整可见。
    private var menuButtonExpanded = false
    /// 展开后的自动收起计时器（「不用了自动隐藏」）。
    private var menuAutoHideTimer: Timer?

    /// 悬浮按钮边长（原 44pt 缩小为 36pt，减少视觉遮挡）。
    private static let menuButtonSide: CGFloat = 36
    /// 收起时从右缘露出的宽度（原 22pt 过宽遮挡页面右侧，缩窄至 10pt，只留精致灵巧的抓手，杜绝误触）。
    private static let menuCollapsedPeek: CGFloat = 10
    /// 展开态距右缘的间距。
    private static let menuTrailingInset: CGFloat = 8
    /// 展开后静置多久自动收起（原 4.0 秒缩短为 2.2 秒，操作后迅速避让页面）。
    private static let menuAutoHideDelay: TimeInterval = 2.2

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
        // 1. 降低模型选择菜单、二级/多级菜单毛玻璃透明度（原深色仅45%不透明度导致文字严重重叠），
        //    提升至 96% 沉浸高对比度毛玻璃，字迹极度清晰。
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
            '  --dsw-menu-surface-fill: rgba(255, 255, 255, 0.96) !important;',
            '  --dsw-menu-backdrop-filter: blur(28px) saturate(180%) !important;',
            '}',
            'body[data-ds-dark-theme] {',
            '  --dsw-menu-surface-fill: rgba(22, 24, 29, 0.96) !important;',
            '  --dsw-menu-backdrop-filter: blur(28px) saturate(180%) !important;',
            '}',
            '.VYXhfG_menu,',
            '[data-menu-material="translucent"],',
            '[data-menu-material],',
            '[role="menu"],',
            '[role="listbox"] {',
            '  background-color: var(--dsw-menu-surface-fill) !important;',
            '  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--dsw-elevation-stroke-color, rgba(255, 255, 255, 0.12)) !important;',
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
            '/* 保证模型选择弹层在软键盘弹出与收起时拥有固定层级与平滑交互，并且支持触摸滚动 */',
            '.VYXhfG_menu {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  z-index: 10050 !important;',
            '  max-height: min(440px, 82vh) !important;',
            '  transform: translateZ(0);',
            '}',
            '.VYXhfG_groups {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  max-height: min(380px, 72vh) !important;',
            '  transform: translateZ(0);',
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
            '/* 1. 彻底解决移动端顶部标题栏：左侧边栏展开按钮与会话标题文本重叠碰撞问题 */',
            '.ank0OG_header {',
            '  display: flex !important;',
            '  flex-direction: row !important;',
            '  align-items: center !important;',
            '  gap: 10px !important;',
            '  padding: 8px 16px 0 14px !important;',
            '}',
            '.ank0OG_headerLeading {',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  gap: 6px !important;',
            '  flex: 0 0 auto !important;',
            '  margin-inline-end: 4px !important;',
            '  z-index: 2 !important;',
            '}',
            '.ank0OG_titleRow {',
            '  flex: 1 1 0% !important;',
            '  min-width: 0 !important;',
            '  padding-inline-start: 0 !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '}',
            '.ank0OG_titleCluster {',
            '  flex: 1 1 0% !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '}',
            '.ank0OG_crumbs {',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '.ank0OG_crumb {',
            '  max-width: min(200px, 45vw) !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '/* 2. 修复右侧边栏(文件/终端/浏览器)在移动端展开后遮挡且缺乏快捷退出按钮 */',
            '.dMHGga_panel[data-sidebar-right-open] {',
            '  pointer-events: auto !important;',
            '}',
            '/* 右侧边栏展开时移动端半透明背景遮罩（点击即可收起退出） */',
            '.dsh-mobile-sidebar-backdrop {',
            '  position: fixed;',
            '  inset: 0;',
            '  background: rgba(0, 0, 0, 0.45);',
            '  backdrop-filter: blur(4px);',
            '  -webkit-backdrop-filter: blur(4px);',
            '  z-index: 9998;',
            '  opacity: 0;',
            '  pointer-events: none;',
            '  transition: opacity 0.2s ease;',
            '}',
            '.dsh-mobile-sidebar-backdrop.active {',
            '  opacity: 1;',
            '  pointer-events: auto;',
            '}',
            '/* 右侧边栏顶部浮动退出关闭按钮 */',
            '.dsh-mobile-sidebar-close-btn {',
            '  position: absolute;',
            '  top: max(10px, env(safe-area-inset-top));',
            '  right: 12px;',
            '  z-index: 10005;',
            '  width: 32px;',
            '  height: 32px;',
            '  border-radius: 16px;',
            '  background: var(--dsw-alias-interactive-bg-hover, rgba(120, 120, 128, 0.24));',
            '  color: var(--dsw-alias-label-primary, #ffffff);',
            '  border: none;',
            '  display: flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  font-size: 18px;',
            '  font-weight: 500;',
            '  cursor: pointer;',
            '  box-shadow: 0 2px 8px rgba(0,0,0,0.25);',
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
            '}'
          ].join('\\n');
          function attach() {
            if (!document.head) { setTimeout(attach, 10); return; }
            if (!document.getElementById('dsh-ios-glass-enhancement')) {
              document.head.appendChild(style);
            }
          }
          attach();

          // 修复 iOS 移动端虚拟键盘自动弹窗与收起导致菜单关闭
          (function fixMobileModelSearchFocus() {
            var origFocus = HTMLElement.prototype.focus;
            var isTouchUser = true;
            var allowNextFocus = false;

            // 监听用户真人的手指触摸
            document.addEventListener('touchstart', function(e) {
              if (e.target && (e.target.matches && (e.target.matches('.VYXhfG_search') || e.target.matches('input[role="searchbox"]')))) {
                allowNextFocus = true;
              }
            }, true);

            // 当且仅当是 ModelSelect 里的快捷搜索框，并且是由代码自动化调用的 focus() 时拦截，避免一进入界面就轰炸弹出软键盘
            HTMLElement.prototype.focus = function(options) {
              if (this && this.classList && (this.classList.contains('VYXhfG_search') || this.getAttribute('role') === 'searchbox')) {
                if (!allowNextFocus) {
                  // 阻止无感知自动唤起软键盘
                  return;
                }
                allowNextFocus = false;
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

            // 监听 DOM 树中的 data-sidebar-right-open 变化
            var obs = new MutationObserver(function() {
              var panel = document.querySelector('.dMHGga_panel');
              var isOpen = panel && panel.hasAttribute('data-sidebar-right-open');
              toggleBackdrop(!!isOpen);

              // 检查面板内部是否有退出按钮，没有则动态植入一个明显的关闭叉号
              if (panel && isOpen) {
                var existingClose = panel.querySelector('.dsh-mobile-sidebar-close-btn');
                if (!existingClose) {
                  var closeBtn = document.createElement('button');
                  closeBtn.className = 'dsh-mobile-sidebar-close-btn';
                  closeBtn.setAttribute('type', 'button');
                  closeBtn.setAttribute('aria-label', '关闭侧边栏');
                  closeBtn.innerHTML = '✕';
                  closeBtn.addEventListener('click', function(evt) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    var toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('.dMHGga_iconButton');
                    if (toggle) toggle.click();
                    else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                  });
                  panel.appendChild(closeBtn);
                }
              }
            });

            obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'] });
          })();
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
            var apiUrl = '/api/file?path=' + encodeURIComponent(filePath);

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
              console.warn('[DSHios] Failed to fetch via /api/file, fallback to DOM text:', err);
              // 如果通过接口拉取失败（如相对路径或离线），尝试从当前预览界面抓取
              var previewBody = document.querySelector('.YdIzba_body');
              if (previewBody) {
                var text = previewBody.innerText || '';
                var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                var reader = new FileReader();
                reader.onloadend = function() {
                  var b64 = (reader.result || '').split(',')[1] || '';
                  sendFileToNative(name, 'text/plain', b64);
                };
                reader.readAsDataURL(blob);
              }
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

                var pathLabel = header.querySelector('.YdIzba_path');
                var rawPath = pathLabel ? (pathLabel.getAttribute('title') || pathLabel.innerText || '').trim() : '';
                var fname = rawPath ? rawPath.split(/[\\\\/]/).pop() : 'document.txt';

                if (rawPath) {
                  shareFileByPath(rawPath, fname);
                } else {
                  var previewBody = header.parentElement ? header.parentElement.querySelector('.YdIzba_body') : null;
                  if (previewBody) {
                    var text = previewBody.innerText || '';
                    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                    var reader = new FileReader();
                    reader.onloadend = function() {
                      var b64 = (reader.result || '').split(',')[1] || '';
                      sendFileToNative(fname, 'text/plain', b64);
                    };
                    reader.readAsDataURL(blob);
                  }
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
        webView.allowsBackForwardNavigationGestures = true
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

    /// 右缘悬浮菜单按钮（半透明、可滑动、不用自动隐藏）。
    ///
    /// 旧实现把它钉死在右下角 40×40，正好压在页面的输入框/发送键上，点不动（用户报障）。
    /// 现在改成「从右缘滑出」：
    /// - 收起态只露出 `menuCollapsedPeek` 宽的一条把手，几乎不占页面热区；
    /// - 手指在按钮上左右拖动可跟手展开/收起（`UIPanGestureRecognizer`），点一下也能切换；
    /// - 展开后静置 `menuAutoHideDelay` 秒自动收起，不遮挡页面；
    /// - 选右缘是因为 iOS 的「侧滑返回」手势占用左缘，放左缘会和系统手势打架。
    private func setupMenuButton() {
        let button = UIButton(type: .system)
        button.tintColor = .secondaryLabel
        button.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.75)
        button.layer.cornerRadius = Self.menuButtonSide / 2
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.18
        button.layer.shadowRadius = 4
        button.layer.shadowOffset = CGSize(width: 0, height: 1)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(menuTapped), for: .touchUpInside)
        button.accessibilityLabel = "菜单"
        button.accessibilityHint = "向左拖动可展开"
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

        self.menuButton = button
        self.setMenuExpanded(false, animated: false)
    }

    /// 收起 / 展开悬浮按钮。收起态把按钮大部分推出右缘，只留一条把手。
    private func setMenuExpanded(_ expanded: Bool, animated: Bool) {
        guard let button = menuButton, let constraint = menuTrailingConstraint else { return }
        menuButtonExpanded = expanded
        let constant = expanded
            ? Self.menuExpandedConstant
            : Self.menuCollapsedConstant
        constraint.constant = constant
        // 展开态更实一些（用户要「悬浮半透明」，收起态更淡，避免干扰阅读：由 0.5 降至 0.28，极致灵动通透不挡屏）。
        let targetAlpha: CGFloat = expanded ? 0.88 : 0.28

        let apply = {
            button.alpha = targetAlpha
            self.view.layoutIfNeeded()
        }
        // 收起时按钮大部分在屏外，居中的图标会被裁掉：换成「左箭头」并把图标整体
        // 往可见的一侧（屏幕右缘）挪，展开后恢复成菜单图标，让把手自己说明「往左拉」。
        let visible = expanded ? Self.menuButtonSide : Self.menuCollapsedPeek
        let shift = (Self.menuButtonSide - visible) / 2
        button.setImage(UIImage(systemName: expanded ? "slider.horizontal.3" : "chevron.left"),
                        for: .normal)
        // 纯图片按钮：内容中心偏移 = (left - right) / 2，正值向右。
        button.imageEdgeInsets = UIEdgeInsets(top: 0, left: shift, bottom: 0, right: -shift)

        if animated {
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut], animations: apply)
        } else {
            apply()
        }

        menuAutoHideTimer?.invalidate()
        menuAutoHideTimer = nil
        if expanded {
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

    /// 点一下：展开时直接弹菜单，收起时先展开。
    @objc private func menuTapped() {
        guard menuButtonExpanded else {
            setMenuExpanded(true, animated: true)
            return
        }
        // 不打断自动收起计时器：菜单关掉后按钮也会自己收回去，不留遮挡。
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

    /// 关于：版本号原生可见（读 Info.plist，回退到编译期常量）
    private func showAbout() {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? AppDelegate.Version.marketing
        let build = info?["CFBundleVersion"] as? String ?? AppDelegate.Version.build
        let alert = UIAlertController(
            title: "DeepSeek Harness iOS",
            message: """
            版本：\(version) (\(build))
            作者：liush734530963
            开源仓库：
            https://github.com/liush734530963/deepseek-harness-ios

            【更新日志与特性】
            1. 支持交付物与工作区文件一键调起 iOS 本地分享（保存到文件/微信/AirDrop）
            2. 底部 Token 统计自适应折行，告别滑动条
            3. 右侧菜单与列表红点标明当前选中的服务地址
            4. 官方原版 DSH 免改代码无缝接入支持
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
        migrateSavedURLIfNeeded()
        let saved = UserDefaults.standard.string(forKey: Keys.lastURL)
        let urlString = (saved?.isEmpty == false) ? saved! : defaultURL
        loadURLString(urlString)
    }

    /// URL 格式迁移：v1 时代保存的地址（旧的 3081/dsh/ 直连地址）已失效，
    /// 统一升级为 Pocket 地址，避免升级后仍加载坏地址导致白屏。
    private func migrateSavedURLIfNeeded() {
        let savedVersion = UserDefaults.standard.integer(forKey: Keys.urlVersion)
        guard savedVersion < Keys.currentURLVersion else { return }
        UserDefaults.standard.removeObject(forKey: Keys.lastURL)
        UserDefaults.standard.set(Keys.currentURLVersion, forKey: Keys.urlVersion)
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
