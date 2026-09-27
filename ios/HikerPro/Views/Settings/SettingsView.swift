import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(LocationManager.self) private var locationManager
    @Environment(\.modelContext) private var modelContext
    @Environment(\.openURL) private var openURL
    @AppStorage(MapStyleOption.storageKey) private var mapStyle: MapStyleOption = .standard
    @State private var isConfirmingDeleteAll = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Location Access") {
                        Text(authorizationText)
                    }
                    LabeledContent("Precise Location") {
                        Text(locationManager.hasFullAccuracy ? "On" : "Off")
                    }
                    Button("Open iOS Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            openURL(url)
                        }
                    }
                } header: {
                    Text("Location")
                } footer: {
                    Text("Location is used in the background only while a hike is being recorded. iOS shows a blue indicator whenever this happens.")
                }

                Section("Map") {
                    Picker("Map Style", selection: $mapStyle) {
                        ForEach(MapStyleOption.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                }

                Section {
                    Button("Delete All Tracks", role: .destructive) {
                        isConfirmingDeleteAll = true
                    }
                } header: {
                    Text("Data")
                } footer: {
                    Text("All tracks are stored only on this device and are never uploaded. Deleting the app also deletes all of its data.")
                }

                Section("About") {
                    LabeledContent("Version", value: AppConfig.version)
                    Link("Privacy Policy", destination: AppConfig.privacyPolicyURL)
                    Link("Contact Us", destination: AppConfig.supportEmailURL)
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Delete all tracks?", isPresented: $isConfirmingDeleteAll, titleVisibility: .visible) {
                Button("Delete All Tracks", role: .destructive) {
                    deleteAllTracks()
                }
            } message: {
                Text("This permanently deletes every saved track. This can't be undone.")
            }
        }
    }

    /// Deletes each model individually (rather than a batch delete) so that any
    /// open detail view sees `isDeleted` and stops reading the model.
    private func deleteAllTracks() {
        let tracks = (try? modelContext.fetch(FetchDescriptor<Track>())) ?? []
        for track in tracks {
            modelContext.delete(track)
        }
        try? modelContext.save()
    }

    private var authorizationText: LocalizedStringKey {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: "Allowed"
        case .denied: "Denied"
        case .restricted: "Restricted"
        case .notDetermined: "Not Set"
        @unknown default: "Unknown"
        }
    }
}
