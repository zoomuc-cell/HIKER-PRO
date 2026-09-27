# HIKER PRO for iOS

SwiftUI로 작성한 네이티브 iPhone/iPad 앱입니다. 외부 라이브러리 없이 Apple 기본 프레임워크만 사용합니다.

| 기능 | 구현 |
| --- | --- |
| 실시간 위치 · 지도 | Core Location, MapKit for SwiftUI (Apple 지도: 기본/하이브리드/위성, 3D 지형) |
| 산행 기록 (백그라운드 포함) | `CLBackgroundActivitySession` + "앱을 사용하는 동안" 권한만 사용 |
| 거리 · 시간 · 평균 속도 · 오르막/내리막 · 최고/최저 고도 | GPS 정확도 필터와 고도 노이즈 필터 적용 |
| 일시정지 / 재개 | 일시정지 구간은 거리와 지도 경로에서 제외 |
| 기록 목록 · 상세 · 이름 변경 · 삭제 | SwiftData (기기 내부에만 저장) |
| 고도 프로필 그래프 | Swift Charts |
| GPX 1.1 / KML 2.2 내보내기 | iOS 공유 시트 (`ShareLink`) |
| 비상 위치 공유 | 좌표 복사, 사용자가 선택한 상대에게만 공유, 지역별 긴급 전화(119/112/911 등) |
| 한국어 / 영어 | String Catalog (`Localizable.xcstrings`, `InfoPlist.xcstrings`) |
| 단위 | 기기 지역 설정에 따라 km·m / mi·ft 자동 전환 |

## 요구 사항

- Xcode 16 이상 (macOS)
- iOS / iPadOS 17.0 이상

## 빌드 및 실행

1. `ios/HikerPro.xcodeproj`를 Xcode로 엽니다.
2. **HikerPro** 타깃 → **Signing & Capabilities**에서 본인의 Team을 선택합니다.
   필요하면 Bundle Identifier(`app.hikerpro.ios`)를 본인 소유의 값으로 바꿉니다.
3. 실제 iPhone을 연결하고 Run(⌘R)을 누릅니다.
   시뮬레이터에서는 **Features → Location → City Run / Freeway Drive** 또는 GPX 파일로 이동을 흉내 낼 수 있습니다.

## 폴더 구조

```
ios/
├── HikerPro.xcodeproj
└── HikerPro/
    ├── App/            앱 진입점, 설정 상수 (개인정보처리방침 URL 등)
    ├── Models/         Track(SwiftData), TrackPoint, 통계 계산
    ├── Services/       LocationManager, TrackRecorder, GPX/KML 내보내기
    ├── Support/        단위 포맷, 지도 스타일, 비상 정보
    ├── Views/          Record / Tracks / Settings 화면
    ├── Resources/      Assets, String Catalog, PrivacyInfo.xcprivacy
    └── Info.plist      위치 권한 문구, 백그라운드 위치 모드
```

## Apple 규격 대응 사항

- **권한 최소화**: "항상 허용"을 요청하지 않고 "앱을 사용하는 동안"만 요청합니다. 백그라운드 기록은 iOS 17의
  `CLBackgroundActivitySession`으로 유지되며 상태 막대에 파란색 표시가 나타납니다(App Review 가이드라인 5.1.1, 2.5.4).
- **권한 요청 전 안내**: 시스템 팝업 전에 위치가 필요한 이유를 화면에 먼저 설명하고, 거부된 경우 설정으로 이동하는 버튼을 제공합니다.
- **정확한 위치**: 대략적인 위치만 허용된 경우 `NSLocationTemporaryUsageDescriptionDictionary`로 일시적 정확한 위치를 요청합니다.
- **Privacy Manifest** (`PrivacyInfo.xcprivacy`): 추적 없음, 수집 데이터 없음, `UserDefaults` 사용 사유(CA92.1) 선언.
- **암호화 수출 규정**: `ITSAppUsesNonExemptEncryption = NO` 설정으로 매 업로드마다 묻는 질문을 생략합니다.
- **데이터 삭제**: 앱 내에서 개별 기록 및 전체 기록 삭제를 지원합니다.
- **접근성 · 다크 모드 · Dynamic Type · iPad 멀티태스킹**: 시스템 컴포넌트와 SF Symbols를 사용해 기본 지원합니다.

## App Store 제출 체크리스트

- [ ] Apple Developer Program 가입 후 App Store Connect에 앱 등록 (Bundle ID 일치 확인)
- [ ] 개인정보처리방침 URL 등록 — 이 저장소에서 **GitHub Pages**를 켜면
      `https://zoomuc-cell.github.io/HIKER-PRO/privacy_policy.html` 로 접근할 수 있습니다.
      다른 주소를 사용한다면 `App/AppConfig.swift`의 `privacyPolicyURL`도 함께 바꾸세요.
- [ ] **앱 개인정보 보호(App Privacy)** 항목: **"데이터를 수집하지 않음(Data Not Collected)"**
      (모든 위치 데이터는 기기 밖으로 전송되지 않으므로 Apple 기준상 "수집"에 해당하지 않습니다.)
- [ ] 연령 등급 설문 작성, 카테고리: 내비게이션 또는 건강 및 피트니스
- [ ] 스크린샷: 6.9" iPhone, 13" iPad (iPad를 지원하지 않으려면 `TARGETED_DEVICE_FAMILY`를 `1`로 변경)
- [ ] App Review 메모 예시:
      "The app records hiking routes. Background location is used only while the user is actively recording a hike
      (started with the Start Hike button) and stops when the hike is paused or finished."
- [ ] 앱 아이콘(`Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`)은 임시 디자인입니다. 1024×1024, 투명도 없는 PNG로 교체할 수 있습니다.
- [ ] Xcode → Product → Archive → Distribute App → App Store Connect 업로드

## 향후 확장 아이디어

- 기압계(`CMAltimeter`)를 이용한 더 정확한 고도 측정 (`NSMotionUsageDescription` 필요)
- 기록 중 잠금 화면 Live Activity
- 오프라인 지도 (MapKit은 기기 자체 오프라인 지도를 활용)
- Apple Watch 앱, HealthKit 운동 기록 저장
