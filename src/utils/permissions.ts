import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

const showIosSettingsAlert = (title: string, message: string) => {
  Alert.alert(title, message, [
    {text: '취소', style: 'cancel'},
    {text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {})},
  ]);
};

// iOS: '앱을 사용하는 동안' 권한만 요청한다. 활동 기록 중 화면이 꺼져도 기록이 계속되는 것은
// Info.plist 의 UIBackgroundModes(location) 덕분이며, 이때 iOS 가 상태 막대에 파란색 표시를 보여 준다.
// Apple 가이드라인에 따라 시스템 권한 창 앞에 '취소' 버튼이 있는 자체 안내 창은 띄우지 않는다.
export const requestIosLocationPermission = async (
  showSettingsHint = true,
): Promise<boolean> => {
  try {
    const status = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
      return true;
    }
    if (showSettingsHint && status === RESULTS.BLOCKED) {
      showIosSettingsAlert(
        '위치 권한 필요',
        '활동 경로를 기록하려면 설정 > HIKERPRO > 위치에서 "앱을 사용하는 동안"을 선택해 주세요.',
      );
    }
    return false;
  } catch (error) {
    console.warn('iOS location permission request failed:', error);
    return false;
  }
};

// 이미 권한이 있는지만 확인 (권한 창을 띄우지 않음)
export const hasIosLocationPermission = async (): Promise<boolean> => {
  try {
    const status = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  } catch (error) {
    return false;
  }
};

const requestIosCameraPermission = async (): Promise<boolean> => {
  try {
    const status = await request(PERMISSIONS.IOS.CAMERA);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
      return true;
    }
    if (status === RESULTS.BLOCKED) {
      showIosSettingsAlert(
        '카메라 권한 필요',
        '사진 촬영과 QR 코드 스캔을 하려면 설정 > HIKERPRO에서 카메라 접근을 허용해 주세요.',
      );
    }
    return false;
  } catch (error) {
    console.warn('iOS camera permission request failed:', error);
    return false;
  }
};

const showBackgroundLocationDisclosure = (): Promise<boolean> => {
  return new Promise(resolve => {
    Alert.alert(
      '백그라운드 위치 사용 안내',
      'HIKERPRO는 사용자가 활동 기록을 시작한 경우 이동 경로, 거리 및 활동 시간을 기록하기 위해 위치 정보를 사용합니다.\n\n' +
        '활동 기록 중 화면이 꺼지거나 다른 앱을 사용하는 동안에도 이동 경로 기록이 중단되지 않도록 앱이 사용 중이 아닐 때도 위치 정보를 사용합니다.\n\n' +
        '위치 추적은 사용자가 직접 시작한 활동 중에만 사용되며, 활동 기록을 종료하면 추적도 종료됩니다.',
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: '계속',
          onPress: () => resolve(true),
        },
      ],
      {cancelable: false},
    );
  });
};

export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    return requestIosLocationPermission();
  }
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    // Android 시스템 권한 요청 전에 HIKERPRO 자체 고지를 먼저 표시한다.
    const disclosureAccepted = await showBackgroundLocationDisclosure();

    if (!disclosureAccepted) {
      return false;
    }

    const fineLocation = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'HIKERPRO 위치 권한',
        message:
          '활동 중 이동 경로와 거리를 기록하려면 위치 권한이 필요합니다.',
        buttonPositive: '허용',
        buttonNegative: '취소',
      },
    );

    if (fineLocation !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }

    // Android 10 이상에서는 사용자가 시작한 활동 기록을
    // 백그라운드에서도 계속하기 위해 백그라운드 위치 권한을 요청한다.
    if (Platform.Version >= 29) {
      const backgroundLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
        {
          title: 'HIKERPRO 백그라운드 위치 권한',
          message:
            '화면이 꺼지거나 다른 앱을 사용하는 동안에도 사용자가 시작한 활동의 이동 경로 기록을 계속하기 위해 백그라운드 위치 권한이 필요합니다.',
          buttonPositive: '허용',
          buttonNegative: '취소',
        },
      );

      if (backgroundLocation !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.warn('Location permission request failed:', error);
    return false;
  }
};

export const requestCameraPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    return requestIosCameraPermission();
  }
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'HIKERPRO 카메라 권한',
        message: '사진 촬영 기능을 사용하려면 카메라 권한이 필요합니다.',
        buttonPositive: '허용',
        buttonNegative: '취소',
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Camera permission request failed:', error);
    return false;
  }
};

// react-native-image-picker 오류 코드를 사용자 안내 문구로 변환
export const cameraErrorMessage = (errorCode?: string, errorMessage?: string) => {
  if (errorCode === 'camera_unavailable') {
    return '이 기기에서는 카메라를 사용할 수 없습니다.';
  }
  if (errorCode === 'permission') {
    return Platform.OS === 'ios'
      ? '카메라 권한이 없습니다. 설정 > HIKERPRO에서 카메라 접근을 허용해 주세요.'
      : '카메라 권한이 없습니다. 설정에서 카메라 권한을 허용해 주세요.';
  }
  return errorMessage || errorCode || '알 수 없는 오류';
};

export const checkAllPermissions = async () => {
  const locationGranted = await requestLocationPermission();
  const cameraGranted = await requestCameraPermission();

  if (!locationGranted) {
    Alert.alert(
      '위치 권한 필요',
      '활동 경로를 기록하려면 위치 권한이 필요합니다.',
      [{text: '확인'}],
    );
  }

  return {
    location: locationGranted,
    camera: cameraGranted,
  };
};
