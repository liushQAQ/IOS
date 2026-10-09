import Foundation

struct ModelPreset {
    let title: String
    let base: String
    let key: String
    let model: String
}

/// 公开版这三项都是空。自用版由打包机在编译前改这个文件，不进 Git。
enum BuiltInModels {
    static let options: [ModelPreset] = []
    static let defaultBase = ""
    static let defaultKey = ""
    static let defaultModel = ""
}
