import UIKit

final class CronTasksViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private var envReport: EnvironmentReport?

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "定时与工作流 (Cron)"
        view.backgroundColor = .systemGroupedBackground

        let addWorkflowBtn = UIBarButtonItem(
            title: "新建工作流", style: .done, target: self, action: #selector(addNewTask)
        )
        navigationItem.rightBarButtonItem = addWorkflowBtn

        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "DefaultCell")
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // 启动常驻定时与保活引擎
        CronEngine.shared.start()

        // 真实探测环境与 8090 MCP 服务连通性
        refreshEnvironment()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        CronEngine.shared.loadTasks()
        CronEngine.shared.loadQuickActions()
        refreshEnvironment()
    }

    private func refreshEnvironment() {
        Task {
            let rep = await EnvironmentDetector.shared.diagnose()
            await MainActor.run {
                self.envReport = rep
                self.tableView.reloadData()
            }
        }
    }

    // MARK: - Actions

    @objc private func addNewTask() {
        var newTask = CronTask(name: "新定时工作流", isEnabled: true)
        newTask.triggerMode = .multiTime
        newTask.timePointsText = "09:00"
        newTask.conditionItems = [
            ConditionItem(type: .minBattery, param: "20", isEnabled: true)
        ]
        newTask.steps = [
            WorkflowStep(type: .wakeAndHome, title: "唤醒屏幕并拉起密码盘"),
            WorkflowStep(type: .unlockWithPasscode, title: "自动输入锁屏密码", param: "123456"),
            WorkflowStep(type: .launchApp, title: "打开微信", param: "com.tencent.xin")
        ]
        let editor = CronTaskEditViewController(task: newTask, isNew: true)
        navigationController?.pushViewController(editor, animated: true)
    }

    @objc private func addNewQuickAction() {
        let alert = UIAlertController(title: "新建快捷动作", message: "创建专属的一键单点触发动作", preferredStyle: .alert)
        alert.addTextField { tf in tf.placeholder = "动作标题 (例如: 开启网易云)" }
        alert.addTextField { tf in tf.placeholder = "描述副标题 (例如: 自动播放通勤歌单)" }
        
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "下一步 (选择动作类型)", style: .default) { [weak self] _ in
            guard let self = self else { return }
            let title = alert.textFields?[0].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "自定义动作"
            let sub = alert.textFields?[1].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            self.showStepPickerForQuickAction(title: title, subtitle: sub, editItem: nil)
        })
        presentAlertSafely(alert)
    }

    private func showStepPickerForQuickAction(title: String, subtitle: String, editItem: QuickActionItem?) {
        let sheet = UIAlertController(title: "为【\(title)】配置动作", message: "选择要执行的原子指令", preferredStyle: .actionSheet)

        sheet.addAction(UIAlertAction(title: "📱 启动指定应用 (从常用库点选)...", style: .default) { [weak self] _ in
            self?.pickAppForQuickAction(title: title, subtitle: subtitle, editItem: editItem)
        })

        let defaultSteps: [(String, WorkflowStep)] = [
            ("☀️ 切换浅色模式 (关闭暗黑)", WorkflowStep(type: .setDarkMode, title: "浅色模式", param: "light")),
            ("🌙 切换深色模式 (开启暗黑)", WorkflowStep(type: .setDarkMode, title: "深色模式", param: "dark")),
            ("🌑 进入纯黑伪熄屏挂机 (0亮度)", WorkflowStep(type: .fakeSleepMode, title: "纯黑伪熄屏")),
            ("🔆 恢复屏幕亮度 (50%)", WorkflowStep(type: .restoreBrightness, title: "恢复屏幕亮度")),
            ("🔕 开启勿扰/专注模式", WorkflowStep(type: .setDND, title: "开启勿扰模式", param: "on")),
            ("🔔 关闭勿扰/专注模式", WorkflowStep(type: .setDND, title: "关闭勿扰模式", param: "off")),
            ("📢 发送本地通知提醒", WorkflowStep(type: .notify, title: "发送通知", param: "测试通知已到达")),
            ("🔄 软注销系统 (Respring)", WorkflowStep(type: .respring, title: "注销系统")),
            ("🔒 熄屏锁屏", WorkflowStep(type: .lockScreen, title: "熄屏锁屏"))
        ]

        for (label, step) in defaultSteps {
            sheet.addAction(UIAlertAction(title: label, style: .default) { [weak self] _ in
                let item = QuickActionItem(title: title, subtitle: subtitle.isEmpty ? label : subtitle, step: step, isSystemPreset: false)
                if let old = editItem {
                    var updated = item
                    updated.id = old.id
                    CronEngine.shared.updateQuickAction(updated)
                } else {
                    CronEngine.shared.addQuickAction(item)
                }
                self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
            })
        }

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func pickAppForQuickAction(title: String, subtitle: String, editItem: QuickActionItem?) {
        let sheet = UIAlertController(title: "选择启动应用", message: nil, preferredStyle: .actionSheet)
        for app in AppCatalog.presets {
            sheet.addAction(UIAlertAction(title: "\(app.name) [\(app.category)]", style: .default) { [weak self] _ in
                let step = WorkflowStep(type: .launchApp, title: "打开 \(app.name)", param: app.bundleID)
                let item = QuickActionItem(title: title, subtitle: subtitle.isEmpty ? "调起 \(app.name)" : subtitle, step: step, isSystemPreset: false)
                if let old = editItem {
                    var updated = item
                    updated.id = old.id
                    CronEngine.shared.updateQuickAction(updated)
                } else {
                    CronEngine.shared.addQuickAction(item)
                }
                self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
            })
        }
        sheet.addAction(UIAlertAction(title: "✍️ 自定义手写 Bundle ID / Scheme...", style: .default) { [weak self] _ in
            let alert = UIAlertController(title: "手写应用", message: "输入 Bundle ID 或 Scheme", preferredStyle: .alert)
            alert.addTextField { tf in tf.placeholder = "如 com.ss.iphone.ugc.Aweme 或 weixin://" }
            alert.addAction(UIAlertAction(title: "取消", style: .cancel))
            alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
                let b = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !b.isEmpty else { return }
                let step = WorkflowStep(type: .launchApp, title: "打开应用", param: b)
                let item = QuickActionItem(title: title, subtitle: subtitle.isEmpty ? "调起 \(b)" : subtitle, step: step, isSystemPreset: false)
                if let old = editItem {
                    var updated = item
                    updated.id = old.id
                    CronEngine.shared.updateQuickAction(updated)
                } else {
                    CronEngine.shared.addQuickAction(item)
                }
                self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
            })
            self?.presentAlertSafely(alert)
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    // MARK: - TableView DataSource

    func numberOfSections(in tableView: UITableView) -> Int {
        return 3
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch section {
        case 0:
            return "真实环境边界与锁屏指南 (硬件/越狱探针)"
        case 1:
            return "快捷指令与工具箱 (可编辑修改 / 左滑删除 / 点击触发)"
        default:
            return "工作流编排列表 (多模式常驻调度 / 点击编辑 / 左滑删除)"
        }
    }

    func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        if section == 0 {
            return "💡 探针算法对标 RootHide/Dopamine 动态根目录，全自动判定越狱权限与 8090 MCP 服务连通状态。"
        }
        if section == 1 {
            return "💡 快捷指令与工具箱已全面开放编辑修改与自定义：点击直接单点触发；长按或右滑可修改名称与参数；左滑可删除；点击下方「➕ 新建快捷动作」可添加专属动作。"
        }
        if section == 2 {
            return "💡 工作流列表支持任意自由增删改查；多模式调度、前置条件与执行步骤均可自由拼装。"
        }
        return nil
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch section {
        case 0: return 2 // 真实探针状态卡片 + 锁屏能力指南
        case 1: return CronEngine.shared.quickActions.count + 1 // 快捷项 + 添加按钮
        default: return CronEngine.shared.tasks.count
        }
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        // Section 0: 真实环境探针
        if indexPath.section == 0 {
            let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "GuideCell")
            cell.selectionStyle = .none
            cell.textLabel?.font = .boldSystemFont(ofSize: 14)
            cell.detailTextLabel?.numberOfLines = 0
            cell.detailTextLabel?.font = .systemFont(ofSize: 12)

            let rep = envReport ?? EnvironmentReport(
                flavor: .stock, jbRoot: nil, isTrollStore: false, isJailbroken: false,
                isMcpReachable: false, mcpPort: 8090, summary: "正在探测设备环境...",
                canSimulateHardwareTouch: false, canRespring: false, canRunCronBackground: true
            )

            if indexPath.row == 0 {
                // 真实环境探针卡片
                let mcpStatus = rep.isMcpReachable ? "🟢 iOS-MCP 8090 运行中" : "🔴 iOS-MCP 8090 未就绪"
                let jbStatus = rep.isJailbroken ? "🔓 \(rep.flavor.rawValue)" : (rep.isTrollStore ? "🧌 \(rep.flavor.rawValue)" : "🔒 原生沙盒环境")
                cell.textLabel?.text = "设备状态: \(jbStatus) | \(mcpStatus)"
                cell.textLabel?.textColor = rep.isJailbroken ? .systemGreen : (rep.isTrollStore ? .systemOrange : .secondaryLabel)
                
                var desc = "• \(rep.summary)\n"
                if let jbPath = rep.jbRoot {
                    desc += "• 越狱根路径: \(jbPath)\n"
                }
                desc += "• 8090 服务状态: \(rep.isMcpReachable ? "已连通，具备 SpringBoard 深度注入与全功能驱动能力" : "未检测到服务 (点击可查看安装与排查指引)")"
                cell.detailTextLabel?.text = desc
                cell.accessoryType = rep.isMcpReachable ? .none : .detailDisclosureButton
            } else {
                // 锁屏能力决策指南
                cell.textLabel?.text = "锁屏触发指南与能力边界判定"
                cell.textLabel?.textColor = .systemBlue
                if rep.canSimulateHardwareTouch {
                    cell.detailTextLabel?.text = "✅ 当前已满足真锁屏解锁能力：定时唤醒后将通过 8090 原生模拟数字密码键盘点击，实现无感解锁。"
                } else if rep.isTrollStore {
                    cell.detailTextLabel?.text = "⚠️ 纯巨魔环境：无法在真锁屏黑屏下模拟硬件点击；建议使用「0 亮度纯黑伪熄屏挂机」，夜间不灭屏挂机，早晨直接调起微信打卡。"
                } else {
                    cell.detailTextLabel?.text = "ℹ️ 普通设备：支持通过微音量音频保活常驻运行前台/后台工作流与系统外观切换。"
                }
            }
            return cell
        }

        // Section 1: 快捷指令与工具箱
        if indexPath.section == 1 {
            if indexPath.row < CronEngine.shared.quickActions.count {
                let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "QuickCell")
                let item = CronEngine.shared.quickActions[indexPath.row]
                cell.accessoryType = .detailDisclosureButton // 点击详情按钮编辑，点击单元格直接执行
                cell.textLabel?.text = item.title
                cell.textLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
                cell.detailTextLabel?.text = "\(item.subtitle) (类型: \(item.step.type.displayName))"
                cell.detailTextLabel?.textColor = .secondaryLabel
                return cell
            } else {
                let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                cell.textLabel?.text = "➕ 新建自定义快捷动作..."
                cell.textLabel?.textColor = .systemBlue
                cell.textLabel?.font = .boldSystemFont(ofSize: 15)
                return cell
            }
        }

        // Section 2: Cron 工作流列表
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "CronCell")
        // 防越界：viewWillAppear 会整体替换任务数组，与重绘之间存在时序差
        guard indexPath.row < CronEngine.shared.tasks.count else { return cell }
        let task = CronEngine.shared.tasks[indexPath.row]

        let switchView = UISwitch()
        switchView.isOn = task.isEnabled
        switchView.tag = indexPath.row
        switchView.addTarget(self, action: #selector(toggleTask(_:)), for: .valueChanged)
        cell.accessoryView = switchView

        cell.textLabel?.text = task.name
        cell.textLabel?.font = .boldSystemFont(ofSize: 16)
        
        let condDesc = task.conditionItems.isEmpty ? "" : " | \(task.conditionItems.count)个前置条件"
        let subText = "模式: \(task.triggerMode.displayName) | \(task.scheduleDescription) (\(task.steps.count)步骤\(condDesc))"
        cell.detailTextLabel?.text = subText
        cell.detailTextLabel?.textColor = task.isEnabled ? .systemBlue : .secondaryLabel
        return cell
    }

    @objc private func toggleTask(_ sender: UISwitch) {
        let index = sender.tag
        guard index < CronEngine.shared.tasks.count else { return }
        var task = CronEngine.shared.tasks[index]
        task.isEnabled = sender.isOn
        CronEngine.shared.updateTask(task)
    }

    // MARK: - TableView Delegate

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        if indexPath.section == 0 {
            if indexPath.row == 0 {
                showMcpGuideAlert()
            }
        } else if indexPath.section == 1 {
            if indexPath.row < CronEngine.shared.quickActions.count {
                // 点击立即执行
                let item = CronEngine.shared.quickActions[indexPath.row]
                runSingleStep(item.step, title: item.title)
            } else {
                addNewQuickAction()
            }
        } else if indexPath.section == 2 {
            // 防越界：数组可能已被 viewWillAppear 整体替换
            guard indexPath.row < CronEngine.shared.tasks.count else { return }
            let task = CronEngine.shared.tasks[indexPath.row]
            let editor = CronTaskEditViewController(task: task, isNew: false)
            navigationController?.pushViewController(editor, animated: true)
        }
    }

    // 点击 accessory 详情按钮进行编辑修改
    func tableView(_ tableView: UITableView, accessoryButtonTappedForRowWith indexPath: IndexPath) {
        if indexPath.section == 0 && indexPath.row == 0 {
            showMcpGuideAlert()
        } else if indexPath.section == 1 && indexPath.row < CronEngine.shared.quickActions.count {
            editQuickAction(at: indexPath.row)
        }
    }

    private func showMcpGuideAlert() {
        let alert = UIAlertController(
            title: "iOS-MCP 安装与运行指引",
            message: """
            【为什么需要 iOS-MCP 服务？】
            iOS-MCP 是运行在 iPhone 本地的自动化守护进程（默认端口 8090）。在已越狱设备上，它借助 SpringBoard 注入能力，实现真锁屏密码输入解锁、屏幕点击滑动以及原生 UI 元素树的高速解析。

            【未检测到 8090 时的安装与排查指引】
            1. 环境支持：
               - 需要设备越狱环境（如 Dopamine、RootHide 等）并安装 ElleKit 框架；
               - 纯巨魔环境 (TrollStore 未越狱) 无法注入 SpringBoard，因此无法运行该服务端（但纯巨魔可使用右上角「定时/工作流」的伪熄屏打卡与系统外观切换）。
            2. 安装越狱插件：
               - 在越狱包管理器（Sileo / Zebra）中搜索安装 iOS-MCP 插件或安装其 Deb 包；
            3. 验证连通性：
               - 在 Safari 打开 http://127.0.0.1:8090/health，若显示 {"status":"ok"} 则表示就绪。
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
        alert.addAction(UIAlertAction(title: "重新探测 (8090)", style: .default, handler: { [weak self] _ in
            self?.refreshEnvironment()
        }))
        alert.addAction(UIAlertAction(title: "我知道了", style: .cancel))
        presentAlertSafely(alert)
    }

    func tableView(_ tableView: UITableView, commit editingStyle: UITableViewCell.EditingStyle, forRowAt indexPath: IndexPath) {
        if indexPath.section == 1 && editingStyle == .delete && indexPath.row < CronEngine.shared.quickActions.count {
            CronEngine.shared.removeQuickAction(at: indexPath.row)
            tableView.deleteRows(at: [indexPath], with: .automatic)
        } else if indexPath.section == 2 && editingStyle == .delete {
            CronEngine.shared.removeTask(at: indexPath.row)
            tableView.deleteRows(at: [indexPath], with: .automatic)
        }
    }

    // MARK: - 快捷动作编辑修改

    private func editQuickAction(at index: Int) {
        let item = CronEngine.shared.quickActions[index]
        let sheet = UIAlertController(title: "编辑快捷动作: \(item.title)", message: "修改动作属性或重新绑定指令", preferredStyle: .actionSheet)

        sheet.addAction(UIAlertAction(title: "✏️ 修改标题与参数", style: .default) { [weak self] _ in
            self?.promptEditQuickActionDetails(at: index)
        })

        sheet.addAction(UIAlertAction(title: "🔄 重新选择动作类型...", style: .default) { [weak self] _ in
            guard let self = self else { return }
            self.showStepPickerForQuickAction(title: item.title, subtitle: item.subtitle, editItem: item)
        })

        sheet.addAction(UIAlertAction(title: "🗑️ 删除此快捷动作", style: .destructive) { [weak self] _ in
            CronEngine.shared.removeQuickAction(at: index)
            self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func promptEditQuickActionDetails(at index: Int) {
        var item = CronEngine.shared.quickActions[index]
        let alert = UIAlertController(title: "修改快捷动作", message: "修改标题、说明与参数（如密码/BundleID/秒数）", preferredStyle: .alert)
        alert.addTextField { tf in
            tf.text = item.title
            tf.placeholder = "标题"
        }
        alert.addTextField { tf in
            tf.text = item.subtitle
            tf.placeholder = "描述"
        }
        alert.addTextField { tf in
            tf.text = item.step.param
            tf.placeholder = "执行参数 (例如: com.tencent.xin / 0.5)"
        }

        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self = self else { return }
            let title = alert.textFields?[0].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? item.title
            let sub = alert.textFields?[1].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? item.subtitle
            let param = alert.textFields?[2].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? item.step.param
            item.title = title
            item.subtitle = sub
            item.step.param = param
            CronEngine.shared.updateQuickAction(item)
            self.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    private func runSingleStep(_ step: WorkflowStep, title: String) {
        var t = CronTask(name: title, isEnabled: true)
        t.steps = [step]
        CronEngine.shared.executeWorkflow(task: t) { [weak self] logMsg in
            DispatchQueue.main.async {
                let alert = UIAlertController(title: "执行结果", message: logMsg, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "确定", style: .default))
                self?.presentAlertSafely(alert)
            }
        }
    }
}

// MARK: - 工作流编辑器 (全自由度：模式/多时间/前置条件增删改/步骤增删改)

final class CronTaskEditViewController: UIViewController, UITableViewDataSource, UITableViewDelegate {
    private var task: CronTask
    private let isNew: Bool
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private let nameField = UITextField()
    private let timePointsField = UITextField()
    private let intervalField = UITextField()

    init(task: CronTask, isNew: Bool) {
        self.task = task
        self.isNew = isNew
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = isNew ? "新建工作流" : "编辑工作流"
        view.backgroundColor = .systemGroupedBackground

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "保存", style: .done, target: self, action: #selector(saveTask)
        )

        nameField.text = task.name
        nameField.placeholder = "输入工作流名称"
        nameField.font = .systemFont(ofSize: 16)

        timePointsField.text = task.timePointsText
        timePointsField.placeholder = "例如: 08:30, 12:00, 18:30"
        timePointsField.font = .systemFont(ofSize: 15)
        timePointsField.autocorrectionType = .no
        timePointsField.autocapitalizationType = .none

        intervalField.text = "\(task.intervalMinutes)"
        intervalField.placeholder = "例如: 30"
        intervalField.keyboardType = .numberPad

        tableView.dataSource = self
        tableView.delegate = self
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    @objc private func saveTask() {
        task.name = nameField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "未命名工作流"
        if task.name.isEmpty { task.name = "未命名工作流" }

        let rawInput = timePointsField.text ?? "08:30"
        task.timePointsText = CronTimeSanitizer.sanitize(rawInput)

        if let minutes = Int(intervalField.text ?? "") {
            task.intervalMinutes = max(1, minutes)
        }

        if isNew {
            CronEngine.shared.addTask(task)
        } else {
            CronEngine.shared.updateTask(task)
        }
        navigationController?.popViewController(animated: true)
    }

    // MARK: - TableView DataSource

    func numberOfSections(in tableView: UITableView) -> Int {
        return 4
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch section {
        case 0: return "基本信息与触发模式"
        case 1: return "触发时间与调度规则"
        case 2: return "前置条件门控 (点击修改 / 左滑删除 / 自由新增)"
        case 3: return "工作流执行流水线 (点击修改 / 左滑删除 / 自由新增)"
        default: return nil
        }
    }

    func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        if section == 1 {
            switch task.triggerMode {
            case .multiTime, .weekly, .monthly:
                return "* 规范标准为英文逗号分隔（如 08:30, 12:00, 18:30）；系统已内置全自动容错，输入中文逗号（，）、分号（；/ ;）或空格均会自动规整并补零。"
            case .interval:
                return "* 间隔循环模式将在设定的有效时间窗口内，每隔指定分钟数自动触发一次。"
            case .carplay:
                return "* 车载模式在检测到 CarPlay 连入时秒级自动执行，无需依赖时钟到达。"
            case .charging:
                return "* 手机插入充电线并识别到充电状态时自动触发。"
            case .lowBattery:
                return "* 手机电量下降至 20% 时自动触发保护流程。"
            }
        }
        if section == 2 {
            return "💡 前置条件是执行门控：满足全部启用的条件时，工作流才会真正执行；可自由新增多个条件。"
        }
        return nil
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch section {
        case 0: return 2
        case 1:
            switch task.triggerMode {
            case .multiTime: return 1
            case .interval: return 2
            case .weekly: return 2
            case .monthly: return 2
            case .carplay, .charging, .lowBattery: return 1
            }
        case 2: return task.conditionItems.count + 1 // 条件列表 + 添加条件按钮
        case 3: return task.steps.count + 2 // 步骤列表 + 添加步骤 + 立即测试
        default: return 0
        }
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        // Section 0: 基本信息
        if indexPath.section == 0 {
            if indexPath.row == 0 {
                let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                cell.selectionStyle = .none
                nameField.frame = CGRect(x: 16, y: 6, width: view.bounds.width - 64, height: 40)
                cell.contentView.addSubview(nameField)
                return cell
            } else {
                let cell = UITableViewCell(style: .value1, reuseIdentifier: "ModeCell")
                cell.accessoryType = .disclosureIndicator
                cell.textLabel?.text = "触发模式"
                cell.detailTextLabel?.text = task.triggerMode.displayName
                cell.detailTextLabel?.textColor = .systemBlue
                return cell
            }
        }

        // Section 1: 调度规则
        if indexPath.section == 1 {
            switch task.triggerMode {
            case .multiTime:
                let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                cell.selectionStyle = .none
                timePointsField.frame = CGRect(x: 16, y: 6, width: view.bounds.width - 64, height: 40)
                cell.contentView.addSubview(timePointsField)
                return cell

            case .interval:
                if indexPath.row == 0 {
                    let cell = UITableViewCell(style: .value1, reuseIdentifier: nil)
                    cell.selectionStyle = .none
                    cell.textLabel?.text = "循环间隔 (分钟)"
                    intervalField.frame = CGRect(x: view.bounds.width - 120, y: 6, width: 80, height: 40)
                    intervalField.textAlignment = .right
                    cell.contentView.addSubview(intervalField)
                    return cell
                } else {
                    let cell = UITableViewCell(style: .value1, reuseIdentifier: "RangeCell")
                    cell.accessoryType = .disclosureIndicator
                    cell.textLabel?.text = "有效时间区间"
                    cell.detailTextLabel?.text = "\(task.intervalStart) ~ \(task.intervalEnd)"
                    return cell
                }

            case .weekly:
                if indexPath.row == 0 {
                    let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                    cell.selectionStyle = .none
                    timePointsField.frame = CGRect(x: 16, y: 6, width: view.bounds.width - 64, height: 40)
                    cell.contentView.addSubview(timePointsField)
                    return cell
                } else {
                    let cell = UITableViewCell(style: .value1, reuseIdentifier: "DaysCell")
                    cell.accessoryType = .disclosureIndicator
                    cell.textLabel?.text = "重复周期"
                    cell.detailTextLabel?.text = formatRepeatDays(task.repeatDays)
                    return cell
                }

            case .monthly:
                if indexPath.row == 0 {
                    let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                    cell.selectionStyle = .none
                    timePointsField.frame = CGRect(x: 16, y: 6, width: view.bounds.width - 64, height: 40)
                    cell.contentView.addSubview(timePointsField)
                    return cell
                } else {
                    let cell = UITableViewCell(style: .value1, reuseIdentifier: "MonthCell")
                    cell.accessoryType = .disclosureIndicator
                    cell.textLabel?.text = "每月执行日期"
                    cell.detailTextLabel?.text = task.monthDays.map { "\($0)号" }.joined(separator: ", ")
                    return cell
                }

            case .carplay, .charging, .lowBattery:
                let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
                cell.selectionStyle = .none
                cell.textLabel?.text = task.triggerMode.displayName
                cell.textLabel?.textColor = .systemGreen
                cell.detailTextLabel?.text = "系统事件感知中，满足条件即刻唤醒执行。"
                return cell
            }
        }

        // Section 2: 前置条件 (自由列表)
        if indexPath.section == 2 {
            if indexPath.row < task.conditionItems.count {
                let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "CondCell")
                let cond = task.conditionItems[indexPath.row]
                cell.textLabel?.text = cond.type.displayName
                cell.detailTextLabel?.text = cond.summaryText
                cell.detailTextLabel?.textColor = .secondaryLabel

                let sw = UISwitch()
                sw.isOn = cond.isEnabled
                sw.tag = indexPath.row
                sw.addTarget(self, action: #selector(toggleConditionEnable(_:)), for: .valueChanged)
                cell.accessoryView = sw
                return cell
            } else {
                let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
                cell.textLabel?.text = "➕ 添加前置条件门控..."
                cell.textLabel?.textColor = .systemBlue
                cell.textLabel?.font = .boldSystemFont(ofSize: 15)
                return cell
            }
        }

        // Section 3: 执行步骤
        if indexPath.row < task.steps.count {
            let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "StepCell")
            let step = task.steps[indexPath.row]
            cell.textLabel?.text = "步骤 \(indexPath.row + 1): \(step.title)"
            if step.type == .unlockWithPasscode {
                let masked = String(repeating: "•", count: step.param.count)
                cell.detailTextLabel?.text = "类型: \(step.type.displayName) [密码: \(masked) 点击修改]"
            } else {
                cell.detailTextLabel?.text = "类型: \(step.type.displayName) \(step.param.isEmpty ? "" : "(\(step.param))")"
            }
            cell.detailTextLabel?.textColor = .secondaryLabel
            cell.accessoryType = .disclosureIndicator
            return cell
        } else if indexPath.row == task.steps.count {
            let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
            cell.textLabel?.text = "➕ 添加动作步骤..."
            cell.textLabel?.textColor = .systemBlue
            cell.textLabel?.font = .boldSystemFont(ofSize: 16)
            return cell
        } else {
            let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
            cell.textLabel?.text = "▶️ 立即测试运行此工作流"
            cell.textLabel?.textColor = .systemGreen
            cell.textLabel?.font = .boldSystemFont(ofSize: 16)
            cell.textLabel?.textAlignment = .center
            return cell
        }
    }

    @objc private func toggleConditionEnable(_ sender: UISwitch) {
        let index = sender.tag
        guard index < task.conditionItems.count else { return }
        task.conditionItems[index].isEnabled = sender.isOn
    }

    private func formatRepeatDays(_ days: [Int]) -> String {
        if days.count == 7 { return "每天" }
        if days == [1, 2, 3, 4, 5] { return "工作日" }
        let names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        return days.compactMap { $0 < names.count ? names[$0] : nil }.joined(separator: " ")
    }

    // MARK: - TableView Delegate

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        
        if indexPath.section == 0 && indexPath.row == 1 {
            showTriggerModePicker()
            return
        }

        if indexPath.section == 1 {
            if task.triggerMode == .interval && indexPath.row == 1 {
                editIntervalRange()
            } else if task.triggerMode == .weekly && indexPath.row == 1 {
                editRepeatDays()
            } else if task.triggerMode == .monthly && indexPath.row == 1 {
                editMonthDays()
            }
            return
        }

        // Section 2: 条件添加与编辑
        if indexPath.section == 2 {
            if indexPath.row < task.conditionItems.count {
                editCondition(at: indexPath.row)
            } else {
                showAddConditionSheet()
            }
            return
        }

        // Section 3: 步骤
        if indexPath.section == 3 {
            if indexPath.row < task.steps.count {
                editStepParam(at: indexPath.row)
            } else if indexPath.row == task.steps.count {
                showAddStepSheet()
            } else {
                testRunWorkflow()
            }
        }
    }

    func tableView(_ tableView: UITableView, commit editingStyle: UITableViewCell.EditingStyle, forRowAt indexPath: IndexPath) {
        if indexPath.section == 2 && indexPath.row < task.conditionItems.count && editingStyle == .delete {
            task.conditionItems.remove(at: indexPath.row)
            tableView.deleteRows(at: [indexPath], with: .automatic)
        } else if indexPath.section == 3 && indexPath.row < task.steps.count && editingStyle == .delete {
            task.steps.remove(at: indexPath.row)
            tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
        }
    }

    // MARK: - 前置条件弹窗与编辑

    private func showAddConditionSheet() {
        let sheet = UIAlertController(title: "添加前置条件门控", message: "只有满足全部条件，任务才会真正执行", preferredStyle: .actionSheet)

        for type in ConditionType.allCases {
            sheet.addAction(UIAlertAction(title: type.displayName, style: .default) { [weak self] _ in
                guard let self = self else { return }
                switch type {
                case .requireCharging, .requireJailbroken, .requireCarPlay:
                    self.task.conditionItems.append(ConditionItem(type: type, param: "", isEnabled: true))
                    self.tableView.reloadSections(IndexSet(integer: 2), with: .automatic)
                case .minBattery:
                    self.promptConditionParam(type: type, defaultParam: "20", title: "设置最低电量百分比", hint: "例如 20 (电量高于 20% 时才执行)")
                case .maxBattery:
                    self.promptConditionParam(type: type, defaultParam: "80", title: "设置最高电量百分比", hint: "例如 80 (电量低于 80% 时才执行)")
                case .timeWindow:
                    self.promptConditionParam(type: type, defaultParam: "09:00 - 21:00", title: "设置有效时间段", hint: "格式如 09:00 - 21:00")
                }
            })
        }

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func promptConditionParam(type: ConditionType, defaultParam: String, title: String, hint: String) {
        let alert = UIAlertController(title: title, message: hint, preferredStyle: .alert)
        alert.addTextField { tf in tf.text = defaultParam }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "确定", style: .default) { [weak self] _ in
            guard let self = self else { return }
            let param = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? defaultParam
            self.task.conditionItems.append(ConditionItem(type: type, param: param, isEnabled: true))
            self.tableView.reloadSections(IndexSet(integer: 2), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    private func editCondition(at index: Int) {
        let item = task.conditionItems[index]
        if item.type == .minBattery || item.type == .maxBattery || item.type == .timeWindow {
            let alert = UIAlertController(title: "修改条件参数", message: item.type.displayName, preferredStyle: .alert)
            alert.addTextField { tf in tf.text = item.param }
            alert.addAction(UIAlertAction(title: "取消", style: .cancel))
            alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
                guard let self = self else { return }
                self.task.conditionItems[index].param = alert.textFields?.first?.text ?? ""
                self.tableView.reloadSections(IndexSet(integer: 2), with: .automatic)
            })
            presentAlertSafely(alert)
        }
    }

    // MARK: - 模式与参数配置弹窗

    private func showTriggerModePicker() {
        let sheet = UIAlertController(title: "选择触发模式", message: "支持时间循环与车载/电量硬件感知", preferredStyle: .actionSheet)
        for mode in TriggerMode.allCases {
            sheet.addAction(UIAlertAction(title: mode.displayName, style: .default) { [weak self] _ in
                guard let self = self else { return }
                self.task.triggerMode = mode
                self.tableView.reloadData()
            })
        }
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func editIntervalRange() {
        let alert = UIAlertController(title: "设置循环时间区间", message: "格式例如 09:00 - 21:00", preferredStyle: .alert)
        alert.addTextField { tf in
            tf.text = "\(self.task.intervalStart) - \(self.task.intervalEnd)"
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self = self, let text = alert.textFields?.first?.text else { return }
            let sub = text.components(separatedBy: "-")
            if sub.count == 2 {
                self.task.intervalStart = sub[0].trimmingCharacters(in: .whitespaces)
                self.task.intervalEnd = sub[1].trimmingCharacters(in: .whitespaces)
                self.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
            }
        })
        presentAlertSafely(alert)
    }

    private func editRepeatDays() {
        let sheet = UIAlertController(title: "设置按周重复周期", message: nil, preferredStyle: .actionSheet)
        sheet.addAction(UIAlertAction(title: "每天", style: .default) { [weak self] _ in
            self?.task.repeatDays = [1, 2, 3, 4, 5, 6, 7]
            self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })
        sheet.addAction(UIAlertAction(title: "仅工作日 (周一至周五)", style: .default) { [weak self] _ in
            self?.task.repeatDays = [1, 2, 3, 4, 5]
            self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })
        sheet.addAction(UIAlertAction(title: "仅周末 (周六与周日)", style: .default) { [weak self] _ in
            self?.task.repeatDays = [6, 7]
            self?.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func editMonthDays() {
        let alert = UIAlertController(title: "设置每月执行日期", message: "多日期用逗号分隔，例如 1, 15, 28", preferredStyle: .alert)
        alert.addTextField { tf in
            tf.text = self.task.monthDays.map(String.init).joined(separator: ", ")
            tf.keyboardType = .numbersAndPunctuation
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self = self, let text = alert.textFields?.first?.text else { return }
            let tokens = text.components(separatedBy: CharacterSet(charactersIn: ",， "))
            let validDays = tokens.compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }.filter { $0 >= 1 && $0 <= 31 }
            self.task.monthDays = validDays.isEmpty ? [1] : validDays.sorted()
            self.tableView.reloadSections(IndexSet(integer: 1), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    // MARK: - 步骤添加与应用选择器弹窗 (手写 + 点选规范)

    private func showAddStepSheet() {
        let sheet = UIAlertController(title: "选择动作类型", message: "自由拼装工作流流水线", preferredStyle: .actionSheet)

        sheet.addAction(UIAlertAction(title: "📱 启动指定应用 (点选常用预设 / 自定义)...", style: .default) { [weak self] _ in
            self?.showAppCatalogPicker()
        })

        sheet.addAction(UIAlertAction(title: "🔓 [越狱] 自动输入数字密码解锁...", style: .default) { [weak self] _ in
            self?.promptPasscodeStep()
        })

        let systemActions: [(String, WorkflowStep)] = [
            ("🏠 唤醒屏幕并回主屏", WorkflowStep(type: .wakeAndHome, title: "唤醒屏幕并回主屏")),
            ("🌑 开启伪熄屏挂机 (0亮度不锁屏)", WorkflowStep(type: .fakeSleepMode, title: "开启伪熄屏挂机(0亮度)")),
            ("🔆 恢复屏幕正常亮度 (50%)", WorkflowStep(type: .restoreBrightness, title: "恢复屏幕正常亮度(50%)")),
            ("☀️ 关闭暗黑模式 (切浅色)", WorkflowStep(type: .setDarkMode, title: "关闭暗黑模式(浅色)", param: "light")),
            ("🌙 开启暗黑模式 (切深色)", WorkflowStep(type: .setDarkMode, title: "开启暗黑模式(深色)", param: "dark")),
            ("🔕 开启勿扰/专注模式", WorkflowStep(type: .setDND, title: "开启勿扰模式", param: "on")),
            ("🔔 关闭勿扰/专注模式", WorkflowStep(type: .setDND, title: "关闭勿扰模式", param: "off")),
            ("📢 发送本地完成通知提醒", WorkflowStep(type: .notify, title: "发送通知", param: "工作流已自动执行完毕")),
            ("🔒 熄屏锁屏", WorkflowStep(type: .lockScreen, title: "熄屏锁屏")),
            ("🔄 软注销系统 (Respring)", WorkflowStep(type: .respring, title: "注销系统(Respring)")),
            ("⏱️ 等待延时 3 秒", WorkflowStep(type: .delay, title: "延时 3 秒", param: "3"))
        ]

        for (label, step) in systemActions {
            sheet.addAction(UIAlertAction(title: label, style: .default) { [weak self] _ in
                self?.task.steps.append(step)
                self?.tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
            })
        }

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func showAppCatalogPicker() {
        let sheet = UIAlertController(title: "选择要启动的应用", message: "内置常用主流应用，一键点选；也可手写自定义", preferredStyle: .actionSheet)

        for app in AppCatalog.presets {
            sheet.addAction(UIAlertAction(title: "\(app.name) [\(app.category)]", style: .default) { [weak self] _ in
                let step = WorkflowStep(type: .launchApp, title: "打开 \(app.name)", param: app.bundleID)
                self?.task.steps.append(step)
                self?.tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
            })
        }

        sheet.addAction(UIAlertAction(title: "✍️ 自定义手写输入 (Bundle ID / URL Scheme)", style: .default) { [weak self] _ in
            self?.promptCustomApp()
        })

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentActionSheet(sheet)
    }

    private func promptCustomApp() {
        let alert = UIAlertController(title: "自定义应用", message: "输入应用显示名称与 BundleID 或 URL Scheme", preferredStyle: .alert)
        alert.addTextField { tf in tf.placeholder = "应用名称 (例如: 抖音)" }
        alert.addTextField { tf in
            tf.placeholder = "Bundle ID 或 Scheme (例如: com.ss.iphone.ugc.Aweme)"
            tf.autocorrectionType = .no
            tf.autocapitalizationType = .none
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "添加", style: .default) { [weak self] _ in
            let name = alert.textFields?[0].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "自定义应用"
            let target = alert.textFields?[1].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !target.isEmpty else { return }
            let step = WorkflowStep(type: .launchApp, title: "打开 \(name)", param: target)
            self?.task.steps.append(step)
            self?.tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    private func promptPasscodeStep() {
        let alert = UIAlertController(
            title: "添加自动锁屏密码解锁",
            message: "请输入手机 4 位或 6 位数字锁屏密码（仅存沙盒，用于越狱定时唤醒后模拟按键解锁）：",
            preferredStyle: .alert
        )
        alert.addTextField { tf in
            tf.placeholder = "例如: 123456"
            tf.keyboardType = .numberPad
            tf.isSecureTextEntry = true
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "添加", style: .default) { [weak self] _ in
            let code = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !code.isEmpty else { return }
            let step = WorkflowStep(type: .unlockWithPasscode, title: "自动输入锁屏密码解锁", param: code)
            self?.task.steps.append(step)
            self?.tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    private func editStepParam(at index: Int) {
        let step = task.steps[index]
        let alert = UIAlertController(title: "修改步骤参数", message: step.title, preferredStyle: .alert)
        alert.addTextField { tf in
            tf.text = step.param
            tf.placeholder = "输入参数（如密码、秒数或 BundleID）"
            if step.type == .unlockWithPasscode || step.type == .delay {
                tf.keyboardType = .numberPad
            }
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self = self else { return }
            let newVal = alert.textFields?.first?.text ?? ""
            self.task.steps[index].param = newVal
            self.tableView.reloadSections(IndexSet(integer: 3), with: .automatic)
        })
        presentAlertSafely(alert)
    }

    private func testRunWorkflow() {
        CronEngine.shared.executeWorkflow(task: task) { [weak self] logMsg in
            DispatchQueue.main.async {
                let alert = UIAlertController(title: "测试运行结果", message: logMsg, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "确定", style: .default))
                self?.presentAlertSafely(alert)
            }
        }
    }
}
