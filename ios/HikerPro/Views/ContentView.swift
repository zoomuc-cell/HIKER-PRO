import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            RecordView()
                .tabItem { Label("Record", systemImage: "figure.hiking") }
            TrackListView()
                .tabItem { Label("Tracks", systemImage: "list.bullet.rectangle") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

#Preview {
    ContentView()
        .environment(LocationManager())
        .environment(TrackRecorder(locationManager: LocationManager()))
        .modelContainer(for: Track.self, inMemory: true)
}
