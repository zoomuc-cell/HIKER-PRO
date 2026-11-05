// Android 활동 기록 포그라운드 서비스 (android/.../TrackingForegroundService.kt)
// 기록 중에는 상단에 '활동 기록 중' 알림을 띄우고, 그동안 화면이 꺼져도 위치를 계속 받는다.
// iOS 는 Info.plist 의 UIBackgroundModes(location) 로 같은 일을 하므로 아무것도 하지 않는다.
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

const native = Platform.OS === 'android' ? NativeModules.HikerTracking : null;

export const startTrackingNotification = async (activityLabel: string) => {
  if (!native) {
    return;
  }
  try {
    // Android 13 이상: 알림 권한이 없으면 알림만 안 보이고 서비스는 동작한다. 거절해도 기록은 계속.
    if (Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any).catch(() => null);
    }
    await native.start(`${activityLabel} 기록 중`, '화면이 꺼져 있어도 이동 경로를 기록하고 있습니다.');
  } catch (e) {
    console.warn('[TrackingForeground] start failed:', e);
  }
};

export const stopTrackingNotification = async () => {
  if (!native) {
    return;
  }
  try {
    await native.stop();
  } catch (e) {
    console.warn('[TrackingForeground] stop failed:', e);
  }
};
