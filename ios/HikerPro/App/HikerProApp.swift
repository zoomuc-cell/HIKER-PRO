import SwiftUI
import SwiftData

@main
struct HikerProApp: App {
    @State private var locationManager: LocationManager
    @State private var recorder: TrackRecorder

    init() {
        let locationManager = LocationManager()
        _locationManager = State(initialValue: locationManager)
        _recorder = State(initialValue: TrackRecorder(locationManager: locationManager))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(locationManager)
                .environment(recorder)
        }
        .modelContainer(for: Track.self)
    }
}
