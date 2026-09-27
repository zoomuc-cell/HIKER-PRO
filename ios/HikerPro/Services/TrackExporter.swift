import Foundation

enum TrackExportFormat: String, CaseIterable, Identifiable {
    case gpx, kml

    var id: String { rawValue }
    var fileExtension: String { rawValue }
}

/// Writes tracks as GPX 1.1 or KML 2.2 files for sharing.
enum TrackExporter {
    static func writeFile(name: String, startDate: Date, points: [TrackPoint], format: TrackExportFormat) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("Exports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory
            .appendingPathComponent(safeFileName(name))
            .appendingPathExtension(format.fileExtension)
        let document = switch format {
        case .gpx: gpx(name: name, startDate: startDate, points: points)
        case .kml: kml(name: name, startDate: startDate, points: points)
        }
        try document.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    static func gpx(name: String, startDate: Date, points: [TrackPoint]) -> String {
        let iso = ISO8601DateFormatter()
        var xml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="HIKER PRO for iOS" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
          <metadata>
            <name>\(escape(name))</name>
            <time>\(iso.string(from: startDate))</time>
          </metadata>
          <trk>
            <name>\(escape(name))</name>

        """
        for segment in points.segmented() {
            xml += "    <trkseg>\n"
            for point in segment {
                xml += "      <trkpt lat=\"\(coordinate(point.latitude))\" lon=\"\(coordinate(point.longitude))\">"
                if point.hasValidAltitude {
                    xml += "<ele>\(String(format: "%.1f", point.altitude))</ele>"
                }
                xml += "<time>\(iso.string(from: point.timestamp))</time></trkpt>\n"
            }
            xml += "    </trkseg>\n"
        }
        xml += "  </trk>\n</gpx>\n"
        return xml
    }

    static func kml(name: String, startDate: Date, points: [TrackPoint]) -> String {
        let iso = ISO8601DateFormatter()
        var xml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Document>
            <name>\(escape(name))</name>
            <Style id="track">
              <LineStyle><color>ff0080ff</color><width>4</width></LineStyle>
            </Style>
            <Placemark>
              <name>\(escape(name))</name>
              <TimeSpan><begin>\(iso.string(from: startDate))</begin><end>\(iso.string(from: points.last?.timestamp ?? startDate))</end></TimeSpan>
              <styleUrl>#track</styleUrl>
              <MultiGeometry>

        """
        for segment in points.segmented() {
            let coordinates = segment.map { point in
                "\(coordinate(point.longitude)),\(coordinate(point.latitude)),\(String(format: "%.1f", point.hasValidAltitude ? point.altitude : 0))"
            }
            xml += """
                    <LineString>
                      <tessellate>1</tessellate>
                      <altitudeMode>clampToGround</altitudeMode>
                      <coordinates>\(coordinates.joined(separator: " "))</coordinates>
                    </LineString>

            """
        }
        xml += """
              </MultiGeometry>
            </Placemark>
          </Document>
        </kml>

        """
        return xml
    }

    static func safeFileName(_ name: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\?%*|\"<>:")
            .union(.newlines)
            .union(.controlCharacters)
        let cleaned = name.components(separatedBy: invalid)
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? "HIKER PRO Track" : String(cleaned.prefix(80))
    }

    /// Locale-independent decimal formatting.
    private static func coordinate(_ value: Double) -> String {
        String(format: "%.7f", value)
    }

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }
}
