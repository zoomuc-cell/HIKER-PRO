import SwiftUI
import MapKit

struct TrackMapView: View {
    let points: [TrackPoint]
    let style: MapStyle

    /// `.automatic` frames all map content, i.e. the whole route.
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $position) {
            ForEach(Array(points.segmentedCoordinates.enumerated()), id: \.offset) { _, coordinates in
                MapPolyline(coordinates: coordinates)
                    .stroke(.orange, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }
            if let first = points.first {
                Marker("Start", systemImage: "flag.fill", coordinate: first.coordinate)
                    .tint(.green)
            }
            if let last = points.last, points.count > 1 {
                Marker("Finish", systemImage: "flag.checkered", coordinate: last.coordinate)
                    .tint(.red)
            }
        }
        .mapStyle(style)
        .mapControls {
            MapCompass()
            MapPitchToggle()
            MapScaleView()
        }
    }
}
