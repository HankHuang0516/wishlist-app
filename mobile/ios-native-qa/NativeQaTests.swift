import XCTest

/// Real UIKit accessibility queries. Anonymous navigation plus an optional
/// genuine auth baseline; credentials go only to QA App text fields through the
/// private broker, never XCTest environment/typeText/attachments.
final class NativeQaTests: XCTestCase {
    private enum Failure: Error { case invalidIdentity, missingControl, unstableControl }
    private var stage = "identity-guard"
    private var app: XCUIApplication!

    private func prepare() throws {
        let bundle = ProcessInfo.processInfo.environment["NATIVE_QA_PACKAGE"] ?? ""
        guard bundle.range(of: "^com\\.hankhuang\\.weesh\\.qa[0-9]{12}$", options: .regularExpression) != nil else { throw Failure.invalidIdentity }
        app = XCUIApplication(bundleIdentifier: bundle)
    }
    private func checkpoint(_ value: String) {
        stage = value
        // Safe enum names only, never values/element debug descriptions.
        print("NATIVE_QA_STAGE=" + value)
    }
    private func element(_ label: String, kind: XCUIElement.ElementType = .any) -> XCUIElement {
        app.descendants(matching: kind).matching(identifier: label).firstMatch
    }
    @discardableResult private func required(_ label: String, scroll: Bool = false, kind: XCUIElement.ElementType = .any) throws -> XCUIElement {
        let deadline = Date().addingTimeInterval(12)
        repeat {
            let control = element(label, kind: kind)
            if control.exists && (!scroll || control.isHittable) { return control }
            if scroll {
                // Do not swipe a background/covered scroll view belonging to
                // a screen underneath a native Modal or keyboard.
                let scroller = app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })
                scroller?.swipeUp()
                let observed = element(label, kind: kind)
                if observed.exists && observed.isHittable { return observed }
            }
            Thread.sleep(forTimeInterval: 0.12)
        } while Date() < deadline
        throw Failure.missingControl
    }
    private func publicInputControl(_ label: String) throws -> XCUIElement {
        let deadline = Date().addingTimeInterval(12)
        repeat {
            for kind in [XCUIElement.ElementType.textField, .textView] {
                let control = element(label, kind: kind)
                // React Native multiline TextInput can remain reported as
                // disabled by XCUIAutomation even while UIKit accepts input.
                // Limit that compatibility path to the synthetic chat field.
                if control.exists && control.isHittable && (control.isEnabled || label == "商品聊天訊息") { return control }
            }
            let scroller = app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })
            scroller?.swipeUp()
            Thread.sleep(forTimeInterval: 0.12)
        } while Date() < deadline
        throw Failure.missingControl
    }
    private func tap(_ label: String, kind: XCUIElement.ElementType = .button) throws {
        let deadline = Date().addingTimeInterval(12)
        var prior = CGRect.null
        var stable = 0
        repeat {
            // Headings and buttons can share public labels (e.g. "登入").
            // Restrict actionable controls by UIKit accessibility type rather
            // than accepting the first static text with the same name.
            let control = try required(label, scroll: true, kind: kind)
            let frame = control.frame
            if control.isEnabled && control.isHittable && !frame.isEmpty {
                stable = frame == prior ? stable + 1 : 1
                prior = frame
                if stable >= 3 { control.tap(); return }
            } else { stable = 0; prior = .null }
            Thread.sleep(forTimeInterval: 0.12)
        } while Date() < deadline
        throw Failure.unstableControl
    }
    private func reportFailure() {
        XCTFail("Isolated iOS QA failed at " + stage + "; raw diagnostics withheld")
        if app != nil && app.state != .notRunning { app.terminate() }
    }
    private func tabIdentifier(_ label: String) throws -> String {
        let identifiers = ["首頁": "wishlist-tab-home", "願望": "wishlist-tab-wishes", "探索": "wishlist-tab-explore", "社交": "wishlist-tab-social", "我的": "wishlist-tab-account"]
        guard let identifier = identifiers[label] else { throw Failure.invalidIdentity }
        return identifier
    }
    private func tapTab(_ label: String) throws {
        let identifier = try tabIdentifier(label)
        try required(identifier)
        guard app.descendants(matching: .any).matching(identifier: identifier).count == 1 else { throw Failure.invalidIdentity }
        // RN tab semantics are not UIButton semantics. The unique public ID
        // addresses only the actionable tab, never a same-named text heading.
        try tap(identifier, kind: .any)
    }
    private func safeScreenshot(_ name: String) throws {
        guard app.state == .runningForeground, ["qa-product-notice", "qa-home", "qa-marketplace", "qa-chat-transition", "qa-chat", "qa-meetup", "qa-wish", "qa-listing-batch", "qa-photo-picker", "qa-photo-selected", "qa-listing-photo", "qa-listing-resumed", "qa-two-selected", "qa-two-listing", "qa-ai-photo", "qa-ai-resumed", "qa-two-ai-photo", "qa-two-ai-resumed", "qa-two-ai-published", "qa-external-map", "qa-external-list", "qa-external-detail", "qa-external-wish-map", "qa-external-wish-list", "qa-deleted"].contains(name) else { throw Failure.invalidIdentity }
        for label in ["手機號碼或 Email", "密碼", "新密碼", "再次輸入新密碼", "刪除帳號的目前密碼", "Email 驗證連結或驗證碼", "密碼重設連結或驗證碼"] {
            let privateControl = element(label)
            guard !privateControl.exists || !privateControl.isHittable else { throw Failure.invalidIdentity }
        }
        // Debug LogBox uses a short-lived collapsed toast which is absent from
        // Release builds. Let it expire before visual acceptance while still
        // failing if an accessible warning surface remains.
        Thread.sleep(forTimeInterval: 3)
        let warningBanner = element("Open debugger to view warnings.")
        if warningBanner.exists {
            guard warningBanner.isHittable else { throw Failure.unstableControl }
            warningBanner.tap()
            Thread.sleep(forTimeInterval: 0.5)
            let diagnostic = XCTAttachment(screenshot: app.screenshot())
            diagnostic.name = "qa-warning-diagnostic"; diagnostic.lifetime = .keepAlways; add(diagnostic)
            checkpoint("unexpected-logbox-warning")
            throw Failure.invalidIdentity
        }
        if ["qa-marketplace", "qa-chat-transition", "qa-chat", "qa-meetup", "qa-external-map", "qa-external-list", "qa-external-detail", "qa-external-wish-map", "qa-external-wish-list"].contains(name) { try dismissCollapsedDebugWarningToastIfPresent() }
        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func syntheticBatchPhotoOffsets(requireOrange: Bool = true) throws -> (CGVector?, CGVector) {
        guard abs(app.frame.width - 402) < 1, abs(app.frame.height - 874) < 1,
              let image = app.screenshot().image.cgImage, image.width == 1206, image.height == 2622 else { throw Failure.invalidIdentity }
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        return try pixels.withUnsafeMutableBytes { raw in
            guard let base = raw.baseAddress,
                  let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue) else { throw Failure.invalidIdentity }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            let bytes = raw.bindMemory(to: UInt8.self)
            for upsideDown in [false, true] {
                var orange: CGVector?, blue: CGVector?
                for row in 0..<3 {
                    for column in 0..<3 {
                        var orangePixels = 0, bluePixels = 0
                        for y in stride(from: Int((326 + row * 134 + 10) * 3), to: Int((326 + row * 134 + 120) * 3), by: 15) {
                            for x in stride(from: (column * 134 + 10) * 3, to: (column * 134 + 120) * 3, by: 15) {
                                let offset = ((upsideDown ? height - 1 - y : y) * width + x) * 4
                                let red = Int(bytes[offset]), green = Int(bytes[offset + 1]), cobalt = Int(bytes[offset + 2])
                                if red > 120 && red * 10 > green * 14 && green * 10 > cobalt * 12 { orangePixels += 1 }
                                if cobalt > 80 && cobalt * 10 > red * 12 && cobalt * 10 > green * 12 { bluePixels += 1 }
                            }
                        }
                        let tile = CGVector(dx: Double(column * 134 + 67) / 402, dy: Double(326 + row * 134 + 67) / 874)
                        if orange == nil && orangePixels >= 30 && bluePixels < 30 { orange = tile }
                        if blue == nil && bluePixels >= 80 && orangePixels < 30 { blue = tile }
                    }
                }
                if let blue, !requireOrange || orange != nil { return (orange, blue) }
            }
            throw Failure.missingControl
        }
    }
    private func hasCollapsedDebugWarningToast(_ screenshot: XCUIScreenshot) -> Bool {
        guard let image = screenshot.image.cgImage, let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data), image.bitsPerComponent == 8,
          image.bitsPerPixel >= 24, image.width > 100, image.height > 100 else { return false }
        let x = min(image.width - 1, Int(Double(image.width) * 0.75))
        let y = min(image.height - 1, Int(Double(image.height) * 0.91))
        let offset = y * image.bytesPerRow + x * (image.bitsPerPixel / 8)
        return max(bytes[offset], bytes[offset + 1], bytes[offset + 2]) < 100
    }
    private func dismissCollapsedDebugWarningToastIfPresent() throws {
        let before = app.screenshot()
        guard hasCollapsedDebugWarningToast(before) else { return }
        checkpoint("debug-warning-toast-dismissed")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.91)).tap()
        Thread.sleep(forTimeInterval: 0.5)
        guard !hasCollapsedDebugWarningToast(app.screenshot()) else { throw Failure.unstableControl }
    }
    private func publicText(_ label: String, value: String, kind: XCUIElement.ElementType = .textField, replace: Bool = false) throws {
        let prefixes = ["清單名稱": "public-list", "願望名稱": "public-wish", "最高預算": "public-budget", "輸入刪除帳號以確認": "deletion-confirmation",
          "搜尋商品名稱與說明": "public-market-search", "商品聊天訊息": "public-chat-message", "私密面交地點名稱": "public-meetup-place",
          "第1件商品名稱": "public-listing-title", "縣市": "public-listing-county", "行政區": "public-listing-district",
          "位置緯度": "public-listing-latitude", "位置經度": "public-listing-longitude", "第1件售價 TWD": "public-listing-price"]
        guard let prefix = prefixes[label] else { throw Failure.invalidIdentity }
        guard [.textField, .textView, .any].contains(kind) else { throw Failure.invalidIdentity }
        let initial = kind == .any ? try publicInputControl(label) : try required(label, scroll: true, kind: kind)
        let resolvedKind = initial.elementType
        guard [.textField, .textView].contains(initial.elementType),
          PublicInputState.classify(nil, label: label, expected: value) != .invalidExpected else { throw Failure.invalidIdentity }
        try tap(label, kind: resolvedKind)
        // The keyboard can change bounds AFTER a stable tap. Observe a bounded
        // settling period and use the newly queried control, not the pre-tap
        // AX reference. This is read-only: no second tap, text replay or swipe.
        // Ambiguity still fails immediately; hidden/moving controls never pass.
        checkpoint(prefix + "-control-settling")
        let settledDeadline = Date().addingTimeInterval(4)
        var settled: XCUIElement?
        var priorFrame = CGRect.null
        var stableSamples = 0
        var observedVisible = false
        repeat {
            let visible = app.descendants(matching: resolvedKind).matching(identifier: label).allElementsBoundByIndex.filter { $0.exists && $0.isHittable }
            if visible.count > 1 {
                checkpoint(prefix + "-control-multiple")
                throw Failure.invalidIdentity
            }
            if let current = visible.first, (current.isEnabled || label == "商品聊天訊息"), !current.frame.isEmpty {
                observedVisible = true
                let frame = current.frame
                stableSamples = frame == priorFrame ? stableSamples + 1 : 1
                priorFrame = frame
                if stableSamples >= 3 { settled = current; break }
            } else { stableSamples = 0; priorFrame = .null }
            Thread.sleep(forTimeInterval: 0.12)
        } while Date() < settledDeadline
        guard var control = settled else {
            checkpoint(prefix + (observedVisible ? "-control-unstable" : "-control-missing"))
            throw Failure.unstableControl
        }
        checkpoint(prefix + "-control-settled")
        // Only public synthetic product data/confirmation, never credentials.
        let deletionConfirmation = label == "輸入刪除帳號以確認"
        let searchSubmission = label == "搜尋商品名稱與說明"
        if deletionConfirmation { checkpoint("deletion-confirmation-typing") }
        if replace {
            guard label == "第1件售價 TWD", let old = control.value as? String, old.count <= 8,
                  old.range(of: "^[0-9]*$", options: .regularExpression) != nil else { throw Failure.invalidIdentity }
            if !old.isEmpty { control.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) }
        }
        control.typeText(value)
        func publicValueState() -> String {
            return PublicInputState.classify(control.value as? String, label: label, expected: value).rawValue
        }
        func awaitedPublicValueState() -> String {
            let deadline = Date().addingTimeInterval(2)
            var state = publicValueState()
            while state != "matched" && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.1)
                state = publicValueState()
            }
            return state
        }
        let valueCheckpoint = deletionConfirmation ? "deletion-confirmation-value-" : "public-input-value-"
        var valueState = awaitedPublicValueState()
        checkpoint(valueCheckpoint + valueState)
        if valueState != "matched" {
            // iOS synthetic typing can very occasionally substitute or omit a
            // public QA character. Reacquire the same unique, non-secure field,
            // clear only its bounded public value and retry exactly once.
            checkpoint(prefix + "-bounded-retry")
            control = try required(label, scroll: true, kind: resolvedKind)
            guard control.elementType != .secureTextField, let observed = control.value as? String, observed.count <= 80 else { throw Failure.invalidIdentity }
            try tap(label, kind: resolvedKind)
            if PublicInputState.classify(observed, label: label, expected: value) != .placeholder && !observed.isEmpty {
                control.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: observed.count))
            }
            control.typeText(value)
            valueState = awaitedPublicValueState()
            checkpoint(valueCheckpoint + "retry-" + valueState)
        }
        guard valueState == "matched" else { throw Failure.invalidIdentity }
        if deletionConfirmation || searchSubmission {
            // Submit this single-line public text field through the real
            // keyboard Return key. Search runs its read-only submit callback;
            // deletion only blurs and cannot dismiss the second confirmation.
            checkpoint(deletionConfirmation ? "deletion-confirmation-return" : "public-market-search-return")
            control.typeText("\n")
            valueState = awaitedPublicValueState()
            checkpoint(valueCheckpoint + "return-" + valueState)
            guard valueState == "matched" else { throw Failure.invalidIdentity }
        }
    }
    private func privateInput(_ action: String) throws {
        guard ["login-buyer", "deletion-buyer"].contains(action),
          let portText = ProcessInfo.processInfo.environment["NATIVE_QA_INPUT_PORT"],
          portText.range(of: "^[0-9]{4,5}$", options: .regularExpression) != nil,
          let port = Int(portText), port >= 1024 && port <= 65535,
          let bundle = ProcessInfo.processInfo.environment["NATIVE_QA_PACKAGE"]
        else { throw Failure.invalidIdentity }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 12; configuration.timeoutIntervalForResource = 12
        let session = URLSession(configuration: configuration)
        var request = URLRequest(url: URL(string: "http://127.0.0.1:" + String(port) + "/request/" + action)!, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue(bundle, forHTTPHeaderField: "x-wishlist-qa-bundle")
        let completed = expectation(description: "Private QA native input completed")
        var success = false
        session.dataTask(with: request) { data, response, _ in
            if (response as? HTTPURLResponse)?.statusCode == 200, let data = data, data.count <= 32,
              let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Bool], result == ["ok": true] { success = true }
            completed.fulfill()
        }.resume()
        wait(for: [completed], timeout: 13)
        session.finishTasksAndInvalidate()
        guard success else { throw Failure.invalidIdentity }
    }
    func test01AnonymousForms() {
        do {
            try prepare()
            app.launch()
            checkpoint("product-notice")
            let notice = try required("我了解，繼續使用", scroll: true)
            guard app.state == .runningForeground else { throw Failure.invalidIdentity }
            for label in ["手機號碼或 Email", "密碼", "新密碼", "Email 驗證連結或驗證碼", "密碼重設連結或驗證碼"] {
                guard !element(label).exists else { throw Failure.invalidIdentity }
            }
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "qa-product-notice"
            attachment.lifetime = .keepAlways
            add(attachment)
            // Product change notice acknowledgement, not platform terms consent.
            guard notice.isEnabled else { throw Failure.unstableControl }
            try tap("我了解，繼續使用")
            checkpoint("anonymous-login")
            try required("手機號碼或 Email")
            try required("密碼")
            checkpoint("anonymous-register")
            try tap("建立帳號")
            for label in ["顯示名稱", "手機號碼", "Email", "新密碼", "再次輸入新密碼"] { try required(label, scroll: true) }
            try tap("返回登入")
            checkpoint("anonymous-forgot")
            try tap("忘記密碼")
            try required("註冊時的 Email")
            try tap("返回登入")
            checkpoint("anonymous-resend")
            try tap("重新寄送驗證信")
            try required("註冊時的 Email")
            try tap("返回登入")
            checkpoint("anonymous-verify")
            try tap("我已有 Email 驗證連結")
            try required("Email 驗證連結或驗證碼")
            try tap("返回登入")
            checkpoint("anonymous-reset")
            try tap("我已有密碼重設連結")
            for label in ["密碼重設連結或驗證碼", "新密碼", "再次輸入新密碼"] { try required(label, scroll: true) }
            try tap("返回登入")
            checkpoint("anonymous-final-login")
            try required("手機號碼或 Email")
            guard !app.buttons["我的"].exists else { throw Failure.invalidIdentity }
        } catch { reportFailure() }
    }
    func test02ActualRestartRemainsAnonymous() {
        do {
            try prepare()
            checkpoint("actual-anonymous-restart")
            app.terminate()
            app.launch()
            try required("手機號碼或 Email")
            guard !app.buttons["我的"].exists && !element("我了解，繼續使用").exists else { throw Failure.invalidIdentity }
        } catch { reportFailure() }
    }
    private func loginBuyerAndRequireTabs() throws {
        app.launchEnvironment["NATIVE_QA_INPUT_PORT"] = ProcessInfo.processInfo.environment["NATIVE_QA_INPUT_PORT"]
        app.launch()
        checkpoint("authenticated-product-notice")
        try required("我了解，繼續使用", scroll: true)
        try safeScreenshot("qa-product-notice")
        try tap("我了解，繼續使用")
        checkpoint("real-login-native-input")
        try required("手機號碼或 Email"); try required("密碼")
        try privateInput("login-buyer")
        try tap("登入")
        checkpoint("authenticated-five-tabs")
        for label in ["首頁", "願望", "探索", "社交", "我的"] { try required(tabIdentifier(label)) }
        try safeScreenshot("qa-home")
    }
    private func openMarketplaceListing(search: Bool) throws {
        try tapTab("探索")
        if search {
            try publicText("搜尋商品名稱與說明", value: "Native QA Switch OLED")
            try tap("搜尋")
        }
        try tap("切換清單")
        let marketplaceCard = "Native QA Switch OLED，NT$ 7,500，台北市中山區"
        try required(marketplaceCard, scroll: true, kind: .button)
        try tap(marketplaceCard)
        try required("Native QA Switch OLED", scroll: true)
        try required("聯絡賣家", scroll: true, kind: .button)
        Thread.sleep(forTimeInterval: 1)
        try dismissCollapsedDebugWarningToastIfPresent()
    }
    func test03RealLoginMarketplaceDiscovery() {
        executionTimeAllowance = 120
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("marketplace-search-list")
            try openMarketplaceListing(search: true)
            try safeScreenshot("qa-marketplace")
            checkpoint("marketplace-discovery-complete")
            app.terminate()
        } catch { reportFailure() }
    }
    func test04RealLoginMarketplaceChat() {
        executionTimeAllowance = 120
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("marketplace-chat-listing")
            try openMarketplaceListing(search: false)
            checkpoint("marketplace-contact-seller")
            try tap("聯絡賣家")
            checkpoint("marketplace-chat-input")
            try safeScreenshot("qa-chat-transition")
            try publicInputControl("商品聊天訊息")
            checkpoint("marketplace-send-message")
            try publicText("商品聊天訊息", value: "Native QA 買家詢問面交", kind: .any)
            try tap("傳送")
            try required("Native QA 買家詢問面交", scroll: true)
            try safeScreenshot("qa-chat")
            checkpoint("marketplace-chat-complete")
            app.terminate()
        } catch { reportFailure() }
    }
    func test05RealLoginMarketplaceMeetup() {
        executionTimeAllowance = 120
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("marketplace-meetup-listing")
            try openMarketplaceListing(search: false)
            try tap("聯絡賣家")
            checkpoint("marketplace-meetup-proposal")
            try tap("查看或提議面交預約")
            try required("面交預約", scroll: true)
            try tap("提出面交邀約")
            try publicText("私密面交地點名稱", value: "台北車站大廳 QA 集合點")
            checkpoint("marketplace-meetup-keyboard-dismiss")
            try required("私密面交地點名稱", kind: .textField).typeText("\n")
            let keyboardDeadline = Date().addingTimeInterval(4)
            while app.keyboards.firstMatch.exists && Date() < keyboardDeadline { Thread.sleep(forTimeInterval: 0.12) }
            guard !app.keyboards.firstMatch.exists else { throw Failure.unstableControl }
            checkpoint("marketplace-meetup-submit")
            try tap("提出此版本（改期需對方重新同意）")
            try required("提議中 · 第1版", scroll: true)
            try required("台北車站大廳 QA 集合點", scroll: true)
            try safeScreenshot("qa-meetup")
            checkpoint("marketplace-meetup-complete")
            app.terminate()
        } catch { reportFailure() }
    }
    func test06RealLoginWishlistDeletionAndRestart() {
        executionTimeAllowance = 120
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("create-private-list")
            checkpoint("open-wishes-tab")
            try tapTab("願望")
            checkpoint("open-private-list-editor")
            try tap("建立願望清單")
            checkpoint("private-list-public-input")
            try publicText("清單名稱", value: "Native QA wishlist")
            try required("私人清單（預設） · 點擊切換", scroll: true)
            checkpoint("private-list-submit-and-ack")
            try tap("儲存")
            try required("Native QA wishlist", scroll: true)
            let savedDeadline = Date().addingTimeInterval(8)
            while (element("清單名稱").exists || element("處理願望中").exists) && Date() < savedDeadline { Thread.sleep(forTimeInterval: 0.12) }
            guard !element("清單名稱").exists && !element("處理願望中").exists else { throw Failure.unstableControl }
            checkpoint("create-private-budget-wish")
            try tap("新增願望")
            try publicText("願望名稱", value: "Nintendo Switch OLED")
            try publicText("最高預算", value: "8000")
            try tap("儲存")
            try required("Nintendo Switch OLED", scroll: true); try required("最高預算 TWD 8000", scroll: true)
            try safeScreenshot("qa-wish")
            checkpoint("account-deletion-impact")
            try tapTab("我的"); try tap("刪除本人帳號與資料")
            try required("刪除影響盤點")
            try required("刪除帳號的目前密碼", scroll: true)
            checkpoint("deletion-password-native-input")
            try privateInput("deletion-buyer")
            checkpoint("deletion-confirmation-public-input")
            try publicText("輸入刪除帳號以確認", value: "刪除帳號")
            checkpoint("deletion-confirmation-submit")
            try tap("永久刪除本人帳號")
            checkpoint("second-native-deletion-alert")
            let alert = app.alerts.firstMatch
            guard alert.waitForExistence(timeout: 5) else { throw Failure.missingControl }
            let confirmation = alert.buttons["永久刪除"]
            guard confirmation.exists && confirmation.isHittable && confirmation.isEnabled else { throw Failure.missingControl }
            confirmation.tap()
            checkpoint("durable-erasure-and-device-cleanup")
            checkpoint("deletion-completion-heading")
            try required("帳號已確認刪除", scroll: true)
            checkpoint("deletion-device-clean-proof")
            try required("deletion-device-clean-proof")
            checkpoint("deletion-safe-completion-screenshot")
            try safeScreenshot("qa-deleted")
            checkpoint("deletion-finish-recovery")
            try tap("清除恢復資料並返回登入確認")
            checkpoint("deletion-returned-login")
            try required("手機號碼或 Email")
            guard !app.buttons["我的"].exists else { throw Failure.invalidIdentity }
            checkpoint("actual-post-deletion-restart")
            app.terminate(); app.launch()
            try required("手機號碼或 Email")
            guard !app.buttons["我的"].exists && !element("我了解，繼續使用").exists else { throw Failure.invalidIdentity }
        } catch { reportFailure() }
    }
    func test07RealLoginListingBatchEntry() {
        executionTimeAllowance = 120
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("listing-batch-account-entry")
            try tapTab("我的")
            try tap("刊登好物")
            checkpoint("listing-batch-screen")
            try safeScreenshot("qa-listing-batch")
            checkpoint("listing-batch-controls")
            for label in ["listing-batch-title", "連續拍照", "批次選照片", "共用刊登位置與交付方式", "商品草稿 0/12"] {
                try required(label, scroll: true)
            }
            guard try required("連續拍照", kind: .button).isEnabled,
                  try required("批次選照片", kind: .button).isEnabled else { throw Failure.unstableControl }
            checkpoint("listing-batch-entry-complete")
            app.terminate()
        } catch { reportFailure() }
    }
    func test08RealLoginListingBatchPhotoUpload() {
        executionTimeAllowance = 180
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("listing-photo-account-entry")
            try tapTab("我的")
            try tap("刊登好物")
            try required("listing-batch-title")
            checkpoint("listing-photo-picker-open")
            try tap("批次選照片")
            try safeScreenshot("qa-photo-picker")
            checkpoint("listing-photo-picker-selection")
            // PHPicker runs in a different process: its image elements appear
            // in the diagnostic hierarchy but not in app.images queries.
            // Prior isolated tests can leave other synthetic photos in this
            // private library. Select the blue mug by observed tile pixels.
            let (_, blue) = try syntheticBatchPhotoOffsets(requireOrange: false)
            app.coordinate(withNormalizedOffset: blue).tap()
            checkpoint("listing-photo-picker-selected")
            try safeScreenshot("qa-photo-selected")
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.905, dy: 0.165)).tap()
            checkpoint("listing-photo-private-draft")
            try required("商品草稿 1/12", scroll: true)
            try required("第1件商品照片", scroll: true)
            try required("第1件商品照片預覽已載入", scroll: true)
            try required("AI 尚未對此帳號開放；照片已私密保存，可稍後重試或手動編輯。", scroll: true)
            try safeScreenshot("qa-listing-photo")
            checkpoint("listing-photo-seller-edit")
            try publicText("第1件商品名稱", value: "Native QA Blue Mug")
            checkpoint("listing-photo-save-on-leave")
            try tap("稍後繼續")
            try required("刊登好物")
            checkpoint("listing-photo-reopen")
            try tap("刊登好物")
            try required("listing-batch-title")
            let restored = try publicInputControl("第1件商品名稱")
            guard restored.value as? String == "Native QA Blue Mug" else { throw Failure.invalidIdentity }
            try safeScreenshot("qa-listing-resumed")
            app.terminate()
        } catch { reportFailure() }
    }
    func test09RealLoginListingBatchTwoPhotos() {
        executionTimeAllowance = 180
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("listing-two-account-entry")
            try tapTab("我的")
            try tap("刊登好物")
            try required("listing-batch-title")
            checkpoint("listing-two-picker-open")
            try tap("批次選照片")
            try safeScreenshot("qa-photo-picker")
            let (maybeOrange, blue) = try syntheticBatchPhotoOffsets()
            guard let orange = maybeOrange else { throw Failure.missingControl }
            checkpoint("listing-two-picker-selection")
            app.coordinate(withNormalizedOffset: orange).tap()
            app.coordinate(withNormalizedOffset: blue).tap()
            try safeScreenshot("qa-two-selected")
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.905, dy: 0.165)).tap()
            checkpoint("listing-two-private-drafts")
            try required("商品草稿 2/12", scroll: true)
            try required("第1件商品照片", scroll: true)
            try required("第1件商品照片預覽已載入", scroll: true)
            try required("第2件商品照片", scroll: true)
            try required("第2件商品照片預覽已載入", scroll: true)
            let unavailable = "AI 尚未對此帳號開放；照片已私密保存，可稍後重試或手動編輯。"
            let deadline = Date().addingTimeInterval(30)
            while app.staticTexts.matching(NSPredicate(format: "label == %@", unavailable)).count < 2 && Date() < deadline {
                app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })?.swipeUp()
                Thread.sleep(forTimeInterval: 0.25)
            }
            try safeScreenshot("qa-two-listing")
            // React Native may expose both a text wrapper and its child to
            // XCTest. The exact AX count is not the exact card count; the
            // backend separately requires two distinct private records.
            guard app.staticTexts.matching(NSPredicate(format: "label == %@", unavailable)).count >= 2 else { throw Failure.missingControl }
            app.terminate()
        } catch { reportFailure() }
    }
    func test11RealLoginListingBatchAiPhoto() {
        executionTimeAllowance = 230
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("listing-ai-account-entry")
            try tapTab("我的")
            try tap("刊登好物")
            try required("listing-batch-title")
            checkpoint("listing-ai-picker-open")
            try tap("批次選照片")
            try safeScreenshot("qa-photo-picker")
            let (_, blue) = try syntheticBatchPhotoOffsets(requireOrange: false)
            checkpoint("listing-ai-picker-selection")
            app.coordinate(withNormalizedOffset: blue).tap()
            try safeScreenshot("qa-photo-selected")
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.905, dy: 0.165)).tap()
            checkpoint("listing-ai-private-upload")
            try required("商品草稿 1/12", scroll: true)
            try required("第1件商品照片", scroll: true)
            try required("第1件商品照片預覽已載入", scroll: true)
            checkpoint("listing-ai-result-await")
            let deadline = Date().addingTimeInterval(145)
            var completed = false
            repeat {
                let status = element("AI 草稿已完成，請確認")
                if status.exists { completed = true; break }
                app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })?.swipeUp()
                Thread.sleep(forTimeInterval: 0.5)
            } while Date() < deadline
            guard completed else { throw Failure.missingControl }
            let price = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第1件 AI 二手參考價：NT$ ")).firstMatch
            guard price.exists else { throw Failure.missingControl }
            checkpoint("listing-ai-result-visible")
            try safeScreenshot("qa-ai-photo")
            checkpoint("listing-ai-seller-edit")
            let field = try publicInputControl("第1件商品名稱")
            guard let original = field.value as? String, original.contains("杯"), original.count < 70 else { throw Failure.invalidIdentity }
            field.tap()
            field.typeText("NativeQA")
            guard let edited = try publicInputControl("第1件商品名稱").value as? String,
                  edited != original, edited.contains("NativeQA") else { throw Failure.invalidIdentity }
            checkpoint("listing-ai-save-on-leave")
            try tap("稍後繼續")
            try required("刊登好物")
            checkpoint("listing-ai-reopen")
            try tap("刊登好物")
            try required("listing-batch-title")
            guard try publicInputControl("第1件商品名稱").value as? String == edited else { throw Failure.invalidIdentity }
            try safeScreenshot("qa-ai-resumed")
            app.terminate()
        } catch { reportFailure() }
    }
    func test12RealLoginListingBatchTwoAiPhotos() { runTwoAiPhotos(publishOne: false) }
    func test13RealLoginListingBatchTwoAiPublishOne() { runTwoAiPhotos(publishOne: true) }
    private func runTwoAiPhotos(publishOne: Bool) {
        // Two real connector calls are serialized by the private worker and
        // can each take up to 150 seconds without indicating an app failure.
        executionTimeAllowance = publishOne ? 590 : 480
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("listing-two-ai-account-entry")
            try tapTab("我的")
            try tap("刊登好物")
            try required("listing-batch-title")
            try tap("批次選照片")
            try safeScreenshot("qa-photo-picker")
            let (maybeOrange, blue) = try syntheticBatchPhotoOffsets()
            guard let orange = maybeOrange else { throw Failure.missingControl }
            checkpoint("listing-two-ai-picker-selection")
            app.coordinate(withNormalizedOffset: orange).tap()
            app.coordinate(withNormalizedOffset: blue).tap()
            try safeScreenshot("qa-two-selected")
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.905, dy: 0.165)).tap()
            checkpoint("listing-two-ai-private-upload")
            try required("商品草稿 2/12", scroll: true)
            try required("第1件商品照片預覽已載入", scroll: true)
            try required("第2件商品照片預覽已載入", scroll: true)
            checkpoint("listing-two-ai-results-await")
            let firstPrice = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第1件 AI 二手參考價：NT$ ")).firstMatch
            let secondPrice = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第2件 AI 二手參考價：NT$ ")).firstMatch
            let deadline = Date().addingTimeInterval(390)
            while !(firstPrice.exists && secondPrice.exists) && Date() < deadline {
                app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })?.swipeUp()
                Thread.sleep(forTimeInterval: 0.5)
            }
            guard firstPrice.exists && secondPrice.exists else { throw Failure.missingControl }
            let firstReference = firstPrice.label.components(separatedBy: "NT$ ").last
            let secondReference = secondPrice.label.components(separatedBy: "NT$ ").last
            guard let firstReference, let secondReference, firstReference != secondReference else { throw Failure.invalidIdentity }
            let firstName = element("第1件商品名稱", kind: .textField).value as? String
            let secondName = element("第2件商品名稱", kind: .textField).value as? String
            guard let firstName, let secondName, firstName.contains("燈"), secondName.contains("杯") else { throw Failure.invalidIdentity }
            try safeScreenshot("qa-two-ai-photo")
            checkpoint("listing-two-ai-seller-edit")
            try tap("稍後繼續")
            try required("刊登好物")
            try tap("刊登好物")
            let field = try publicInputControl("第1件商品名稱")
            guard field.value as? String == firstName else { throw Failure.invalidIdentity }
            field.tap()
            field.typeText("NativeQA")
            guard let edited = try publicInputControl("第1件商品名稱").value as? String,
                  edited != firstName, edited.contains("NativeQA") else { throw Failure.invalidIdentity }
            checkpoint("listing-two-ai-save-on-leave")
            try tap("稍後繼續")
            try required("刊登好物")
            try tap("刊登好物")
            try required("商品草稿 2/12", scroll: true)
            guard try publicInputControl("第1件商品名稱").value as? String == edited,
                  try publicInputControl("第2件商品名稱").value as? String == secondName else { throw Failure.invalidIdentity }
            try safeScreenshot("qa-two-ai-resumed")
            if publishOne {
                checkpoint("listing-two-ai-publish-preconditions")
                guard !(try required("刊登已逐件確認的商品（0）", scroll: true, kind: .button)).isEnabled else { throw Failure.invalidIdentity }
                let county = element("縣市", kind: .textField)
                for _ in 0..<12 where !county.isHittable {
                    guard let scroller = app.scrollViews.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) else { throw Failure.missingControl }
                    scroller.swipeDown()
                }
                guard county.isHittable else { throw Failure.missingControl }
                try publicText("縣市", value: "台北市")
                try publicText("行政區", value: "中正區")
                try publicText("位置緯度", value: "25.033")
                try publicText("位置經度", value: "121.565")
                try tap("☐ 可面交", kind: .any)
                try tap("☐ 我確認資料屬實並同意公開照片與約略位置", kind: .any)
                try publicText("第1件售價 TWD", value: "450", replace: true)
                checkpoint("listing-two-ai-publish-confirm-one")
                try tap("☐ 我已逐欄確認第 1 件商品的照片、內容及售價", kind: .any)
                guard try required("刊登已逐件確認的商品（1）", scroll: true, kind: .button).isEnabled else { throw Failure.invalidIdentity }
                checkpoint("listing-two-ai-publish-one")
                try tap("刊登已逐件確認的商品（1）")
                try required("商品草稿 1/12", scroll: true)
                try required("第 1 件 · 已刊登", scroll: true)
                try required("第 2 件", scroll: true)
                try safeScreenshot("qa-two-ai-published")
            }
            app.terminate()
        } catch { reportFailure() }
    }
    func test10RealLoginExternalSourceMapAndDetail() {
        executionTimeAllowance = 210
        do {
            try prepare()
            try loginBuyerAndRequireTabs()
            checkpoint("external-map-open")
            try tapTab("探索")
            // This is one React Native Text node: its accessibility label is
            // "站內 0 件 · 外部 1 件", not a standalone "外部 1 件" identifier.
            let externalCount = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "外部 1 件")).firstMatch
            guard externalCount.waitForExistence(timeout: 20), externalCount.isHittable else { throw Failure.missingControl }
            try safeScreenshot("qa-external-map")
            checkpoint("external-list-open")
            try tap("切換清單")
            let card = "外部來源商品，Native QA 外部檯燈，來源售價 NT$ 590，新北市板橋區"
            try required(card, scroll: true, kind: .button)
            try safeScreenshot("qa-external-list")
            checkpoint("external-detail-open")
            try tap(card)
            try required("外部來源 · github.com", scroll: true)
            try required("來源售價 NT$ 590", scroll: true)
            try required("地圖圖釘是行政區中心示意，不是商品或面交的精確位置。售價與描述由來源提供，Wishlist.ai 並非此商品賣家；請在原站確認現貨、狀態與交易方式。", scroll: true)
            try required("前往來源網站查看", scroll: true, kind: .button)
            guard !app.buttons["聯絡賣家"].exists else { throw Failure.invalidIdentity }
            try safeScreenshot("qa-external-detail")
            try tap("返回探索")
            try tapTab("願望")
            try required("Native QA 外部比對清單", scroll: true)
            try tap("查看清單")
            try required("檯燈", scroll: true)
            try required("最高預算 TWD 600", scroll: true)
            try tap("查附近符合商品")
            checkpoint("external-wish-map-open")
            let wishBanner = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "符合所選願望")).firstMatch
            guard wishBanner.waitForExistence(timeout: 20) else { throw Failure.missingControl }
            guard externalCount.waitForExistence(timeout: 20), externalCount.isHittable else { throw Failure.missingControl }
            try safeScreenshot("qa-external-wish-map")
            checkpoint("external-wish-list-open")
            try tap("切換清單")
            try required(card, scroll: true, kind: .button)
            try safeScreenshot("qa-external-wish-list")
            app.terminate()
        } catch { reportFailure() }
    }
}
