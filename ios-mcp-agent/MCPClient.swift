import Foundation

enum MCPError: LocalizedError {
    case badResponse(String)
    case tool(String)
    case notReady

    var errorDescription: String? {
        switch self {
        case .badResponse(let s): return s
        case .tool(let s): return s
        case .notReady: return "还没连上 ios-mcp"
        }
    }
}

/// 手机本机 ios-mcp。只转发工具调用，不解释工具怎么做。
final class MCPClient {
    let base: String
    private let session: URLSession
    private var sessionID: String?
    private var rpcID = 0
    private(set) var serverInfo: [String: Any] = [:]

    init(base: String = "http://127.0.0.1:8090") {
        self.base = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    func connect() async throws {
        let result = try await rpc("initialize", params: [
            "protocolVersion": "2025-11-25",
            "capabilities": [String: Any](),
            "clientInfo": ["name": "ios-mcp-agent", "version": "1.0"]
        ])
        _ = try? await post(["jsonrpc": "2.0", "method": "notifications/initialized"])
        serverInfo = (result?["serverInfo"] as? [String: Any]) ?? [:]
    }

    func health() async throws -> String {
        guard let url = URL(string: base + "/health") else {
            throw MCPError.badResponse("服务端地址格式无效：\(base)")
        }
        let (data, _) = try await NetworkCompat.data(from: url, session: session)
        return String(data: data, encoding: .utf8) ?? ""
    }

    /// 原样转发一个 MCP 工具。返回文本；截图返回带 data 的字典描述。
    func call(_ tool: String, arguments: [String: Any] = [:]) async throws -> String {
        let result = try await rpc("tools/call", params: ["name": tool, "arguments": arguments])
        guard let result = result else { return "" }
        if (result["isError"] as? Bool) == true {
            throw MCPError.tool(text(of: result))
        }
        return text(of: result)
    }

    // MARK: - JSON-RPC

    private func rpc(_ method: String, params: [String: Any]?) async throws -> [String: Any]? {
        rpcID += 1
        var payload: [String: Any] = ["jsonrpc": "2.0", "id": rpcID, "method": method]
        if let params = params { payload["params"] = params }
        let resp = try await post(payload)
        if let err = resp?["error"] as? [String: Any] {
            let msg = (err["message"] as? String) ?? String(describing: err)
            throw MCPError.badResponse(msg)
        }
        return resp?["result"] as? [String: Any]
    }

    private func post(_ payload: [String: Any]) async throws -> [String: Any]? {
        // 🔴 用户可在设置页手填任意地址，非法字符串若强制解包会直接闪退，这里改为抛错
        guard let url = URL(string: base + "/mcp") else {
            throw MCPError.badResponse("服务端地址格式无效：\(base)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json, text/event-stream", forHTTPHeaderField: "Accept")
        if let sessionID = sessionID {
            req.setValue(sessionID, forHTTPHeaderField: "Mcp-Session-Id")
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await NetworkCompat.data(for: req, session: session)
        if let http = response as? HTTPURLResponse,
           let sid = http.value(forHTTPHeaderField: "Mcp-Session-Id"), !sid.isEmpty {
            sessionID = sid
        }
        guard !data.isEmpty else { return nil }
        let body = String(data: data, encoding: .utf8) ?? ""
        let jsonText = sseData(body) ?? body
        guard let obj = try JSONSerialization.jsonObject(with: Data(jsonText.utf8)) as? [String: Any] else {
            return nil
        }
        return obj
    }

    private func sseData(_ body: String) -> String? {
        guard body.contains("data:") else { return nil }
        for line in body.split(separator: "\n") where line.hasPrefix("data:") {
            return String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
        }
        return nil
    }

    private func text(of result: [String: Any]) -> String {
        let content = result["content"] as? [[String: Any]] ?? []
        var texts: [String] = []
        for item in content {
            if (item["type"] as? String) == "text" {
                texts.append(item["text"] as? String ?? "")
            } else if (item["type"] as? String) == "image" {
                let n = (item["data"] as? String)?.count ?? 0
                texts.append("[截图 \(n) 字节]")
            }
        }
        return texts.joined(separator: "\n")
    }
}
