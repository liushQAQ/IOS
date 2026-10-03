import UIKit
import WebKit

final class ViewController: UIViewController {

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!
    private var urlTextField: UITextField!

    /// 默认加载的 DSH web UI 地址。替换为你的局域网/公网服务地址。
    private let defaultURL = "http://192.168.1.100:3081/dsh/"

    private struct Keys {
        static let lastURL = "DSHios.lastURL"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadInitialURL()
    }

    // MARK: - UI

    private func setupUI() {
        view.backgroundColor = .systemBackground
        title = "DeepSeek Harness"

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
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

            activity.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
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

        let settingsButton = UIButton(type: .system)
        settingsButton.setImage(UIImage(systemName: "gearshape"), for: .normal)
        settingsButton.addTarget(self, action: #selector(settingsTapped), for: .touchUpInside)

        bar.addArrangedSubview(textField)
        bar.addArrangedSubview(goButton)
        bar.addArrangedSubview(settingsButton)
        return bar
    }

    // MARK: - Loading

    private func loadInitialURL() {
        let saved = UserDefaults.standard.string(forKey: Keys.lastURL)
        let urlString = (saved?.isEmpty == false) ? saved! : defaultURL
        urlTextField.text = urlString
        loadURLString(urlString)
    }

    @objc private func loadTapped() {
        urlTextField.resignFirstResponder()
        guard let text = urlTextField.text, !text.isEmpty else { return }
        loadURLString(text)
    }

    @objc private func settingsTapped() {
        let settings = SettingsViewController { [weak self] newURL in
            self?.urlTextField.text = newURL
            self?.loadURLString(newURL)
        }
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
        guard let url = URL(string: finalString) else { return }

        UserDefaults.standard.set(trimmed, forKey: Keys.lastURL)
        urlTextField.text = finalString
        webView.load(URLRequest(url: url))
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        activityIndicator.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
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
