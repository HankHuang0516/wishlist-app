import Foundation

// Host-only Foundation parser check with public synthetic values. No device,
// actors, app credentials or actual capability is involved.
let bundle = "com.hankhuang.weesh.qa202609152220"
let url = URL(string: "wishlistqa202609152220://qa-input?action=login-buyer&port=18887&job=00000000-0000-4000-8000-000000000000")!
let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
let checks: [String: Bool] = [
  "bundle": bundle.range(of: "^com\\.hankhuang\\.weesh\\.qa[0-9]{12}$", options: .regularExpression) != nil,
  "scheme": components.scheme == "wishlistqa" + String(bundle.suffix(12)),
  "host": components.host == "qa-input",
  "authority": components.user == nil && components.password == nil && components.port == nil,
  "fragment": components.fragment == nil,
  "emptyPath": components.path.isEmpty,
  "query": components.queryItems?.count == 3 && Set(components.queryItems!.map { $0.name }) == Set(["action", "port", "job"])
]
let json = try JSONSerialization.data(withJSONObject: ["kind": "host-only-foundation-qa-url-guard", "checks": checks], options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
if checks.values.contains(false) { exit(1) }
