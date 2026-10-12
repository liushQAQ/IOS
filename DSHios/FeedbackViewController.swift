import UIKit

/// 反馈与建议页面：支持玩家和用户反馈 Bug、提交建议、一键复制设备与网络运行诊断信息
final class FeedbackViewController: UIViewController {

    private let scrollView = UIScrollView()
    private let contentView = UIView()

    private let typeSegment = UISegmentedControl(items: ["界面排版", "切后台卡死", "键盘动画", "网络连接", "功能建议"])
    private let detailTextView = UITextView()
    private let placeholderLabel = UILabel()
    private let contactField = UITextField()
    private let diagTextView = UITextView()

    private let currentURLString: String

    init(currentURL: String = "") {
        self.currentURLString = currentURL
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadDiagnostics()
    }

    private func setupUI() {
        title = "反馈与建议"
        view.backgroundColor = .systemGroupedBackground

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "关闭", style: .plain, target: self, action: #selector(closeTapped))
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "提交", style: .done, target: self, action: #selector(submitTapped))

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        contentView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)
        scrollView.addSubview(contentView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor)
        ])

        // 1. 问题分类
        let typeHeader = makeSectionHeader("问题类型")
        typeSegment.selectedSegmentIndex = 1
        typeSegment.translatesAutoresizingMaskIntoConstraints = false

        // 2. 详细说明
        let detailHeader = makeSectionHeader("问题或建议描述")
        let detailBox = UIView()
        detailBox.backgroundColor = .secondarySystemGroupedBackground
        detailBox.layer.cornerRadius = 10
        detailBox.translatesAutoresizingMaskIntoConstraints = false

        detailTextView.backgroundColor = .clear
        detailTextView.font = .preferredFont(forTextStyle: .body)
        detailTextView.delegate = self
        detailTextView.translatesAutoresizingMaskIntoConstraints = false

        placeholderLabel.text = "请详细描述您遇到的现象（如：切换后台几分钟回来卡死、关闭键盘太快等）…"
        placeholderLabel.font = .preferredFont(forTextStyle: .subheadline)
        placeholderLabel.textColor = .tertiaryLabel
        placeholderLabel.numberOfLines = 0
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false

        detailBox.addSubview(detailTextView)
        detailBox.addSubview(placeholderLabel)
        NSLayoutConstraint.activate([
            detailTextView.topAnchor.constraint(equalTo: detailBox.topAnchor, constant: 8),
            detailTextView.leadingAnchor.constraint(equalTo: detailBox.leadingAnchor, constant: 10),
            detailTextView.trailingAnchor.constraint(equalTo: detailBox.trailingAnchor, constant: -10),
            detailTextView.bottomAnchor.constraint(equalTo: detailBox.bottomAnchor, constant: -8),
            detailTextView.heightAnchor.constraint(equalToConstant: 120),

            placeholderLabel.topAnchor.constraint(equalTo: detailTextView.topAnchor, constant: 8),
            placeholderLabel.leadingAnchor.constraint(equalTo: detailTextView.leadingAnchor, constant: 5),
            placeholderLabel.trailingAnchor.constraint(equalTo: detailTextView.trailingAnchor, constant: -5)
        ])

        // 3. 联系方式
        let contactHeader = makeSectionHeader("联系方式（选填）")
        let contactBox = UIView()
        contactBox.backgroundColor = .secondarySystemGroupedBackground
        contactBox.layer.cornerRadius = 10
        contactBox.translatesAutoresizingMaskIntoConstraints = false

        contactField.placeholder = "微信 / QQ / 邮箱（方便回访与测试验证）"
        contactField.font = .preferredFont(forTextStyle: .body)
        contactField.clearButtonMode = .whileEditing
        contactField.translatesAutoresizingMaskIntoConstraints = false
        contactBox.addSubview(contactField)
        NSLayoutConstraint.activate([
            contactField.topAnchor.constraint(equalTo: contactBox.topAnchor, constant: 12),
            contactField.bottomAnchor.constraint(equalTo: contactBox.bottomAnchor, constant: -12),
            contactField.leadingAnchor.constraint(equalTo: contactBox.leadingAnchor, constant: 12),
            contactField.trailingAnchor.constraint(equalTo: contactBox.trailingAnchor, constant: -12)
        ])

        // 4. 诊断信息
        let diagHeader = makeSectionHeader("当前设备运行诊断信息")
        let diagBox = UIView()
        diagBox.backgroundColor = .secondarySystemGroupedBackground
        diagBox.layer.cornerRadius = 10
        diagBox.translatesAutoresizingMaskIntoConstraints = false

        diagTextView.backgroundColor = .clear
        diagTextView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        diagTextView.textColor = .secondaryLabel
        diagTextView.isEditable = false
        diagTextView.translatesAutoresizingMaskIntoConstraints = false

        let copyBtn = UIButton(type: .system)
        copyBtn.setTitle("📋 复制全部诊断信息（发微信/发群）", for: .normal)
        copyBtn.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        copyBtn.backgroundColor = .systemBlue.withAlphaComponent(0.12)
        copyBtn.layer.cornerRadius = 8
        copyBtn.addTarget(self, action: #selector(copyDiagTapped), for: .touchUpInside)
        copyBtn.translatesAutoresizingMaskIntoConstraints = false

        diagBox.addSubview(diagTextView)
        diagBox.addSubview(copyBtn)
        NSLayoutConstraint.activate([
            diagTextView.topAnchor.constraint(equalTo: diagBox.topAnchor, constant: 8),
            diagTextView.leadingAnchor.constraint(equalTo: diagBox.leadingAnchor, constant: 8),
            diagTextView.trailingAnchor.constraint(equalTo: diagBox.trailingAnchor, constant: -8),
            diagTextView.heightAnchor.constraint(equalToConstant: 130),

            copyBtn.topAnchor.constraint(equalTo: diagTextView.bottomAnchor, constant: 6),
            copyBtn.leadingAnchor.constraint(equalTo: diagBox.leadingAnchor, constant: 12),
            copyBtn.trailingAnchor.constraint(equalTo: diagBox.trailingAnchor, constant: -12),
            copyBtn.bottomAnchor.constraint(equalTo: diagBox.bottomAnchor, constant: -10),
            copyBtn.heightAnchor.constraint(equalToConstant: 36)
        ])

        // 整体排列
        let stack = UIStackView(arrangedSubviews: [
            typeHeader, typeSegment,
            detailHeader, detailBox,
            contactHeader, contactBox,
            diagHeader, diagBox
        ])
        stack.axis = .vertical
        stack.spacing = 8
        stack.setCustomSpacing(16, after: typeSegment)
        stack.setCustomSpacing(16, after: detailBox)
        stack.setCustomSpacing(16, after: contactBox)
        stack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -32)
        ])
    }

    private func makeSectionHeader(_ title: String) -> UILabel {
        let label = UILabel()
        label.text = title
        label.font = .preferredFont(forTextStyle: .footnote)
        label.textColor = .secondaryLabel
        return label
    }

    private func loadDiagnostics() {
        let appVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.86"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "21"
        let sysVer = UIDevice.current.systemVersion
        let model = UIDevice.current.model
        let screen = "\(Int(UIScreen.main.bounds.width))×\(Int(UIScreen.main.bounds.height))"
        let url = currentURLString.isEmpty ? "未连接" : currentURLString

        let text = """
        【应用版本】DSHios v\(appVer) (Build \(build))
        【系统环境】iOS \(sysVer) (\(model))
        【屏幕分辨率】\(screen) (@\(Int(UIScreen.main.scale))x)
        【当前访问地址】\(url)
        【生成时间】\(Date())
        """
        diagTextView.text = text
    }

    @objc private func copyDiagTapped() {
        UIPasteboard.general.string = diagTextView.text
        let alert = UIAlertController(title: "已复制诊断信息", message: "诊断信息已复制到剪贴板，您可以直接粘贴发送给技术支持或群聊中。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    @objc private func submitTapped() {
        let detail = detailTextView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if detail.isEmpty {
            let alert = UIAlertController(title: "请输入描述", message: "请填写您遇到的问题或建议描述，方便我们跟进。", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "好", style: .default))
            present(alert, animated: true)
            return
        }

        let selectedType = typeSegment.titleForSegment(at: typeSegment.selectedSegmentIndex) ?? "建议"
        let contact = contactField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        let report = """
        【类型】\(selectedType)
        【描述】\(detail)
        【联系方式】\(contact)
        \n\(diagTextView.text ?? "")
        """

        // 保存一份到沙盒供离线归档
        let dir = FileManager.default.temporaryDirectory
        let fileURL = dir.appendingPathComponent("feedback_\(Int(Date().timeIntervalSince1970)).txt")
        try? report.write(to: fileURL, atomically: true, encoding: .utf8)

        let alert = UIAlertController(
            title: "感谢您的反馈！",
            message: "您的反馈建议与诊断数据已生成。\n\n是否同时前往 GitHub Issues 仓库在线提交？",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "复制内容并打开 GitHub", style: .default) { [weak self] _ in
            UIPasteboard.general.string = report
            if let issueURL = URL(string: "https://github.com/liushQAQ/IOS/issues/new") {
                UIApplication.shared.open(issueURL)
            }
            self?.dismiss(animated: true)
        })
        alert.addAction(UIAlertAction(title: "直接完成", style: .cancel) { [weak self] _ in
            self?.dismiss(animated: true)
        })
        present(alert, animated: true)
    }
}

extension FeedbackViewController: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        placeholderLabel.isHidden = !textView.text.isEmpty
    }
}
