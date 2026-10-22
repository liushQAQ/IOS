import UIKit

final class AppUpdateManager {
    static let shared = AppUpdateManager()

    private struct AppReleaseInfo: Decodable {
        let version: String
        let build: Int?
        let title: String?
        let changelog: String?
        let tipa_url: String?
        let public_tipa_url: String?
        let release_url: String?
    }

    /// 国内免代理极速实时镜像列表（排除 jsDelivr 等强缓存 CDN，确保获取到最新构建）
    private static let updateMetadataMirrorURLs: [String] = [
        "https://ghfast.top/https://raw.githubusercontent.com/liushQAQ/IOS/main/releases/latest.json",
        "https://gh-proxy.com/https://raw.githubusercontent.com/liushQAQ/IOS/main/releases/latest.json",
        "https://raw.gitmirror.com/liushQAQ/IOS/main/releases/latest.json",
        "https://raw.githubusercontent.com/liushQAQ/IOS/main/releases/latest.json"
    ]

    static func mirrorCandidates(for rawURL: String) -> [String] {
        guard !rawURL.isEmpty else { return [] }
        if rawURL.contains("ghfast.top") || rawURL.contains("gh-proxy.com") {
            return [rawURL]
        }
        return [
            "https://ghfast.top/\(rawURL)",
            "https://gh-proxy.com/\(rawURL)",
            rawURL
        ]
    }

    private static var topViewController: UIViewController? {
        guard let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })
                ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let window = windowScene.windows.first(where: { $0.isKeyWindow }) ?? windowScene.windows.first,
              let root = window.rootViewController else {
            return nil
        }
        // 逐层解析到最顶层可呈现控制器（含导航栈与分屏多窗口场景）
        return UIViewController.dsh_topMost(from: root) ?? root
    }

    func checkForUpdates(manual: Bool = false) {
        guard let topVC = Self.topViewController else { return }
        let currentVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.9"
        let currentBuildStr = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        let currentBuild = Int(currentBuildStr) ?? 0

        var loadingAlert: UIAlertController?
        if manual {
            let alert = UIAlertController(title: "正在检查更新", message: "正在通过国内免代理节点检查最新构建…", preferredStyle: .alert)
            topVC.presentAlertSafely(alert)
            loadingAlert = alert
        }

        let mirrorURLs = Self.updateMetadataMirrorURLs
        let lock = NSLock()
        var bestInfo: AppReleaseInfo?
        var completedCount = 0
        var hasDispatched = false
        var lastError: Error?
        let total = mirrorURLs.count
        let ts = Int(Date().timeIntervalSince1970)

        func finishWithResult(info: AppReleaseInfo?) {
            lock.lock()
            if hasDispatched {
                lock.unlock()
                return
            }
            hasDispatched = true
            lock.unlock()

            DispatchQueue.main.async {
                let done = {
                    if let valid = info {
                        self.handleFetchedReleaseInfo(valid, currentVer: currentVer, currentBuild: currentBuild, manual: manual)
                    } else if manual {
                        let msg = lastError?.localizedDescription ?? "所有加速节点均未响应，请检查网络连接。"
                        let alert = UIAlertController(title: "检查更新失败", message: "无法连接更新源：\(msg)", preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "好", style: .default))
                        Self.topViewController?.presentAlertSafely(alert)
                    }
                }
                if let loading = loadingAlert {
                    loading.dismiss(animated: true, completion: done)
                } else {
                    done()
                }
            }
        }

        for urlStr in mirrorURLs {
            let sep = urlStr.contains("?") ? "&" : "?"
            guard let url = URL(string: "\(urlStr)\(sep)_t=\(ts)") else {
                lock.lock()
                completedCount += 1
                if completedCount >= total && !hasDispatched {
                    lock.unlock()
                    finishWithResult(info: bestInfo)
                } else {
                    lock.unlock()
                }
                continue
            }

            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 6)
            req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

            URLSession.shared.dataTask(with: req) { data, resp, error in
                var validInfo: AppReleaseInfo?
                if error == nil,
                   let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode),
                   let data = data,
                   let decoded = try? JSONDecoder().decode(AppReleaseInfo.self, from: data) {
                    validInfo = decoded
                }

                lock.lock()
                completedCount += 1
                if let err = error { lastError = err }

                if let info = validInfo {
                    let incomingBuild = info.build ?? 0
                    let currentBestBuild = bestInfo?.build ?? -1
                    if incomingBuild > currentBestBuild {
                        bestInfo = info
                    }

                    if incomingBuild > currentBuild {
                        lock.unlock()
                        finishWithResult(info: info)
                        return
                    }
                }

                if completedCount >= total {
                    lock.unlock()
                    finishWithResult(info: bestInfo)
                } else {
                    lock.unlock()
                }
            }.resume()
        }
    }

    private func handleFetchedReleaseInfo(_ info: AppReleaseInfo, currentVer: String, currentBuild: Int, manual: Bool) {
        guard let topVC = Self.topViewController else { return }
        let remoteVer = info.version
        let remoteBuild = info.build ?? 0

        let hasNewVersion: Bool = {
            if remoteBuild > currentBuild { return true }
            if remoteBuild == currentBuild && remoteVer.compare(currentVer, options: .numeric) == .orderedDescending {
                return true
            }
            return remoteVer.compare(currentVer, options: .numeric) == .orderedDescending
        }()

        let tipaURL = info.tipa_url ?? info.public_tipa_url ?? ""

        if hasNewVersion {
            presentNewVersionPrompt(info: info, currentVer: currentVer, currentBuild: currentBuild, tipaURL: tipaURL)
        } else if manual {
            let alert = UIAlertController(
                title: "✅ 当前已是最新版本",
                message: "当前版本：v\(currentVer) (Build \(currentBuild))\n仓库最新：v\(remoteVer) (Build \(remoteBuild))\n\n如有强制重装需求，也可通过国内加速通道重装最新包。",
                preferredStyle: .alert)
            if !tipaURL.isEmpty {
                alert.addAction(UIAlertAction(title: "🚀 重新下载并用巨魔安装 (免代理加速)", style: .default) { [weak self] _ in
                    self?.downloadAndInstallTIPA(remoteURLString: tipaURL, filename: "ios-mcp-agent-public-\(remoteVer)-\(remoteBuild).tipa")
                })
            }
            alert.addAction(UIAlertAction(title: "好", style: .cancel))
            topVC.presentAlertSafely(alert)
        }
    }

    private func presentNewVersionPrompt(info: AppReleaseInfo, currentVer: String, currentBuild: Int, tipaURL: String) {
        guard let topVC = Self.topViewController else { return }
        let remoteVer = info.version
        let remoteBuild = info.build ?? 0
        let notes = info.changelog ?? info.title ?? "包含最新的功能优化与稳定性升级。"

        let alert = UIAlertController(
            title: "🎉 发现新版本 v\(remoteVer) (Build \(remoteBuild))",
            message: "当前版本：v\(currentVer) (Build \(currentBuild))\n\n【更新说明】\n\(notes)\n\n推荐点击下方按钮，App 将通过免代理通道极速下载并自动调起巨魔安装（彻底避免 301 报错）。",
            preferredStyle: .alert
        )

        if !tipaURL.isEmpty {
            alert.addAction(UIAlertAction(title: "🚀 极速下载并用巨魔安装 (推荐·零报错)", style: .default) { [weak self] _ in
                self?.downloadAndInstallTIPA(remoteURLString: tipaURL, filename: "ios-mcp-agent-public-\(remoteVer)-\(remoteBuild).tipa")
            })
            alert.addAction(UIAlertAction(title: "⚡ 巨魔一键直连安装", style: .default) { [weak self] _ in
                self?.installViaTrollStore(remoteURLString: tipaURL, filename: "ios-mcp-agent-public-\(remoteVer)-\(remoteBuild).tipa")
            })
        }

        if let rel = info.release_url, let relURL = URL(string: rel) {
            alert.addAction(UIAlertAction(title: "🌐 打开仓库页面", style: .default) { _ in
                UIApplication.shared.open(relURL)
            })
        }

        alert.addAction(UIAlertAction(title: "稍后提醒", style: .cancel))
        topVC.presentAlertSafely(alert)
    }

    func installViaTrollStore(remoteURLString: String, filename: String) {
        let candidates = Self.mirrorCandidates(for: remoteURLString)
        let acceleratedURL = candidates.first(where: { $0.contains("ghfast.top") || $0.contains("gh-proxy.com") }) ?? candidates.first ?? remoteURLString

        guard let reqURL = URL(string: acceleratedURL) else {
            downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: filename)
            return
        }

        var req = URLRequest(url: reqURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 4)
        req.httpMethod = "HEAD"

        URLSession.shared.dataTask(with: req) { [weak self] _, resp, error in
            let finalTarget: String = {
                if let http = resp as? HTTPURLResponse, let finalURL = http.url?.absoluteString, !finalURL.isEmpty {
                    return finalURL
                }
                return acceleratedURL
            }()

            DispatchQueue.main.async {
                guard let encoded = finalTarget.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
                    self?.downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: filename)
                    return
                }

                let schemes = [
                    "apple-magnifier://install?url=\(encoded)",
                    "trollstore://install?url=\(encoded)"
                ]

                var didOpen = false
                let group = DispatchGroup()
                for s in schemes {
                    if let u = URL(string: s) {
                        group.enter()
                        UIApplication.shared.open(u, options: [:]) { success in
                            if success { didOpen = true }
                            group.leave()
                        }
                    }
                }

                group.notify(queue: .main) {
                    if !didOpen {
                        self?.downloadAndInstallTIPA(remoteURLString: remoteURLString, filename: filename)
                    }
                }
            }
        }.resume()
    }

    private func downloadAndInstallTIPA(remoteURLString: String, filename: String) {
        let candidates = Self.mirrorCandidates(for: remoteURLString)
        guard !candidates.isEmpty else { return }
        guard let topVC = Self.topViewController else { return }

        let progressAlert = UIAlertController(title: "正在加速下载最新包", message: "正在通过国内镜像下载 \(filename)…\n进度：0%", preferredStyle: .alert)
        topVC.presentAlertSafely(progressAlert)

        let destURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: destURL)

        func tryDownload(index: Int) {
            guard index < candidates.count, let url = URL(string: candidates[index]) else {
                DispatchQueue.main.async {
                    progressAlert.dismiss(animated: true) {
                        let alert = UIAlertController(title: "下载失败", message: "所有国内加速镜像节点均无法下载，请稍后重试。", preferredStyle: .alert)
                        alert.addAction(UIAlertAction(title: "好", style: .default))
                        Self.topViewController?.presentAlertSafely(alert)
                    }
                }
                return
            }

            var observation: NSKeyValueObservation?
            let task = URLSession.shared.downloadTask(with: url) { [weak self] localURL, resp, error in
                observation?.invalidate()
                let statusOK = (resp as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } ?? false
                if error != nil || !statusOK || localURL == nil {
                    tryDownload(index: index + 1)
                    return
                }
                guard let localURL = localURL else { return }
                do {
                    try? FileManager.default.removeItem(at: destURL)
                    try FileManager.default.moveItem(at: localURL, to: destURL)
                    DispatchQueue.main.async {
                        progressAlert.dismiss(animated: true) {
                            self?.openDownloadedTIPA(fileURL: destURL)
                        }
                    }
                } catch {
                    tryDownload(index: index + 1)
                }
            }

            observation = task.progress.observe(\.fractionCompleted) { progress, _ in
                DispatchQueue.main.async {
                    let pct = Int(progress.fractionCompleted * 100)
                    progressAlert.message = "正在通过国内镜像 (节点 \(index + 1)) 下载 \(filename)…\n进度：\(pct)%"
                }
            }
            task.resume()
        }

        tryDownload(index: 0)
    }

    private func openDownloadedTIPA(fileURL: URL) {
        if let encoded = fileURL.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let tsURL = URL(string: "apple-magnifier://install?url=\(encoded)") {
            UIApplication.shared.open(tsURL, options: [:]) { [weak self] success in
                if !success {
                    self?.presentShareForFile(fileURL)
                }
            }
        } else {
            presentShareForFile(fileURL)
        }
    }

    private func presentShareForFile(_ fileURL: URL) {
        guard let topVC = Self.topViewController else { return }
        let act = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        // 🔴 iPad 关键修复：UIActivityViewController 在 iPad 上必须是 popover，
        // 锚点（sourceView + sourceRect）由 presentAlertSafely 统一补齐。
        topVC.presentAlertSafely(act)
    }
}
