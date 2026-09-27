import Foundation
import CoreLocation

/// A single recorded GPS fix. `segment` changes every time a recording is paused,
/// so that pauses are not drawn or measured as a straight line.
struct TrackPoint: Codable, Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    /// Meters above mean sea level.
    var altitude: Double
    var horizontalAccuracy: Double
    /// Negative when the altitude is invalid.
    var verticalAccuracy: Double
    var speed: Double
    var timestamp: Date
    var segment: Int

    init(location: CLLocation, segment: Int) {
        latitude = location.coordinate.latitude
        longitude = location.coordinate.longitude
        altitude = location.altitude
        horizontalAccuracy = location.horizontalAccuracy
        verticalAccuracy = location.verticalAccuracy
        speed = location.speed
        timestamp = location.timestamp
        self.segment = segment
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var location: CLLocation {
        CLLocation(
            coordinate: coordinate,
            altitude: altitude,
            horizontalAccuracy: horizontalAccuracy,
            verticalAccuracy: verticalAccuracy,
            timestamp: timestamp
        )
    }

    var hasValidAltitude: Bool { verticalAccuracy > 0 }
}

struct ElevationSample: Identifiable {
    let id: Int
    /// Cumulative distance from the start, in meters.
    let distance: Double
    /// Meters above mean sea level.
    let altitude: Double
}

extension Array where Element == TrackPoint {
    /// Points grouped into continuous segments (split at pauses).
    func segmented() -> [[TrackPoint]] {
        var result: [[TrackPoint]] = []
        for point in self {
            if let last = result.last?.last, last.segment == point.segment {
                result[result.count - 1].append(point)
            } else {
                result.append([point])
            }
        }
        return result
    }

    var segmentedCoordinates: [[CLLocationCoordinate2D]] {
        segmented().map { $0.map(\.coordinate) }
    }

    /// Altitude against cumulative distance, downsampled for charting.
    func elevationProfile(maxSamples: Int = 400) -> [ElevationSample] {
        var samples: [ElevationSample] = []
        var cumulative = 0.0
        var previous: TrackPoint?
        for point in self {
            if let previous, previous.segment == point.segment {
                cumulative += point.location.distance(from: previous.location)
            }
            previous = point
            if point.hasValidAltitude {
                samples.append(ElevationSample(id: samples.count, distance: cumulative, altitude: point.altitude))
            }
        }
        guard samples.count > maxSamples else { return samples }
        let step = Double(samples.count) / Double(maxSamples)
        return (0..<maxSamples).map { index in
            let sample = samples[Int(Double(index) * step)]
            return ElevationSample(id: index, distance: sample.distance, altitude: sample.altitude)
        }
    }
}
