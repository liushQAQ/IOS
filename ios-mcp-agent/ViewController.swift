import UIKit

final class ViewController: UIViewController {
    private let input = UITextView()
    private let logView = UITextView()
    private let send = UIButton(type: .system)
    private let stop = UIButton(type: .system)
    private var runner: AgentRunner?
    private let mcpBanner = UIView()
    private let mcpStatusLabel = UILabel()
    private let mcpGuideButton = UIButton(type: .system)
    private var lines: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "手机助手"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "关于", style: .plain, target: self, action: #selector(openAbout))
        let settingsBtn = UIBarButtonItem(
            title: "模型", style: .plain, target: self, action: #selector(openSettings))
        let cronBtn = UIBarButtonItem(
            title: "定时/工作流", style: .done, target: self, action: #selector(openCron))
        navigationItem.rightBarButtonItems = [settingsBtn, cronBtn]

        // 启动时自动激活后台常驻 Cron 定时引擎
        CronEngine.shared.start()

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

        setupMcpBanner()

        let stack = UIStackView(arrangedSubviews: [mcpBanner, input, buttons, logView])
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

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        checkMcpStatus()
    }

    private func setupMcpBanner() {
        mcpBanner.backgroundColor = .secondarySystemBackground
        mcpBanner.layer.cornerRadius = 8
        mcpBanner.layer.borderWidth = 1
        mcpBanner.layer.borderColor = UIColor.separator.cgColor

        mcpStatusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        mcpStatusLabel.textColor = .secondaryLabel
        mcpStatusLabel.text = "🔍 正在检测 iOS-MCP 驱动服务..."

        mcpGuideButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .bold)
        mcpGuideButton.setTitle("安装指引 📖", for: .normal)
        mcpGuideButton.setTitleColor(.systemBlue, for: .normal)
        mcpGuideButton.addTarget(self, action: #selector(showMcpGuide), for: .touchUpInside)

        let hstack = UIStackView(arrangedSubviews: [mcpStatusLabel, mcpGuideButton])
        hstack.axis = .horizontal
        hstack.spacing = 8
        hstack.alignment = .center
        hstack.distribution = .equalSpacing
        hstack.translatesAutoresizingMaskIntoConstraints = false

        mcpBanner.addSubview(hstack)
        NSLayoutConstraint.activate([
            hstack.topAnchor.constraint(equalTo: mcpBanner.topAnchor, constant: 8),
            hstack.bottomAnchor.constraint(equalTo: mcpBanner.bottomAnchor, constant: -8),
            hstack.leadingAnchor.constraint(equalTo: mcpBanner.leadingAnchor, constant: 12),
            hstack.trailingAnchor.constraint(equalTo: mcpBanner.trailingAnchor, constant: -12)
        ])
    }

    private func checkMcpStatus() {
        Task {
            let isMcpOk = await EnvironmentDetector.shared.checkMcpReachability(port: 8090)
            await MainActor.run { [weak self] in
                guard let self = self else { return }
                if isMcpOk {
                    self.mcpBanner.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.12)
                    self.mcpBanner.layer.borderColor = UIColor.systemGreen.withAlphaComponent(0.4).cgColor
                    self.mcpStatusLabel.text = "🟢 iOS-MCP 8090 在线 (具备 SpringBoard 驱动能力)"
                    self.mcpStatusLabel.textColor = .systemGreen
                    self.mcpGuideButton.setTitle("运行正常", for: .normal)
                    self.mcpGuideButton.setTitleColor(.systemGreen, for: .normal)
                } else {
                    self.mcpBanner.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.12)
                    self.mcpBanner.layer.borderColor = UIColor.systemOrange.withAlphaComponent(0.4).cgColor
                    self.mcpStatusLabel.text = "🔴 未检测到 iOS-MCP (8090 未就绪)"
                    self.mcpStatusLabel.textColor = .systemOrange
                    self.mcpGuideButton.setTitle("安装指引 📖", for: .normal)
                    self.mcpGuideButton.setTitleColor(.systemBlue, for: .normal)
                }
            }
        }
    }

    @objc private func showMcpGuide() {
        let alert = UIAlertController(
            title: "iOS-MCP 安装与运行指引",
            message: """
            【什么是 iOS-MCP？】
            iOS-MCP 是运行在越狱 iPhone 上的底层自动化服务（端口 8090）。本 App 需要通过 8090 端口驱动屏幕模拟点击、滑动及读取原生 UI 元素树。

            【未检测到 8090 时排查指引】
            1. 环境要求：
               - iOS-MCP 强依赖 SpringBoard Hook 与 ElleKit，必须越狱设备方可运行（纯巨魔环境无法运行该服务端，但可运行右上角「定时/工作流」的伪熄屏打卡与系统外观切换）。
            2. 安装越狱插件：
               - 在越狱包管理器（Sileo / Zebra）中安装最新版 iOS-MCP 插件或其 Deb 包；
               - 确保依赖 ElleKit 或相应越狱注入框架正常开启。
            3. 启动并验证服务：
               - 安装后通常开机或注销(Respring)后自动启动；
               - 可在 iPhone 上的 Safari 浏览器直接访问测试：
                 http://127.0.0.1:8090/health
                 若页面显示 {"status":"ok"}，即表示服务运行正常！
            4. 官方开源项目主页：
               - https://github.com/witchan/iOS-MCP
            """,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Safari 打开项目主页", style: .default, handler: { _ in
            if let url = URL(string: "https://github.com/witchan/iOS-MCP") {
                UIApplication.shared.open(url)
            }
        }))
        alert.addAction(UIAlertAction(title: "测试连接 (8090)", style: .default, handler: { [weak self] _ in
            self?.checkMcpStatus()
        }))
        alert.addAction(UIAlertAction(title: "我知道了", style: .cancel))
        present(alert, animated: true)
    }

    @objc private func openSettings() {
        navigationController?.pushViewController(SettingsViewController(), animated: true)
    }

    @objc private func openCron() {
        navigationController?.pushViewController(CronTasksViewController(), animated: true)
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

        // 运行时先快速做一次 MCP 8090 连通性判断，若未安装/未连通则弹窗提醒
        Task { [weak self] in
            guard let self = self else { return }
            let isMcpOk = await EnvironmentDetector.shared.checkMcpReachability(port: 8090)
            if !isMcpOk {
                await MainActor.run {
                    let alert = UIAlertController(
                        title: "⚠️ 未检测到 iOS-MCP 服务",
                        message: "本机未检测到 8090 端口 iOS-MCP 驱动服务，自动化模拟点击与 UI 元素树读取可能无法正常工作。\n\n是否继续尝试执行，或查看安装配置指引？",
                        preferredStyle: .alert
                    )
                    alert.addAction(UIAlertAction(title: "查看安装指引", style: .default, handler: { [weak self] _ in
                        self?.showMcpGuide()
                    }))
                    alert.addAction(UIAlertAction(title: "强行执行", style: .destructive, handler: { [weak self] _ in
                        self?.executeAgentTask(task: task, config: config)
                    }))
                    alert.addAction(UIAlertAction(title: "取消", style: .cancel))
                    self.present(alert, animated: true)
                }
            } else {
                await MainActor.run {
                    self.executeAgentTask(task: task, config: config)
                }
            }
        }
    }

    private func executeAgentTask(task: String, config: AgentConfig) {
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
