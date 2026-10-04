import UIKit
import Network

// MARK: - 服务条目与存储

struct ServiceItem: Codable, Equatable {
    var name: String
    var url: String
    /// 外网入口专用：电脑端 token 每次重启都会变，先在局域网内向仪表盘换最新地址。
    var resolverURL: String?
}

enum ServiceStore {
    static let key = "DSHios.services"
    static let seedVersionKey = "DSHios.servicesSeedVersion"
    /// 种子版本：2 = 同一个端口配一对（局域网 + 外网 OpenFRP），只收能打开网页页面的入口。
    /// 旧版本预置的一堆 API/401 端口全部移除。
    static let currentSeedVersion = 2

    /// 默认预置：实测能渲染网页页面的端口，同个端口局域网一条 + 外网一条，成对配置。
    /// DSH 对：局域网走 Pocket 3083（明文 HTTP，免密码，desk 端全权限）；
    ///         外网走 OpenFRP 穿透到 9060 认证网关（token 会变，故附 resolver 自动换新）。
    /// 仪表盘对：9009 自包含单页，外网带密码直达，无需换票。
    /// TTS 8210 外网 404（无外网入口），只配局域网一条。
    static let defaults: [ServiceItem] = [
        ServiceItem(name: "DSH 主控（局域网·全权限）", url: "http://192.168.215.218:3083/"),
        ServiceItem(name: "DSH 外网（OpenFRP 穿透）",
                    url: "http://cn-hk-bgp-4.ofalias.net:47027/dsh/?password=Liu326766%40&token=0_dlRNXTE3cfdXUzG1KMXqcHb1nB2o2tlcfHHLp7Uo4",
                    resolverURL: "http://192.168.215.218:9009/api/dsh-url"),
        ServiceItem(name: "端口仪表盘（局域网）", url: "http://192.168.215.218:9009/"),
        ServiceItem(name: "端口仪表盘（外网·OpenFRP）",
                    url: "http://cn-hk-bgp-4.ofalias.net:47027/?password=Liu326766%40"),
        ServiceItem(name: "本地 TTS（局域网）", url: "http://192.168.215.218:8210/")
    ]

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
    /// 外网入口的 token 会随电脑端 3081 重启而失效。
    /// 打开前先回局域网向 9009 仪表盘换一张最新的完整地址（/api/dsh-url），
    /// 换不到（不在局域网 / 仪表盘没开 / 3081 没起）就退回预置地址，不阻塞用户。
    static func resolve(_ item: ServiceItem, completion: @escaping (String) -> Void) {
        guard let api = item.resolverURL, !api.isEmpty, let url = URL(string: api) else {
            completion(item.url)
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 6)
        request.httpMethod = "GET"
        URLSession.shared.dataTask(with: request) { data, _, _ in
            var resolved = item.url
            if let data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ok = json["ok"] as? Bool, ok,
               let external = json["externalUrl"] as? String, !external.isEmpty {
                resolved = external
            }
            DispatchQueue.main.async { completion(resolved) }
        }.resume()
    }
}

// MARK: - 服务列表管理页

final class SettingsViewController: UIViewController {

    private let onSave: (String) -> Void
    private let onSelect: (String) -> Void
    private var services: [ServiceItem] = []
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    /// 原生在线状态探测：不依赖 web 会话，打开列表即用 TCP 探活，绿点=端口通。
    private var online: [String: Bool] = [:]

    init(onSave: @escaping (String) -> Void, onSelect: @escaping (String) -> Void) {
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
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closeTapped))

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

        let footer = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 72))
        let footerLabel = UILabel()
        footerLabel.text = "点击行直接打开该服务；右上角 + 添加新地址；左滑删除或编辑。列表保存在本机，电脑 IP 变化时只需编辑对应条目。"
        footerLabel.font = .preferredFont(forTextStyle: .footnote)
        footerLabel.textColor = .secondaryLabel
        footerLabel.numberOfLines = 0
        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(footerLabel)
        NSLayoutConstraint.activate([
            footerLabel.topAnchor.constraint(equalTo: footer.topAnchor, constant: 8),
            footerLabel.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            footerLabel.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20),
            footerLabel.bottomAnchor.constraint(lessThanOrEqualTo: footer.bottomAnchor, constant: -8),
        ])
        tableView.tableFooterView = footer
        probeAll()
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
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.cancel()
                completion(true)
            case .failed, .cancelled:
                completion(false)
            default:
                break
            }
        }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 6) {
            connection.cancel()
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
            message: "名称与局域网地址",
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
            // 编辑已有条目时保留其换票地址（外网入口专用，用户改地址不改换票逻辑）。
            let item = ServiceItem(name: name, url: url, resolverURL: existing?.item.resolverURL)
            if let existing {
                ServiceStore.update(at: existing.index, with: item)
            } else {
                ServiceStore.add(item)
            }
            self.services = ServiceStore.load()
            self.tableView.reloadData()
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
        config.text = item.name
        config.secondaryText = item.url
        config.secondaryTextProperties.color = .secondaryLabel
        config.secondaryTextProperties.font = .preferredFont(forTextStyle: .caption1)
        // 原生状态点：绿=端口可达，灰=不可达，透明=探测中
        if let up = online[item.url] {
            config.image = UIImage(systemName: "circle.fill")
            config.imageProperties.tintColor = up ? .systemGreen : .systemGray3
        } else {
            config.image = UIImage(systemName: "circle.dotted")
            config.imageProperties.tintColor = .tertiaryLabel
        }
        cell.contentConfiguration = config
        cell.accessoryType = .disclosureIndicator
        return cell
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
