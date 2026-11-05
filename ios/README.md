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
| 기록 중 화면 꺼짐 | 포그라운드 서비스(상단 '활동 기록 중' 알림) | 백그라운드 위치 모드 (상태 막대 파란색 표시) |
| 5일 이용권 | 관리되는 인앱 상품 (구매 후 소비) | 비갱신형 구독 (구매 복원 가능) |

## App Store 심사 관련 주의사항

- **멤버십(월간/연간 Pro, 관광객 이용권)**: `react-native-iap`(StoreKit / Play 결제)로 판매합니다 (가이드라인 3.1.1).
  App Store Connect에 아래 상품을 같은 ID로 만들어야 합니다.
  - 자동 갱신 구독(같은 구독 그룹 하나에): `hikerpro_pro_monthly`(1개월), `hikerpro_pro_yearly`(1년)
  - **비갱신형 구독(Non-Renewing Subscription)**: `hikerpro_tourist_pass` — 소모성(Consumable)으로 만들면 안 됩니다.
    기간이 정해진 이용권은 Apple 규정상 비갱신형 구독이어야 하고, 한 번 만든 상품의 유형은 바꿀 수 없습니다.
    앱은 구매 시각 + 5일로 만료를 계산하며, 재설치·기기 변경 뒤 '구매 복원'으로 남은 기간이 되살아납니다.
  - Android는 구독 `hikerpro_pro`(기본 요금제 `monthly`, `yearly`)와 인앱 상품 `hikerpro_tourist_pass`
  - 서버 영수증 검증은 없으며, 구독 상태는 앱 시작·구매 복원 때 스토어에서 다시 확인합니다 (`src/services/ProService.ts`).
  - 스토어 연결에 실패하면 프로필의 멤버십 카드와 결제 창에 '다시 시도' 버튼이 나옵니다.
  - 결제 화면에 자동 갱신 안내, 구매 복원, 개인정보처리방침, Apple 표준 이용약관(EULA) 링크가 있습니다. App Store Connect 앱 설명에도 EULA 링크를 넣으세요.
- **예시 데이터 화면 제거**: 맛집·쿠폰 탭(가상의 가게·전화번호·쿠폰)은 출시 버전에서 뺐습니다 (가이드라인 2.1, 2.3). 실제 제휴 데이터가 생기면 `App.tsx`에 다시 넣으세요. QR 스캐너(react-native-camera)도 iOS에 넣지 않아 마이크 권한 문구가 필요 없습니다.
- **숨겨진 관리자 화면 제거**: 결제 없이 Pro를 켜던 관리자 화면은 지웠습니다. 결제 테스트는 TestFlight 샌드박스 계정으로 하세요.
- **App Store Connect 개인정보 항목**: 데이터가 기기 밖으로 전송되지 않으므로 "데이터를 수집하지 않음"을 선택할 수 있습니다.
- **심사 메모**: "Location is used in the background only while the user is recording an activity started with the Start button on the Activity tab. It stops when the activity ends. No account or login is required. Pro features can be bought with the in-app purchases in Profile > Membership."
- **개인정보처리방침 URL**: `https://zoomuc-cell.github.io/HIKER-PRO/privacy_policy.html` (PR #1을 main에 병합해야 새 내용이 반영됩니다)
- **앱 아이콘**: `Images.xcassets/AppIcon.appiconset/AppIcon-1024.png` (1024×1024, 투명 배경 없이)

## TestFlight 자동 업로드

GitHub → **Actions → iOS build → Run workflow** 에서 **testflight**를 체크하고 실행하면, 시뮬레이터 빌드 확인 뒤
서명된 빌드를 만들어 App Store Connect(TestFlight)에 올립니다. 빌드 번호는 실행할 때마다 자동으로 커집니다.

처음 한 번, 저장소 **Settings → Secrets and variables → Actions**에 아래 4개를 넣어야 합니다 (WEEKLINE과 같은 값을 써도 됩니다).

| 이름 | 값 |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer 팀 ID (developer.apple.com → Membership, 10자리) |
| `ASC_KEY_ID` | App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API 키의 키 ID (**관리** 역할) |
| `ASC_ISSUER_ID` | 같은 화면 위쪽의 Issuer ID |
| `ASC_KEY_P8` | 내려받은 `AuthKey_XXXX.p8` 파일 내용 전체 |

App Store Connect에 번들 ID `com.hikerpro.app`로 앱이 먼저 만들어져 있어야 합니다.

## Codemagic으로 TestFlight 올리기 (맥 없이, 클릭으로)

저장소 루트의 `codemagic.yaml` 이 설정 파일입니다 (워크플로 이름 **HIKER PRO iOS → TestFlight**).
위의 GitHub Actions 방법과 둘 중 **한 가지만** 쓰세요. 빌드 번호를 따로 세기 때문에 Codemagic으로 올린 뒤
GitHub Actions로 올리면 번호가 더 작아 거절될 수 있습니다.

> 아이폰 코드(`ios/` 폴더)는 아직 main에 없습니다 (PR #1·#2 병합 전). 병합 전에는 Codemagic에서 브랜치를
> `claude/project-thread-gw3dis` 로 골라야 하고, main으로 빌드하면 "ios/ folder is missing" 오류가 납니다.

**준비 (한 번만)** — WEEKLINE에서 이미 한 단계는 건너뛰어도 됩니다.

1. **번들 ID 등록**: developer.apple.com › Certificates, Identifiers & Profiles › Identifiers › **+** › App IDs › App ›
   설명 `Hiker Pro`, Bundle ID(Explicit) `com.hikerpro.app` › **In-App Purchase** 체크 확인 › 등록.
2. **App Store Connect에 앱 만들기**: 앱 › **+** › 신규 앱 › 플랫폼 iOS, 이름 Hiker Pro(이미 쓰는 이름이면 HIKER PRO 등산 기록 처럼),
   기본 언어 한국어, 번들 ID `com.hikerpro.app`, SKU `hikerpro`. 만든 뒤 **앱 정보**의 **Apple ID**(숫자)를 적어 둡니다.
3. **API 키**: Codemagic에 등록된 키 **`N8CMWWQ693`** 을 그대로 씁니다 (같은 Apple 팀이면 모든 앱에 쓸 수 있음). 키를 새로 넣어 이름이 바뀌면 `codemagic.yaml` 의 `app_store_connect:` 값도 같은 이름으로 바꿔야 합니다.
   아직 없다면 App Store Connect › 사용자 및 액세스 › **통합** › App Store Connect API › **팀 키** › **+** (액세스 **관리자**)로 만들고,
   Codemagic 왼쪽 **Settings › Integrations › Developer Portal › Connect** 에서 Issuer ID, Key ID, `.p8` 파일을 넣습니다.
4. **Codemagic 환경 변수**: Applications › HIKER-PRO › **Environment variables**
   - Variable name `CERTIFICATE_PRIVATE_KEY`, Value는 NOWHERE·WEEKLINE 에 넣은 것과 같은 키 파일 내용 전체(같은 키를 쓰면 배포 인증서를 하나로 같이 씀),
     Group `hikerpro_signing`, **Secret** 체크 › Add
     - 윈도우에서 복사해 줄바꿈이 깨졌거나 BEGIN/END 줄이 빠져도 빌드가 `ci/normalize_cert_key.py` 로 정리하니 그대로 넣어도 됩니다.
     - 키 파일이 없다면 윈도우 PowerShell 에서 `ssh-keygen -t rsa -b 2048 -m PEM -f hikerpro_cert_key -q -N '""'` 로 만들고 그 내용을 넣습니다.
   - (권장) Variable name `APP_STORE_APPLE_ID`, Value는 2번의 Apple ID 숫자, Group `hikerpro_signing` › Add

**빌드할 때마다**

5. HIKER-PRO 화면 위의 **Branch** 를 고르고(병합 전: `claude/project-thread-gw3dis`, 병합 후: `main`) 오른쪽 위 **Check for configuration files** 를 누릅니다.
   `codemagic.yaml` 내용이 보이면 **Start new build** › 같은 브랜치, 워크플로 **HIKER PRO iOS → TestFlight** › Start.
   GitHub에서 `ios-1.3.0` 처럼 `ios-` 로 시작하는 태그를 만들어도 자동으로 시작합니다.
6. 30~40분 뒤 빌드가 초록색이 되면 App Store Connect › TestFlight 에 새 빌드가 나타납니다 (Apple 처리에 10~30분 더 걸림).
   수출 규정(암호화) 질문은 Info.plist 에 미리 답해 두어서 따로 묻지 않습니다.

- 인증서와 배포용 프로비저닝 프로파일은 첫 빌드 때 Codemagic이 Apple 쪽에 자동으로 만들고, 다음부터는 같은 것을 씁니다.
- 빌드 번호는 매번 자동으로 올라갑니다. 버전(1.3.0)은 Xcode 프로젝트의 `MARKETING_VERSION` 입니다.
- 실패하면 빌드 화면에서 빨간 단계의 로그를 그대로 보내 주세요.
