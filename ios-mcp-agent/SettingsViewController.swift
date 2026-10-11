import UIKit

/// 模型配置：支持主流国内外服务商一键预设、拉取在线模型、Picker 点选确定与自定义 Base/Key/Model
final class SettingsViewController: UIViewController {
    private let scrollView = UIScrollView()
    private let contentView = UIView()
    
    private let mcpField = UITextField()
    private let baseField = UITextField()
    private let keyField = UITextField()
    private let modelField = UITextField()
    
    private let providerPresetButton = UIButton(type: .system)
    private let fetchButton = UIButton(type: .system)
    private let loadingIndicator = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "模型配置"
        view.backgroundColor = .systemGroupedBackground

        let config = AgentConfig.load()

        configure(mcpField, "ios-mcp 服务端地址 (默认 http://127.0.0.1:8090)", config.mcpBase)
        configure(baseField, "模型接口 Base URL（如 https://api.siliconflow.cn/v1）", config.llmBase)
        configure(keyField, "API Key 密钥 (本地沙盒安全存储)", config.llmKey)
        keyField.isSecureTextEntry = true
        configure(modelField, "模型名（可手动输入或点击下方获取）", config.llmModel)

        // 🔘 预设服务商选择按钮
        providerPresetButton.setTitle("🌐 选择常用服务商预设 (国内/国外主流)...", for: .normal)
        providerPresetButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        providerPresetButton.backgroundColor = .secondarySystemGroupedBackground
        providerPresetButton.layer.cornerRadius = 8
        providerPresetButton.layer.borderWidth = 1
        providerPresetButton.layer.borderColor = UIColor.systemBlue.withAlphaComponent(0.3).cgColor
        providerPresetButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        providerPresetButton.addTarget(self, action: #selector(showProviderPicker), for: .touchUpInside)

        // 🔘 获取模型列表按钮
        fetchButton.setTitle("🔍 点击拉取该服务商在线可用模型列表", for: .normal)
        fetchButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        fetchButton.backgroundColor = .secondarySystemGroupedBackground
        fetchButton.layer.cornerRadius = 8
        fetchButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        fetchButton.addTarget(self, action: #selector(fetchModels), for: .touchUpInside)

        loadingIndicator.hidesWhenStopped = true

        let modelStack = UIStackView(arrangedSubviews: [modelField, fetchButton])
        modelStack.axis = .vertical
        modelStack.spacing = 8

        var formViews: [UIView] = [
            createSectionHeader("服务商与快捷预设"),
            providerPresetButton
        ]

        // 如果编译期注入了私有快捷预设（自用版）
        if !BuiltInModels.options.isEmpty {
            let label = UILabel()
            label.text = "私有免密快捷预设 (自用专用)："
            label.font = .systemFont(ofSize: 13, weight: .medium)
            label.textColor = .secondaryLabel
            formViews.append(label)

            let presets = UISegmentedControl(items: BuiltInModels.options.map(\.title))
            presets.addTarget(self, action: #selector(applyPrivatePreset(_:)), for: .valueChanged)
            formViews.append(presets)
        }

        formViews.append(contentsOf: [
            createSectionHeader("MCP 本地服务端"),
            mcpField,
            createSectionHeader("LLM 接口凭证 (OpenAI 协议兼容)"),
            baseField,
            keyField,
            modelStack
        ])

        let saveButton = UIButton(type: .system)
        saveButton.setTitle("保存配置", for: .normal)
        saveButton.titleLabel?.font = .boldSystemFont(ofSize: 18)
        saveButton.backgroundColor = .systemBlue
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.layer.cornerRadius = 10
        saveButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
        saveButton.addTarget(self, action: #selector(saveConfig), for: .touchUpInside)
        formViews.append(saveButton)

        let stack = UIStackView(arrangedSubviews: formViews)
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        contentView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(scrollView)
        scrollView.addSubview(contentView)
        contentView.addSubview(stack)
        view.addSubview(loadingIndicator)
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -32),

            loadingIndicator.centerXAnchor.constraint(equalTo: fetchButton.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: fetchButton.centerYAnchor)
        ])
    }

    private func createSectionHeader(_ title: String) -> UILabel {
        let label = UILabel()
        label.text = title
        label.font = .systemFont(ofSize: 13, weight: .bold)
        label.textColor = .secondaryLabel
        return label
    }

    private func configure(_ field: UITextField, _ placeholder: String, _ text: String) {
        field.placeholder = placeholder
        field.text = text
        field.borderStyle = .roundedRect
        field.backgroundColor = .secondarySystemGroupedBackground
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.clearButtonMode = .whileEditing
        field.heightAnchor.constraint(equalToConstant: 44).isActive = true
    }

    @objc private func applyPrivatePreset(_ control: UISegmentedControl) {
        let preset = BuiltInModels.options[control.selectedSegmentIndex]
        baseField.text = preset.base
        keyField.text = preset.key
        modelField.text = preset.model
    }

    /// 弹出国内主流与国外主流模型服务商预设库
    @objc private func showProviderPicker() {
        let sheet = UIAlertController(
            title: "主流模型服务商预设",
            message: "点击一键回填 Base URL 与推荐模型，然后输入您的 API Key 即可使用（公开版不含任何私有密钥）",
            preferredStyle: .actionSheet
        )

        for provider in GlobalModelPresets.providers {
            let title = "[\(provider.category)] \(provider.name)"
            sheet.addAction(UIAlertAction(title: title, style: .default) { [weak self] _ in
                guard let self = self else { return }
                self.baseField.text = provider.baseURL
                self.modelField.text = provider.recommendedModels.first ?? ""
                if self.keyField.text?.isEmpty ?? true {
                    self.keyField.placeholder = provider.placeholderKey
                }
                
                // 提示该服务商推荐模型
                let subAlert = UIAlertController(
                    title: provider.name,
                    message: "已填入 Base URL：\(provider.baseURL)\n\n推荐模型列表：\n" + provider.recommendedModels.joined(separator: "\n") + "\n\n\(provider.hint)",
                    preferredStyle: .alert
                )
                for m in provider.recommendedModels {
                    subAlert.addAction(UIAlertAction(title: "选用: \(m)", style: .default) { _ in
                        self.modelField.text = m
                    })
                }
                subAlert.addAction(UIAlertAction(title: "确定", style: .cancel))
                self.present(subAlert, animated: true)
            })
        }

        sheet.addAction(UIAlertAction(title: "取消", style: .cancel))
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = providerPresetButton
            popover.sourceRect = providerPresetButton.bounds
        }
        present(sheet, animated: true)
    }

    /// 核心功能：点击网络请求 Base URL + Key 获取在线可用模型并弹出选择菜单
    @objc private func fetchModels() {
        view.endEditing(true)
        guard let base = baseField.text?.trimmingCharacters(in: .whitespacesAndNewlines), !base.isEmpty else {
            showAlert("请先填写模型接口 Base URL")
            return
        }
        let key = keyField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        var cleanBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if cleanBase.hasSuffix("/chat/completions") {
            cleanBase = String(cleanBase.dropLast("/chat/completions".count))
        }

        let modelsUrlStr = cleanBase.hasSuffix("/models") ? cleanBase : cleanBase + "/models"
        guard let url = URL(string: modelsUrlStr) else {
            showAlert("Base URL 地址格式无效")
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 15
        if !key.isEmpty {
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }

        fetchButton.isEnabled = false
        fetchButton.setTitle("正在拉取模型中...", for: .normal)
        loadingIndicator.startAnimating()

        Task {
            do {
                let (data, response) = try await NetworkCompat.data(for: req, session: .shared)
                await MainActor.run {
                    self.fetchButton.isEnabled = true
                    self.fetchButton.setTitle("🔍 点击拉取该服务商在线可用模型列表", for: .normal)
                    self.loadingIndicator.stopAnimating()
                }

                if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                    let errStr = String(data: data, encoding: .utf8) ?? "状态码 \(http.statusCode)"
                    await MainActor.run { self.showAlert("拉取失败: \(errStr.prefix(120))") }
                    return
                }

                guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let list = obj["data"] as? [[String: Any]] else {
                    await MainActor.run { self.showAlert("未从响应中解析出有效的模型列表(data)") }
                    return
                }

                let modelIDs = list.compactMap { $0["id"] as? String }.sorted()
                if modelIDs.isEmpty {
                    await MainActor.run { self.showAlert("接口返回成功，但模型列表为空") }
                    return
                }

                await MainActor.run {
                    self.showModelPickerActionSheet(models: modelIDs)
                }
            } catch {
                await MainActor.run {
                    self.fetchButton.isEnabled = true
                    self.fetchButton.setTitle("🔍 点击拉取该服务商在线可用模型列表", for: .normal)
                    self.loadingIndicator.stopAnimating()
                    self.showAlert("网络连接错误: \(error.localizedDescription)")
                }
            }
        }
    }

    /// 弹出选择框让用户挑选模型，选中后直接确定回填
    private func showModelPickerActionSheet(models: [String]) {
        let alert = UIAlertController(title: "请选择模型 (共 \(models.count) 个)", message: "点击选中即可自动填入配置", preferredStyle: .actionSheet)

        let displayList = Array(models.prefix(25))
        for m in displayList {
            alert.addAction(UIAlertAction(title: m, style: .default, handler: { [weak self] _ in
                self?.modelField.text = m
            }))
        }

        if models.count > 25 {
            alert.addAction(UIAlertAction(title: "⚠️ 模型较多，可在上框直接手动输入", style: .destructive, handler: nil))
        }

        alert.addAction(UIAlertAction(title: "取消", style: .cancel, handler: nil))

        if let popover = alert.popoverPresentationController {
            popover.sourceView = fetchButton
            popover.sourceRect = fetchButton.bounds
        }
        present(alert, animated: true)
    }

    private func showAlert(_ msg: String) {
        let alert = UIAlertController(title: "提示", message: msg, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default))
        present(alert, animated: true)
    }

    @objc private func saveConfig() {
        var config = AgentConfig.load()
        config.mcpBase = mcpField.text?.trimmingCharacters(in: .whitespaces) ?? config.mcpBase
        config.llmBase = baseField.text?.trimmingCharacters(in: .whitespaces) ?? config.llmBase
        config.llmKey = keyField.text?.trimmingCharacters(in: .whitespaces) ?? ""
        config.llmModel = modelField.text?.trimmingCharacters(in: .whitespaces) ?? config.llmModel
        config.save()
        navigationController?.popViewController(animated: true)
    }
}
