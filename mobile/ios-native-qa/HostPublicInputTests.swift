import Foundation

@main struct HostPublicInputTests {
    static func main() {
        let label = "輸入刪除帳號以確認", expected = "刪除帳號"
        let cases: [(String?, PublicInputState)] = [
            (nil, .missing), (expected, .matched), ("", .empty), ("請輸入「刪除帳號」", .placeholder),
            (expected + expected, .duplicated), ("刪除", .incomplete), (" 刪除帳號\n", .whitespace),
            ("删除账号", .simplifiedSubstitution), ("删除帐号", .simplifiedSubstitution),
            ("刪除帳号", .simplifiedSubstitution), ("刪除账号", .simplifiedSubstitution), ("刪除帐号", .simplifiedSubstitution),
            ("shanchuzhanghao", .asciiSubstitution), ("\u{fffd}", .replacementCharacter),
            ("刪\n除帳號", .lineBreak), ("刪\r除帳號", .lineBreak), ("刪\u{200b}除帳號", .formatCharacters),
            ("刪除\u{feff}帳號", .formatCharacters), ("帳號刪除", .publicCharactersWrongOrder), ("其他合成文字", .mismatched),
        ]
        for (observed, state) in cases {
            guard PublicInputState.classify(observed, label: label, expected: expected) == state else { fatalError("Public input enum host check failed; values withheld") }
        }
        for (otherLabel, value) in [("清單名稱", "Native QA wishlist"), ("願望名稱", "Nintendo Switch OLED"), ("最高預算", "8000"),
          ("搜尋商品名稱與說明", "Native QA Switch OLED"), ("商品聊天訊息", "Native QA 買家詢問面交"), ("私密面交地點名稱", "台北車站大廳 QA 集合點"),
          ("第1件商品名稱", "Native QA Blue Mug")] {
            guard PublicInputState.classify(value, label: otherLabel, expected: value) == .matched else { fatalError("Public input whitelist check failed") }
        }
        guard PublicInputState.classify("synthetic-private", label: "密碼", expected: "synthetic-private") == .invalidExpected,
          PublicInputState.classify("private", label: label, expected: "private") == .invalidExpected,
          PublicInputState.classify("SHANCHUZHANGHAO", label: label, expected: expected) != .matched,
          PublicInputState.classify("删除账号", label: label, expected: expected) != .matched,
          PublicInputState.classify("Native Qa wishlist", label: "清單名稱", expected: "Native QA wishlist") == .caseSubstitution else { fatalError("Public input strict boundary check failed") }
        print("{\"kind\":\"host-public-input-enum\",\"checks\":32,\"passed\":true,\"rawValuesSerialized\":false,\"deviceOperations\":0}")
    }
}
