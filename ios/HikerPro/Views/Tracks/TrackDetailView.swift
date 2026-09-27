import SwiftUI
import SwiftData

struct TrackDetailView: View {
    @Bindable var track: Track
    @AppStorage(MapStyleOption.storageKey) private var mapStyle: MapStyleOption = .standard

    @State private var points: [TrackPoint] = []
    @State private var profile: [ElevationSample] = []
    @State private var exportURLs: [TrackExportFormat: URL] = [:]
    @State private var isRenaming = false
    @State private var draftName = ""

    var body: some View {
        if track.isDeleted || track.modelContext == nil {
            ContentUnavailableView("Track Deleted", systemImage: "trash")
        } else {
            content
        }
    }

    private var content: some View {
        List {
            Section {
                Group {
                    if points.isEmpty {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        TrackMapView(points: points, style: mapStyle.mapStyle)
                    }
                }
                .frame(height: 280)
                .listRowInsets(EdgeInsets())
            }

            Section("Summary") {
                LabeledContent("Date", value: track.startDate.formatted(date: .long, time: .shortened))
                LabeledContent("Distance", value: Fmt.distance(track.distance))
                LabeledContent("Moving Time", value: Fmt.duration(track.movingTime))
                LabeledContent("Avg Speed", value: Fmt.speed(track.averageSpeed))
                LabeledContent("Ascent", value: Fmt.altitude(track.elevationGain))
                LabeledContent("Descent", value: Fmt.altitude(track.elevationLoss))
                if let maxAltitude = track.maxAltitude {
                    LabeledContent("Highest Point", value: Fmt.altitude(maxAltitude))
                }
                if let minAltitude = track.minAltitude {
                    LabeledContent("Lowest Point", value: Fmt.altitude(minAltitude))
                }
            }

            if profile.count > 1 {
                Section("Elevation Profile") {
                    ElevationChart(samples: profile)
                        .frame(height: 200)
                        .padding(.vertical, 8)
                }
            }
        }
        .navigationTitle(track.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Rename", systemImage: "pencil") {
                        draftName = track.name
                        isRenaming = true
                    }
                    if let url = exportURLs[.gpx] {
                        ShareLink(item: url) {
                            Label("Export GPX", systemImage: "square.and.arrow.up")
                        }
                    }
                    if let url = exportURLs[.kml] {
                        ShareLink(item: url) {
                            Label("Export KML", systemImage: "square.and.arrow.up")
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .alert("Rename Track", isPresented: $isRenaming) {
            TextField("Name", text: $draftName)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                let trimmed = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    track.name = trimmed
                }
            }
        }
        .task(id: track.name) {
            if points.isEmpty {
                points = track.points
                profile = points.elevationProfile()
            }
            var urls: [TrackExportFormat: URL] = [:]
            for format in TrackExportFormat.allCases {
                urls[format] = try? TrackExporter.writeFile(
                    name: track.name,
                    startDate: track.startDate,
                    points: points,
                    format: format
                )
            }
            exportURLs = urls
        }
    }
}
