#if WISHLIST_NATIVE_QA
import UIKit

// Never compiled into a release App. XCTest asks the loopback broker to begin
// an action; only this isolated App receives the one-use synthetic values.
private final class WishlistQaInputBridge {
  private let bundle: String
  private let port: Int
  private let session: URLSession
  private var timer: Timer?
  private var busy = false
  private var loginCompleted = false
  private let expires = Date().addingTimeInterval(320)

  private init(bundle: String, port: Int) {
    self.bundle = bundle
    self.port = port
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.timeoutIntervalForRequest = 4
    configuration.timeoutIntervalForResource = 4
    session = URLSession(configuration: configuration)
  }

  static func startIfEnabled(bundle: String) -> WishlistQaInputBridge? {
    guard let raw = ProcessInfo.processInfo.environment["NATIVE_QA_INPUT_PORT"],
      let port = Int(raw), (1024...65535).contains(port),
      bundle.range(of: "^com\\.hankhuang\\.weesh\\.qa[0-9]{12}$", options: .regularExpression) != nil
    else { return nil }
    let bridge = WishlistQaInputBridge(bundle: bundle, port: port)
    bridge.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak bridge] _ in bridge?.tick() }
    return bridge
  }

  private func request(_ path: String, completion: @escaping (Data?) -> Void) {
    guard let url = URL(string: "http://127.0.0.1:\(port)/\(path)") else { completion(nil); return }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.setValue(bundle, forHTTPHeaderField: "x-wishlist-qa-bundle")
    session.dataTask(with: request) { data, response, error in
      guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200,
        let data, data.count <= 4096 else { completion(nil); return }
      completion(data)
    }.resume()
  }

  private func finishPoll() {
    DispatchQueue.main.async { [weak self] in self?.busy = false }
  }

  private func tick() {
    guard !busy else { return }
    if Date() >= expires { timer?.invalidate(); timer = nil; session.invalidateAndCancel(); return }
    guard UIApplication.shared.applicationState == .active else { return }
    busy = true
    let action = loginCompleted ? "deletion-buyer" : "login-buyer"
    request("pending/\(action)") { [weak self] pending in
      guard let self else { return }
      guard let pending,
        let object = (try? JSONSerialization.jsonObject(with: pending)) as? [String: String],
        object["action"] == action, let job = object["job"], UUID(uuidString: job) != nil
      else { self.finishPoll(); return }
      self.request("credentials/\(job)") { [weak self] credentials in
        guard let self else { return }
        guard let credentials,
          let object = (try? JSONSerialization.jsonObject(with: credentials)) as? [String: Any],
          object["action"] as? String == action,
          let fields = object["fields"] as? [[String: String]]
        else { self.reject(job); return }
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          guard self.apply(fields, action: action) else { self.reject(job); return }
          // React Native's editingChanged handler updates state on the JS
          // thread. Confirm UIKit values before telling XCTest to tap Login.
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self else { return }
            guard self.matches(fields, action: action) else { self.reject(job); return }
            self.request("done/\(job)") { [weak self] reply in
              guard let self else { return }
              DispatchQueue.main.async {
                if reply != nil && action == "login-buyer" { self.loginCompleted = true }
                self.busy = false
              }
            }
          }
        }
      }
    }
  }

  private func reject(_ job: String) {
    request("failed/\(job)") { [weak self] _ in self?.finishPoll() }
  }

  private func textFields(in view: UIView) -> [UITextField] {
    var result = view is UITextField ? [view as! UITextField] : []
    for child in view.subviews { result.append(contentsOf: textFields(in: child)) }
    return result
  }

  private func resolved(_ fields: [[String: String]], action: String) -> [(UITextField, String)]? {
    guard UIApplication.shared.applicationState == .active else { return nil }
    let expected = action == "login-buyer" ? ["手機號碼或 Email", "密碼"] : ["刪除帳號的目前密碼"]
    guard fields.count == expected.count, fields.compactMap({ $0["label"] }) == expected,
      fields.allSatisfy({ $0["value"] != nil }) else { return nil }
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }.filter { $0.isKeyWindow && !$0.isHidden }
    guard windows.count == 1 else { return nil }
    let controls = windows.flatMap { textFields(in: $0) }
    var resolved: [(UITextField, String)] = []
    for field in fields {
      guard let label = field["label"], let value = field["value"] else { return nil }
      let matches = controls.filter { ($0.accessibilityLabel == label || $0.placeholder == label) &&
        !$0.isHidden && $0.alpha > 0 && $0.isEnabled && $0.window != nil }
      guard matches.count == 1, let control = matches.first,
        control.isSecureTextEntry == (label != "手機號碼或 Email") else { return nil }
      resolved.append((control, value))
    }
    return resolved
  }

  private func apply(_ fields: [[String: String]], action: String) -> Bool {
    guard let controls = resolved(fields, action: action) else { return false }
    for (control, value) in controls {
      control.text = value
      control.sendActions(for: .editingChanged)
    }
    return true
  }

  private func matches(_ fields: [[String: String]], action: String) -> Bool {
    guard let controls = resolved(fields, action: action) else { return false }
    return controls.allSatisfy { control, value in control.text == value }
  }
}
#endif
