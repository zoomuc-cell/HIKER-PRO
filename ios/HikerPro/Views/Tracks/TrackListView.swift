import SwiftUI
import SwiftData

struct TrackListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Track.startDate, order: .reverse) private var tracks: [Track]

    var body: some View {
        NavigationStack {
            List {
                ForEach(tracks) { track in
                    NavigationLink(value: track) {
                        TrackRow(track: track)
                    }
                }
                .onDelete(perform: delete)
            }
            .navigationTitle("Tracks")
            .navigationDestination(for: Track.self) { track in
                TrackDetailView(track: track)
            }
            .toolbar {
                if !tracks.isEmpty {
                    EditButton()
                }
            }
            .overlay {
                if tracks.isEmpty {
                    ContentUnavailableView(
                        "No Tracks Yet",
                        systemImage: "map",
                        description: Text("Start a hike on the Record tab. Saved tracks appear here.")
                    )
                }
            }
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(tracks[index])
        }
        try? modelContext.save()
    }
}

struct TrackRow: View {
    let track: Track

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(track.name)
                .font(.headline)
            Text(track.startDate, format: .dateTime.year().month().day().hour().minute())
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 14) {
                Label(Fmt.distance(track.distance), systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                Label(Fmt.duration(track.movingTime), systemImage: "clock")
                Label(Fmt.altitude(track.elevationGain), systemImage: "arrow.up.right")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .labelStyle(.titleAndIcon)
        }
        .padding(.vertical, 4)
    }
}
