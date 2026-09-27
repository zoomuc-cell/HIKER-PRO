import Foundation
import SwiftData

/// A saved hike. Stored only on device (SwiftData, iOS data protection).
@Model
final class Track {
    var name: String
    var startDate: Date
    var endDate: Date
    /// Meters.
    var distance: Double
    /// Seconds spent recording, excluding pauses.
    var movingTime: TimeInterval
    var elevationGain: Double
    var elevationLoss: Double
    var maxAltitude: Double?
    var minAltitude: Double?
    @Attribute(.externalStorage) var pointsData: Data

    init(name: String, startDate: Date, endDate: Date, movingTime: TimeInterval, points: [TrackPoint]) {
        let stats = TrackStatistics(points: points)
        self.name = name
        self.startDate = startDate
        self.endDate = endDate
        self.movingTime = movingTime
        self.distance = stats.distance
        self.elevationGain = stats.elevationGain
        self.elevationLoss = stats.elevationLoss
        self.maxAltitude = stats.maxAltitude
        self.minAltitude = stats.minAltitude
        self.pointsData = Track.encode(points)
    }

    /// Decodes on every access; read once and keep the result.
    var points: [TrackPoint] {
        get { (try? PropertyListDecoder().decode([TrackPoint].self, from: pointsData)) ?? [] }
        set { pointsData = Track.encode(newValue) }
    }

    /// Meters per second over the moving time.
    var averageSpeed: Double {
        movingTime > 0 ? distance / movingTime : 0
    }

    private static func encode(_ points: [TrackPoint]) -> Data {
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        return (try? encoder.encode(points)) ?? Data()
    }
}
