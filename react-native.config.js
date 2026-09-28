// iOS 에서 사용하지 않는 네이티브 모듈은 iOS 자동 링크에서 제외한다 (Android 빌드에는 영향 없음).
// - react-native-background-geolocation: JS 에서 사용하지 않음. iOS 에는 별도 라이선스/권한 설정이 필요
// - react-native-iap: JS 에서 사용하지 않음. iOS 버전은 react-native-nitro-modules 가 추가로 필요
// - react-native-sqlite-storage, @react-native-community/geolocation: JS 에서 사용하지 않음
module.exports = {
  dependencies: {
    'react-native-background-geolocation': {platforms: {ios: null}},
    'react-native-iap': {platforms: {ios: null}},
    'react-native-sqlite-storage': {platforms: {ios: null}},
    '@react-native-community/geolocation': {platforms: {ios: null}},
  },
};
