import CoreLocation
import Observation

/// Wraps `CLLocationManager`.
///
/// Only "When In Use" authorization is requested. Background recording is kept
/// alive with `CLBackgroundActivitySession` (iOS 17+), which shows the blue
/// location indicator while a hike is being recorded.
@MainActor
@Observable
final class LocationManager: NSObject {
    /// Purpose key from `NSLocationTemporaryUsageDescriptionDictionary` in Info.plist.
    static let fullAccuracyPurposeKey = "HikeTracking"

    private(set) var authorizationStatus: CLAuthorizationStatus
    private(set) var accuracyAuthorization: CLAccuracyAuthorization
    private(set) var lastLocation: CLLocation?
    private(set) var isTracking = false

    /// Receives every location update, on the main actor.
    @ObservationIgnored var onLocations: (@MainActor ([CLLocation]) -> Void)?

    @ObservationIgnored private let manager: CLLocationManager
    @ObservationIgnored private var backgroundSession: CLBackgroundActivitySession?

    override init() {
        let manager = CLLocationManager()
        self.manager = manager
        self.authorizationStatus = manager.authorizationStatus
        self.accuracyAuthorization = manager.accuracyAuthorization
        super.init()
        manager.delegate = self
        manager.activityType = .fitness
        configureForBrowsing()
        startIfAuthorized()
    }

    var isAuthorized: Bool {
        authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways
    }

    var isDenied: Bool {
        authorizationStatus == .denied || authorizationStatus == .restricted
    }

    var hasFullAccuracy: Bool {
        accuracyAuthorization == .fullAccuracy
    }

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func requestFullAccuracy() {
        manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.fullAccuracyPurposeKey)
    }

    /// High-accuracy updates that continue while the app is in the background.
    /// Must be called while the app is in the foreground.
    func startTracking() {
        guard isAuthorized else { return }
        isTracking = true
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        if backgroundSession == nil {
            backgroundSession = CLBackgroundActivitySession()
        }
        manager.startUpdatingLocation()
        if !hasFullAccuracy {
            requestFullAccuracy()
        }
    }

    /// Returns to low-power, foreground-only updates for showing the map.
    func stopTracking() {
        isTracking = false
        backgroundSession?.invalidate()
        backgroundSession = nil
        manager.allowsBackgroundLocationUpdates = false
        configureForBrowsing()
        startIfAuthorized()
    }

    private func configureForBrowsing() {
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 10
    }

    private func startIfAuthorized() {
        if isAuthorized {
            manager.startUpdatingLocation()
        } else {
            manager.stopUpdatingLocation()
        }
    }
}

// CLLocationManager calls its delegate on the thread it was created on,
// which is the main thread here.
extension LocationManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            authorizationStatus = self.manager.authorizationStatus
            accuracyAuthorization = self.manager.accuracyAuthorization
            if !isTracking {
                startIfAuthorized()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated {
            if let latest = locations.last {
                lastLocation = latest
            }
            onLocations?(locations)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // kCLErrorLocationUnknown is transient; the manager keeps trying.
        // Authorization errors are reflected through locationManagerDidChangeAuthorization.
    }
}
