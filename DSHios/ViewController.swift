import UIKit
import WebKit

final class ViewController: UIViewController {

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!
    private var urlTextField: UITextField!
    private var errorOverlay: UIView!
    private var errorTitleLabel: UILabel!
    private var errorDetailLabel: UILabel!
    private var navigationTimer: Timer?

    /// 默认加载地址：DSH Pocket（桌面端 LAN 代理，明文 HTTP，免密码）。
    /// 桌面端需保持运行；端口 3083 由 dsh-pocket settings.json 固定。
    private let defaultURL = "http://192.168.215.218:3083/"

    private struct Keys {
        static let lastURL = "DSHios.lastURL"
        /// 保存 URL 的格式版本：旧版本保存过坏的 3081/dsh/ 地址，需迁移到新默认值。
        static let urlVersion = "DSHios.urlVersion"
        static let currentURLVersion = 2
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadInitialURL()
    }

    deinit {
        navigationTimer?.invalidate()
    }

    // MARK: - UI

    private func setupUI() {
        view.backgroundColor = .systemBackground
        title = "DeepSeek Harness"

        // 关于按钮（原生壳自带）：版本号随时可查，不依赖 web 会话
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "info.circle"),
            style: .plain,
            target: self,
            action: #selector(aboutTapped))

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        // 首帧到达前保持透明：加载期间用户看到的是原生壳（地址栏+转圈），
        // 不会出现"内容区一片白"的观感，也不会随 web 会话刷新而闪。
        webView.alpha = 0
        view.addSubview(webView)
        self.webView = webView

        let activity = UIActivityIndicatorView(style: .medium)
        activity.hidesWhenStopped = true
        activity.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activity)
        self.activityIndicator = activity

        let toolbar = buildToolbar()
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toolbar)

        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            webView.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            activity.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: webView.centerYAnchor)
        ])

        setupErrorOverlay()
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

        container.addArrangedSubview(icon)
        container.addArrangedSubview(title)
        container.addArrangedSubview(detail)
        container.addArrangedSubview(hint)
        container.addArrangedSubview(retryButton)

        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: webView.topAnchor),
            overlay.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: webView.bottomAnchor),

            container.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            container.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 32),
            container.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -32)
        ])

        self.errorOverlay = overlay
        self.errorTitleLabel = title
        self.errorDetailLabel = detail
    }

    private func buildToolbar() -> UIView {
        let bar = UIStackView()
        bar.axis = .horizontal
        bar.spacing = 8
        bar.alignment = .center

        let textField = UITextField()
        textField.borderStyle = .roundedRect
        textField.autocapitalizationType = .none
        textField.autocorrectionType = .no
        textField.keyboardType = .URL
        textField.returnKeyType = .go
        textField.placeholder = "DSH 服务地址"
        textField.delegate = self
        textField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        self.urlTextField = textField

        let goButton = UIButton(type: .system)
        goButton.setTitle("加载", for: .normal)
        goButton.addTarget(self, action: #selector(loadTapped), for: .touchUpInside)

        let servicesButton = UIButton(type: .system)
        servicesButton.setImage(UIImage(systemName: "list.bullet"), for: .normal)
        servicesButton.setTitle(" 服务", for: .normal)
        servicesButton.titleLabel?.font = .preferredFont(forTextStyle: .footnote)
        servicesButton.addTarget(self, action: #selector(servicesTapped), for: .touchUpInside)
        servicesButton.setContentHuggingPriority(.required, for: .horizontal)

        bar.addArrangedSubview(textField)
        bar.addArrangedSubview(goButton)
        bar.addArrangedSubview(servicesButton)
        return bar
    }

    /// 关于：版本号原生可见（读 Info.plist，回退到编译期常量）
    @objc private func aboutTapped() {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? AppDelegate.Version.marketing
        let build = info?["CFBundleVersion"] as? String ?? AppDelegate.Version.build
        let alert = UIAlertController(
            title: "DeepSeek Harness iOS",
            message: """
            版本：\(version) (\(build))

            默认服务：http://192.168.215.218:3083/
            外壳为原生，内容区加载电脑端 DSH
            """,
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
    }

    /// 原生服务切换入口：不依赖 web 页面是否已加载，随时可跳转任意已保存地址。
    @objc private func servicesTapped() {
        urlTextField.resignFirstResponder()
        let sheet = UIAlertController(title: "服务列表", message: nil, preferredStyle: .actionSheet)
        for item in ServiceStore.load() {
            sheet.addAction(UIAlertAction(title: item.name, style: .default) { [weak self] _ in
                self?.loadURLString(item.url)
            })
        }
        sheet.addAction(UIAlertAction(title: "管理服务…", style: .default) { [weak self] _ in
            self?.settingsTapped()
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = view
        present(sheet, animated: true)
    }

    // MARK: - Loading

    private func loadInitialURL() {
        migrateSavedURLIfNeeded()
        let saved = UserDefaults.standard.string(forKey: Keys.lastURL)
        let urlString = (saved?.isEmpty == false) ? saved! : defaultURL
        urlTextField.text = urlString
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

    @objc private func loadTapped() {
        urlTextField.resignFirstResponder()
        guard let text = urlTextField.text, !text.isEmpty else { return }
        loadURLString(text)
    }

    @objc private func retryTapped() {
        guard let text = urlTextField.text, !text.isEmpty else { return }
        loadURLString(text)
    }

    @objc private func settingsTapped() {
        let settings = SettingsViewController(
            onSave: { [weak self] newURL in
                self?.urlTextField.text = newURL
            },
            onSelect: { [weak self] newURL in
                self?.loadURLString(newURL)
            })
        navigationController?.pushViewController(settings, animated: true)
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
        urlTextField.text = finalString
        hideError()
        // 新地址开始加载：先隐藏旧内容，避免残留上一个服务的画面
        UIView.animate(withDuration: 0.12) {
            self.webView.alpha = 0
        }
        webView.load(URLRequest(url: url))
    }

    // MARK: - Error overlay

    /// webView 只在内容就绪后显形，加载中/失败时露出的是原生壳（地址栏 + 转圈 / 错误提示）。
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
        // 内容首帧就绪后才显形：加载过程只显示原生壳，永不白屏
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

// MARK: - UITextFieldDelegate

extension ViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        loadTapped()
        return true
    }
}
