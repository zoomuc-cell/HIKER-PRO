import SwiftUI
import Charts

struct ElevationChart: View {
    let samples: [ElevationSample]

    private var distanceUnit: UnitLength { Fmt.usesMetric ? .kilometers : .miles }
    private var altitudeUnit: UnitLength { Fmt.usesMetric ? .meters : .feet }

    private struct ChartPoint: Identifiable {
        let id: Int
        let x: Double
        let y: Double
    }

    /// Samples converted to the display units.
    private var chartPoints: [ChartPoint] {
        samples.map { sample in
            ChartPoint(
                id: sample.id,
                x: Measurement(value: sample.distance, unit: UnitLength.meters).converted(to: distanceUnit).value,
                y: Measurement(value: sample.altitude, unit: UnitLength.meters).converted(to: altitudeUnit).value
            )
        }
    }

    var body: some View {
        let points = chartPoints
        let lowest = points.map(\.y).min() ?? 0
        let highest = points.map(\.y).max() ?? 0
        let padding = max(10, (highest - lowest) * 0.1)
        let floor = lowest - padding

        Chart(points) { point in
            AreaMark(
                x: .value("Distance", point.x),
                yStart: .value("Base", floor),
                yEnd: .value("Altitude", point.y)
            )
            .foregroundStyle(
                LinearGradient(colors: [.green.opacity(0.35), .green.opacity(0.05)], startPoint: .top, endPoint: .bottom)
            )
            LineMark(
                x: .value("Distance", point.x),
                y: .value("Altitude", point.y)
            )
            .foregroundStyle(.green)
        }
        .chartYScale(domain: floor...(highest + padding))
        .chartXAxisLabel(distanceUnit.symbol)
        .chartYAxisLabel(altitudeUnit.symbol)
        .accessibilityLabel(Text("Elevation profile"))
    }
}
