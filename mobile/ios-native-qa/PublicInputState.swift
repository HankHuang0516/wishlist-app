import Foundation

/// Only a fixed enum leaves this classifier. Values must come from a unique,
/// non-secure public QA field; never pass credentials or element descriptions.
enum PublicInputState: String {
    case invalidExpected = "invalid-expected"
    case missing, matched, empty, placeholder, duplicated, incomplete, whitespace
    case simplifiedSubstitution = "simplified-substitution"
    case asciiSubstitution = "ascii-substitution"
    case lineBreak = "line-break"
    case replacementCharacter = "replacement-character"
    case formatCharacters = "format-characters"
    case publicCharactersWrongOrder = "public-characters-wrong-order"
    case caseSubstitution = "case-substitution"
    case mismatched

    static func classify(_ observed: String?, label: String, expected: String) -> PublicInputState {
        let publicValues = ["清單名稱": "Native QA wishlist", "願望名稱": "Nintendo Switch OLED", "最高預算": "8000", "輸入刪除帳號以確認": "刪除帳號",
          "搜尋商品名稱與說明": "Native QA Switch OLED", "商品聊天訊息": "Native QA 買家詢問面交", "私密面交地點名稱": "台北車站大廳 QA 集合點",
          "第1件商品名稱": "Native QA Blue Mug", "縣市": "台北市", "行政區": "中正區",
          "位置緯度": "25.033", "位置經度": "121.565", "第1件售價 TWD": "450"]
        guard publicValues[label] == expected else { return .invalidExpected }
        guard let observed = observed else { return .missing }
        if observed == expected { return .matched }
        if observed.isEmpty { return .empty }
        if ["清單名稱", "願望名稱", "最高預算", "請輸入「刪除帳號」", "想找什麼好物？", "輸入訊息，預約前請確認商品狀態", "公共場所名稱、出口或集合點", "第1件商品名稱"].contains(observed) { return .placeholder }
        if observed == expected + expected { return .duplicated }
        if expected.hasPrefix(observed) { return .incomplete }
        if observed.trimmingCharacters(in: .whitespacesAndNewlines) == expected { return .whitespace }
        if observed.caseInsensitiveCompare(expected) == .orderedSame { return .caseSubstitution }
        // Classify only known public substitutions, not arbitrary text content.
        if label == "輸入刪除帳號以確認" {
            if ["删除账号", "删除帐号", "刪除帳号", "刪除账号", "刪除帐号"].contains(observed) { return .simplifiedSubstitution }
            if observed.unicodeScalars.allSatisfy({ $0.value <= 0x7f }) { return .asciiSubstitution }
            if observed.contains("\u{fffd}") { return .replacementCharacter }
            if observed.contains("\n") || observed.contains("\r") { return .lineBreak }
            let withoutFormat = String(observed.unicodeScalars.filter { ![0x200b, 0x200c, 0x200d, 0xfeff].contains($0.value) })
            if withoutFormat == expected { return .formatCharacters }
            if observed.count == expected.count && observed.sorted() == expected.sorted() { return .publicCharactersWrongOrder }
        }
        return .mismatched
    }
}
