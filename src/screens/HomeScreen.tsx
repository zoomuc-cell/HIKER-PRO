import React, {useCallback, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  useWindowDimensions,
  Alert,
  Linking,
  Share,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useFocusEffect} from '@react-navigation/native';
import {launchCamera} from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationService from '../services/LocationService';
import HomeShareSheet from '../components/HomeShareSheet';

type ActivityType =
  | 'hiking'
  | 'walking'
  | 'running'
  | 'cycling'
  | 'building';

const HOME_IMAGE = require('../../assets/activities/activity-home.png');
const IMAGE_RATIO = 1199 / 1312;

// 홈 독립 사진 (활동 사진 photosRef / hiker_activity_photos 와 별도)
const PHOTO_LIBRARY_KEY = 'hiker_photo_library';
const PHOTO_DIR_NAME = 'hiker_photos';
const EMERGENCY_CONTACT_KEY = 'hiker_emergency_contact';
const HISTORY_KEY = 'hiker_activity_history';

// 사진 위치: TrackingScreen 과 동일 기준 (30초 이내, 정확도 50m 이하)
const PHOTO_LOCATION_MAX_AGE_MS = 30000;
const PHOTO_LOCATION_MAX_ACCURACY_M = 50;
// SOS 위치: 최근 10분 이내, 정확도 100m 이하만 표시
const SOS_LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
const SOS_LOCATION_MAX_ACCURACY_M = 100;
const FRESH_LOCATION_TIMEOUT_MS = 10000;

type LibraryPhoto = {
  id: string;
  uri: string;
  timestamp: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
};

type EmergencyContact = {
  name: string;
  phone: string;
};

type ValidLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

type QuickAction = 'location' | 'photo' | 'route' | 'share' | 'plan';

const QUICK_MENU: {
  key: QuickAction;
  icon: string;
  label: string;
  a11y: string;
  color: string;
}[] = [
  {key: 'location', icon: 'crosshairs-gps', label: '현위치', a11y: '현위치 보기', color: '#2E7D32'},
  {key: 'photo', icon: 'camera', label: '사진', a11y: '사진 찍기', color: '#1565C0'},
  {key: 'route', icon: 'map-marker-path', label: '등산경로', a11y: '등산경로 보기', color: '#6D4C41'},
  {key: 'share', icon: 'share-variant', label: 'SNS 공유', a11y: 'SNS 공유하기', color: '#EF6C00'},
  {key: 'plan', icon: 'calendar-check', label: '등산계획', a11y: '등산계획하기', color: '#6A1B9A'},
];

// 신뢰할 수 있는 위치만 반환. 조건 미달이면 null (좌표를 임의 생성하지 않음)
const toValidLocation = (
  loc: any,
  refTime: number,
  maxAgeMs: number,
  maxAccuracyM: number,
): ValidLocation | null => {
  if (!loc) {
    return null;
  }
  const {latitude, longitude, accuracy, timestamp} = loc;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy > maxAccuracyM) {
    return null;
  }
  if (typeof timestamp !== 'number' || Math.abs(refTime - timestamp) > maxAgeMs) {
    return null;
  }
  return {latitude, longitude, accuracy, timestamp};
};

// 이미 위치 권한이 있을 때만 true (홈에서 새 권한 팝업을 띄우지 않음)
const hasLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
  } catch (e) {
    return false;
  }
};

// 기존 LocationService.getCurrentPosition() 1회 요청 (타임아웃 시 null)
const fetchFreshLocation = async (): Promise<any | null> => {
  if (!(await hasLocationPermission())) {
    return null;
  }
  try {
    return await Promise.race([
      LocationService.getCurrentPosition(),
      new Promise<null>(resolve =>
        setTimeout(() => resolve(null), FRESH_LOCATION_TIMEOUT_MS),
      ),
    ]);
  } catch (e) {
    return null;
  }
};

const phoneForUrl = (phone: string) => phone.replace(/[^0-9+]/g, '');

const HomeScreen = ({navigation}: any) => {
  const {width} = useWindowDimensions();

  const horizontalMargin = 14;
  const imageWidth = width - horizontalMargin * 2;
  const imageHeight = imageWidth * IMAGE_RATIO;

  const openActivity = (activityType: ActivityType) => {
    navigation.navigate('Track', {
      activityType,
      activityRequestId: Date.now(),
    });
  };

  const [photoBusy, setPhotoBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const locationWarmupRef = useRef(false);

  // 비상연락처 (Profile 에서 등록한 hiker_emergency_contact {name, phone}) — 홈 진입 시마다 다시 읽음
  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(EMERGENCY_CONTACT_KEY)
        .then(v => {
          if (!active) {
            return;
          }
          if (!v) {
            setContact(null);
            return;
          }
          try {
            const c = JSON.parse(v);
            const phone = typeof c?.phone === 'string' ? c.phone.trim() : '';
            setContact(phone ? {name: String(c?.name || '').trim(), phone} : null);
          } catch (e) {
            setContact(null);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  // 1. 현위치 보기 → 지도 탭 (MapScreen 의 기존 centerOnUser 사용)
  const openCurrentLocation = () => {
    navigation.navigate('Map', {centerRequestId: Date.now()});
  };

  // 2. 등산경로 보기 → 기존 활동 기록 화면 (저장된 routePoints/photos 그대로 사용)
  const openRouteHistory = () => {
    navigation.navigate('Track');
  };

  // 3. 홈 독립 사진 찍기 (활동 여부와 무관)
  const takeHomePhoto = async () => {
    if (photoBusyRef.current) {
      return;
    }
    photoBusyRef.current = true;
    setPhotoBusy(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('카메라 권한', '사진 촬영을 위해 카메라 권한이 필요합니다.');
          return;
        }
      }
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        saveToPhotos: false,
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.8,
      });
      if (result.didCancel) {
        return;
      }
      if (result.errorCode) {
        Alert.alert('사진 촬영 실패', result.errorMessage || result.errorCode);
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('사진 저장 실패', '촬영한 사진 데이터를 받지 못했습니다.');
        return;
      }

      const capturedAt = Date.now();
      const directory = ReactNativeBlobUtil.fs.dirs.DocumentDir + '/' + PHOTO_DIR_NAME;
      await ReactNativeBlobUtil.fs.mkdir(directory).catch(async () => {
        if (!(await ReactNativeBlobUtil.fs.exists(directory))) {
          throw new Error('사진 폴더 생성 실패');
        }
      });
      const id = 'libphoto_' + capturedAt + '_' + Math.floor(Math.random() * 1000000);
      const path = directory + '/' + id + '.jpg';
      await ReactNativeBlobUtil.fs.writeFile(path, asset.base64, 'base64');

      // 위치: 최근 수신 위치 → 없으면 1회 요청. 기준 미달이면 위치 없이 저장
      let location = toValidLocation(
        LocationService.getLastKnownLocation(),
        capturedAt,
        PHOTO_LOCATION_MAX_AGE_MS,
        PHOTO_LOCATION_MAX_ACCURACY_M,
      );
      if (!location) {
        location = toValidLocation(
          await fetchFreshLocation(),
          capturedAt,
          PHOTO_LOCATION_MAX_AGE_MS,
          PHOTO_LOCATION_MAX_ACCURACY_M,
        );
      }

      const photo: LibraryPhoto = {
        id,
        uri: 'file://' + path,
        timestamp: capturedAt,
        ...(location
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
            }
          : {}),
      };

      // 기존 metadata 가 손상된 경우 덮어쓰지 않음
      const raw = await AsyncStorage.getItem(PHOTO_LIBRARY_KEY);
      let library: LibraryPhoto[] = [];
      if (raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          parsed = null;
        }
        if (!Array.isArray(parsed)) {
          Alert.alert(
            '사진 기록 저장 실패',
            '사진 파일은 저장했지만 기존 사진 목록을 읽지 못해 목록에 추가하지 않았습니다.',
          );
          return;
        }
        library = parsed as LibraryPhoto[];
      }
      await AsyncStorage.setItem(
        PHOTO_LIBRARY_KEY,
        JSON.stringify([...library, photo]),
      );

      Alert.alert(
        '사진 저장 완료',
        location
          ? '촬영 시각과 위치를 함께 저장했습니다.'
          : '사진을 저장했습니다. 신뢰할 수 있는 GPS 위치가 없어 위치 정보는 저장하지 않았습니다.',
      );
    } catch (error) {
      console.error('Home photo error:', error);
      Alert.alert('사진 저장 실패', '사진을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      photoBusyRef.current = false;
      setPhotoBusy(false);
    }
  };

  // 4. SNS 공유 → "무엇을 공유할까요?" 선택 시트 (사진 / 활동·경로 / 사진+활동 / 등산계획)
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const shareHikerPro = () => {
    setShareSheetVisible(true);
  };

  // 5. 등산계획 → 숨겨진 HikingPlan route (하단 탭에는 표시되지 않음)
  const openPlanning = () => {
    navigation.navigate('HikingPlan');
  };

  const onQuickAction = (key: QuickAction) => {
    switch (key) {
      case 'location':
        openCurrentLocation();
        break;
      case 'photo':
        takeHomePhoto();
        break;
      case 'route':
        openRouteHistory();
        break;
      case 'share':
        shareHikerPro();
        break;
      case 'plan':
        openPlanning();
        break;
    }
  };

  // SOS (기존 MapScreen 동작을 홈으로 이전)
  const openUrlSafe = (url: string, failTitle: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(failTitle, '연결하지 못했습니다. 직접 전화해 주세요.');
    });
  };

  const call119 = () => openUrlSafe('tel:119', '119 전화 실패');

  const getSosLocation = () =>
    toValidLocation(
      LocationService.getLastKnownLocation(),
      Date.now(),
      SOS_LOCATION_MAX_AGE_MS,
      SOS_LOCATION_MAX_ACCURACY_M,
    );

  // 위치가 없으면 권한이 이미 있을 때만 백그라운드로 1회 요청 (다음 SOS 에 반영)
  const warmUpLocation = async () => {
    if (locationWarmupRef.current) {
      return;
    }
    locationWarmupRef.current = true;
    try {
      await fetchFreshLocation();
    } finally {
      locationWarmupRef.current = false;
    }
  };

  const showSosDialog = () => {
    const loc = getSosLocation();
    let pos = '수신 대기중';
    if (loc) {
      const ageMin = Math.floor((Date.now() - loc.timestamp) / 60000);
      pos =
        loc.latitude.toFixed(5) + ', ' + loc.longitude.toFixed(5) +
        (ageMin >= 1 ? ' (약 ' + ageMin + '분 전 위치)' : '');
    } else {
      warmUpLocation();
    }

    const sms119 = () => {
      if (loc) {
        const msg = '긴급 구조 요청! 위치: 위도 ' + loc.latitude.toFixed(6) + ', 경도 ' + loc.longitude.toFixed(6);
        openUrlSafe('sms:119?body=' + encodeURIComponent(msg), '문자 전송 실패');
      } else {
        Alert.alert('알림', '현재 위치를 아직 받지 못했습니다. 전화로 신고해 주세요.');
      }
    };

    if (contact) {
      const label = (contact.name ? contact.name + ' ' : '') + '(' + contact.phone + ')';
      const phone = phoneForUrl(contact.phone);
      Alert.alert('긴급 구조 요청', '현재 위치: ' + pos, [
        {text: '119 전화', onPress: call119},
        {
          text: '비상연락처',
          onPress: () =>
            Alert.alert('비상연락처', label, [
              {text: '전화', onPress: () => openUrlSafe('tel:' + phone, '전화 연결 실패')},
              {
                text: '위치 문자',
                onPress: () =>
                  openUrlSafe(
                    'sms:' + phone + '?body=' + encodeURIComponent('긴급 구조 요청! 위치: ' + pos),
                    '문자 전송 실패',
                  ),
              },
              {text: '취소', style: 'cancel'},
            ]),
        },
        {text: '취소', style: 'cancel'},
      ]);
    } else {
      Alert.alert(
        '긴급 구조 요청',
        '등록된 비상연락처가 없습니다. (프로필에서 등록할 수 있습니다)\n현재 위치: ' + pos,
        [
          {text: '119 전화', onPress: call119},
          {text: '위치 문자(119)', onPress: sms119},
          {text: '취소', style: 'cancel'},
        ],
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>HIKERPRO</Text>
            <Text style={styles.headerTitle}>
              오늘 어떤 활동을 시작할까요?
            </Text>
          </View>

          <Icon name="terrain" size={38} color="#FFFFFF" />
        </View>

        <View
          style={[
            styles.activityBoard,
            {
              width: imageWidth,
              height: imageHeight,
              marginHorizontal: horizontalMargin,
            },
          ]}>
          <ImageBackground
            source={HOME_IMAGE}
            resizeMode="stretch"
            style={styles.activityImage}
            imageStyle={styles.activityImageRadius}>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="등산 시작"
              style={[styles.touchArea, styles.hikingArea]}
              onPress={() => openActivity('hiking')}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="걷기 시작"
              style={[styles.touchArea, styles.walkingArea]}
              onPress={() => openActivity('walking')}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="달리기 시작"
              style={[styles.touchArea, styles.runningArea]}
              onPress={() => openActivity('running')}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="자전거 시작"
              style={[styles.touchArea, styles.cyclingArea]}
              onPress={() => openActivity('cycling')}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="빌딩 오르기 시작"
              style={[styles.touchArea, styles.buildingArea]}
              onPress={() => openActivity('building')}
            />
          </ImageBackground>
        </View>

        <Text style={styles.sectionTitle}>빠른 기능</Text>
        <View style={styles.quickMenu}>
          {QUICK_MENU.map(item => {
            const busy = item.key === 'photo' && photoBusy;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.a11y}
                disabled={busy}
                onPress={() => onQuickAction(item.key)}
                style={({pressed}) => [
                  styles.quickButton,
                  pressed && styles.quickButtonPressed,
                ]}>
                {busy ? (
                  <ActivityIndicator size="small" color={item.color} />
                ) : (
                  <Icon name={item.icon} size={26} color={item.color} />
                )}
                <Text style={styles.quickText} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.locationInfo}>
          <Icon name="satellite-variant" size={23} color="#1565C0" />
          <View style={styles.locationTextBox}>
            <Text style={styles.locationTitle}>GNSS 활동 기록</Text>
            <Text style={styles.locationSubtitle}>
              활동을 선택하면 위치와 이동 기록을 준비합니다.
            </Text>
          </View>
        </View>

      </ScrollView>

      <HomeShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
      />

      <View style={styles.sosBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SOS 긴급 구조 요청"
          onPress={showSosDialog}
          style={({pressed}) => [styles.sosButton, pressed && styles.sosButtonPressed]}>
          <Icon name="alarm-light" size={30} color="#FFFFFF" />
          <Text style={styles.sosText}>SOS 긴급 구조</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F5F2',
  },

  content: {
    paddingBottom: 30,
  },

  header: {
    minHeight: 118,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: '#173D2A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  logo: {
    color: '#B8D7C0',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.2,
  },

  headerTitle: {
    marginTop: 7,
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },

  activityBoard: {
    marginTop: 14,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#DDE5DD',
    elevation: 4,
  },

  activityImage: {
    flex: 1,
  },

  activityImageRadius: {
    borderRadius: 22,
  },

  touchArea: {
    position: 'absolute',
  },

  hikingArea: {
    left: '0%',
    top: '0%',
    width: '100%',
    height: '43%',
  },

  walkingArea: {
    left: '0%',
    top: '43%',
    width: '25%',
    height: '57%',
  },

  runningArea: {
    left: '25%',
    top: '43%',
    width: '25%',
    height: '57%',
  },

  cyclingArea: {
    left: '50%',
    top: '43%',
    width: '25%',
    height: '57%',
  },

  buildingArea: {
    left: '75%',
    top: '43%',
    width: '25%',
    height: '57%',
  },

  sectionTitle: {
    marginHorizontal: 18,
    marginTop: 23,
    marginBottom: 11,
    color: '#263238',
    fontSize: 18,
    fontWeight: '900',
  },

  quickMenu: {
    marginHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  quickButton: {
    width: '18.5%',
    minHeight: 70,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },

  quickButtonPressed: {
    opacity: 0.65,
  },

  quickText: {
    marginTop: 5,
    color: '#37474F',
    fontSize: 11,
    fontWeight: '800',
  },

  sosBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#F3F5F2',
    borderTopWidth: 1,
    borderTopColor: '#E0E4DF',
  },

  sosButton: {
    height: 64,
    borderRadius: 18,
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },

  sosButtonPressed: {
    backgroundColor: '#B71C1C',
  },

  sosText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 1,
  },

  locationInfo: {
    marginHorizontal: 18,
    marginTop: 18,
    padding: 15,
    borderRadius: 17,
    backgroundColor: '#E3F2FD',
    flexDirection: 'row',
    alignItems: 'center',
  },

  locationTextBox: {
    flex: 1,
    marginLeft: 12,
  },

  locationTitle: {
    color: '#0D47A1',
    fontSize: 14,
    fontWeight: '900',
  },

  locationSubtitle: {
    marginTop: 3,
    color: '#546E7A',
    fontSize: 12,
  },
});

export default HomeScreen;
