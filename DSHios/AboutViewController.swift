import UIKit

/// 关于页（v2.1.18 重构）
///
/// 老总 2026-11-06 令：「关于说明改这个地址，高亮可以打开直接跳转 Safari」
/// - 地址必须在正文里高亮显示（不是按钮伪装成文字）；
/// - 点一下直接用系统浏览器（Safari）打开；
/// - 地址只允许来自 ViewController 里的常量（projectReleasesURL），严禁在正文里硬编码裸 URL 字符串，
///   否则又变成「看着像链接点了没反应」的假链接（[关于·R65] 机械拦截）。
final class AboutViewController: UIViewController {

    // 由外部注入，保证地址与 ViewController 中唯一定义保持同源
    private let releasesURLString: String
    private let mirrorURLString: String
    private let repoURLString: String

    var onCheckUpdate: (() -> Void)?
    var onOpenGuide: (() -> Void)?

    init(releasesURLString: String, mirrorURLString: String, repoURLString: String) {
        self.releasesURLString = releasesURLString
        self.mirrorURLString = mirrorURLString
        self.repoURLString = repoURLString
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "关于"
        view.backgroundColor = .systemGroupedBackground
        setupUI()
    }

    // MARK: - UI

    private func setupUI() {
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scroll.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scroll.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scroll.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: scroll.bottomAnchor, constant: -20),
            stack.widthAnchor.constraint(equalTo: scroll.widthAnchor, constant: -32)
        ])

        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? AppDelegate.Version.marketing
        let build = info?["CFBundleVersion"] as? String ?? AppDelegate.Version.build

        let titleLabel = UILabel()
        titleLabel.text = "DeepSeek Harness iOS"
        titleLabel.font = .systemFont(ofSize: 22, weight: .bold)
        titleLabel.textColor = .label
        titleLabel.textAlignment = .left
        stack.addArrangedSubview(titleLabel)

        let versionLabel = UILabel()
        versionLabel.text = "版本：v\(version) (\(build))"
        versionLabel.font = .preferredFont(forTextStyle: .subheadline)
        versionLabel.textColor = .secondaryLabel
        versionLabel.textAlignment = .left
        stack.addArrangedSubview(versionLabel)

        // 地址卡片：正文里高亮显示地址，点一下直接跳 Safari
        stack.addArrangedSubview(makeCard(with: makeAddressTextView()))
        stack.addArrangedSubview(makeCard(with: makeHighlightTextView()))

        stack.addArrangedSubview(makeActionButton(title: "🚀 检查更新 / 下载最新包（国内免代理）",
                                                 background: .systemBlue,
                                                 titleColor: .white,
                                                 action: #selector(checkUpdateTapped)))
        stack.addArrangedSubview(makeActionButton(title: "📦 安装包发布页（GitHub Releases）",
                                                 background: .secondarySystemGroupedBackground,
                                                 titleColor: .label,
                                                 action: #selector(openReleasesTapped)))
        stack.addArrangedSubview(makeActionButton(title: "🌐 源码仓库（personal 分支）",
                                                 background: .secondarySystemGroupedBackground,
                                                 titleColor: .label,
                                                 action: #selector(openRepoTapped)))
        stack.addArrangedSubview(makeActionButton(title: "连接教程与更新说明",
                                                 background: .secondarySystemGroupedBackground,
                                                 titleColor: .label,
                                                 action: #selector(openGuideTapped)))
        stack.addArrangedSubview(makeActionButton(title: "关闭",
                                                 background: .secondarySystemGroupedBackground,
                                                 titleColor: .secondaryLabel,
                                                 action: #selector(closeTapped)))

        let footer = UILabel()
        footer.text = "这东西是我自己每天在用的，哪儿别扭直接说，我改。"
        footer.font = .preferredFont(forTextStyle: .footnote)
        footer.textColor = .tertiaryLabel
        footer.textAlignment = .left
        footer.numberOfLines = 0
        stack.addArrangedSubview(footer)
    }

    /// 地址说明区：地址以 .link 属性渲染 —— 系统自带蓝色高亮，点击由系统直接跳 Safari
    private func makeAddressTextView() -> UITextView {
        let textView = UITextView()
        textView.isEditable = false
        textView.isScrollEnabled = false
        textView.isSelectable = true
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.adjustsFontForContentSizeCategory = true
        textView.linkTextAttributes = [
            .foregroundColor: UIColor.systemBlue,
            .underlineStyle: NSUnderlineStyle.single.rawValue
        ]

        let body = NSMutableAttributedString()
        let bodyFont = UIFont.preferredFont(forTextStyle: .body)
        body.append(NSAttributedString(string: "项目就在这儿，点一下直接用 Safari 打开：\n", attributes: [
            .font: UIFont.preferredFont(forTextStyle: .subheadline),
            .foregroundColor: UIColor.secondaryLabel
        ]))
        if let url = URL(string: releasesURLString) {
            body.append(NSAttributedString(string: releasesURLString, attributes: [
                .font: bodyFont,
                .link: url
            ]))
        }
        body.append(NSAttributedString(string: "\n\n打不开多半是墙的事，不是链接坏了 —— 下面有一键镜像，一样下得到包。", attributes: [
            .font: UIFont.preferredFont(forTextStyle: .footnote),
            .foregroundColor: UIColor.secondaryLabel
        ]))
        textView.attributedText = body
        textView.textAlignment = .left
        return textView
    }

    /// 本版要点（[文案·R46] 校验：≤3 条、每条 ≤40 字、序号从 1 递增、靠左对齐）
    private func makeHighlightTextView() -> UITextView {
        let textView = UITextView()
        textView.isEditable = false
        textView.isScrollEnabled = false
        textView.isSelectable = false
        textView.backgroundColor = .clear
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.textAlignment = .left

        let points = """
        【本版要点】
        1. 服务连不上自动换备用线路（不限条数）
        2. 服务配置可一键分享给别的手机
        3. iOS 16.3 及以上可正常打开
        """
        textView.text = points
        textView.font = .preferredFont(forTextStyle: .subheadline)
        textView.textColor = .secondaryLabel
        return textView
    }

    private func makeCard(with content: UIView) -> UIView {
        let card = UIView()
        card.backgroundColor = .secondarySystemGroupedBackground
        card.layer.cornerRadius = 12
        content.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: card.topAnchor, constant: 14),
            content.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 14),
            content.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
            content.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14)
        ])
        return card
    }

    private func makeActionButton(title: String,
                                  background: UIColor,
                                  titleColor: UIColor,
                                  action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.titleLabel?.numberOfLines = 2
        button.titleLabel?.textAlignment = .center
        button.setTitleColor(titleColor, for: .normal)
        button.backgroundColor = background
        button.layer.cornerRadius = 12
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    // MARK: - Actions

    @objc private func checkUpdateTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onCheckUpdate?()
        }
    }

    @objc private func openReleasesTapped() {
        openExternal(releasesURLString)
    }

    @objc private func openRepoTapped() {
        openExternal(repoURLString)
    }

    @objc private func openGuideTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onOpenGuide?()
        }
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    private func openExternal(_ string: String) {
        guard let url = URL(string: string) else { return }
        UIApplication.shared.open(url, options: [:]) { ok in
            guard !ok else { return }
            // 跳转失败兜底：复制链接并提示（镜像地址一并给出，保证任何网络环境都能下载）
            UIPasteboard.general.string = string
            let alert = UIAlertController(title: "浏览器没打开",
                                          message: "链接我先复制好了：\n\(string)\n\n实在打不开就用镜像：\n\(self.mirrorURLString)",
                                          preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "镜像也复制一下", style: .default) { _ in
                UIPasteboard.general.string = self.mirrorURLString
            })
            alert.addAction(UIAlertAction(title: "好", style: .cancel))
            self.present(alert, animated: true)
        }
    }
}
