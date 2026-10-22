import UIKit

final class AboutViewController: UIViewController {
    private let crashLabel = UILabel()
    private let crashButton = UIButton(type: .system)
    private let safeModeButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "关于与更新"
        view.backgroundColor = .systemBackground

        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)

        let content = UIView()
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)

        let text = UILabel()
        text.numberOfLines = 0
        text.font = .systemFont(ofSize: 15)
        text.textColor = .label
        text.translatesAutoresizingMaskIntoConstraints = false
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.10"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

        text.text = """
        手机助手 (ios-mcp-agent)
        版本：v\(version) (Build \(build))
        开发者：liush（GitHub: liush734530963）
        开源主页：https://github.com/liush734530963/ios-mcp-agent-public

        【功能原理与环境边界】
        1. 越狱设备（已装 iOS-MCP 8090 端口）：
           - 支持 AI 自然语言全自动拆解步骤驱动设备；
           - 支持定时工作流自动亮屏、自动输入 4/6 位锁屏密码解锁、调起任意 App 及模拟点击滑动。
        2. 纯巨魔设备（TrollStore 未越狱，无法装 iOS-MCP）：
           - 支持后台常驻定时工作流：无感切换深色/浅色模式、软注销桌面(Respring)、跳转勿扰模式、URL 调起应用；
           - 针对夜间挂机无法输锁屏密码的问题，内置「纯黑伪熄屏(0亮度)」模式，绕过真锁屏，次日自动恢复亮度并打开应用。

        ==============================
        🌟 最新更新日志 (v1.0.11)
        ==============================
        【iPad 兼容与闪退专项修复】
        1. 修复 iPad 上大量按钮一点就闪退：
           - 根因：iPad 会把 actionSheet 自动转成 popover，未提供锚点（sourceView/sourceRect）时
             UIKit 直接抛 NSInternalInconsistencyException 闪退（iPhone 上不会）；
           - 现已统一收口到 AlertCompat，所有弹层自动补锚点并排队呈现，覆盖全部 20+ 处弹窗。
        2. 修复分享/文件导出弹层在 iPad 上的同类崩溃（UIActivityViewController 缺锚点）。
        3. 补齐 iPad 专用方向键 UISupportedInterfaceOrientations~ipad（四方向全开），
           避免竖屏专项配置在 iPad 横屏/分屏下触发方向不匹配异常。
        4. 修复启动期潜在的数组越界：Documents 目录查询在异常沙盒下返回空数组时，
           旧写法 [0] 会直接闪退，现已改为安全兜底，保证 App 一定能打开。

        【崩溃现场自诊断（本次新增）】
        5. 内置崩溃守卫 CrashGuard：
           - 自动捕获未捕获异常并写入 Documents/ios_mcp_data/last_crash.log；
           - 启动时打「启动中」标记，4 秒仍存活才清除；若上次启动中断（闪退），
             下次启动自动进入「安全模式」：跳过后台音频保活、自动更新检查与默认定时引擎，
             优先保证 App 能正常打开，并在本页展示上次闪退现场。
        6. 本页新增「查看崩溃日志」与「退出安全模式」按钮，方便定位与一键恢复。

        ==============================
        🌟 历史重要更新 (v1.0.10)
        ==============================
        - 标配在线检测更新：主界面启动静默检测，关于页支持一键升级；
        - 根治巨魔 301 报错：App 内免代理极速下载 + 本地直调巨魔安装；
        - 统一单一公开版：零凭据、纯净开源基线，本地沙盒数据 100% 自动继承。

        ==============================
        📖 使用前检查与 iOS-MCP 安装指引
        ==============================
        1. 若需 AI 自动化点击与自动输密码解锁，请确保设备已越狱并安装 iOS-MCP 插件 (GitHub: witchan/iOS-MCP)。
        2. 确保在设备上开启服务后，Safari 打开 http://127.0.0.1:8090/health 能看到 status:ok。
        3. 若为纯巨魔未越狱设备，无需安装 iOS-MCP，可直接进入右上角「定时/工作流」使用系统外观切换、软注销与伪熄屏打卡。
        """

        // 崩溃诊断面板
        crashLabel.numberOfLines = 0
        crashLabel.font = .systemFont(ofSize: 13)
        crashLabel.textColor = .secondaryLabel
        crashLabel.translatesAutoresizingMaskIntoConstraints = false

        crashButton.setTitle("🩺 查看崩溃日志", for: .normal)
        crashButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        crashButton.backgroundColor = .secondarySystemBackground
        crashButton.layer.cornerRadius = 8
        crashButton.translatesAutoresizingMaskIntoConstraints = false
        crashButton.addTarget(self, action: #selector(showCrashLog), for: .touchUpInside)

        safeModeButton.setTitle("🔓 退出安全模式并恢复正常启动", for: .normal)
        safeModeButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        safeModeButton.backgroundColor = .secondarySystemBackground
        safeModeButton.setTitleColor(.systemBlue, for: .normal)
        safeModeButton.layer.cornerRadius = 8
        safeModeButton.translatesAutoresizingMaskIntoConstraints = false
        safeModeButton.addTarget(self, action: #selector(exitSafeMode), for: .touchUpInside)

        let checkUpdateButton = UIButton(type: .system)
        checkUpdateButton.setTitle("🚀 检查新版本 (巨魔免代理直装)", for: .normal)
        checkUpdateButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        checkUpdateButton.backgroundColor = .systemBlue
        checkUpdateButton.setTitleColor(.white, for: .normal)
        checkUpdateButton.layer.cornerRadius = 10
        checkUpdateButton.translatesAutoresizingMaskIntoConstraints = false
        checkUpdateButton.addTarget(self, action: #selector(checkUpdateTapped), for: .touchUpInside)

        content.addSubview(text)
        content.addSubview(crashLabel)
        content.addSubview(crashButton)
        content.addSubview(safeModeButton)
        content.addSubview(checkUpdateButton)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            content.topAnchor.constraint(equalTo: scroll.topAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: scroll.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: scroll.bottomAnchor),
            content.widthAnchor.constraint(equalTo: scroll.widthAnchor),

            text.topAnchor.constraint(equalTo: content.topAnchor, constant: 12),
            text.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 14),
            text.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -14),

            crashLabel.topAnchor.constraint(equalTo: text.bottomAnchor, constant: 12),
            crashLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            crashLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),

            crashButton.topAnchor.constraint(equalTo: crashLabel.bottomAnchor, constant: 10),
            crashButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            crashButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
            crashButton.heightAnchor.constraint(equalToConstant: 44),

            safeModeButton.topAnchor.constraint(equalTo: crashButton.bottomAnchor, constant: 8),
            safeModeButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            safeModeButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
            safeModeButton.heightAnchor.constraint(equalToConstant: 44),

            checkUpdateButton.topAnchor.constraint(equalTo: safeModeButton.bottomAnchor, constant: 12),
            checkUpdateButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            checkUpdateButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
            checkUpdateButton.heightAnchor.constraint(equalToConstant: 48),
            checkUpdateButton.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -20)
        ])

        refreshDiagnostics()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refreshDiagnostics()
    }

    private func refreshDiagnostics() {
        let guardInstance = CrashGuard.shared
        var parts: [String] = []
        if guardInstance.safeMode {
            parts.append("🛡️ 当前处于「安全模式」（上次启动疑似闪退，已自动跳过高风险启动项）")
        } else {
            parts.append("✅ 启动状态正常（未检测到上次闪退）")
        }
        parts.append("累计崩溃记录：\(guardInstance.crashCount) 次")
        parts.append("机型：\(CrashGuard.deviceModelIdentifier()) ｜ 系统：\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)")
        parts.append("界面类型：\(UIDevice.current.userInterfaceIdiom == .pad ? "iPad (pad)" : "iPhone (phone)")")
        if let report = guardInstance.readLastReport(), !report.isEmpty {
            let head = report.split(separator: "\n").prefix(6).joined(separator: "\n")
            parts.append("—— 上次崩溃摘要 ——\n\(head)")
        }
        crashLabel.text = parts.joined(separator: "\n")
        safeModeButton.isHidden = !guardInstance.safeMode
    }

    @objc private func showCrashLog() {
        let report = CrashGuard.shared.readLastReport()
        let message = (report?.isEmpty == false ? report! : "暂无崩溃记录。\n\n若 App 仍会闪退，请到 iPad「设置 → 隐私与安全性 → 分析与改进 → 分析数据」中查找以 ios-mcp-agent 开头的 .ips 文件，那是系统级崩溃报告。")
        let alert = UIAlertController(title: "崩溃日志", message: String(message.prefix(4000)), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "复制全部", style: .default) { _ in
            UIPasteboard.general.string = message
        })
        alert.addAction(UIAlertAction(title: "清空记录", style: .destructive) { [weak self] _ in
            CrashGuard.shared.clearReports()
            self?.refreshDiagnostics()
        })
        alert.addAction(UIAlertAction(title: "关闭", style: .cancel))
        presentAlertSafely(alert)
    }

    @objc private func exitSafeMode() {
        let alert = UIAlertController(
            title: "退出安全模式",
            message: "退出后下次启动将恢复全部功能（后台保活、自动更新检查、定时引擎）。若再次闪退，App 会自动重新进入安全模式。",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确认退出", style: .default) { [weak self] _ in
            CrashGuard.shared.resetSafeMode()
            self?.refreshDiagnostics()
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentAlertSafely(alert)
    }

    @objc private func checkUpdateTapped() {
        AppUpdateManager.shared.checkForUpdates(manual: true)
    }
}
