import Foundation

struct UIElementItem {
    let label: String
    let x: Double
    let y: Double
}

enum ElementParser {
    /// 将 ios-mcp 返回的树状结构递归拍平，提取所有带有效文字或中心坐标的控件
    static func parse(raw: String) -> [UIElementItem] {
        guard let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) else {
            return []
        }
        var items: [UIElementItem] = []
        walk(node: json, items: &items)
        return items
    }

    private static func walk(node: Any, items: inout [UIElementItem]) {
        if let dict = node as? [String: Any] {
            let label = (dict["label"] as? String)
                ?? (dict["text"] as? String)
                ?? (dict["name"] as? String)
                ?? (dict["title"] as? String)
                ?? (dict["value"] as? String)
                ?? (dict["description"] as? String)
                ?? ""
            
            let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
            if let center = extractCenter(from: dict) {
                if !trimmed.isEmpty {
                    items.append(UIElementItem(label: trimmed, x: center.x, y: center.y))
                }
            }

            for key in ["children", "childElements", "subelements", "elements", "windows"] {
                if let children = dict[key] as? [Any] {
                    for child in children {
                        walk(node: child, items: &items)
                    }
                }
            }
        } else if let array = node as? [Any] {
            for item in array {
                walk(node: item, items: &items)
            }
        }
    }

    private static func extractCenter(from dict: [String: Any]) -> (x: Double, y: Double)? {
        if let cx = dict["centerX"] as? Double, let cy = dict["centerY"] as? Double {
            return (cx, cy)
        }
        if let x = dict["x"] as? Double, let y = dict["y"] as? Double {
            return (x, y)
        }
        if let frame = dict["frame"] as? [String: Any] ?? dict["rect"] as? [String: Any],
           let x = frame["x"] as? Double, let y = frame["y"] as? Double,
           let w = frame["width"] as? Double, let h = frame["height"] as? Double {
            return (x + w / 2.0, y + h / 2.0)
        }
        if let str = dict["frame"] as? String {
            // 解析类似 {{0, 0}, {390, 844}} 的 iOS 字符串
            let nums = str.components(separatedBy: CharacterSet(charactersIn: "{}, ")).compactMap { Double($0) }
            if nums.count >= 4 {
                return (nums[0] + nums[2] / 2.0, nums[1] + nums[3] / 2.0)
            }
        }
        return nil
    }
}
