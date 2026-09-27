import Foundation

/// Incrementally computed distance and elevation statistics.
struct TrackStatistics {
    /// Altitude changes smaller than this are treated as GPS noise.
    static let elevationThreshold = 5.0
    /// Fixes with a worse vertical accuracy are ignored for elevation.
    static let maxVerticalAccuracy = 20.0

    private(set) var distance = 0.0
    private(set) var elevationGain = 0.0
    private(set) var elevationLoss = 0.0
    private(set) var maxAltitude: Double?
    private(set) var minAltitude: Double?

    private var lastPoint: TrackPoint?
    private var altitudeAnchor: Double?

    init() {}

    init(points: [TrackPoint]) {
        for point in points {
            add(point)
        }
    }

    mutating func add(_ point: TrackPoint) {
        if let lastPoint, lastPoint.segment == point.segment {
            distance += point.location.distance(from: lastPoint.location)
        }
        lastPoint = point

        guard point.hasValidAltitude, point.verticalAccuracy <= Self.maxVerticalAccuracy else { return }
        let altitude = point.altitude
        maxAltitude = Swift.max(maxAltitude ?? altitude, altitude)
        minAltitude = Swift.min(minAltitude ?? altitude, altitude)

        guard let anchor = altitudeAnchor else {
            altitudeAnchor = altitude
            return
        }
        let delta = altitude - anchor
        if delta >= Self.elevationThreshold {
            elevationGain += delta
            altitudeAnchor = altitude
        } else if delta <= -Self.elevationThreshold {
            elevationLoss -= delta
            altitudeAnchor = altitude
        }
    }
}
