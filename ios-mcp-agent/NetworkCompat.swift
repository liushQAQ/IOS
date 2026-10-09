import Foundation

/// 针对 iOS 15.0 ~ 15.8 提供安全的 URLSession async 数据传输封装，避免系统早期并发库偶发缺陷
enum NetworkCompat {
    static func data(for request: URLRequest, session: URLSession = .shared) async throws -> (Data, URLResponse) {
        if #available(iOS 15.0, *) {
            return try await withCheckedThrowingContinuation { continuation in
                let task = session.dataTask(with: request) { data, response, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let data = data, let response = response {
                        continuation.resume(returning: (data, response))
                    } else {
                        continuation.resume(throwing: URLError(.unknown))
                    }
                }
                task.resume()
            }
        } else {
            throw URLError(.unsupportedURL)
        }
    }

    static func data(from url: URL, session: URLSession = .shared) async throws -> (Data, URLResponse) {
        return try await data(for: URLRequest(url: url), session: session)
    }
}
