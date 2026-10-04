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
    private var navigationTimer: Timer?
    private var pathMonitor: NWPathMonitor?
    private var hasLoadedOnce = false

    /// 默认加载地址：DSH Pocket（桌面端 LAN 代理，明文 HTTP，免密码）。
    /// 桌面端需保持运行；端口 3083 由 dsh-pocket settings.json 固定。
    private let defaultURL = "http://192.168.215.218:3083/"

    private struct Keys {
        static let lastURL = "DSHios.lastURL"
        /// 保存 URL 的格式版本：旧版本保存过坏的 3081/dsh/ 地址，需迁移到新默认值。
        static let urlVersion = "DSHios.urlVersion"
        static let currentURLVersion = 2
    }

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

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
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
        changeButton.addTarget(self, action: #selector(menuTapped), for: .touchUpInside)

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

    /// 右下角半透明小按钮：默认几乎不可见，点开才能换地址/看版本，不破坏「与桌面端一致」的观感。
    private func setupMenuButton() {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "slider.horizontal.3"), for: .normal)
        button.tintColor = .secondaryLabel
        button.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.75)
        button.layer.cornerRadius = 20
        button.alpha = 0.35
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(menuTapped), for: .touchUpInside)
        view.addSubview(button)

        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 40),
            button.heightAnchor.constraint(equalToConstant: 40),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
        self.menuButton = button
    }

    // MARK: - 菜单（换地址 / 服务列表 / 版本）

    @objc private func menuTapped() {
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
            self?.webView.reload()
        })
        sheet.addAction(UIAlertAction(title: "关于", style: .default) { [weak self] _ in
            self?.showAbout()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = menuButton
        present(sheet, animated: true)
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
        hasLoadedOnce = false
        // 新地址开始加载：先隐藏旧内容，避免残留上一个服务的画面
        UIView.animate(withDuration: 0.12) {
            self.webView.alpha = 0
        }
        webView.load(URLRequest(url: url))
    }

    // MARK: - 联网即加载

    @objc private func appDidBecomeActive() {
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
        errorDetailLabel.text = detail
        errorOverlay.isHidden = false
        errorOverlay.alpha = 0
        UIView.animate(withDuration: 0.2) {
            self.errorOverlay.alpha = 1
        }
    }

    private func hideError() {
        errorOverlay.isHidden = true
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
    }

    /// Web 内容进程被系统回收（内存压力/后台）时自动重连，避免只剩空白页。
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        activityIndicator.startAnimating()
        startNavigationTimeout()
        webView.reload()
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
