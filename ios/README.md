# HIKER PRO — iOS

Android 앱과 **같은 React Native 코드**(`App.tsx`, `src/`)를 사용합니다.
이 `ios/` 폴더에는 iOS 전용 네이티브 프로젝트가 들어 있습니다.

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| `ios/HikerPro.xcodeproj` | Xcode 프로젝트 (직접 열지 말고 `pod install` 후 생기는 `HikerPro.xcworkspace`를 여세요) |
| `ios/Podfile` | iOS 라이브러리(CocoaPods) 목록, 권한 모듈 설정 |
| `ios/HikerPro/AppDelegate.swift` | 앱 시작, `hikerpro://plan/import` 딥링크 처리 |
| `ios/HikerPro/HikerShareModule.swift`, `.m` | Android `HikerShareModule.kt`의 iOS 버전 (텍스트·이미지 공유, 클립보드, 활동 요약 카드 합성) |
| `ios/HikerPro/Info.plist` | 권한 안내 문구, 백그라운드 위치, URL 스킴, 아이콘 폰트 |
| `ios/HikerPro/PrivacyInfo.xcprivacy` | Apple 개인정보 매니페스트 |
| `ios/HikerPro/Images.xcassets/AppIcon.appiconset` | 앱 아이콘 (Android 아이콘으로 만든 1024×1024) |
| `react-native.config.js` (루트) | iOS에서 쓰지 않는 네이티브 모듈 제외 |
| `.github/workflows/ios-build.yml` (루트) | GitHub의 Mac 서버에서 iOS 빌드를 자동 확인 |

## Mac에서 빌드하기

준비물: Mac, Xcode 16 이상, Node 18 이상, CocoaPods (`sudo gem install cocoapods` 또는 `brew install cocoapods`)

```bash
npm ci --legacy-peer-deps
cd ios
pod install
open HikerPro.xcworkspace
```

Xcode에서:
1. **HikerPro** 타깃 → **Signing & Capabilities** → Team 선택 (Apple Developer 계정)
2. 실제 iPhone을 연결하고 ▶︎ 실행
3. App Store 제출: 상단 기기를 **Any iOS Device**로 바꾸고 **Product → Archive → Distribute App**

## Android와 다른 점

| 항목 | Android | iOS |
| --- | --- | --- |
| 지도 | Google Maps (API 키 필요) | Apple 지도 (API 키 불필요) |
| 위치 권한 | 정밀 위치 + 백그라운드 위치 | "앱을 사용하는 동안"만 요청. 활동 기록 중에는 화면이 꺼져도 계속 기록되며 상태 막대에 파란색 표시 |
| 기록 중이 아닐 때 | — | 앱이 백그라운드로 가면 위치 수신을 멈춤 (배터리·심사 기준) |
| 공유 | ACTION_SEND 선택 창 | iOS 공유 시트 |
| 관리자 기기 ID | ANDROID_ID | identifierForVendor. 아이폰에서 프로필 사진을 1.5초 길게 누르면 "접근 거부" 창에 기기 ID가 표시되니, `src/screens/ProfileScreen.tsx`의 `ADMIN_DEVICE_IDS`에 추가하세요. 앱을 삭제 후 다시 설치하면 ID가 바뀝니다. |
| 멤버십 가격 안내 / 오프라인 지도·등산 히스토리 메뉴 | 표시 | 숨김 (아래 참고) |

## App Store 심사 관련 주의사항

- **멤버십(월간/연간 Pro, 관광객 이용권)**: iOS에서 디지털 이용권을 팔려면 **Apple 인앱 결제**를 써야 합니다 (가이드라인 3.1.1).
  현재 앱은 결제 없이 "신청"만 저장하므로 iOS에서는 멤버십 카드를 숨겼습니다. 판매하려면 StoreKit(`react-native-iap`) 연동이 필요합니다.
- **"준비 중" 기능**: 오프라인 지도·등산 히스토리 메뉴는 "준비 중" 안내만 있어 심사 거절 사유(2.1)가 되므로 iOS에서 숨겼습니다.
- **숨겨진 관리자 화면**: 프로필 사진 길게 누르기로 들어가는 관리자 화면은 등록된 기기에서만 열리지만, 심사에서 숨겨진 기능(2.3.1)으로 볼 수 있습니다. 출시 빌드에서는 제거를 권합니다.
- **App Store Connect 개인정보 항목**: 데이터가 기기 밖으로 전송되지 않으므로 "데이터를 수집하지 않음"을 선택할 수 있습니다.
- **심사 메모 예시**: "Background location is used only while the user is recording an activity started with the Start button on the Activity tab. It stops when the activity ends."
- **개인정보처리방침 URL**: `https://zoomuc-cell.github.io/HIKER-PRO/privacy_policy.html` (이 브랜치의 `privacy_policy.html`을 main에 병합해야 iOS 내용이 반영됩니다)
- **앱 아이콘**: Android 아이콘(432px)을 키워서 만들었습니다. 원본 고해상도(1024×1024) 파일이 있으면 교체하세요.
