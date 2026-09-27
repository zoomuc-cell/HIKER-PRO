import Foundation
import CoreLocation
import Observation
import SwiftData

/// Records the current hike: filters incoming fixes, tracks pauses and statistics.
@MainActor
@Observable
final class TrackRecorder {
    enum State: Equatable {
        case idle, recording, paused
    }

    /// Fixes less accurate than this are dropped.
    static let maxHorizontalAccuracy: CLLocationAccuracy = 30
    /// Minimum spacing between stored points, to filter jitter while standing still.
    static let minPointSpacing: CLLocationDistance = 3

    private(set) var state: State = .idle
    private(set) var points: [TrackPoint] = []
    private(set) var stats = TrackStatistics()
    private(set) var startDate: Date?

    private var accumulatedTime: TimeInterval = 0
    private var runningSince: Date?
    private var segment = 0

    @ObservationIgnored private let locationManager: LocationManager

    init(locationManager: LocationManager) {
        self.locationManager = locationManager
        locationManager.onLocations = { [weak self] locations in
            self?.ingest(locations)
        }
    }

    var isActive: Bool { state != .idle }

    var segments: [[CLLocationCoordinate2D]] { points.segmentedCoordinates }

    /// Recording time excluding pauses.
    func elapsedTime(at date: Date = .now) -> TimeInterval {
        accumulatedTime + (runningSince.map { date.timeIntervalSince($0) } ?? 0)
    }

    func start() {
        guard state == .idle else { return }
        reset()
        let now = Date.now
        startDate = now
        runningSince = now
        state = .recording
        locationManager.startTracking()
    }

    func pause() {
        guard state == .recording else { return }
        accumulatedTime = elapsedTime()
        runningSince = nil
        segment += 1
        state = .paused
        locationManager.stopTracking()
    }

    func resume() {
        guard state == .paused else { return }
        runningSince = .now
        state = .recording
        locationManager.startTracking()
    }

    /// Saves the hike. Returns `nil` when too few points were recorded to form a track.
    @discardableResult
    func finish(saveTo context: ModelContext) -> Track? {
        guard state != .idle else { return nil }
        let movingTime = elapsedTime()
        defer {
            reset()
            locationManager.stopTracking()
        }
        guard points.count >= 2, let startDate else { return nil }

        let track = Track(
            name: Self.defaultName(for: startDate),
            startDate: startDate,
            endDate: points.last?.timestamp ?? .now,
            movingTime: movingTime,
            points: points
        )
        context.insert(track)
        try? context.save()
        return track
    }

    func discard() {
        reset()
        locationManager.stopTracking()
    }

    static func defaultName(for date: Date) -> String {
        let formatted = date.formatted(date: .abbreviated, time: .shortened)
        return String(localized: "Hike \(formatted)")
    }

    private func reset() {
        state = .idle
        points = []
        stats = TrackStatistics()
        startDate = nil
        accumulatedTime = 0
        runningSince = nil
        segment = 0
    }

    private func ingest(_ locations: [CLLocation]) {
        guard state == .recording else { return }
        for location in locations {
            guard location.horizontalAccuracy >= 0,
                  location.horizontalAccuracy <= Self.maxHorizontalAccuracy else { continue }
            // Skip cached fixes from before the hike started.
            if let startDate, location.timestamp < startDate { continue }
            if let last = points.last {
                guard location.timestamp > last.timestamp else { continue }
                if last.segment == segment,
                   location.distance(from: last.location) < Self.minPointSpacing { continue }
            }
            let point = TrackPoint(location: location, segment: segment)
            points.append(point)
            stats.add(point)
        }
    }
}
