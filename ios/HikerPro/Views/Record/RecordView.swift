import SwiftUI
import MapKit
import SwiftData

struct RecordView: View {
    @Environment(LocationManager.self) private var locationManager
    @Environment(TrackRecorder.self) private var recorder
    @Environment(\.modelContext) private var modelContext
    @Environment(\.openURL) private var openURL
    @AppStorage(MapStyleOption.storageKey) private var mapStyle: MapStyleOption = .standard

    @State private var position: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var isConfirmingFinish = false
    @State private var isShowingEmergency = false
    @State private var isShowingTooShort = false

    var body: some View {
        NavigationStack {
            Map(position: $position) {
                UserAnnotation()
                ForEach(Array(recorder.segments.enumerated()), id: \.offset) { _, coordinates in
                    MapPolyline(coordinates: coordinates)
                        .stroke(.orange, style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
                }
            }
            .mapStyle(mapStyle.mapStyle)
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapPitchToggle()
                MapScaleView()
            }
            .safeAreaInset(edge: .top) {
                permissionBanner
            }
            .safeAreaInset(edge: .bottom) {
                RecordingPanel(isConfirmingFinish: $isConfirmingFinish)
            }
            .navigationTitle("HIKER PRO")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingEmergency = true
                    } label: {
                        Label("Emergency", systemImage: "sos.circle.fill")
                    }
                    .tint(.red)
                }
            }
            .sheet(isPresented: $isShowingEmergency) {
                EmergencyView()
            }
            .confirmationDialog("Finish this hike?", isPresented: $isConfirmingFinish, titleVisibility: .visible) {
                Button("Save Track") {
                    if recorder.finish(saveTo: modelContext) == nil {
                        isShowingTooShort = true
                    }
                }
                Button("Discard Track", role: .destructive) {
                    recorder.discard()
                }
                Button("Continue Recording", role: .cancel) {}
            }
            .alert("Track Not Saved", isPresented: $isShowingTooShort) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Not enough GPS points were recorded to save a track.")
            }
        }
    }

    @ViewBuilder
    private var permissionBanner: some View {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            PermissionCard(
                systemImage: "location.circle.fill",
                title: "Location Access Needed",
                message: "HIKER PRO uses your location to show where you are and to record your route. Your location never leaves this device.",
                actionTitle: "Allow Location Access"
            ) {
                locationManager.requestAuthorization()
            }
        case .denied, .restricted:
            PermissionCard(
                systemImage: "location.slash.fill",
                title: "Location Access Is Off",
                message: "Turn on location access for HIKER PRO in Settings to see your position and record hikes.",
                actionTitle: "Open Settings"
            ) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    openURL(url)
                }
            }
        default:
            if !locationManager.hasFullAccuracy {
                PermissionCard(
                    systemImage: "scope",
                    title: "Precise Location Is Off",
                    message: "Recorded routes and distances are much more accurate with Precise Location.",
                    actionTitle: "Turn On Precise Location"
                ) {
                    locationManager.requestFullAccuracy()
                }
            }
        }
    }
}
