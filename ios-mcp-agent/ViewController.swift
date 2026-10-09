import UIKit

final class ViewController: UIViewController {
    private let input = UITextView()
    private let logView = UITextView()
    private let send = UIButton(type: .system)
    private let stop = UIButton(type: .system)
    private var runner: AgentRunner?
    private var lines: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "手机助手"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "关于", style: .plain, target: self, action: #selector(openAbout))
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "模型", style: .plain, target: self, action: #selector(openSettings))

        input.font = .systemFont(ofSize: 17)
        input.layer.borderColor = UIColor.separator.cgColor
        input.layer.borderWidth = 1
        input.layer.cornerRadius = 8
        input.text = "帮我打开微信，找到好友ZZ发信息"
        input.textContainerInset = UIEdgeInsets(top: 8, left: 6, bottom: 8, right: 6)

        logView.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        logView.isEditable = false
        logView.backgroundColor = .secondarySystemBackground
        logView.layer.cornerRadius = 8
        logView.textContainerInset = UIEdgeInsets(top: 8, left: 6, bottom: 8, right: 6)

        send.setTitle("开始", for: .normal)
        send.titleLabel?.font = .boldSystemFont(ofSize: 18)
        send.addTarget(self, action: #selector(start), for: .touchUpInside)
        stop.setTitle("停止", for: .normal)
        stop.addTarget(self, action: #selector(halt), for: .touchUpInside)
        stop.isEnabled = false

        let buttons = UIStackView(arrangedSubviews: [send, stop])
        buttons.axis = .horizontal
        buttons.spacing = 16
        buttons.distribution = .fillEqually

        let stack = UIStackView(arrangedSubviews: [input, buttons, logView])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            input.heightAnchor.constraint(equalToConstant: 96),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
    }

    @objc private func openSettings() {
        navigationController?.pushViewController(SettingsViewController(), animated: true)
    }

    @objc private func openAbout() {
        navigationController?.pushViewController(AboutViewController(), animated: true)
    }

    @objc private func start() {
        view.endEditing(true)
        let task = input.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !task.isEmpty else { return }
        let config = AgentConfig.load()
        guard !config.llmKey.isEmpty else {
            append("先点右上角「模型」，填接口、密钥、模型名")
            return
        }
        lines = []
        logView.text = ""
        send.isEnabled = false
        stop.isEnabled = true
        let runner = AgentRunner(config: config)
        self.runner = runner
        BackgroundKeeper.shared.start()
        Task { [weak self] in
            await runner.run(task: task) { line in
                Task { @MainActor in self?.append(line) }
            }
            await MainActor.run {
                BackgroundKeeper.shared.stop()
                self?.send.isEnabled = true
                self?.stop.isEnabled = false
                self?.runner = nil
            }
        }
    }

    @objc private func halt() {
        runner?.stop()
        BackgroundKeeper.shared.stop()
    }

    private func append(_ line: String) {
        lines.append(line)
        logView.text = lines.joined(separator: "\n")
        let end = NSRange(location: max(0, (logView.text as NSString).length - 1), length: 1)
        logView.scrollRangeToVisible(end)
    }
}
