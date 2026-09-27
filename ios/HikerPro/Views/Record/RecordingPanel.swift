import SwiftUI

struct RecordingPanel: View {
    @Environment(TrackRecorder.self) private var recorder
    @Environment(LocationManager.self) private var locationManager
    @Binding var isConfirmingFinish: Bool

    var body: some View {
        VStack(spacing: 16) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let elapsed = recorder.elapsedTime(at: context.date)
                Grid(horizontalSpacing: 12, verticalSpacing: 14) {
                    GridRow {
                        StatView(title: "Time", value: Fmt.duration(elapsed))
                        StatView(title: "Distance", value: Fmt.distance(recorder.stats.distance))
                        StatView(title: "Avg Speed", value: Fmt.speed(elapsed > 0 ? recorder.stats.distance / elapsed : 0))
                    }
                    GridRow {
                        StatView(title: "Altitude", value: currentAltitude)
                        StatView(title: "Ascent", value: Fmt.altitude(recorder.stats.elevationGain))
                        StatView(title: "Descent", value: Fmt.altitude(recorder.stats.elevationLoss))
                    }
                }
            }

            if recorder.state == .paused {
                Label("Paused", systemImage: "pause.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
            }

            controls
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal)
        .padding(.bottom, 8)
        .sensoryFeedback(.impact, trigger: recorder.state)
    }

    private var currentAltitude: String {
        guard let location = locationManager.lastLocation, location.verticalAccuracy > 0 else { return "—" }
        return Fmt.altitude(location.altitude)
    }

    @ViewBuilder
    private var controls: some View {
        switch recorder.state {
        case .idle:
            Button {
                recorder.start()
            } label: {
                Label("Start Hike", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!locationManager.isAuthorized)
        case .recording:
            HStack(spacing: 12) {
                Button {
                    recorder.pause()
                } label: {
                    Label("Pause", systemImage: "pause.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                finishButton
            }
            .controlSize(.large)
        case .paused:
            HStack(spacing: 12) {
                Button {
                    recorder.resume()
                } label: {
                    Label("Resume", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                finishButton
            }
            .controlSize(.large)
        }
    }

    private var finishButton: some View {
        Button {
            isConfirmingFinish = true
        } label: {
            Label("Finish", systemImage: "stop.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(.red)
    }
}

struct StatView: View {
    let title: LocalizedStringKey
    let value: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.weight(.semibold).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
