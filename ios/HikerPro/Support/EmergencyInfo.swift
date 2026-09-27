import Foundation
import CoreLocation

enum EmergencyInfo {
    /// Emergency number for the device's region. 112 works on most mobile networks worldwide.
    static var phoneNumber: String {
        switch Locale.current.region?.identifier ?? "" {
        case "KR", "JP", "TW": "119"
        case "US", "CA", "MX": "911"
        case "GB": "999"
        case "AU": "000"
        case "NZ": "111"
        default: "112"
        }
    }

    static var phoneURL: URL {
        URL(string: "tel:\(phoneNumber)")!
    }

    /// Text shared only when the user explicitly picks a recipient.
    static func message(for location: CLLocation) -> String {
        let latitude = String(format: "%.6f", location.coordinate.latitude)
        let longitude = String(format: "%.6f", location.coordinate.longitude)
        var lines = [
            String(localized: "HIKER PRO: I need help. My current location:"),
            "\(latitude), \(longitude)",
        ]
        if location.verticalAccuracy > 0 {
            let altitude = Fmt.altitude(location.altitude)
            lines.append(String(localized: "Altitude: \(altitude)"))
        }
        let accuracy = Fmt.altitude(location.horizontalAccuracy)
        lines.append(String(localized: "Accuracy: ±\(accuracy)"))
        let time = location.timestamp.formatted(date: .abbreviated, time: .shortened)
        lines.append(String(localized: "Time: \(time)"))
        lines.append("https://maps.apple.com/?ll=\(latitude),\(longitude)&q=SOS")
        return lines.joined(separator: "\n")
    }
}
