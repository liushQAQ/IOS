import UIKit
import Network

// MARK: - 服务条目与存储

struct ServiceItem: Codable, Equatable {
    var name: String
    var url: String
    /// 备注（可选）：显示在地址旁，便于区分用途。
    var note: String?
    /// 外网入口专用：电脑端 token 每次重启都会变，先在局域网内向仪表盘换最新地址。
    var resolverURL: String?
}

enum ServiceStore {
    static let key = "DSHios.services"
    static let seedVersionKey = "DSHios.servicesSeedVersion"
    /// 种子版本：6 = 新增 Tailscale 虚拟局域网直连预置（极速P2P打洞）。
    static let currentSeedVersion = 6

    /// 默认预置：实测能渲染网页页面的端口，同个端口局域网一条 + 外网一条，成对配置。
    /// DSH 对：局域网走 Pocket 3084（桌面端主控事实源，明文 HTTP，免密码，全权限）；
    ///         Tailscale 走自建虚拟内网（15-40ms P2P 极速直连）；
    ///         外网走 OpenFRP 穿透到 9060 认证网关（经 8080 反代直通 3084）。
    /// 仪表盘对：9009 自包含单页，外网带密码直达，无需换票。
    /// TTS 8210 外网 404（无外网入口），只配局域网一条。
    #if PUBLIC_BUILD
    static let defaults: [ServiceItem] = [
        ServiceItem(name: "DSH 主控（局域网）", url: "http://192.168.1.100:3084/",
                    note: "局域网·请修改为你的电脑局域网IP", resolverURL: nil),
        ServiceItem(name: "端口仪表盘（局域网）", url: "http://192.168.1.100:9009/",
                    note: "局域网·请修改为你的电脑局域网IP", resolverURL: nil),
        ServiceItem(name: "本地 TTS", url: "http://192.168.1.100:8210/",
                    note: "局域网", resolverURL: nil)
    ]
    #else
    static let defaults: [ServiceItem] = [
        ServiceItem(name: "DSH 主控（局域网）", url: "http://192.168.215.218:3084/",
                    note: "局域网·全权限", resolverURL: nil),
        ServiceItem(name: "DSH 主控（Tailscale 极速）",
                    url: "http://100.x.x.x:3084/",
                    note: "自建虚拟内网·15ms直连(换成电脑Tailscale IP)", resolverURL: nil),
        ServiceItem(name: "DSH 外网（OpenFrp穿透）",
                    url: "http://cn-hk-bgp-4.ofalias.net:47027/dsh/?password=Liu326766%40",
                    note: "OpenFRP 穿透·自动换票",
                    resolverURL: "http://192.168.215.218:9009/api/dsh-url"),
        ServiceItem(name: "端口仪表盘（局域网）", url: "http://192.168.215.218:9009/",
                    note: nil, resolverURL: nil),
        ServiceItem(name: "端口仪表盘（外网）",
                    url: "http://cn-hk-bgp-4.ofalias.net:47027/?password=Liu326766%40",
                    note: "OpenFRP 穿透", resolverURL: nil),
        ServiceItem(name: "本地 TTS", url: "http://192.168.215.218:8210/",
                    note: "局域网（外网无入口）", resolverURL: nil)
    ]
    #endif

    static func load() -> [ServiceItem] {
        // 种子升级：直接换成最新预置，清掉旧版本里打不开页面的一堆端口。
        if UserDefaults.standard.integer(forKey: seedVersionKey) < currentSeedVersion {
            UserDefaults.standard.set(currentSeedVersion, forKey: seedVersionKey)
            save(defaults)
            return defaults
        }
        guard let data = UserDefaults.standard.data(forKey: key),
              let items = try? JSONDecoder().decode([ServiceItem].self, from: data) else {
            return defaults
        }
        return items.isEmpty ? defaults : items
    }

    static func save(_ items: [ServiceItem]) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func add(_ item: ServiceItem) {
        var items = load()
        items.append(item)
        save(items)
    }

    static func update(at index: Int, with item: ServiceItem) {
        var items = load()
        guard items.indices.contains(index) else { return }
        items[index] = item
        save(items)
    }

    static func remove(at index: Int) {
        var items = load()
        guard items.indices.contains(index) else { return }
        items.remove(at: index)
        save(items)
    }
}

// MARK: - 外网地址换票

enum ServiceResolver {
    /// 换票结果缓存：地址 → 换到的最新地址 + 时间。
    /// 局域网内换到一次后，出门（信号差/换网络）也用最近一次的有效地址，不至于退回死 token。
    private static var cache: [String: (url: String, at: Date)] = [:]
    private static var inflight: [String: Bool] = [:]
    private static let cacheTTL: TimeInterval = 30 * 60

    /// 外网入口的 token 会随电脑端 3081 重启而失效。
    /// 打开前先回局域网向 9009 仪表盘换一张最新的完整地址（/api/dsh-url）；
    /// 优先用缓存（30 分钟内），局域网内换不到就退回缓存/预置地址，不阻塞用户。
    static func resolve(_ item: ServiceItem, completion: @escaping (String) -> Void) {
        guard let api = item.resolverURL, !api.isEmpty, let url = URL(string: api) else {
            completion(item.url)
            return
        }
        // 有新鲜缓存直接用，不再等网络。
        if let hit = cache[api], Date().timeIntervalSince(hit.at) < cacheTTL {
            completion(hit.url)
            return
        }
        // 并发去重：同一条目的换票请求只发一次，结果广播给所有等待者。
        if inflight[api] == true {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { resolve(item, completion: completion) }
            return
        }
        inflight[api] = true
        var request = URLRequest(url: url, timeoutInterval: 6)
        request.httpMethod = "GET"
        URLSession.shared.dataTask(with: request) { data, _, _ in
            inflight[api] = false
            var resolved = cache[api]?.url ?? item.url
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ok = json["ok"] as? Bool, ok,
               let external = json["externalUrl"] as? String, !external.isEmpty {
                resolved = external
                cache[api] = (external, Date())
            }
            DispatchQueue.main.async { completion(resolved) }
        }.resume()
    }
}

// MARK: - 服务列表管理页

final class SettingsViewController: UIViewController {

    private let onSave: (String) -> Void
    private let onSelect: (String) -> Void
    private var currentURL: String = ""
    private var services: [ServiceItem] = []
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    /// 原生在线状态探测：不依赖 web 会话，打开列表即用 TCP 探活，绿点=端口通。
    private var online: [String: Bool] = [:]

    init(currentURL: String = "", onSave: @escaping (String) -> Void, onSelect: @escaping (String) -> Void) {
        self.currentURL = currentURL
        self.onSave = onSave
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "服务列表"
        view.backgroundColor = .systemBackground
        services = ServiceStore.load()

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .add, target: self, action: #selector(addTapped))
        let doneItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closeTapped))
        let helpItem = UIBarButtonItem(
            image: UIImage(systemName: "questionmark.circle"),
            style: .plain,
            target: self,
            action: #selector(helpTapped))
        navigationItem.leftBarButtonItems = [doneItem, helpItem]

        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "service")
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let footer = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 116))
        let footerLabel = UILabel()
        footerLabel.text = "点行打开该服务；右侧 ✎ 编辑（名称/地址/备注）；左滑删除。列表保存在本机，电脑 IP 变化时只需编辑对应条目。"
        footerLabel.font = .preferredFont(forTextStyle: .footnote)
        footerLabel.textColor = .secondaryLabel
        footerLabel.numberOfLines = 0
        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(footerLabel)

        let guideBtn = UIButton(type: .system)
        guideBtn.setTitle(" 📖 官方 DSH 电脑端连接说明与教程", for: .normal)
        guideBtn.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        guideBtn.setImage(UIImage(systemName: "book.pages"), for: .normal)
        guideBtn.tintColor = .systemBlue
        guideBtn.translatesAutoresizingMaskIntoConstraints = false
        guideBtn.addTarget(self, action: #selector(helpTapped), for: .touchUpInside)
        footer.addSubview(guideBtn)

        NSLayoutConstraint.activate([
            footerLabel.topAnchor.constraint(equalTo: footer.topAnchor, constant: 8),
            footerLabel.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            footerLabel.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20),

            guideBtn.topAnchor.constraint(equalTo: footerLabel.bottomAnchor, constant: 10),
            guideBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            guideBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),
            guideBtn.bottomAnchor.constraint(lessThanOrEqualTo: footer.bottomAnchor, constant: -8)
        ])
        tableView.tableFooterView = footer
        probeAll()
    }

    @objc private func helpTapped() {
        let guideVC = ConnectionGuideViewController(onOpenInputURL: { [weak self] in
            self?.presentEditor(nil)
        })
        let nav = UINavigationController(rootViewController: guideVC)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
    }

    // MARK: - 在线状态探测（原生 TCP，6 秒超时）

    private func probeAll() {
        for (index, item) in services.enumerated() {
            probe(item.url) { [weak self] isUp in
                guard let self else { return }
                self.online[item.url] = isUp
                if self.services.indices.contains(index) {
                    self.tableView.reloadRows(at: [IndexPath(row: index, section: 0)], with: .none)
                }
            }
        }
    }

    private func probe(_ urlString: String, completion: @escaping (Bool) -> Void) {
        guard let comps = URLComponents(string: urlString),
              let host = comps.host, !host.isEmpty else {
            completion(false)
            return
        }
        let port = UInt16(comps.port ?? (comps.scheme == "https" ? 443 : 80))
        let connection = NWConnection(host: .init(host), port: .init(rawValue: port)!, using: .tcp)
        // 只回调一次（.ready→cancel 会再触发 .cancelled），且回主线程刷 UI——
        // 全局队列直接 reloadRows 会触发 "Main Thread Checker: UI API called on background thread" 导致闪退。
        var finished = false
        let finish: (Bool) -> Void = { up in
            guard !finished else { return }
            finished = true
            connection.cancel()
            DispatchQueue.main.async { completion(up) }
        }
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                finish(true)
            case .failed, .waiting:
                finish(false)
            default:
                break
            }
        }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 6) {
            finish(false)
        }
        connection.start(queue: DispatchQueue.global(qos: .utility))
    }

    // MARK: - 添加 / 编辑

    @objc private func closeTapped() {
        if presentingViewController != nil {
            dismiss(animated: true)
        } else {
            navigationController?.popViewController(animated: true)
        }
    }

    @objc private func addTapped() {
        presentEditor(nil)
    }

    private func presentEditor(_ existing: (index: Int, item: ServiceItem)?) {
        let alert = UIAlertController(
            title: existing == nil ? "添加服务" : "编辑服务",
            message: "名称、地址与备注",
            preferredStyle: .alert)

        alert.addTextField { tf in
            tf.placeholder = "名称（如：端口仪表盘）"
            tf.text = existing?.item.name
            tf.autocapitalizationType = .none
        }
        alert.addTextField { tf in
            tf.placeholder = "http://192.168.215.218:9009/"
            tf.text = existing?.item.url
            tf.autocapitalizationType = .none
            tf.autocorrectionType = .no
            tf.keyboardType = .URL
        }
        alert.addTextField { tf in
            tf.placeholder = "备注（可选，如：局域网·全权限）"
            tf.text = existing?.item.note
            tf.autocorrectionType = .no
        }

        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self,
                  let name = alert.textFields?[0].text?.trimmingCharacters(in: .whitespaces),
                  !name.isEmpty,
                  var url = alert.textFields?[1].text?.trimmingCharacters(in: .whitespaces),
                  !url.isEmpty else { return }
            if !url.lowercased().hasPrefix("http://"), !url.lowercased().hasPrefix("https://") {
                url = "http://" + url
            }
            let note = alert.textFields?[2].text?.trimmingCharacters(in: .whitespaces)
            // 编辑已有条目时保留其换票地址（外网入口专用，用户改地址不改换票逻辑）。
            let item = ServiceItem(name: name, url: url,
                                   note: (note?.isEmpty ?? true) ? nil : note,
                                   resolverURL: existing?.item.resolverURL)
            if let existing {
                ServiceStore.update(at: existing.index, with: item)
            } else {
                ServiceStore.add(item)
            }
            self.services = ServiceStore.load()
            self.tableView.reloadData()
            self.probeAll()
        })
        present(alert, animated: true)
    }
}

extension SettingsViewController: UITableViewDataSource, UITableViewDelegate {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        services.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "service", for: indexPath)
        let item = services[indexPath.row]
        var config = cell.defaultContentConfiguration()

        let isSelected: Bool = {
            if !currentURL.isEmpty {
                if item.url == currentURL { return true }
                if let itemComps = URLComponents(string: item.url),
                   let currComps = URLComponents(string: currentURL) {
                    if itemComps.host == currComps.host && itemComps.port == currComps.port {
                        return true
                    }
                }
            }
            return false
        }()

        if isSelected {
            config.text = "🔴 " + item.name + " (当前)"
            config.textProperties.color = .systemRed
            config.textProperties.font = .preferredFont(forTextStyle: .headline)
        } else {
            config.text = item.name
            config.textProperties.color = .label
            config.textProperties.font = .preferredFont(forTextStyle: .body)
        }

        if let note = item.note, !note.isEmpty {
            config.secondaryText = note + " · " + item.url
        } else {
            config.secondaryText = item.url
        }
        config.secondaryTextProperties.color = isSelected ? .systemRed.withAlphaComponent(0.8) : .secondaryLabel
        config.secondaryTextProperties.font = .preferredFont(forTextStyle: .caption1)
        config.secondaryTextProperties.numberOfLines = 2
        // 原生状态点：绿=端口可达，灰=不可达，透明=探测中
        if let up = online[item.url] {
            config.image = UIImage(systemName: "circle.fill")
            config.imageProperties.tintColor = up ? .systemGreen : .systemGray3
        } else {
            config.image = UIImage(systemName: "circle.dotted")
            config.imageProperties.tintColor = .tertiaryLabel
        }
        cell.contentConfiguration = config
        // 「编辑」按钮：点行=打开服务，点右侧编辑笔=改名称/地址/备注（不再只藏在左滑里）。
        let editButton = UIButton(type: .system)
        editButton.setImage(UIImage(systemName: "square.and.pencil"), for: .normal)
        editButton.tintColor = .systemBlue
        editButton.addTarget(self, action: #selector(editTapped(_:)), for: .touchUpInside)
        cell.accessoryView = editButton
        return cell
    }

    /// 编辑按钮（cell.accessoryView 上的笔）：通过 hit-test 反查所在行。
    @objc private func editTapped(_ sender: UIButton) {
        let center = CGPoint(x: sender.bounds.midX, y: sender.bounds.midY)
        let point = sender.convert(center, to: tableView)
        guard let indexPath = tableView.indexPathForRow(at: point),
              services.indices.contains(indexPath.row) else { return }
        presentEditor((indexPath.row, services[indexPath.row]))
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let item = services[indexPath.row]
        // 外网入口先换最新 token，换不到就用原地址（换票失败不拦人）。
        ServiceResolver.resolve(item) { [weak self] url in
            guard let self else { return }
            self.onSave(url)
            self.onSelect(url)
            if self.presentingViewController != nil {
                self.dismiss(animated: true)
            } else {
                self.navigationController?.popViewController(animated: true)
            }
        }
    }

    func tableView(_ tableView: UITableView,
                   trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        let delete = UIContextualAction(style: .destructive, title: "删除") { [weak self] _, _, done in
            ServiceStore.remove(at: indexPath.row)
            self?.services = ServiceStore.load()
            tableView.deleteRows(at: [indexPath], with: .automatic)
            done(true)
        }
        let edit = UIContextualAction(style: .normal, title: "编辑") { [weak self] _, _, done in
            guard let self else { done(false); return }
            self.presentEditor((indexPath.row, self.services[indexPath.row]))
            done(true)
        }
        edit.backgroundColor = .systemBlue
        return UISwipeActionsConfiguration(actions: [delete, edit])
    }
}

// MARK: - 官方 DSH 连接教程页

final class ConnectionGuideViewController: UIViewController {

    private let onOpenInputURL: (() -> Void)?

    init(onOpenInputURL: (() -> Void)? = nil) {
        self.onOpenInputURL = onOpenInputURL
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "连接说明与教程"
        view.backgroundColor = .systemBackground

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closeTapped))

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -40)
        ])

        // 头部卡片
        let headerBox = createCardView(
            title: "💡 官方原版 DSH 免改动直连",
            desc: "即使您的电脑安装的是纯正官方原版 DeepSeek Harness，也完全不需要改动任何源码！只需加装官方开源插件即可完美联动手机端。"
        )
        stack.addArrangedSubview(headerBox)

        // 步骤一：电脑端安装手机访问插件
        let step1 = createStepCard(
            badge: "步骤 1",
            title: "电脑端安装手机访问插件",
            detail: "官方 DSH 默认出于安全策略只监听 127.0.0.1，禁止局域网未授权控制。请在电脑端安装 dsh-pocket 插件：\n\n方式 A：在电脑终端（CMD / PowerShell）执行命令：",
            code: "dsh plugin --profile web add dsh-pocket -w",
            tip: "方式 B：在 DSH 桌面端界面打开「设置 → 插件市场」，搜索并安装 dsh-pocket。"
        )
        stack.addArrangedSubview(step1)

        // 步骤二：获取局域网地址
        let step2 = createStepCard(
            badge: "步骤 2",
            title: "开启手机访问并查看地址",
            detail: "1. 电脑端重启 DSH\n2. 打开「设置 → 手机访问」页面\n3. 界面会显示您的电脑局域网访问地址（例如 http://192.168.1.100:3084/）与二维码\n4. 可在该页面选择关闭局域网访问密码（实现免密秒开），或记录默认访问口令。",
            code: nil,
            tip: "💡 如需出门在外 4G 访问，在该设置页点击「开启公网访问」即可获得免费穿透链接。"
        )
        stack.addArrangedSubview(step2)

        // 步骤三：手机端连接
        let step3 = createStepCard(
            badge: "步骤 3",
            title: "在 iPhone 上填入并连接",
            detail: "1. 确保手机与电脑连入同一 WiFi（同一局域网）\n2. 点击右侧悬浮球，选择「手动输入地址…」或点服务列表右上角「+」\n3. 填入刚才获取的地址并点「加载」即可进入！\n4. 本 App 会自动保存该地址并持久化缓存，下次点开直接秒进。",
            code: nil,
            tip: "🎉 iOS 端已为您自动适配 Safari 现代特性补丁与输入防误关机制，体验极致丝滑！"
        )
        stack.addArrangedSubview(step3)

        // 快捷操作按钮
        let actionBtn = UIButton(type: .system)
        actionBtn.setTitle("立即添加 / 输入电脑端服务地址", for: .normal)
        actionBtn.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        actionBtn.backgroundColor = .systemBlue
        actionBtn.setTitleColor(.white, for: .normal)
        actionBtn.layer.cornerRadius = 12
        actionBtn.heightAnchor.constraint(equalToConstant: 48).isActive = true
        actionBtn.addTarget(self, action: #selector(openAddServiceTapped), for: .touchUpInside)
        stack.addArrangedSubview(actionBtn)
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    @objc private func openAddServiceTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onOpenInputURL?()
        }
    }

    @objc private func copyCommandTapped(_ sender: UIButton) {
        let codeText = "dsh plugin --profile web add dsh-pocket -w"
        UIPasteboard.general.string = codeText
        sender.setTitle("已复制", for: .normal)
        let feedback = UINotificationFeedbackGenerator()
        feedback.notificationOccurred(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            sender.setTitle("复制", for: .normal)
        }
    }

    private func createCardView(title: String, desc: String) -> UIView {
        let card = UIView()
        card.backgroundColor = .secondarySystemBackground
        card.layer.cornerRadius = 12

        let t = UILabel()
        t.text = title
        t.font = .preferredFont(forTextStyle: .headline)
        t.textColor = .label

        let d = UILabel()
        d.text = desc
        d.font = .preferredFont(forTextStyle: .subheadline)
        d.textColor = .secondaryLabel
        d.numberOfLines = 0

        let vStack = UIStackView(arrangedSubviews: [t, d])
        vStack.axis = .vertical
        vStack.spacing = 8
        vStack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(vStack)

        NSLayoutConstraint.activate([
            vStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 14),
            vStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 14),
            vStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
            vStack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14)
        ])
        return card
    }

    private func createStepCard(badge: String, title: String, detail: String, code: String?, tip: String?) -> UIView {
        let card = UIView()
        card.backgroundColor = .secondarySystemBackground
        card.layer.cornerRadius = 12

        let badgeLabel = UILabel()
        badgeLabel.text = " \(badge) "
        badgeLabel.font = .systemFont(ofSize: 12, weight: .bold)
        badgeLabel.textColor = .systemBlue
        badgeLabel.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.12)
        badgeLabel.layer.cornerRadius = 4
        badgeLabel.clipsToBounds = true

        let t = UILabel()
        t.text = title
        t.font = .preferredFont(forTextStyle: .headline)
        t.textColor = .label

        let headStack = UIStackView(arrangedSubviews: [badgeLabel, t])
        headStack.axis = .horizontal
        headStack.spacing = 8
        headStack.alignment = .center

        let d = UILabel()
        d.text = detail
        d.font = .preferredFont(forTextStyle: .subheadline)
        d.textColor = .secondaryLabel
        d.numberOfLines = 0

        var views: [UIView] = [headStack, d]

        if let codeText = code {
            let codeBox = UIView()
            codeBox.backgroundColor = .tertiarySystemBackground
            codeBox.layer.cornerRadius = 8

            let codeLabel = UILabel()
            codeLabel.text = codeText
            codeLabel.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
            codeLabel.textColor = .label
            codeLabel.numberOfLines = 0

            let copyBtn = UIButton(type: .system)
            copyBtn.setTitle("复制", for: .normal)
            copyBtn.titleLabel?.font = .preferredFont(forTextStyle: .caption1)
            copyBtn.setImage(UIImage(systemName: "doc.on.doc"), for: .normal)
            copyBtn.tintColor = .systemBlue
            copyBtn.addTarget(self, action: #selector(copyCommandTapped), for: .touchUpInside)

            let hCode = UIStackView(arrangedSubviews: [codeLabel, copyBtn])
            hCode.axis = .horizontal
            hCode.spacing = 8
            hCode.alignment = .center
            hCode.translatesAutoresizingMaskIntoConstraints = false
            codeBox.addSubview(hCode)

            NSLayoutConstraint.activate([
                hCode.topAnchor.constraint(equalTo: codeBox.topAnchor, constant: 10),
                hCode.leadingAnchor.constraint(equalTo: codeBox.leadingAnchor, constant: 12),
                hCode.trailingAnchor.constraint(equalTo: codeBox.trailingAnchor, constant: -12),
                hCode.bottomAnchor.constraint(equalTo: codeBox.bottomAnchor, constant: -10)
            ])
            views.append(codeBox)
        }

        if let tipText = tip {
            let tipLabel = UILabel()
            tipLabel.text = tipText
            tipLabel.font = .preferredFont(forTextStyle: .caption1)
            tipLabel.textColor = .tertiaryLabel
            tipLabel.numberOfLines = 0
            views.append(tipLabel)
        }

        let vStack = UIStackView(arrangedSubviews: views)
        vStack.axis = .vertical
        vStack.spacing = 10
        vStack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(vStack)

        NSLayoutConstraint.activate([
            vStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 14),
            vStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 14),
            vStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
            vStack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14)
        ])

        return card
    }
}

