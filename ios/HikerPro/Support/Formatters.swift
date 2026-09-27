import Foundation
import CoreLocation

/// Locale-aware formatting (kilometers/meters or miles/feet).
enum Fmt {
    static var usesMetric: Bool {
        Locale.current.measurementSystem == .metric
    }

    static func distance(_ meters: Double) -> String {
        let value = Measurement(value: meters, unit: UnitLength.meters)
            .converted(to: usesMetric ? .kilometers : .miles)
        return value.formatted(.measurement(
            width: .abbreviated,
            usage: .asProvided,
            numberFormatStyle: .number.precision(.fractionLength(2))
        ))
    }

    /// Altitude, ascent and GPS accuracy.
    static func altitude(_ meters: Double) -> String {
        let value = Measurement(value: meters, unit: UnitLength.meters)
            .converted(to: usesMetric ? .meters : .feet)
        return value.formatted(.measurement(
            width: .abbreviated,
            usage: .asProvided,
            numberFormatStyle: .number.precision(.fractionLength(0))
        ))
    }

    static func speed(_ metersPerSecond: Double) -> String {
        let value = Measurement(value: max(0, metersPerSecond), unit: UnitSpeed.metersPerSecond)
            .converted(to: usesMetric ? .kilometersPerHour : .milesPerHour)
        return value.formatted(.measurement(
            width: .abbreviated,
            usage: .asProvided,
            numberFormatStyle: .number.precision(.fractionLength(1))
        ))
    }

    static func duration(_ seconds: TimeInterval) -> String {
        Duration.seconds(max(0, seconds)).formatted(.time(pattern: .hourMinuteSecond))
    }

    /// Always uses "." as the decimal separator so the value can be pasted anywhere.
    static func coordinate(_ coordinate: CLLocationCoordinate2D) -> String {
        String(format: "%.6f, %.6f", coordinate.latitude, coordinate.longitude)
    }
}
