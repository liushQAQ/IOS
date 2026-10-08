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

    /// 悬浮按钮边长。
    private static let menuButtonSide: CGFloat = 44
    /// 收起时从右缘露出的宽度（贴边把手；够宽才好按住拖动，又不压住页面热区）。
    private static let menuCollapsedPeek: CGFloat = 22
    /// 展开态距右缘的间距。
    private static let menuTrailingInset: CGFloat = 10
    /// 展开后静置多久自动收起。
    private static let menuAutoHideDelay: TimeInterval = 4.0

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
    /// 桌面端主控运行在 3084（DSH Desktop GUI 进程，持有全量活会话）。
    private let defaultURL = "http://192.168.215.218:3084/"

    private struct Keys {
        static let lastURL = "DSHios.lastURL"
        static let urlVersion = "DSHios.urlVersion"
        static let currentURLVersion = 3
    }

    /// iOS 16 缺失的关键 Web API 兜底。页面构建目标定得比 16 高，
    /// 缺失任一都会导致启动脚本抛错白屏。每条只在原生不存在时补齐。
    static let iosCompatShims: [String] = [
        // 移动端视觉与对比度增强：
        // 降低模型选择菜单、二级/多级菜单毛玻璃透明度（原深色仅45%不透明度导致文字严重重叠），
        // 提升至 96% 沉浸高对比度毛玻璃，字迹极度清晰。
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
            '}'
          ].join('\\n');
          function attach() {
            if (!document.head) { setTimeout(attach, 10); return; }
            if (!document.getElementById('dsh-ios-glass-enhancement')) {
              document.head.appendChild(style);
            }
          }
          attach();
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
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
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
        1. 电脑端 DSH Desktop 正在运行
        2. 手机与电脑在同一局域网
        3. 电脑防火墙放行 3083 端口
        """

        let retryButton = UIButton(type: .system)
        retryButton.setTitle("重试", for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let changeButton = UIButton(type: .system)
        changeButton.setTitle("换一个地址", for: .normal)
        changeButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        changeButton.addTarget(self, action: #selector(openMenuDirectly), for: .touchUpInside)

        container.addArrangedSubview(icon)
        container.addArrangedSubview(title)
        container.addArrangedSubview(detail)
        container.addArrangedSubview(hint)
        container.addArrangedSubview(retryButton)
        container.addArrangedSubview(changeButton)

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
        // 展开态更实一些（用户要「悬浮半透明」，收起态更淡，避免干扰阅读）。
        let targetAlpha: CGFloat = expanded ? 0.9 : 0.5

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
        for item in services.prefix(6) {
            sheet.addAction(UIAlertAction(title: item.name, style: .default) { [weak self] _ in
                guard let self else { return }
                // 外网入口先回局域网换最新 token 再打开，避免用过期 token 撞 401。
                ServiceResolver.resolve(item) { url in
                    self.loadURLString(url)
                }
            })
        }

        sheet.addAction(UIAlertAction(title: "全部服务…", style: .default) { [weak self] _ in
            self?.openServiceList()
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
        let settings = SettingsViewController(
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
            tf.placeholder = "http://192.168.215.218:3083/"
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

            默认服务：http://192.168.215.218:3083/
            联网即加载电脑端会话
            """,
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
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
