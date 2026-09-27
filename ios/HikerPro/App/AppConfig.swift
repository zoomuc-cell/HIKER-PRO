import Foundation

enum AppConfig {
    /// Must match the Privacy Policy URL entered in App Store Connect.
    static let privacyPolicyURL = URL(string: "https://zoomuc-cell.github.io/HIKER-PRO/privacy_policy.html")!
    static let supportEmailURL = URL(string: "mailto:privacy@hikerpro.app")!

    static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }
}
