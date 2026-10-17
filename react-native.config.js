// iOS 에서 사용하지 않는 네이티브 모듈은 iOS 자동 링크에서 제외한다 (Android 빌드에는 영향 없음).
// - react-native-background-geolocation: JS 에서 사용하지 않음. iOS 에는 별도 라이선스/권한 설정이 필요
// - react-native-sqlite-storage, @react-native-community/geolocation: JS 에서 사용하지 않음
// - react-native-gesture-handler: JS 에서 사용하지 않음(@react-navigation/stack 미사용). 2.32 는 RN 0.87 iOS 에서 컴파일되지 않음
// @react-native-community/geolocation 은 Android 에서도 제외: 3.4 는 play-services-location 21 API 를 쓰는데
// 프로젝트가 tslocationmanager 때문에 20.0.0 으로 고정해 컴파일되지 않음 (위치는 react-native-geolocation-service 사용)
module.exports = {
  dependencies: {
    'react-native-background-geolocation': {platforms: {ios: null}},
    'react-native-sqlite-storage': {platforms: {ios: null}},
    '@react-native-community/geolocation': {platforms: {ios: null, android: null}},
    'react-native-gesture-handler': {platforms: {ios: null}},
  },
};
