import UIKit

final class SettingsViewController: UIViewController {

    private let onSave: (String) -> Void
    private let urlTextField = UITextField()

    init(onSave: @escaping (String) -> Void) {
        self.onSave = onSave
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "设置"
        view.backgroundColor = .systemBackground
        setupUI()
    }

    private func setupUI() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = "DeepSeek Harness 服务地址"
        titleLabel.font = .preferredFont(forTextStyle: .headline)

        urlTextField.borderStyle = .roundedRect
        urlTextField.autocapitalizationType = .none
        urlTextField.autocorrectionType = .no
        urlTextField.keyboardType = .URL
        urlTextField.placeholder = "http://<host>:<port>/dsh/"
        urlTextField.text = UserDefaults.standard.string(forKey: "DSHios.lastURL")

        let hintLabel = UILabel()
        hintLabel.numberOfLines = 0
        hintLabel.font = .preferredFont(forTextStyle: .footnote)
        hintLabel.textColor = .secondaryLabel
        hintLabel.text = """
        填入你的 DeepSeek Harness web 服务地址（局域网或公网均可）。
        地址中可包含认证参数，例如：
        http://192.168.1.100:3081/dsh/?password=xxx&token=xxx
        """

        let saveButton = UIButton(type: .system)
        saveButton.setTitle("保存并加载", for: .normal)
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)

        stack.addArrangedSubview(titleLabel)
        stack.addArrangedSubview(urlTextField)
        stack.addArrangedSubview(hintLabel)
        stack.addArrangedSubview(saveButton)

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20)
        ])
    }

    @objc private func saveTapped() {
        guard let text = urlTextField.text, !text.isEmpty else { return }
        onSave(text)
        navigationController?.popViewController(animated: true)
    }
}
