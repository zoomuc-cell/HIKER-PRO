import SwiftUI
import UIKit

struct EmergencyView: View {
    @Environment(LocationManager.self) private var locationManager
    @Environment(\.dismiss) private var dismiss
    @State private var didCopy = false

    var body: some View {
        NavigationStack {
            List {
                Section("Current Position") {
                    if let location = locationManager.lastLocation {
                        LabeledContent("Coordinates", value: Fmt.coordinate(location.coordinate))
                            .textSelection(.enabled)
                        LabeledContent("Altitude", value: location.verticalAccuracy > 0 ? Fmt.altitude(location.altitude) : "—")
                        LabeledContent("Accuracy", value: "± " + Fmt.altitude(location.horizontalAccuracy))
                        LabeledContent("Updated", value: location.timestamp.formatted(date: .omitted, time: .standard))
                    } else {
                        ContentUnavailableView(
                            "Finding Your Location",
                            systemImage: "location.magnifyingglass",
                            description: Text("Waiting for a GPS fix. Move to an open area if you can.")
                        )
                    }
                }

                if let location = locationManager.lastLocation {
                    Section {
                        ShareLink(item: EmergencyInfo.message(for: location)) {
                            Label("Share My Location", systemImage: "square.and.arrow.up")
                        }
                        Button {
                            UIPasteboard.general.string = Fmt.coordinate(location.coordinate)
                            didCopy = true
                        } label: {
                            Label(didCopy ? "Copied" : "Copy Coordinates", systemImage: didCopy ? "checkmark" : "doc.on.doc")
                        }
                    } footer: {
                        Text("Your location is shared only with the people or apps you choose. HIKER PRO never sends it automatically.")
                    }
                }

                Section {
                    Link(destination: EmergencyInfo.phoneURL) {
                        Label("Call \(EmergencyInfo.phoneNumber)", systemImage: "phone.fill")
                            .foregroundStyle(.red)
                    }
                } footer: {
                    Text("You can also use Emergency SOS: press and hold the side button and either volume button.")
                }
            }
            .navigationTitle("Emergency")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
