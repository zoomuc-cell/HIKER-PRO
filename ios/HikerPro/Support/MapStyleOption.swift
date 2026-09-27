import SwiftUI
import MapKit

enum MapStyleOption: String, CaseIterable, Identifiable {
    case standard, hybrid, imagery

    static let storageKey = "mapStyle"

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .standard: "Standard"
        case .hybrid: "Hybrid"
        case .imagery: "Satellite"
        }
    }

    var mapStyle: MapStyle {
        switch self {
        case .standard: .standard(elevation: .realistic)
        case .hybrid: .hybrid(elevation: .realistic)
        case .imagery: .imagery(elevation: .realistic)
        }
    }
}
