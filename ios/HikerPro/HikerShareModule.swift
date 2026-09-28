import Foundation
import UIKit
import React

/**
 * HIKERPRO iOS 공유 모듈 (Android HikerShareModule.kt 와 같은 JS 인터페이스)
 * - shareText: 텍스트 공유 (UIActivityViewController)
 * - shareImage: 이미지 1장 + 선택 텍스트 공유
 * - copyText: 클립보드 복사
 * - composeActivityCard: 지도 이미지 아래에 활동 요약 카드를 그려 PNG 1장으로 합성
 *
 * 앱 샌드박스(Documents / Library / tmp) 안의 파일만 공유한다.
 */
@objc(HikerShare)
final class HikerShareModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - shareText

  @objc(shareText:title:resolver:rejecter:)
  func shareText(
    _ message: String?,
    title: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let text = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !text.isEmpty else {
      reject("E_EMPTY", "공유할 내용이 없습니다.", nil)
      return
    }
    DispatchQueue.main.async {
      let items: [Any] = [ShareTextItem(text: text, subject: title)]
      if self.presentShareSheet(items: items) {
        resolve(true)
      } else {
        reject("E_NO_APP", "공유 화면을 열 수 없습니다.", nil)
      }
    }
  }

  // MARK: - shareImage

  @objc(shareImage:message:title:resolver:rejecter:)
  func shareImage(
    _ path: String?,
    message: String?,
    title: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let rawPath = path?.trimmingCharacters(in: .whitespaces), !rawPath.isEmpty,
          rawPath.hasPrefix("file://") || rawPath.hasPrefix("/") else {
      reject("E_INVALID_PATH", "올바른 파일 경로가 아닙니다.", nil)
      return
    }
    guard let fileURL = fileURL(from: rawPath), fileExists(fileURL) else {
      reject("E_FILE_NOT_FOUND", "파일을 찾을 수 없습니다.", nil)
      return
    }
    guard isInsideAppSandbox(fileURL) else {
      reject("E_PATH_NOT_ALLOWED", "앱 내부 파일만 공유할 수 있습니다.", nil)
      return
    }

    let ext = fileURL.pathExtension.lowercased()
    let mime: String
    switch ext {
    case "jpg", "jpeg": mime = "image/jpeg"
    case "png": mime = "image/png"
    default: mime = "image/*"
    }

    let text = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    DispatchQueue.main.async {
      var items: [Any] = [fileURL]
      if !text.isEmpty {
        items.append(ShareTextItem(text: text, subject: title))
      }
      guard self.presentShareSheet(items: items) else {
        reject("E_NO_APP", "공유 화면을 열 수 없습니다.", nil)
        return
      }
      resolve([
        "filePath": fileURL.path,
        "contentUri": fileURL.absoluteString,
        "mimeType": mime,
        "textAttached": !text.isEmpty,
      ])
    }
  }

  // MARK: - copyText

  @objc(copyText:label:resolver:rejecter:)
  func copyText(
    _ text: String?,
    label: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let value = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !value.isEmpty else {
      reject("E_EMPTY", "복사할 내용이 없습니다.", nil)
      return
    }
    DispatchQueue.main.async {
      UIPasteboard.general.string = value
      resolve(true)
    }
  }

  // MARK: - composeActivityCard

  /// 지도 snapshot PNG 아래에 활동 요약 카드를 그려 이미지 1장(PNG, Caches)으로 합성.
  /// 레이아웃과 색상은 Android 버전과 같다. rows: [{label, value}]
  @objc(composeActivityCard:title:rows:footer:resolver:rejecter:)
  func composeActivityCard(
    _ mapPath: String?,
    title: String?,
    rows: [Any]?,
    footer: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let mapPath, let source = fileURL(from: mapPath), fileExists(source),
          isInsideAppSandbox(source) else {
      reject("E_FILE_NOT_FOUND", "지도 이미지 파일을 찾을 수 없습니다.", nil)
      return
    }
    guard let map = UIImage(contentsOfFile: source.path), let mapCG = map.cgImage else {
      reject("E_COMPOSE", "지도 이미지를 읽지 못했습니다.", nil)
      return
    }

    // 행 데이터 (최대 10행, 길이 제한)
    var items: [(String, String)] = []
    for case let row as [String: Any] in (rows ?? []).prefix(10) {
      let label = String(((row["label"] as? String) ?? "").trimmingCharacters(in: .whitespaces).prefix(20))
      let value = String(((row["value"] as? String) ?? "").trimmingCharacters(in: .whitespaces).prefix(60))
      if !label.isEmpty && !value.isEmpty {
        items.append((label, value))
      }
    }

    let width = CGFloat(mapCG.width)
    let mapHeight = CGFloat(mapCG.height)
    let s = width / 1080
    let pad = 48 * s
    let headerH = 150 * s
    let rowH = 76 * s
    let footerText = String((footer ?? "").trimmingCharacters(in: .whitespaces).prefix(60))
    let footerH: CGFloat = footerText.isEmpty ? 0 : 90 * s
    let bodyH = pad * 0.8 + CGFloat(items.count) * rowH + footerH + pad * 0.6
    let size = CGSize(width: width, height: (headerH + mapHeight + bodyH).rounded())

    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: format)

    let image = renderer.image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))

      // 상단 브랜드 바
      UIColor(hex: 0x173D2A).setFill()
      context.fill(CGRect(x: 0, y: 0, width: width, height: headerH))
      let brandFont = UIFont.systemFont(ofSize: 28 * s, weight: .bold)
      drawText("HIKERPRO", font: brandFont, color: UIColor(hex: 0xB8D7C0), x: pad, baseline: 56 * s,
               maxWidth: width - pad * 2, kern: 28 * s * 0.15)
      let titleText = String(((title ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        ? "HIKERPRO 활동 기록" : title!.trimmingCharacters(in: .whitespaces)).prefix(40))
      drawText(titleText, font: UIFont.systemFont(ofSize: 48 * s, weight: .bold), color: .white,
               x: pad, baseline: 118 * s, maxWidth: width - pad * 2)

      // 지도
      map.draw(in: CGRect(x: 0, y: headerH, width: width, height: mapHeight))

      // 요약 행
      let labelFont = UIFont.systemFont(ofSize: 34 * s)
      let valueFont = UIFont.systemFont(ofSize: 40 * s, weight: .bold)
      let labelW = width * 0.32
      var y = headerH + mapHeight + pad * 0.8
      for (index, item) in items.enumerated() {
        let baseline = y + rowH * 0.64
        drawText(item.0, font: labelFont, color: UIColor(hex: 0x607D8B), x: pad, baseline: baseline,
                 maxWidth: labelW - 8 * s)
        drawText(item.1, font: valueFont, color: UIColor(hex: 0x263238), x: pad + labelW, baseline: baseline,
                 maxWidth: width - pad * 2 - labelW)
        if index < items.count - 1 {
          UIColor(hex: 0xEEF2EE).setFill()
          context.fill(CGRect(x: pad, y: y + rowH - s, width: width - pad * 2, height: 2 * s))
        }
        y += rowH
      }

      // 하단 문구
      if !footerText.isEmpty {
        let top = y + pad * 0.3
        UIColor(hex: 0xE8F5E9).setFill()
        UIBezierPath(roundedRect: CGRect(x: pad, y: top, width: width - pad * 2, height: 70 * s),
                     cornerRadius: 20 * s).fill()
        drawText(footerText, font: UIFont.systemFont(ofSize: 30 * s, weight: .bold), color: UIColor(hex: 0x2E7D32),
                 x: pad * 1.6, baseline: top + 46 * s, maxWidth: width - pad * 4)
      }
    }

    guard let data = image.pngData() else {
      reject("E_COMPOSE", "요약 이미지를 만들지 못했습니다.", nil)
      return
    }
    let millis = Int(Date().timeIntervalSince1970 * 1000)
    let target = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("hikerpro_activity_\(millis).png")
    do {
      try data.write(to: target, options: .atomic)
      resolve(target.absoluteString)
    } catch {
      reject("E_COMPOSE", "요약 이미지를 만들지 못했습니다.", error)
    }
  }

  // MARK: - Helpers

  /// 한 줄 텍스트를 baseline 기준으로 그림. 폭을 넘으면 말줄임표로 자름.
  private func drawText(_ text: String, font: UIFont, color: UIColor, x: CGFloat, baseline: CGFloat,
                        maxWidth: CGFloat, kern: CGFloat = 0) {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byTruncatingTail
    var attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: style,
    ]
    if kern != 0 {
      attributes[.kern] = kern
    }
    let rect = CGRect(x: x, y: baseline - font.ascender, width: max(0, maxWidth), height: font.lineHeight)
    (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                            attributes: attributes, context: nil)
  }

  private func fileURL(from path: String) -> URL? {
    let trimmed = path.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("file://") {
      return URL(string: trimmed) ?? URL(fileURLWithPath: String(trimmed.dropFirst("file://".count)).removingPercentEncoding ?? "")
    }
    if trimmed.hasPrefix("/") {
      return URL(fileURLWithPath: trimmed)
    }
    return nil
  }

  private func fileExists(_ url: URL) -> Bool {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
      return false
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    return size > 0
  }

  /// Documents, Library(Caches 포함), tmp 아래 파일만 허용
  private func isInsideAppSandbox(_ url: URL) -> Bool {
    let filePath = url.standardizedFileURL.resolvingSymlinksInPath().path
    let fm = FileManager.default
    let roots = [
      fm.urls(for: .documentDirectory, in: .userDomainMask).first,
      fm.urls(for: .libraryDirectory, in: .userDomainMask).first,
      URL(fileURLWithPath: NSTemporaryDirectory()),
    ].compactMap { $0?.standardizedFileURL.resolvingSymlinksInPath().path }
    return roots.contains { root in
      let prefix = root.hasSuffix("/") ? root : root + "/"
      return filePath.hasPrefix(prefix)
    }
  }

  /// 현재 화면 위에 공유 시트를 띄움. iPad 에서는 화면 중앙의 팝오버로 표시.
  private func presentShareSheet(items: [Any]) -> Bool {
    guard let presenter = RCTPresentedViewController() else {
      return false
    }
    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
    if let popover = controller.popoverPresentationController {
      popover.sourceView = presenter.view
      popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    presenter.present(controller, animated: true)
    return true
  }
}

/// 공유 텍스트 + 메일 등에서 쓰이는 제목
private final class ShareTextItem: NSObject, UIActivityItemSource {
  private let text: String
  private let subject: String?

  init(text: String, subject: String?) {
    self.text = text
    self.subject = subject
  }

  func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any {
    text
  }

  func activityViewController(_ activityViewController: UIActivityViewController,
                              itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
    text
  }

  func activityViewController(_ activityViewController: UIActivityViewController,
                              subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
    subject ?? ""
  }
}

private extension UIColor {
  convenience init(hex: UInt32) {
    self.init(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
}
