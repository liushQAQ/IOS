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

    enum CodingKeys: String, CodingKey {
        case name, url, note, resolverURL
    }

    init(name: String, url: String, note: String? = nil, resolverURL: String? = nil) {
        self.name = name
        self.url = url
        self.note = note
        self.resolverURL = resolverURL
    }

    /// 容错解码：即使未来版本增减字段或旧版格式不完整，也不会抛出解码异常导致覆盖用户已有配置
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.name = (try? container.decode(String.self, forKey: .name)) ?? "未命名服务"
        self.url = (try? container.decode(String.self, forKey: .url)) ?? ""
        self.note = try? container.decodeIfPresent(String.self, forKey: .note)
        self.resolverURL = try? container.decodeIfPresent(String.self, forKey: .resolverURL)
    }
}

/// 跨版本防覆盖持久化中心：采用 Documents/dsh_user_data/ 物理文件 + UserDefaults 双轨互备存储。
/// 只要用户未卸载 App，无论覆盖安装个人版还是公开版 IPA/TIPA，用户已自定义的服务器、最近访问地址、Web 登录 Cookie 均 100% 保留。
enum DSHPersistenceCenter {
    private static var storageDir: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir = docs.appendingPathComponent("dsh_user_data", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static var servicesFileURL: URL { storageDir.appendingPathComponent("services_v1.json") }
    static var stateFileURL: URL { storageDir.appendingPathComponent("user_state_v1.json") }
    static var cookiesBackupFileURL: URL { storageDir.appendingPathComponent("cookies_backup_v1.json") }

    struct UserState: Codable {
        var initialized: Bool = true
        var lastURL: String?
        var customFreeWebItems: [FreeWebItem]?
    }

    static func loadState() -> UserState {
        if let data = try? Data(contentsOf: stateFileURL),
           let state = try? JSONDecoder().decode(UserState.self, from: data) {
            return state
        }
        let legacyLastURL = UserDefaults.standard.string(forKey: "DSHios.lastURL")
        let initialized = UserDefaults.standard.bool(forKey: "DSHios.userInitialized") || (legacyLastURL != nil)
        return UserState(initialized: initialized, lastURL: legacyLastURL, customFreeWebItems: nil)
    }

    static func saveState(_ state: UserState) {
        if let data = try? JSONEncoder().encode(state) {
            try? data.write(to: stateFileURL, options: .atomic)
        }
        UserDefaults.standard.set(state.initialized, forKey: "DSHios.userInitialized")
        if let last = state.lastURL {
            UserDefaults.standard.set(last, forKey: "DSHios.lastURL")
        }
    }

    static func saveLastURL(_ url: String) {
        var st = loadState()
        st.initialized = true
        st.lastURL = url
        saveState(st)
    }

    static func loadLastURL() -> String? {
        if let last = loadState().lastURL, !last.isEmpty {
            return last
        }
        return UserDefaults.standard.string(forKey: "DSHios.lastURL")
    }
}

/// 免费 AI 网页版平台模型条目
struct FreeWebItem: Codable, Equatable {
    var name: String
    var url: String
    var category: String // "domestic" 国内直连 | "overseas" 海外平台
    var subtitle: String
}

enum FreeWebStore {
    static let domesticDefaults: [FreeWebItem] = [
        FreeWebItem(name: "1. 豆包", url: "https://www.doubao.com", category: "domestic", subtitle: "字节跳动 · 手机号登录免费畅聊"),
        FreeWebItem(name: "2. DeepSeek", url: "https://chat.deepseek.com", category: "domestic", subtitle: "深度求索官方网页端 · 免费对话"),
        FreeWebItem(name: "3. Kimi", url: "https://kimi.moonshot.cn", category: "domestic", subtitle: "月之暗面 · 超长上下文免费助手"),
        FreeWebItem(name: "4. 通义千问", url: "https://tongyi.aliyun.com", category: "domestic", subtitle: "阿里云 Qwen 官方网页版"),
        FreeWebItem(name: "5. 文心一言", url: "https://yiyan.baidu.com", category: "domestic", subtitle: "百度文心大模型免费网页版"),
        FreeWebItem(name: "6. 腾讯元宝", url: "https://yuanbao.tencent.com", category: "domestic", subtitle: "腾讯混元 + DeepSeek 免费网页版"),
        FreeWebItem(name: "7. 智谱清言", url: "https://chatglm.cn", category: "domestic", subtitle: "智谱 GLM 官方免费网页端"),
        FreeWebItem(name: "8. 讯飞星火", url: "https://xinghuo.xfyun.cn", category: "domestic", subtitle: "科大讯飞星火大模型网页端")
    ]

    static let overseasDefaults: [FreeWebItem] = [
        FreeWebItem(name: "1. Gemini（谷歌）", url: "https://gemini.google.com", category: "overseas", subtitle: "Google Gemini 免费网页版"),
        FreeWebItem(name: "2. ChatGPT", url: "https://chatgpt.com", category: "overseas", subtitle: "OpenAI ChatGPT 官方网页端"),
        FreeWebItem(name: "3. Claude", url: "https://claude.ai", category: "overseas", subtitle: "Anthropic Claude 官方网页端"),
        FreeWebItem(name: "4. Grok（X）", url: "https://grok.com", category: "overseas", subtitle: "xAI Grok 官方免费网页端")
    ]

    static var allDefaults: [FreeWebItem] {
        return domesticDefaults + overseasDefaults
    }
}

enum ServiceStore {
    static let key = "DSHios.services"
    static let initializedLockKey = "DSHios.servicesInitializedLock"
    static let seedVersionKey = "DSHios.servicesSeedVersion"
    /// 种子版本：8 = 统一收拢至桌面端主控端口 3083，确保局域网与外网与当前电脑桌面窗口全量会话完全同步。
    static let currentSeedVersion = 8

    /// 默认预置（全网统一纯净公开版模板）：
    /// 🔴 v1.0.114：只保留 DSH 官方主控端口 3083 这一条通用占位。
    ///   原模板混入了三个「开发者本机专有服务」（57890 WorkBuddy 账号切换 / 9009 端口仪表盘 / 8210 本地 TTS），
    ///   任何陌生玩家装上后首屏都会看到 3 个永远连不上的条目 —— 属于特殊性污染，已移除。
    ///   已安装用户沙盒里已保存的条目（含老用户自己加的）一律保留，不做删除；此处只影响全新安装的初始模板。
    static let defaults: [ServiceItem] = [
        ServiceItem(name: "DSH 主控（局域网）", url: "http://192.168.1.100:3083/",
                    note: "局域网·请修改为你的电脑局域网IP", resolverURL: nil)
    ]

    /// 双轨读取（Documents/dsh_user_data/services_v1.json + UserDefaults），带初始化锁。
    /// 首次安装后只要未卸载，后续版本覆盖更新（无论个人版或公开版）均严格保留玩家已自定义的条目与配置，绝不重置覆盖。
    static func load() -> [ServiceItem] {
        var items: [ServiceItem] = []
        if let fileData = try? Data(contentsOf: DSHPersistenceCenter.servicesFileURL),
           let fileItems = try? JSONDecoder().decode([ServiceItem].self, from: fileData),
           !fileItems.isEmpty {
            UserDefaults.standard.set(fileData, forKey: key)
            UserDefaults.standard.set(true, forKey: initializedLockKey)
            items = fileItems
        } else if let udData = UserDefaults.standard.data(forKey: key),
                  let udItems = try? JSONDecoder().decode([ServiceItem].self, from: udData),
                  !udItems.isEmpty {
            try? udData.write(to: DSHPersistenceCenter.servicesFileURL, options: .atomic)
            UserDefaults.standard.set(true, forKey: initializedLockKey)
            items = udItems
        } else {
            let initial = defaults
            save(initial)
            return initial
        }

        // 自动补齐当前版本新增的标准服务（如 WorkBuddy 账号切换 57890），老用户无损升级
        var changed = false
        for def in defaults {
            let exists = items.contains { item in
                if item.url == def.url || item.name == def.name { return true }
                if let u1 = URLComponents(string: item.url), let u2 = URLComponents(string: def.url) {
                    if u1.host == u2.host && u1.port == u2.port && u1.path == u2.path {
                        return true
                    }
                }
                return false
            }
            if !exists {
                items.append(def)
                changed = true
            }
        }
        if changed {
            save(items)
        }
        return items
    }

    static func save(_ items: [ServiceItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: key)
        UserDefaults.standard.set(true, forKey: initializedLockKey)
        try? data.write(to: DSHPersistenceCenter.servicesFileURL, options: .atomic)
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

    /// 外网入口换票：加 1.5 秒快速硬超时兜底，换不到立刻使用已有地址，绝不阻断用户换 URL
    static func resolve(_ item: ServiceItem, completion: @escaping (String) -> Void) {
        guard let api = item.resolverURL, !api.isEmpty, let url = URL(string: api) else {
            completion(item.url)
            return
        }
        // 有新鲜缓存直接用
        if let hit = cache[api], Date().timeIntervalSince(hit.at) < cacheTTL {
            completion(hit.url)
            return
        }
        if inflight[api] == true {
            completion(cache[api]?.url ?? item.url)
            return
        }
        inflight[api] = true
        var request = URLRequest(url: url, timeoutInterval: 1.5)
        request.httpMethod = "GET"
        var didComplete = false
        let safeCompletion = { (resURL: String) in
            if !didComplete {
                didComplete = true
                inflight[api] = false
                completion(resURL)
            }
        }
        // 1.5 秒硬超时保护
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            safeCompletion(cache[api]?.url ?? item.url)
        }
        URLSession.shared.dataTask(with: request) { data, _, _ in
            var resolved = cache[api]?.url ?? item.url
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ok = json["ok"] as? Bool, ok,
               let external = json["externalUrl"] as? String, !external.isEmpty {
                resolved = external
                cache[api] = (external, Date())
            }
            DispatchQueue.main.async { safeCompletion(resolved) }
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
        // 扫码添加服务：扫到地址二维码自动填好名称与地址，省去手输（v1.0.71）
        let scanItem = UIBarButtonItem(
            image: UIImage(systemName: "qrcode.viewfinder"),
            style: .plain,
            target: self,
            action: #selector(scanTapped))
        navigationItem.rightBarButtonItems = [scanItem, navigationItem.rightBarButtonItem!]
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

        let footer = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 160))
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

        let feedbackBtn = UIButton(type: .system)
        feedbackBtn.setTitle(" 💬 提交问题反馈与使用建议", for: .normal)
        feedbackBtn.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        feedbackBtn.setImage(UIImage(systemName: "bubble.left.and.exclamationmark.bubble.right"), for: .normal)
        feedbackBtn.tintColor = .systemOrange
        feedbackBtn.translatesAutoresizingMaskIntoConstraints = false
        feedbackBtn.addTarget(self, action: #selector(feedbackTapped), for: .touchUpInside)
        footer.addSubview(feedbackBtn)

        NSLayoutConstraint.activate([
            footerLabel.topAnchor.constraint(equalTo: footer.topAnchor, constant: 8),
            footerLabel.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            footerLabel.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20),

            guideBtn.topAnchor.constraint(equalTo: footerLabel.bottomAnchor, constant: 10),
            guideBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            guideBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),

            feedbackBtn.topAnchor.constraint(equalTo: guideBtn.bottomAnchor, constant: 10),
            feedbackBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            feedbackBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),
            feedbackBtn.bottomAnchor.constraint(lessThanOrEqualTo: footer.bottomAnchor, constant: -8)
        ])
        tableView.tableFooterView = footer
        probeAll()
    }

    @objc private func feedbackTapped() {
        let feedbackVC = FeedbackViewController()
        let nav = UINavigationController(rootViewController: feedbackVC)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
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

    /// 扫码添加/编辑服务：识别到地址后直接进编辑框，名称按 host 预填，确认即存。
    @objc private func scanTapped() {
        let scanner = QRAddressScannerViewController()
        scanner.onResult = { [weak self] address in
            guard let self else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                self.presentEditor(nil, prefilledURL: address)
            }
        }
        scanner.modalPresentationStyle = .fullScreen
        present(scanner, animated: true)
    }

    private func presentEditor(_ existing: (index: Int, item: ServiceItem)?, prefilledURL: String? = nil) {
        let alert = UIAlertController(
            title: existing == nil ? "添加服务" : "编辑服务",
            message: "名称、地址与备注",
            preferredStyle: .alert)

        // 扫码进来的：按地址 host 预填一个像样的名称，用户只按「保存」就行
        let suggestedName: String? = {
            guard let prefilledURL, let host = URL(string: prefilledURL)?.host else { return nil }
            return host == "127.0.0.1" || host == "localhost" ? "本机服务" : host
        }()

        alert.addTextField { tf in
            tf.placeholder = "名称（如：我的电脑）"
            tf.text = existing?.item.name ?? suggestedName
            tf.autocapitalizationType = .none
        }
        alert.addTextField { tf in
            tf.placeholder = "http://192.168.1.100:3083/"
            tf.text = existing?.item.url ?? prefilledURL
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
            let active = UserDefaults.standard.string(forKey: "DSHios.activeServiceURL") ?? currentURL
            if !active.isEmpty {
                if item.url == active { return true }
                if let itemComps = URLComponents(string: item.url),
                   let activeComps = URLComponents(string: active) {
                    if itemComps.host == activeComps.host && itemComps.port == activeComps.port && itemComps.path == activeComps.path {
                        return true
                    }
                }
            }
            if !currentURL.isEmpty {
                if item.url == currentURL { return true }
                if let itemComps = URLComponents(string: item.url),
                   let currComps = URLComponents(string: currentURL) {
                    if itemComps.host == currComps.host && itemComps.port == currComps.port && itemComps.path == currComps.path {
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

        // 头部卡片：主推自研 dsh-anywhere，备选 dsh-pocket
        let headerBox = createCardView(
            title: "💡 首选：dsh-anywhere 超级连接枢纽（支持多设备无缝协同）",
            desc: "专为 DSH iOS App 与多端协同深度打造！\n• 多端同屏：支持多台手机（iPhone / 安卓）、iPad / 平板、电脑多设备同时在线访问，实时同屏收发、流式同步打印！\n• 无缝切换：多终端随时接续，不冲突、不踢线！\n• 极速自愈：手机锁屏一两分钟切回 App 均能自动秒级自愈重连。\n• 纯净开源：完全开源无任何个人外网地址与密码。\n\n（备选方案：单设备轻量访问亦可选用 dsh-pocket）"
        )
        stack.addArrangedSubview(headerBox)

        // 步骤一：电脑端安装插件（主推 dsh-anywhere，备选 dsh-pocket）
        let step1 = createStepCard(
            badge: "步骤 1",
            title: "电脑端安装插件（主推 dsh-anywhere / 备选 dsh-pocket）",
            detail: "【首选方案 dsh-anywhere】支持多台手机与 iPad 同时在线访问与无缝切换：\n开源地址：https://github.com/liushQAQ/dsh-anywhere\n安装命令（务必带 github: 前缀，直接装本仓库）：",
            code: "pnpm add github:liushQAQ/dsh-anywhere",
            tip: "【备选方案 dsh-pocket】若仅需单设备轻量访问，可安装社区备选（npm 上的 dsh-pocket，作者 shaobeichen）：\ndsh plugin --profile web add dsh-pocket -w"
        )
        stack.addArrangedSubview(step1)

        // 步骤二：开启多端访问并查看地址
        let step2 = createStepCard(
            badge: "步骤 2",
            title: "多台手机/Pad 同时访问与无缝切换",
            detail: "1. 电脑端启动 DSH（统一以 3083 端口为唯一主控代理）\n2. 终端或 DSH 界面会显示您的电脑局域网访问地址与二维码\n3. 多台 iPhone、iPad 与电脑可同时打开同一会话，两边实时同屏收发、流式同步打印，不踢线、不冲突！\n4. 如需公网访问，支持 Cloudflare / 自定义穿透，重启软件外网地址保持不变。",
            code: nil,
            tip: "⚡ 彻底告别锁屏假死：手机锁屏一两分钟切回，系统自动恢复联通；亦可点击悬浮球「刷新」或「当前地址」瞬间重新联通！"
        )
        stack.addArrangedSubview(step2)

        // 步骤三：手机端连接
        let step3 = createStepCard(
            badge: "步骤 3",
            title: "在 iPhone 上扫码或填入连接",
            detail: "1. 确保手机与电脑连入同一 WiFi（或使用公网地址）\n2. 最快方式：点右上角「扫码」或悬浮球 →「📷 扫码连接」，直接扫地址二维码自动填好并连接\n3. 也可以选「手动输入地址…」，填入地址后点「加载」进入\n4. 本 App 会自动保存该地址并持久化保持登录态 Cookie，下次点开直接秒进。",
            code: nil,
            tip: "🎉 iOS 端已为您自动适配 Safari 现代特性补丁与流式消息防遮挡机制，体验极致丝滑！"
        )
        stack.addArrangedSubview(step3)

        // 步骤四：新增功能与体验说明（更新日志）
        let updateCard = createUpdateLogCard()
        stack.addArrangedSubview(updateCard)

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
        // 必须与卡片上展示的命令保持一致：带 github: 前缀直装本仓库，
        // 不能写成裸包名 dsh-anywhere —— 该名字在 npm 上已被第三方占用（版本与功能完全不同）。
        let codeText = "pnpm add github:liushQAQ/dsh-anywhere"
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
        t.numberOfLines = 0
        t.lineBreakMode = .byWordWrapping

        let d = UILabel()
        d.text = desc
        d.font = .preferredFont(forTextStyle: .subheadline)
        d.textColor = .secondaryLabel
        d.numberOfLines = 0
        d.lineBreakMode = .byWordWrapping

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
        badgeLabel.setContentHuggingPriority(.required, for: .horizontal)
        badgeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

        let t = UILabel()
        t.text = title
        t.font = .preferredFont(forTextStyle: .headline)
        t.textColor = .label
        t.numberOfLines = 0
        t.lineBreakMode = .byWordWrapping

        let headStack = UIStackView(arrangedSubviews: [badgeLabel, t])
        headStack.axis = .horizontal
        headStack.spacing = 8
        headStack.alignment = .top

        let d = UILabel()
        d.text = detail
        d.font = .preferredFont(forTextStyle: .subheadline)
        d.textColor = .secondaryLabel
        d.numberOfLines = 0
        d.lineBreakMode = .byWordWrapping

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

    private func createUpdateLogCard() -> UIView {
        let card = UIView()
        card.backgroundColor = .secondarySystemBackground
        card.layer.cornerRadius = 12

        let badgeLabel = UILabel()
        badgeLabel.text = "最新更新日志 (v1.0.88)"
        badgeLabel.font = .systemFont(ofSize: 12, weight: .bold)
        badgeLabel.textColor = .systemIndigo
        badgeLabel.backgroundColor = .systemIndigo.withAlphaComponent(0.12)
        badgeLabel.layer.cornerRadius = 4
        badgeLabel.clipsToBounds = true
        badgeLabel.textAlignment = .center

        let hBadge = UIStackView(arrangedSubviews: [badgeLabel, UIView()])
        hBadge.axis = .horizontal

        let titleLabel = UILabel()
        titleLabel.text = "功能特性与体验升级说明"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textColor = .label
        titleLabel.numberOfLines = 0
        titleLabel.lineBreakMode = .byWordWrapping

        let logContent = """
        🌐 1. 国内外主流大模型网页版支持一键添加快捷打开（v1.0.117）：
        • 在国内外主流模型列表（豆包/DeepSeek/Kimi等）中，点击任一条目均可一键添加为快捷服务，直接在首屏「切换服务」中常驻打开；
        • 正在浏览任何国内外模型或外部网页时，点击悬浮菜单首项直接出现「⭐ 将当前网页添加为快捷打开」，一秒收录；
        • 维护与工具中补齐「📡 全部服务与快捷方式管理」入口，随时自由添加、排序、编辑自定义快捷打开项。

        🧱 2. 设置页与弹层通用布局修复（v1.0.115 / v1.0.116）：
        • 设置页与任何弹出页面不再能左右滑动超出屏幕范围，内容永久锁定在屏宽内；
        • 插件页顶部标题条不再被压扁，标题与下方卡片完全分离、互不遮挡；滚动时吸顶条自带底色，内容不再透上来；
        • 设置页里被拉成整行通栏的控件（下拉框 / 数字框 / 开关）统一恢复官方桌面宽度，开关回到 36×20 的小胶囊；
        • 上述修复全部为通用机制：运行时读取官方规则后自动跟随，官方改版不会失效，也不写死任何像素值。

        🧩 3. 通用性与分发修复（v1.0.114）：
        • 插件安装命令改为直装本仓库：pnpm add github:liushQAQ/dsh-anywhere —— npm 上的同名包属第三方、功能完全不同，旧命令会把玩家装到错误的插件；
        • 默认服务清单只保留「DSH 主控 3083」一条通用占位，移除开发者本机专用的三个服务条目，首屏不再出现永远连不上的地址；
        • 检查更新改走公开仓库直链，并逐个加速镜像自动切换；不再依赖任何个人隧道节点，节点下线不影响所有玩家更新；
        • 「检查更新」的巨魔一键直连也改为逐镜像探测，单条加速线挂掉不会整条路径失效；
        • 连接教程里备选插件措辞修正为「社区备选」；反馈收件地址改为从配置读取，不再写死在代码里。

        ⚡ 4. 首推自研 dsh-anywhere 插件（多端协同枢纽）：
        • 支持多台 iPhone、安卓手机、iPad 与电脑多设备同时在线访问；
        • 实时双向同屏收发、流式同步打印，不踢线、不冲突，多端无缝切换；
        • 内置毫秒级 Fast-Resume，锁屏一两分钟切回 App 均能自动秒级自愈恢复联通；
        • 纯净开源无个人外网密码（备选支持单端 dsh-pocket 插件）。

        🛡 5. 锁屏假死彻底自愈与强行重连：
        • 针对锁屏后网络通信中断导致的页面卡死，切回前台自动触发强行重连自愈；
        • 悬浮菜单点击「刷新」或点击「当前服务地址」，100% 强行建立全新连接恢复通讯。

        📐 6. 顶栏 / 侧边栏 / 右侧面板统一收紧（v1.0.110 / v1.0.113）：
        • 顶栏、标题与目录按钮统一上移并对齐 iOS 系统状态栏，之间不再残留空白条（v1.0.113 定版再微调半格）；
        • 左侧侧边栏宽度收紧至屏宽的 70%（252pt），主内容区豁然开阔；
        • 右侧面板顶部多余留白收起（官方重复的一段内边距），内容整体上提 45pt，打开即见正文。

        🖱️ 7. 入口按钮实测可直接点开（v1.0.112 / v1.0.113）：
        • 首页悬浮键与会话页左上角「打开目录」按钮双通道均实测有效，点开即回落 252pt 抽屉；
        • 界面看护不再误伤「故意停在屏幕外」的弹层与抽屉，浮层不再乱飞。

        ⌨️ 8. 输入框只有两个固定位置（v1.0.107 / v1.0.110）：
        • 键盘弹起与收起各停一处，不再随流式输出上下飘移、也不再能一路滑到天上；
        • 键盘弹起时「用量 / token / 上下文」统计条完整显示，不再莫名消失。

        🎨 9. 界面细节修复（v1.0.108 / v1.0.109）：
        • 暗色模式分层接缝修复，状态栏下方不再出现横向色阶断层；
        • 会话记录不再从聊天框底部缝隙露出；新建会话左上角按钮恢复响应。

        🚀 10. 远程仓库更新与巨魔 (TrollStore) 一键自动安装：
        • 悬浮菜单内置「检查更新」，自动检测仓库新版本，支持巨魔一键覆盖安装；
        • 下载地址为公开仓库直链，内置多个加速镜像并自动逐个重试，单节点异常不影响更新。

        📱 11. iOS 机型安全区自动适配（v1.0.105）：
        • 内置 iPhone / iPad 全系安全区标准值对照表，启动即按机型自动匹配，无需手工配置；
        • 本机检测：\(iOSSafeArea.selfCheckSummary())；
        • 顶栏按状态栏高度自动让位、底栏按底部安全区自动预留，换机与横竖屏切换均自动重算。
        """

        let contentLabel = UILabel()
        contentLabel.text = logContent
        contentLabel.font = .preferredFont(forTextStyle: .subheadline)
        contentLabel.textColor = .secondaryLabel
        contentLabel.numberOfLines = 0

        let vStack = UIStackView(arrangedSubviews: [hBadge, titleLabel, contentLabel])
        vStack.axis = .vertical
        vStack.spacing = 10
        vStack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(vStack)

        NSLayoutConstraint.activate([
            vStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 14),
            vStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 14),
            vStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
            vStack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14),
            badgeLabel.heightAnchor.constraint(equalToConstant: 22),
            badgeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 80)
        ])

        return card
    }
}


