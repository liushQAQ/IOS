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
    ///
    /// 🔴 v1.0.124 两个致命 bug 修复（老总：「预设的快捷链接，修改 url 可以，删除直接报错」）：
    ///   ① 原实现用 `!fileItems.isEmpty` 判断「有没有数据」——用户把条目删光后文件里是 `[]`，
    ///      会被当成「没数据」直接重置回预设，等于删不掉；
    ///   ② 原实现无条件自动补齐 defaults —— 删掉预设条目后，下一次 load() 立刻把它**补回来**，
    ///      列表条数没变，而表格那边已经 `deleteRows` 删了一行 → UIKit 直接抛
    ///      「invalid number of rows」异常崩溃。
    ///   现在：空列表是合法状态；删掉的默认条目记进「墓碑」，再也不自动补。
    static func load() -> [ServiceItem] {
        var decoded: [ServiceItem]?
        if let fileData = try? Data(contentsOf: DSHPersistenceCenter.servicesFileURL),
           let fileItems = try? JSONDecoder().decode([ServiceItem].self, from: fileData) {
            UserDefaults.standard.set(fileData, forKey: key)
            UserDefaults.standard.set(true, forKey: initializedLockKey)
            decoded = fileItems
        } else if let udData = UserDefaults.standard.data(forKey: key),
                  let udItems = try? JSONDecoder().decode([ServiceItem].self, from: udData) {
            try? udData.write(to: DSHPersistenceCenter.servicesFileURL, options: .atomic)
            UserDefaults.standard.set(true, forKey: initializedLockKey)
            decoded = udItems
        }
        guard var items = decoded else {
            let initial = defaults
            save(initial)
            return initial
        }

        // 自动补齐当前版本新增的标准服务（老用户无损升级）；
        // 但用户**明确删除过**的默认条目一律跳过，绝不复活。
        let tombstones = deletedDefaultKeys()
        var changed = false
        for def in defaults {
            if tombstones.contains(identity(def)) { continue }
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

    // MARK: - 默认条目墓碑（用户删掉的预置项，永远不再自动补回）

    static let deletedDefaultsKey = "DSHios.servicesDeletedDefaults"

    static func identity(_ item: ServiceItem) -> String {
        return item.name + "|" + item.url
    }

    static func deletedDefaultKeys() -> Set<String> {
        let arr = UserDefaults.standard.stringArray(forKey: deletedDefaultsKey) ?? []
        return Set(arr)
    }

    static func markDefaultDeleted(_ item: ServiceItem) {
        var arr = UserDefaults.standard.stringArray(forKey: deletedDefaultsKey) ?? []
        let id = identity(item)
        if !arr.contains(id) {
            arr.append(id)
            UserDefaults.standard.set(arr, forKey: deletedDefaultsKey)
        }
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
        let old = items[index]
        items[index] = item
        // 改掉预设条目的地址/名字后，原始预设身份就不存在了 —— 记账，
        // 否则下次 load() 会认定「预设缺失」再补一条一模一样的新条目（用户会看到重复行）。
        if defaults.contains(where: { identity($0) == identity(old) }) && identity(old) != identity(item) {
            markDefaultDeleted(old)
        }
        save(items)
    }

    static func remove(at index: Int) {
        var items = load()
        guard items.indices.contains(index) else { return }
        let gone = items[index]
        items.remove(at: index)
        // 🔴 删的是预设条目 → 记墓碑，防止 load() 自动补回来（补回来就是「删了没反应」甚至崩溃）
        if defaults.contains(where: { identity($0) == identity(gone) }) {
            markDefaultDeleted(gone)
        }
        save(items)
    }

    /// 🔴 v1.0.130 排序（老总：「没有编辑，排序，上移下移最前末尾」）：
    ///   把 from 位置的条目挪到 to 位置并持久化。上移=to-1 / 下移=to+1 / 最前=0 / 末尾=count-1。
    ///   排序结果原样写入存储 —— 与删除/编辑共用同一份 JSON，下次打开顺序保持。
    static func move(from: Int, to: Int) {
        var items = load()
        guard items.indices.contains(from), items.indices.contains(to), from != to else { return }
        let item = items.remove(at: from)
        items.insert(item, at: to)
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
        // 🔴 v1.0.130 长按行弹排序菜单（上移/下移/最前/末尾）—— 与右侧 ☰ 按钮双入口。
        let lp = UILongPressGestureRecognizer(target: self, action: #selector(rowLongPressed(_:)))
        lp.minimumPressDuration = 0.45
        tableView.addGestureRecognizer(lp)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let footer = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 210))
        let footerLabel = UILabel()
        footerLabel.text = "点行打开该服务；右侧 ✎ 编辑、⇅ 排序（上移/下移/最前/末尾），长按行也可排序；左滑删除。列表保存在本机，电脑 IP 变化时只需编辑对应条目。"
        footerLabel.font = .preferredFont(forTextStyle: .footnote)
        footerLabel.textColor = .secondaryLabel
        footerLabel.numberOfLines = 0
        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(footerLabel)

        let rulesBtn = UIButton(type: .system)
        rulesBtn.setTitle(" 🔴 插件布局规范（所有玩家必读）", for: .normal)
        rulesBtn.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        rulesBtn.setImage(UIImage(systemName: "exclamationmark.shield"), for: .normal)
        rulesBtn.tintColor = .systemRed
        rulesBtn.translatesAutoresizingMaskIntoConstraints = false
        rulesBtn.addTarget(self, action: #selector(rulesTapped), for: .touchUpInside)
        footer.addSubview(rulesBtn)

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

            rulesBtn.topAnchor.constraint(equalTo: footerLabel.bottomAnchor, constant: 12),
            rulesBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            rulesBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),

            guideBtn.topAnchor.constraint(equalTo: rulesBtn.bottomAnchor, constant: 12),
            guideBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            guideBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),

            feedbackBtn.topAnchor.constraint(equalTo: guideBtn.bottomAnchor, constant: 10),
            feedbackBtn.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            feedbackBtn.trailingAnchor.constraint(lessThanOrEqualTo: footer.trailingAnchor, constant: -20),
            feedbackBtn.bottomAnchor.constraint(lessThanOrEqualTo: footer.bottomAnchor, constant: -8)
        ])
        tableView.tableFooterView = footer
        probeAll()
        updateEmptyState()
    }

    /// 列表空态：所有服务都被删光时给一句提示（删光不再被重置回预设，必须让人知道怎么加回来）
    private func updateEmptyState() {
        guard services.isEmpty else {
            tableView.backgroundView = nil
            return
        }
        let label = UILabel()
        label.text = "还没有任何服务\n点右上角 + 添加，或用扫码导入"
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.textColor = .secondaryLabel
        tableView.backgroundView = label
    }

    @objc private func feedbackTapped() {
        let feedbackVC = FeedbackViewController()
        let nav = UINavigationController(rootViewController: feedbackVC)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true)
    }

    @objc private func rulesTapped() {
        let rulesVC = PluginLayoutRulesViewController()
        let nav = UINavigationController(rootViewController: rulesVC)
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
            self.updateEmptyState()
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
        // 🔴 v1.0.130 「排序」按钮（老总：「没有编辑，排序，上移下移最前末尾」）：
        //   右侧再挂一枚 ☰ 按钮，点它弹 上移/下移/移到最前/移到末尾 菜单；
        //   长按行同样弹出（viewDidLoad 里装了长按手势）—— 显式按钮 + 手势双入口。
        let orderButton = UIButton(type: .system)
        orderButton.setImage(UIImage(systemName: "arrow.up.arrow.down"), for: .normal)
        orderButton.tintColor = .systemOrange
        orderButton.addTarget(self, action: #selector(orderTapped(_:)), for: .touchUpInside)
        let accessory = UIStackView(arrangedSubviews: [orderButton, editButton])
        accessory.axis = .horizontal
        accessory.spacing = 12
        cell.accessoryView = accessory
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

    // MARK: - 排序（v1.0.130：上移 / 下移 / 移到最前 / 移到末尾）

    /// 排序按钮（cell.accessoryView 上的 ☰）：与编辑笔同一套 hit-test 反查所在行。
    @objc private func orderTapped(_ sender: UIButton) {
        let center = CGPoint(x: sender.bounds.midX, y: sender.bounds.midY)
        let point = sender.convert(center, to: tableView)
        guard let indexPath = tableView.indexPathForRow(at: point),
              services.indices.contains(indexPath.row) else { return }
        showOrderMenu(forRowAt: indexPath)
    }

    /// 长按行 = 弹出排序菜单（与 ☰ 按钮同一入口，老总不用去找小按钮）。
    @objc private func rowLongPressed(_ g: UILongPressGestureRecognizer) {
        guard g.state == .began else { return }
        let p = g.location(in: tableView)
        guard let indexPath = tableView.indexPathForRow(at: p),
              services.indices.contains(indexPath.row) else { return }
        showOrderMenu(forRowAt: indexPath)
    }

    func showOrderMenu(forRowAt indexPath: IndexPath) {
        guard services.indices.contains(indexPath.row) else { return }
        let row = indexPath.row
        let last = services.count - 1
        let item = services[row]
        let sheet = UIAlertController(
            title: item.name,
            message: "调整排列顺序（保存到本机，下次打开保持）",
            preferredStyle: .actionSheet)
        if row > 0 {
            sheet.addAction(UIAlertAction(title: "⬆️ 上移", style: .default) { [weak self] _ in
                self?.moveService(from: row, to: row - 1)
            })
        }
        if row < last {
            sheet.addAction(UIAlertAction(title: "⬇️ 下移", style: .default) { [weak self] _ in
                self?.moveService(from: row, to: row + 1)
            })
        }
        if row > 0 {
            sheet.addAction(UIAlertAction(title: "⏫ 移到最前", style: .default) { [weak self] _ in
                self?.moveService(from: row, to: 0)
            })
        }
        if row < last {
            sheet.addAction(UIAlertAction(title: "⏬ 移到末尾", style: .default) { [weak self] _ in
                self?.moveService(from: row, to: last)
            })
        }
        sheet.addAction(UIAlertAction(title: "✏️ 编辑（名称/地址/备注）", style: .default) { [weak self] _ in
            guard let self, self.services.indices.contains(row) else { return }
            self.presentEditor((row, self.services[row]))
        })
        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        // iPad 的 actionSheet 必须给 anchor，否则直接崩；iPhone 不受影响。
        if let anchor = tableView.cellForRow(at: indexPath) {
            sheet.popoverPresentationController?.sourceView = anchor
            sheet.popoverPresentationController?.sourceRect = anchor.bounds
        }
        present(sheet, animated: true)
    }

    /// 落库 + 刷新。与删除同一套兜底哲学：一律 reloadData（绝不做增量 moveRow），
    /// 数据层无论发生什么，界面永远和数据一致，绝无 invalid number of rows 崩溃。
    private func moveService(from: Int, to: Int) {
        ServiceStore.move(from: from, to: to)
        services = ServiceStore.load()
        tableView.reloadData()
        probeAll()
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
            guard let self else { done(false); return }
            ServiceStore.remove(at: indexPath.row)
            self.services = ServiceStore.load()
            // 🔴 v1.0.124：这里原来用 deleteRows，一旦「删掉预设后 load() 又把它补回来」，
            //   表格删一行 vs 数据没少 → UIKit 直接抛 invalid number of rows 崩溃（老总说的「删除直接报错」）。
            //   现在 ServiceStore 不再复活被删的预设，同时这里改用 reloadData 做兜底：
            //   即使将来数据层再出意外，也只会刷新，绝不会崩。
            tableView.reloadData()
            self.updateEmptyState()
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

// MARK: - 插件布局规范页（长期文本 · 所有玩家必读）

/// 长期常驻的规范文本页。
/// 老总 2026-10-23 令：「在 iOS App 那个地方长期文本显示规范。要求任何插件占用原生会话框位置、
/// 压缩原生按钮的，必须回到顶部 tab 栏，如何规范。也要告诉他们。通用性任何玩家都适合。」
final class PluginLayoutRulesViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "插件布局规范"
        view.backgroundColor = .systemBackground

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closeTapped))

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 14
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
            stack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -28),
            stack.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -40)
        ])

        stack.addArrangedSubview(makeCard(
            title: "🔴 一句话铁律",
            body: "插件永远不占会话框（输入框）的位置，永远不压缩原生按钮的空间。原生会话框里的按钮（模型 / 权限 / 语音 / 齿轮 / 发送）是一个整体，一个都不许动。\n\n插件要有界面，就去自己的地盘：会话 tab 栏（「对话 / 轨迹 / 系统监控」那一行的右侧）、卡片下方读数条、侧栏面板、独立浮层。不许挤进用户打字的那个框。",
            accent: .systemRed))

        stack.addArrangedSubview(makeCard(
            title: "💥 违规时会发生什么（真实故障）",
            body: "插件挤进输入框工具行后，那一行宽度是固定的，原生按钮只能被压窄：\n\n• 模型按钮被压到只剩 5 像素宽、文字宽 0 —— 用户以为「模型按钮不见了」\n• 权限模式、语音、齿轮、发送按钮互相叠印，点不动\n• 窄屏（375 / 430 宽）下直接溢出屏幕，右边一半按钮消失\n• 新建会话时模型按钮整块不渲染，只能重启 App\n\n这不是「不好看」，是功能直接不可用。",
            accent: .systemOrange))

        stack.addArrangedSubview(makeCard(
            title: "✅ 唯一正确做法：放进会话 tab 栏",
            body: "「对话 / 轨迹 / 系统监控」这一行叫会话 tab 栏，它是由 DSH 的 conversation.view 插槽渲染出来的 —— 其中「系统监控」就是第三方插件 dsh-system-monitor-plugin 贡献的。\n\n所以这一行本来就是「官方 + 插件共用」的地盘，插件往里放东西不需要任何官方插槽，右侧全是空位。\n\n推荐两步：\n\n① 注册位仍用 conversation.session.header.actions（它只在会话态声明，正好当降级位）\n\n② 组件里把胶囊 Portal 进 tab 栏容器：\n\ndocument.querySelector('[data-conversation-tabs]')\nReactDOM.createPortal(胶囊, 那个容器)\n\n锚点必须用 data-conversation-tabs 这个稳定语义属性，绝不用 CSS Module 哈希类名（ank0OG_tabs / _727C8a_tabs 之类，换版本就失效）。\n\n取不到 tab 栏（新会话空态 / 版本改结构）就降级回注册位渲染，绝不让胶囊整块消失。",
            accent: .systemGreen, mono: true))

        stack.addArrangedSubview(makeCard(
            title: "⛔ 绝对禁止挂这些插槽",
            body: "conversation.input.left\nconversation.input.right\nconversation.input.model      （除非接管替换官方，必须 priority: -1）\nconversation.input.model.label\nconversation.input.overlay\nconversation.input.attachments\nconversation.input.plan\nconversation.input.permission\nconversation.composer.bar\n\n以上全部位于输入框内部或紧邻工具行，挂上去必然压缩原生按钮。",
            accent: .systemRed, mono: true))

        stack.addArrangedSubview(makeCard(
            title: "⛔ 也禁止这些「绕过」写法",
            body: "1. 用 transform: translate(...) 把元素「视觉上」挪出输入框 —— 它的布局宽度还在原位，照样挤原生按钮。\n\n2. 改原生容器的 padding / width 给插件腾位置。\n\n3. 用 position: absolute / fixed 直接抢占原生按钮的坐标。\n\n4. 把插件挂在「有时不渲染」的容器上（例如无会话数据时 display:none 的读数条）—— 用户会看到按钮时有时无。",
            accent: .systemRed))

        stack.addArrangedSubview(makeCard(
            title: "✅ 推荐挂这些位置",
            body: "[P1 首选] 会话 tab 栏（对话/轨迹/系统监控 那一行右侧）\n           锚点 data-conversation-tabs\n\n[降级位] conversation.session.header.actions    会话标题行右侧\nconversation.session.header.utilities     标题行工具位\nconversation.session.header.corner        标题行最右角（只放图标）\nconversation.composer.dock                卡片下方读数条\nshell.overlay                             全局浮层（关闭态必须零占位）\nsettings.section / sidebar.*              设置页 / 侧栏",
            accent: .systemGreen, mono: true))

        stack.addArrangedSubview(makeCard(
            title: "📏 版面约束",
            body: "• 高度统一 28pt，垂直居中，不换行。\n• 宽度不够时按可用宽度等比压缩、标签出省略号，绝不换行下移、绝不挤压原生按钮。\n• 带下拉菜单的，菜单必须在打开时重新定位贴住自己的按钮（锚点在上半屏向下展开、下半屏向上展开）。\n• 关闭态必须零占位，不得残留隐形占位块。",
            accent: .systemBlue))

        stack.addArrangedSubview(makeCard(
            title: "🌍 通用性说明（任何玩家都适用）",
            body: "本条规范不区分使用者、不区分机器、不区分渠道。\n\n会话 tab 栏（conversation.view 渲染出来的那一行）在桌面端与手机端是同一套前端，插件自己 Portal 进去，两端同时到同一个位置，不依赖任何本机特有结构。\n\n任何玩家安装同一个插件包，都会得到同样的合规位置。\n\n已按本规范迁移的插件：\n• dsh-our-free-model-composer-credits v1.3.0（积分胶囊 → tab 栏）\n• dsh-prompt-optimizer v1.6.0（提示词优化 → tab 栏）\n• dsh-connect-workbuddy（余额读数改为输入框下方 dock）",
            accent: .systemPurple))

        stack.addArrangedSubview(makeCard(
            title: "🧪 改完怎么自检",
            body: "1. 输入框工具行（+ / 语音 / 权限 / 模型 / 齿轮 / 发送）里不应出现任何插件元素。\n2. 官方模型选择器的可见宽度不能低于它的文字自然宽度（出现省略号就是被压了）。\n3. 所有原生按钮中心点能被点中，不被任何东西遮挡。\n4. 375 / 430 窄屏下逐张截图看：不溢出、不叠印、不下移。\n5. 必须在「装了全部插件」的环境里测 —— 沙箱没装某个插件，就永远测不出它挤爆布局。",
            accent: .systemTeal))

        let footer = UILabel()
        footer.text = "本规范与仓库 PLUGIN_LAYOUT_RULES.md 同源，冲突时以该文件为准。"
        footer.font = .preferredFont(forTextStyle: .caption1)
        footer.textColor = .tertiaryLabel
        footer.numberOfLines = 0
        footer.textAlignment = .left   // 🔴 v1.0.142 文案规范：页面说明一律靠左
        stack.addArrangedSubview(footer)
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    private func makeCard(title: String, body: String, accent: UIColor, mono: Bool = false) -> UIView {
        let card = UIView()
        card.backgroundColor = .secondarySystemBackground
        card.layer.cornerRadius = 12

        let t = UILabel()
        t.text = title
        t.font = .preferredFont(forTextStyle: .headline)
        t.textColor = accent
        t.numberOfLines = 0
        t.textAlignment = .left   // 🔴 v1.0.142 文案规范：页面说明一律靠左

        let d = UILabel()
        d.text = body
        d.textAlignment = .left   // 🔴 v1.0.142 文案规范：页面说明一律靠左
        d.font = mono
            ? .monospacedSystemFont(ofSize: 13, weight: .regular)
            : .preferredFont(forTextStyle: .subheadline)
        d.textColor = .label
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
        // 🔴 v1.0.142 文案规范（老总令）：徽章版本必须动态取当前版本，禁止写死。
        badgeLabel.text = "更新日志 (v\(AppDelegate.Version.marketing))"
        badgeLabel.font = .systemFont(ofSize: 12, weight: .bold)
        badgeLabel.textColor = .systemIndigo
        badgeLabel.backgroundColor = .systemIndigo.withAlphaComponent(0.12)
        badgeLabel.layer.cornerRadius = 4
        badgeLabel.clipsToBounds = true
        badgeLabel.textAlignment = .center

        let hBadge = UIStackView(arrangedSubviews: [badgeLabel, UIView()])
        hBadge.axis = .horizontal

        let titleLabel = UILabel()
        titleLabel.text = "更新说明"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textColor = .label
        titleLabel.numberOfLines = 0
        titleLabel.lineBreakMode = .byWordWrapping
        titleLabel.textAlignment = .left

        // 🔴 v1.0.142 文案规范（老总令：「更新说明和关于要尽量最大化精简，
        //   排序 1-2-3-4-5-6 序号对齐，靠左对齐，纳入打包前校验」）：
        //   ① 一条一行、序号从 1 严格递增不重复；② 每行 ≤ 40 字；③ 只写结果不写过程；
        //   ④ 闸门 [文案·R46] 机械校验：序号断链 / 超长 / 缺左对齐 = 红条禁打包。
        let logContent = """
        1. 2.0 重大升级：离线OCR/后台保活/灵动岛 (2.0.0)
        2. 修复开关抽屉回会话页，按钮跑出屏幕 (142)
        3. 修复开始页顶栏被挡住、多出一排假按钮 (140-141)
        4. 启动提速：冷启动 5.7MB→0.2MB，秒开 (139)
        5. 开始页顶栏出屏五犯根治 + 高度锁定 + 防闪烁 (138)
        6. 工作区按钮下移四犯根治 + 多终端同步丢失根治 (137)
        7. 会话框 + 号弹层闪退根治 (136)
        8. 抽屉按钮出屏三犯根治 + 值守卫 (135-136)
        9. 左滑右滑手势收窄左缘，不再误关误返 (135)
        10. 右抽屉顶栏三症状根治 + 左侧目录改手势 (134)
        11. 会话标题横跳、图片放大「闪退」根治 (133)
        12. 后台任务胶囊与团队按钮重叠根治 (132)
        13. 顶栏整体下移 59pt 原生层根治 (130)
        14. 整页滚动锁：顶栏底栏钉死，只有内容区滚 (129)
        15. 会话框底排按钮防挤压、模型选择器不再压发送钮 (127)
        16. 顶栏对齐状态栏 + 右侧面板上提 (126)
        17. 溢出通用钳制 + 抽屉 252 收敛 + 回归闸门建立 (122-124)
        18. 多端协同 dsh-anywhere + 锁屏假死自愈重连 (114-117)
        19. 全系机型安全区自动适配 (105)
        """

        let contentLabel = UILabel()
        contentLabel.text = logContent
        contentLabel.font = .preferredFont(forTextStyle: .subheadline)
        contentLabel.textColor = .secondaryLabel
        contentLabel.numberOfLines = 0
        // 🔴 v1.0.142 文案规范（老总令）：正文靠左对齐显式声明，闸门 [文案·R46] 校验。
        contentLabel.textAlignment = .left

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



// MARK: - 国内外主流大模型网页版专属固定面板（彻底解决忽大忽小、位置不固定、滑动多下）
// 方案：固定底部优雅抽屉面板 + 双列 8 宫格紧凑布局，零滚动、一屏全部装下，点击秒开，长按设置快捷打开

final class FreeWebListViewController: UIViewController {
    private let onSelect: (String) -> Void
    private let onAddShortcut: (FreeWebItem) -> Void
    private let onRemoveShortcut: (FreeWebItem) -> Void

    private var currentCategory: String = "domestic" // "domestic" | "overseas"
    private var containerView: UIView!
    private var segmentedControl: UISegmentedControl!
    private var gridStackView: UIStackView!

    private var items: [FreeWebItem] {
        return currentCategory == "domestic" ? FreeWebStore.domesticDefaults : FreeWebStore.overseasDefaults
    }

    init(initialCategory: String = "domestic",
         onSelect: @escaping (String) -> Void,
         onAddShortcut: @escaping (FreeWebItem) -> Void,
         onRemoveShortcut: @escaping (FreeWebItem) -> Void) {
        self.currentCategory = initialCategory
        self.onSelect = onSelect
        self.onAddShortcut = onAddShortcut
        self.onRemoveShortcut = onRemoveShortcut
        super.init(nibName: nil, bundle: nil)
        self.modalPresentationStyle = .overFullScreen
        self.modalTransitionStyle = .crossDissolve
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        // 1. 半透明暗色背景遮罩，点背景任意处即可退出
        let backdrop = UIView()
        backdrop.backgroundColor = UIColor(white: 0, alpha: 0.55)
        backdrop.translatesAutoresizingMaskIntoConstraints = false
        let tapBackdrop = UITapGestureRecognizer(target: self, action: #selector(closeTapped))
        backdrop.addGestureRecognizer(tapBackdrop)
        view.addSubview(backdrop)

        // 2. 核心：绝对固定在底部的卡片容器（固定高度，严禁忽大忽小伸缩，零滚动！）
        containerView = UIView()
        containerView.backgroundColor = UIColor(red: 0.11, green: 0.11, blue: 0.13, alpha: 0.98)
        containerView.layer.cornerRadius = 24
        containerView.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        containerView.layer.borderWidth = 0.5
        containerView.layer.borderColor = UIColor(white: 1.0, alpha: 0.15).cgColor
        containerView.layer.shadowColor = UIColor.black.cgColor
        containerView.layer.shadowOpacity = 0.5
        containerView.layer.shadowRadius = 25
        containerView.layer.shadowOffset = CGSize(width: 0, height: -8)
        containerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(containerView)

        NSLayoutConstraint.activate([
            backdrop.topAnchor.constraint(equalTo: view.topAnchor),
            backdrop.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            backdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            containerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            containerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            containerView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            // 固定高度：底部安全区 + 390pt 内容，确保整洁紧凑固定，杜绝滑动多下
            containerView.heightAnchor.constraint(equalToConstant: 440)
        ])

        setupHeader()
        setupGrid()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // 底部固定面板轻微上弹动画
        containerView.transform = CGAffineTransform(translationX: 0, y: 440)
        UIView.animate(withDuration: 0.28, delay: 0, usingSpringWithDamping: 0.82, initialSpringVelocity: 1.2, options: .curveEaseOut) {
            self.containerView.transform = .identity
        }
    }

    @objc private func closeTapped() {
        UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseIn, animations: {
            self.containerView.transform = CGAffineTransform(translationX: 0, y: 440)
            self.view.alpha = 0
        }) { _ in
            self.dismiss(animated: false)
        }
    }

    private func setupHeader() {
        let grabber = UIView()
        grabber.backgroundColor = UIColor(white: 0.35, alpha: 1.0)
        grabber.layer.cornerRadius = 2.5
        grabber.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(grabber)

        // 顶栏水平条
        let topBar = UIView()
        topBar.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(topBar)

        let titleLabel = UILabel()
        titleLabel.text = "主流AI大模型"
        titleLabel.font = .systemFont(ofSize: 16.5, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        topBar.addSubview(titleLabel)

        segmentedControl = UISegmentedControl(items: ["🇨🇳 国内 (8)", "🌐 国外 (4)"])
        segmentedControl.selectedSegmentIndex = (currentCategory == "domestic") ? 0 : 1
        segmentedControl.addTarget(self, action: #selector(segmentChanged(_:)), for: .valueChanged)
        segmentedControl.translatesAutoresizingMaskIntoConstraints = false
        topBar.addSubview(segmentedControl)

        let closeBtn = UIButton(type: .system)
        closeBtn.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        closeBtn.tintColor = UIColor(white: 0.5, alpha: 1.0)
        closeBtn.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        topBar.addSubview(closeBtn)

        // 操作规则提示栏
        let tipBar = UIView()
        tipBar.backgroundColor = UIColor(red: 0.18, green: 0.82, blue: 0.34, alpha: 0.12)
        tipBar.layer.cornerRadius = 8
        tipBar.layer.borderWidth = 0.5
        tipBar.layer.borderColor = UIColor(red: 0.18, green: 0.82, blue: 0.34, alpha: 0.3).cgColor
        tipBar.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(tipBar)

        let tipLabel = UILabel()
        tipLabel.text = "💡 操作规则：轻点卡片直接打开链接 · 长按弹出快捷打开设置"
        tipLabel.font = .systemFont(ofSize: 11.5, weight: .medium)
        tipLabel.textColor = UIColor(red: 0.25, green: 0.85, blue: 0.4, alpha: 1.0)
        tipLabel.textAlignment = .center
        tipLabel.translatesAutoresizingMaskIntoConstraints = false
        tipBar.addSubview(tipLabel)

        NSLayoutConstraint.activate([
            grabber.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 8),
            grabber.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
            grabber.widthAnchor.constraint(equalToConstant: 38),
            grabber.heightAnchor.constraint(equalToConstant: 5),

            topBar.topAnchor.constraint(equalTo: grabber.bottomAnchor, constant: 6),
            topBar.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            topBar.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            topBar.heightAnchor.constraint(equalToConstant: 34),

            titleLabel.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),

            segmentedControl.centerXAnchor.constraint(equalTo: topBar.centerXAnchor, constant: 10),
            segmentedControl.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
            segmentedControl.heightAnchor.constraint(equalToConstant: 28),

            closeBtn.trailingAnchor.constraint(equalTo: topBar.trailingAnchor),
            closeBtn.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
            closeBtn.widthAnchor.constraint(equalToConstant: 30),
            closeBtn.heightAnchor.constraint(equalToConstant: 30),

            tipBar.topAnchor.constraint(equalTo: topBar.bottomAnchor, constant: 8),
            tipBar.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            tipBar.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            tipBar.heightAnchor.constraint(equalToConstant: 26),

            tipLabel.centerXAnchor.constraint(equalTo: tipBar.centerXAnchor),
            tipLabel.centerYAnchor.constraint(equalTo: tipBar.centerYAnchor)
        ])
    }

    private func setupGrid() {
        gridStackView = UIStackView()
        gridStackView.axis = .vertical
        gridStackView.spacing = 8
        gridStackView.distribution = .fillEqually
        gridStackView.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(gridStackView)

        NSLayoutConstraint.activate([
            gridStackView.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 94),
            gridStackView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 14),
            gridStackView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -14),
            gridStackView.heightAnchor.constraint(equalToConstant: 270)
        ])

        reloadGridData()
    }

    @objc private func segmentChanged(_ sender: UISegmentedControl) {
        currentCategory = (sender.selectedSegmentIndex == 0) ? "domestic" : "overseas"
        reloadGridData()
    }

    private func isItemSaved(_ item: FreeWebItem) -> Bool {
        let services = ServiceStore.load()
        let itm = item.url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return services.contains {
            let u = $0.url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return u == itm || u.hasPrefix(itm) || itm.hasPrefix(u)
        }
    }

    /// 重新填入宫格（2 列排列，零滚动，一屏全收录）
    private func reloadGridData() {
        gridStackView.arrangedSubviews.forEach {
            gridStackView.removeArrangedSubview($0)
            $0.removeFromSuperview()
        }

        let currentItems = items
        let count = currentItems.count
        let rows = 4 // 固定 4 行，双列

        for r in 0..<rows {
            let rowStack = UIStackView()
            rowStack.axis = .horizontal
            rowStack.spacing = 8
            rowStack.distribution = .fillEqually

            let i1 = r * 2
            let i2 = r * 2 + 1

            if i1 < count {
                let card1 = createModelCard(item: currentItems[i1])
                rowStack.addArrangedSubview(card1)
            } else {
                let empty = UIView()
                rowStack.addArrangedSubview(empty)
            }

            if i2 < count {
                let card2 = createModelCard(item: currentItems[i2])
                rowStack.addArrangedSubview(card2)
            } else {
                let empty = UIView()
                rowStack.addArrangedSubview(empty)
            }

            gridStackView.addArrangedSubview(rowStack)
        }
    }

    /// 构建单个模型双列卡片：轻点直接进入，长按才有选择
    private func createModelCard(item: FreeWebItem) -> UIView {
        let isSaved = isItemSaved(item)
        let cleanName = item.name.replacingOccurrences(of: #"^\d+\.\s*"#, with: "", options: .regularExpression)

        let card = UIView()
        card.backgroundColor = UIColor(red: 0.16, green: 0.16, blue: 0.19, alpha: 0.95)
        card.layer.cornerRadius = 10
        card.layer.borderWidth = isSaved ? 1.2 : 0.6
        card.layer.borderColor = isSaved ? UIColor(red: 1.0, green: 0.62, blue: 0.04, alpha: 0.7).cgColor : UIColor(white: 1.0, alpha: 0.1).cgColor

        let nameLabel = UILabel()
        nameLabel.text = cleanName
        nameLabel.font = .systemFont(ofSize: 14.5, weight: .bold)
        nameLabel.textColor = .white
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(nameLabel)

        let subLabel = UILabel()
        let sub = item.subtitle.components(separatedBy: "·").first?.trimmingCharacters(in: .whitespaces) ?? item.subtitle
        subLabel.text = sub
        subLabel.font = .systemFont(ofSize: 11, weight: .regular)
        subLabel.textColor = UIColor(white: 0.65, alpha: 1.0)
        subLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(subLabel)

        let rightIcon = UILabel()
        if isSaved {
            rightIcon.text = "⭐"
            rightIcon.font = .systemFont(ofSize: 13)
        } else {
            rightIcon.text = "›"
            rightIcon.textColor = UIColor(white: 0.45, alpha: 1.0)
            rightIcon.font = .systemFont(ofSize: 16, weight: .semibold)
        }
        rightIcon.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(rightIcon)

        NSLayoutConstraint.activate([
            nameLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 10),
            nameLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 8),

            subLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 10),
            subLabel.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -8),
            subLabel.trailingAnchor.constraint(lessThanOrEqualTo: rightIcon.leadingAnchor, constant: -4),

            rightIcon.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -10),
            rightIcon.centerYAnchor.constraint(equalTo: card.centerYAnchor)
        ])

        // 1. 点击手势：直接进入打开链接（零多余弹窗打扰！）
        let tap = UITapGestureRecognizer(target: self, action: #selector(cardTapped(_:)))
        card.addGestureRecognizer(tap)

        // 2. 长按手势：长按才有选择（长按 0.38 秒弹出设置）
        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(cardLongPressed(_:)))
        longPress.minimumPressDuration = 0.38
        card.addGestureRecognizer(longPress)

        // 绑定数据用于手势响应
        card.tag = FreeWebStore.allDefaults.firstIndex(of: item) ?? 0

        return card
    }

    /// 点击卡片：直接进入打开链接
    @objc private func cardTapped(_ gesture: UITapGestureRecognizer) {
        guard let card = gesture.view else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        // 按钮轻微触觉回弹动画
        UIView.animate(withDuration: 0.1, animations: {
            card.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
        }) { _ in
            UIView.animate(withDuration: 0.1) {
                card.transform = .identity
            }
        }

        let idx = card.tag
        guard FreeWebStore.allDefaults.indices.contains(idx) else { return }
        let item = FreeWebStore.allDefaults[idx]

        closeTapped()
        self.onSelect(item.url)
    }

    /// 长按卡片：长按才有选择（弹出快捷操作选项）
    @objc private func cardLongPressed(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let card = gesture.view else { return }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

        let idx = card.tag
        guard FreeWebStore.allDefaults.indices.contains(idx) else { return }
        let item = FreeWebStore.allDefaults[idx]
        let isSaved = isItemSaved(item)
        let cleanName = item.name.replacingOccurrences(of: #"^\d+\.\s*"#, with: "", options: .regularExpression)

        let sheet = UIAlertController(
            title: "\(cleanName) 快捷设置",
            message: "网址：\(item.url)\n长按弹出快捷操作：",
            preferredStyle: .actionSheet)

        if !isSaved {
            sheet.addAction(UIAlertAction(title: "⭐ 添加到快捷服务列表（主页快捷打开）", style: .default) { [weak self] _ in
                guard let self = self else { return }
                self.onAddShortcut(item)
                self.reloadGridData()
            })
        } else {
            sheet.addAction(UIAlertAction(title: "🗑 从快捷服务列表中移除", style: .destructive) { [weak self] _ in
                guard let self = self else { return }
                self.onRemoveShortcut(item)
                self.reloadGridData()
            })
        }

        sheet.addAction(UIAlertAction(title: "🚀 进入该网页版", style: .default) { [weak self] _ in
            self?.closeTapped()
            self?.onSelect(item.url)
        })

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        sheet.popoverPresentationController?.sourceView = card
        sheet.popoverPresentationController?.sourceRect = card.bounds
        present(sheet, animated: true)
    }
}
