import React, {useEffect, useRef, useState} from 'react';
import {View, StyleSheet, ScrollView, TouchableOpacity, Alert, AppState, Image, Linking, Modal, PermissionsAndroid, Platform} from 'react-native';
import type {ScrollViewInstance} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import {launchCamera} from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Text, Card, Button, ProgressBar} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationService from '../services/LocationService';
import {cameraErrorMessage, requestCameraPermission, requestLocationPermission} from '../utils/permissions';
import {exportActivityGpx} from '../utils/gpx';
import {usePro} from '../services/ProService';
import ProUpgradeModal from '../components/ProUpgradeModal';
import {
  clearDraft,
  loadActivitySummaries,
  loadDraft,
  loadRoutePoints,
  saveActivity,
  saveDraft,
  type TrackingDraft,
} from '../services/ActivityStore';
import {startTrackingNotification, stopTrackingNotification} from '../services/TrackingForeground';
import {resolveAppFileUri, toStoredFileRef} from '../utils/appFiles';

const VISITED_KEY = 'hiker_visited_regions';
// 기록 중 임시 저장 주기 (앱이 꺼져도 이 간격 안의 기록만 잃는다)
const DRAFT_SAVE_INTERVAL_MS = 60 * 1000;
// 정확도가 이보다 나쁜 위치는 거리·고도 계산에서 뺀다
const MAX_POINT_ACCURACY_M = 50;
// 고도가 이만큼 이상 오른 경우에만 상승 고도로 센다 (GPS 고도의 잔떨림 제거)
const ELEVATION_STEP_M = 3;

type ActivityType =
  | 'hiking'
  | 'building'
  | 'walking'
  | 'running'
  | 'cycling';

type TrackingPoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
};

type ActivityPhoto = {
  id: string;
  uri: string;
  timestamp: number;
  latitude?: number;
  longitude?: number;
};

type ActivityRecord = {
  id: string;
  activityType: ActivityType;
  activityLabel: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  distanceM: number;
  elevationM: number;
  calories: number;
  weightKgUsed?: number;
  calorieMethodVersion?: string;
  locationLabel: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  visitedRegionKeys: string[];
  pointsCount: number;
  estimatedFloors?: number;
  routePoints?: TrackingPoint[];
  hasRoute?: boolean;
  photos?: ActivityPhoto[];
};

const ACTIVITY_META: Record<
  ActivityType,
  {label: string; icon: string; color: string; caloriesPerKm: number}
> = {
  hiking: {
    label: '등산',
    icon: 'terrain',
    color: '#2E7D32',
    caloriesPerKm: 70,
  },
  building: {
    label: '빌딩 오르기',
    icon: 'office-building',
    color: '#6A1B9A',
    caloriesPerKm: 65,
  },
  walking: {
    label: '걷기',
    icon: 'walk',
    color: '#00897B',
    caloriesPerKm: 45,
  },
  running: {
    label: '러닝',
    icon: 'run',
    color: '#EF6C00',
    caloriesPerKm: 75,
  },
  cycling: {
    label: '자전거',
    icon: 'bike',
    color: '#1565C0',
    caloriesPerKm: 35,
  },
};

const ACTIVITY_ORDER: ActivityType[] = [
  'hiking',
  'building',
  'walking',
  'running',
  'cycling',
];

type HistoryPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

const TrackingScreen = ({route}: any) => {
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityType>(route?.params?.activityType || 'hiking');
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('monthly');
  const [isTracking, setIsTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [elevation, setElevation] = useState(0);
  const [calories, setCalories] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [photos, setPhotos] = useState<ActivityPhoto[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ActivityRecord | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<ActivityPhoto | null>(null);
  const [gpxUpgradeVisible, setGpxUpgradeVisible] = useState(false);
  const pro = usePro();

  const exportGpx = async (record: ActivityRecord) => {
    if (!pro.isPro) {
      setGpxUpgradeVisible(true);
      return;
    }
    const routePoints = record.routePoints || (await loadRoutePoints(record));
    if (routePoints.length < 2) {
      Alert.alert('GPX 내보내기', '이 활동에는 내보낼 경로가 없습니다.');
      return;
    }
    try {
      await exportActivityGpx({...record, routePoints});
    } catch (error: any) {
      Alert.alert('GPX 내보내기', error?.message || 'GPX 파일을 만들지 못했습니다.');
    }
  };
  const [cameraBusy, setCameraBusy] = useState(false);

  const watchRef = useRef<{remove: () => void} | null>(null);
  const pointsRef = useRef<TrackingPoint[]>([]);
  const photosRef = useRef<ActivityPhoto[]>([]);
  const cameraBusyRef = useRef(false);
  const lastLocationRef = useRef<{latitude: number; longitude: number; timestamp: number; accuracy: number} | null>(null);
  const distanceRef = useRef(0);
  const elevationRef = useRef(0);
  // 상승 고도 계산 기준 고도 (ELEVATION_STEP_M 이상 오르면 그만큼 더하고 기준을 올린다)
  const elevationAnchorRef = useRef<number | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const activityRef = useRef<ActivityType>('hiking');
  const activityWeightKgRef = useRef(70);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const historySectionYRef = useRef(0);

  // 프로필 '등산 히스토리'에서 navigate('Track', {historyRequestId}) 로 진입: 전체 기록을 보여 주고 기록 목록으로 스크롤
  const historyRequestId = route?.params?.historyRequestId;
  useEffect(() => {
    if (!historyRequestId) {
      return;
    }
    setHistoryPeriod('all');
    loadHistory();
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({y: historySectionYRef.current, animated: true});
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRequestId]);

  useEffect(() => {
    loadHistory();
    offerDraftRecovery();

    // 백그라운드로 갈 때 바로 임시 저장 (iOS·Android 가 앱을 종료해도 그때까지의 기록은 남는다)
    const appStateSub = AppState.addEventListener('change', state => {
      if (state !== 'active' && isTrackingRef.current) {
        persistDraft();
      }
    });

    return () => {
      appStateSub.remove();
      stopDraftTimer();
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activityRef.current = selectedActivity;
  }, [selectedActivity]);

  useEffect(() => {
    const requestedActivity = route?.params?.activityType as ActivityType | undefined;
    if (requestedActivity && !isTracking) {
      setSelectedActivity(requestedActivity);
      activityRef.current = requestedActivity;
    }
  }, [
    route?.params?.activityType,
    route?.params?.activityRequestId,
    isTracking,
  ]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isTracking && startTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setDuration(elapsed);
        setCalories(
          estimateCalories(
            distanceRef.current,
            elevationRef.current,
            elapsed,
            activityRef.current,
            activityWeightKgRef.current,
          ),
        );
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isTracking, startTime]);

  const loadHistory = async () => {
    try {
      setHistory(await loadActivitySummaries());
    } catch (error) {
      console.error('Failed to load activity history:', error);
      setHistory([]);
    }
  };

  const openRecord = async (item: ActivityRecord) => {
    setSelectedPhoto(null);
    const routePoints = await loadRoutePoints(item);
    setSelectedRecord({...item, routePoints});
  };

  const toRadians = (value: number) => (value * Math.PI) / 180;

  const getDistanceMeters = (a: TrackingPoint, b: TrackingPoint) => {
    const R = 6371000;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);

    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  };

  const estimateCalories = (
    distanceM: number,
    elevationM: number,
    durationSec: number,
    activityType: ActivityType,
    weightKg: number,
  ) => {
    const durationHours = Math.max(0, durationSec) / 3600;
    const safeWeightKg =
      Number.isFinite(weightKg) && weightKg >= 25 && weightKg <= 300
        ? weightKg
        : 70;

    const baseMet: Record<ActivityType, number> = {
      hiking: 6.0,
      building: 8.0,
      walking: 3.5,
      running: 8.3,
      cycling: 6.8,
    };

    let met = baseMet[activityType];

    if (durationHours > 0 && distanceM > 0) {
      const speedKmh = distanceM / 1000 / durationHours;

      if (activityType === 'walking') {
        if (speedKmh >= 6.5) met = 5.0;
        else if (speedKmh >= 5.0) met = 4.3;
        else if (speedKmh < 3.0) met = 2.8;
      } else if (activityType === 'running') {
        if (speedKmh >= 12.0) met = 11.5;
        else if (speedKmh >= 10.0) met = 10.0;
        else if (speedKmh >= 8.0) met = 8.3;
        else met = 6.0;
      } else if (activityType === 'cycling') {
        if (speedKmh >= 24.0) met = 10.0;
        else if (speedKmh >= 19.0) met = 8.0;
        else if (speedKmh >= 14.0) met = 6.8;
        else met = 4.0;
      }
    }

    const timeCalories = met * safeWeightKg * durationHours;

    const elevationFactor =
      activityType === 'building'
        ? 0.10
        : activityType === 'hiking'
          ? 0.07
          : 0.03;

    const elevationCalories =
      Math.max(0, elevationM) * safeWeightKg * elevationFactor / 70;

    return Math.max(0, Math.round(timeCalories + elevationCalories));
  };

  const makeRegionKey = (point: TrackingPoint) =>
    `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;

  const makeLocationLabel = (point?: TrackingPoint) => {
    if (!point) {
      return '위치 기록';
    }
    return `${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`;
  };

  const estimateFloors = (elevationM: number) => {
    return Math.max(0, Math.round(elevationM / 3));
  };

  const pushLocation = (location: any) => {
    const point: TrackingPoint = {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      altitude: Number(location.altitude || 0),
      timestamp: Number(location.timestamp || Date.now()),
    };

    if (
      Number.isNaN(point.latitude) ||
      Number.isNaN(point.longitude) ||
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude)
    ) {
      return;
    }

    // 정확도가 나쁜 위치(실내, 계곡 등)는 경로가 지그재그로 튀어 거리·고도가 부풀려지므로 버린다
    const accuracy = Number(location.accuracy);
    if (Number.isFinite(accuracy) && accuracy > MAX_POINT_ACCURACY_M) {
      return;
    }

    const prev = pointsRef.current[pointsRef.current.length - 1];

    if (prev) {
      const segment = getDistanceMeters(prev, point);
      const seconds = Math.max(1, (point.timestamp - prev.timestamp) / 1000);
      // 위치가 잠시 끊겼다 이어진 경우도 거리에 넣되, 걷기·자전거로 불가능한 순간이동(초속 30m 초과)은 뺀다
      if (segment > 0.5 && segment / seconds < 30) {
        distanceRef.current += segment;
        setDistance(distanceRef.current);
      }
    }

    // 상승 고도: 기준 고도보다 ELEVATION_STEP_M 이상 올랐을 때만 더한다. 내려가면 기준을 낮춘다.
    {
      const anchor = elevationAnchorRef.current;
      if (anchor === null) {
        elevationAnchorRef.current = point.altitude;
      } else if (point.altitude - anchor >= ELEVATION_STEP_M) {
        elevationRef.current += point.altitude - anchor;
        elevationAnchorRef.current = point.altitude;
        setElevation(elevationRef.current);
      } else if (anchor - point.altitude >= ELEVATION_STEP_M) {
        elevationAnchorRef.current = point.altitude;
      }
    }

    pointsRef.current.push(point);
    lastLocationRef.current = {
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp,
      accuracy: Number(location.accuracy || 999),
    };

    const elapsed = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : duration;

    setCalories(
      estimateCalories(
        distanceRef.current,
        elevationRef.current,
        elapsed,
        activityRef.current,
        activityWeightKgRef.current,
      ),
    );
  };

  const takeActivityPhoto = async () => {
    if (!isTracking || cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    setCameraBusy(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('카메라 권한', '사진 촬영을 위해 카메라 권한이 필요합니다.');
          return;
        }
      } else if (Platform.OS === 'ios' && !(await requestCameraPermission())) {
        return;
      }
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        saveToPhotos: false,
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.8,
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('사진 촬영 실패', cameraErrorMessage(result.errorCode, result.errorMessage));
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('사진 저장 실패', '촬영한 사진 데이터를 받지 못했습니다.');
        return;
      }
      const capturedAt = Date.now();
      const directory = ReactNativeBlobUtil.fs.dirs.DocumentDir + '/hiker_activity_photos';
      await ReactNativeBlobUtil.fs.mkdir(directory).catch(async () => {
        if (!(await ReactNativeBlobUtil.fs.exists(directory))) throw new Error('사진 폴더 생성 실패');
      });
      const path = directory + '/photo_' + capturedAt + '_' + Math.floor(Math.random() * 1000000) + '.jpg';
      await ReactNativeBlobUtil.fs.writeFile(path, asset.base64, 'base64');
      // iOS 는 앱 업데이트 때 앱 폴더 경로가 바뀌므로 Documents 아래 상대 경로만 저장한다
      const location = lastLocationRef.current;
      const validLocation = location &&
        capturedAt - location.timestamp <= 30000 &&
        location.accuracy <= 50 &&
        Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
      const photo: ActivityPhoto = {
        id: 'photo_' + capturedAt,
        uri: toStoredFileRef(path),
        timestamp: capturedAt,
        ...(validLocation ? {latitude: location!.latitude, longitude: location!.longitude} : {}),
      };
      photosRef.current = [...photosRef.current, photo];
      setPhotos([...photosRef.current]);
      persistDraft();
    } catch (error) {
      console.error('Activity photo error:', error);
      Alert.alert('사진 저장 실패', '사진을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      cameraBusyRef.current = false;
      setCameraBusy(false);
    }
  };

  // ---- 기록 중 임시 저장 / 복구 ----

  const persistDraft = async () => {
    const startedAt = startTimeRef.current;
    if (!isTrackingRef.current || !startedAt) {
      return;
    }
    try {
      await saveDraft({
        activityType: activityRef.current,
        startedAt,
        distanceM: distanceRef.current,
        elevationM: elevationRef.current,
        weightKg: activityWeightKgRef.current,
        points: pointsRef.current,
        photos: photosRef.current,
      });
    } catch (error) {
      console.warn('Failed to save tracking draft:', error);
    }
  };

  const startDraftTimer = () => {
    stopDraftTimer();
    draftTimerRef.current = setInterval(persistDraft, DRAFT_SAVE_INTERVAL_MS);
  };

  const stopDraftTimer = () => {
    if (draftTimerRef.current) {
      clearInterval(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  };

  // 지난번에 기록 중 앱이 꺼졌으면 이어서 기록하거나 저장할지 묻는다
  const offerDraftRecovery = async () => {
    const draft = await loadDraft();
    if (!draft || isTrackingRef.current) {
      return;
    }
    const type = (ACTIVITY_META as any)[draft.activityType] ? (draft.activityType as ActivityType) : 'hiking';
    const started = new Date(draft.startedAt);
    const km = (draft.distanceM / 1000).toFixed(2);
    Alert.alert(
      '기록 중이던 활동이 있습니다',
      `${started.getMonth() + 1}월 ${started.getDate()}일 ${started.getHours()}시 ${String(started.getMinutes()).padStart(2, '0')}분에 시작한 ${ACTIVITY_META[type].label} 기록(${km}km)이 저장되지 않은 채 앱이 종료되었습니다.`,
      [
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            Alert.alert('기록 삭제', '이 기록을 지울까요? 되돌릴 수 없습니다.', [
              {text: '취소', style: 'cancel', onPress: () => offerDraftRecovery()},
              {text: '삭제', style: 'destructive', onPress: () => clearDraft()},
            ]),
        },
        {text: '지금까지 저장', onPress: () => saveDraftAsActivity(draft, type)},
        {text: '이어서 기록', onPress: () => startTracking(type, draft)},
      ],
      {cancelable: false},
    );
  };

  const saveDraftAsActivity = async (draft: TrackingDraft, type: ActivityType) => {
    const ok = await finalizeActivity({
      activityType: type,
      startedAt: draft.startedAt,
      endedAt: Math.max(draft.savedAt, draft.startedAt),
      distanceM: draft.distanceM,
      elevationM: draft.elevationM,
      weightKg: draft.weightKg,
      points: draft.points as TrackingPoint[],
      photos: draft.photos as ActivityPhoto[],
    });
    if (ok) {
      Alert.alert('저장 완료', '앱이 종료되기 전까지의 기록을 저장했습니다.');
    }
  };

  const showLocationSettingsAlert = () => {
    Alert.alert(
      '위치 권한이 필요합니다',
      Platform.OS === 'ios'
        ? '활동 경로를 기록하려면 설정 > Hiker Pro > 위치에서 "앱을 사용하는 동안"을 선택해 주세요.'
        : '활동 경로를 기록하려면 설정 > 앱 > Hiker Pro > 권한 > 위치에서 "앱 사용 중에만 허용"과 "정확한 위치"를 켜 주세요.',
      [
        {text: '취소', style: 'cancel'},
        {text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {})},
      ],
    );
  };

  const startTracking = async (activityType?: ActivityType, resumeDraft?: TrackingDraft) => {
    try {
      const permissionGranted = await requestLocationPermission();

      if (!permissionGranted) {
        showLocationSettingsAlert();
        return;
      }

      const nextActivity = activityType || selectedActivity;

      setSelectedActivity(nextActivity);
      activityRef.current = nextActivity;

      let activityWeightKg = resumeDraft?.weightKg || 70;
      if (!resumeDraft) {
        try {
          const savedUser = await AsyncStorage.getItem('hiker_user');
          if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            const savedWeight = Number(parsedUser?.weightKg);
            if (
              Number.isFinite(savedWeight) &&
              savedWeight >= 25 &&
              savedWeight <= 300
            ) {
              activityWeightKg = savedWeight;
            }
          }
        } catch (error) {
          console.warn('Failed to load profile weight for activity:', error);
        }
      }
      activityWeightKgRef.current = activityWeightKg;

      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }

      const now = Date.now();
      const startedAt = resumeDraft ? resumeDraft.startedAt : now;
      const resumedPoints = (resumeDraft?.points || []) as TrackingPoint[];

      pointsRef.current = [...resumedPoints];
      photosRef.current = [...((resumeDraft?.photos || []) as ActivityPhoto[])];
      lastLocationRef.current = null;
      setPhotos([...photosRef.current]);
      distanceRef.current = resumeDraft?.distanceM || 0;
      elevationRef.current = resumeDraft?.elevationM || 0;
      elevationAnchorRef.current = resumedPoints.length
        ? resumedPoints[resumedPoints.length - 1].altitude
        : null;
      startTimeRef.current = startedAt;
      isTrackingRef.current = true;

      setIsTracking(true);
      setStartTime(startedAt);
      setDistance(distanceRef.current);
      setDuration(Math.floor((now - startedAt) / 1000));
      setElevation(elevationRef.current);
      setCalories(0);

      // Android: 상단 '활동 기록 중' 알림과 함께 포그라운드 서비스를 켜서 화면이 꺼져도 위치를 계속 받는다
      startTrackingNotification(ACTIVITY_META[nextActivity].label);

      try {
        await LocationService.startTracking();
      } catch (error) {
        // 실내에서 첫 GPS 위치를 얻지 못해도 활동 시간과 사진 기록은 계속합니다.
        console.warn('Initial GPS unavailable; continuing activity:', error);
      }

      const initial = LocationService.getLastKnownLocation();
      if (
        initial &&
        Number(initial.timestamp) >= now - 30000 &&
        Number(initial.accuracy) <= 50
      ) {
        pushLocation(initial);
      }

      watchRef.current = LocationService.watchPosition((location: any) => {
        pushLocation(location);
      });

      await persistDraft();
      startDraftTimer();
    } catch (error) {
      console.error('Failed to start tracking:', error);
      isTrackingRef.current = false;
      stopDraftTimer();
      stopTrackingNotification();
      setIsTracking(false);
      setStartTime(null);
      startTimeRef.current = null;
    }
  };

  type FinalizeInput = {
    activityType: ActivityType;
    startedAt: number;
    endedAt: number;
    distanceM: number;
    elevationM: number;
    weightKg: number;
    points: TrackingPoint[];
    photos: ActivityPhoto[];
  };

  // 활동을 기록 목록에 저장한다. 성공하면 임시 저장본을 지우고 true.
  // 실패하면 임시 저장본을 남겨 두고(다음에 앱을 열면 다시 저장할 수 있음) 알림창을 띄운다.
  const finalizeActivity = async (input: FinalizeInput): Promise<boolean> => {
    const {activityType: finalActivity, startedAt, endedAt, points} = input;
    const finalDuration = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1] || firstPoint;

    const visitedRegionKeys = Array.from(
      new Set(points.map(point => makeRegionKey(point))),
    );

    const record: ActivityRecord = {
      id: `activity_${endedAt}`,
      activityType: finalActivity,
      activityLabel: ACTIVITY_META[finalActivity].label,
      startedAt,
      endedAt,
      durationSec: finalDuration,
      distanceM: Math.round(input.distanceM),
      elevationM: Math.round(input.elevationM),
      calories: estimateCalories(
        input.distanceM,
        input.elevationM,
        finalDuration,
        finalActivity,
        input.weightKg,
      ),
      weightKgUsed: input.weightKg,
      calorieMethodVersion: 'CALORIE_MET_V1',
      locationLabel: makeLocationLabel(firstPoint),
      startLatitude: firstPoint?.latitude || 0,
      startLongitude: firstPoint?.longitude || 0,
      endLatitude: lastPoint?.latitude || 0,
      endLongitude: lastPoint?.longitude || 0,
      visitedRegionKeys,
      pointsCount: points.length,
      estimatedFloors:
        finalActivity === 'building'
          ? estimateFloors(Math.round(input.elevationM))
          : undefined,
      routePoints: points,
      photos: input.photos,
    };

    try {
      setHistory(await saveActivity(record));
    } catch (error) {
      console.error('Failed to save activity result:', error);
      try {
        await saveDraft({
          activityType: finalActivity,
          startedAt,
          distanceM: input.distanceM,
          elevationM: input.elevationM,
          weightKg: input.weightKg,
          points,
          photos: input.photos,
        });
      } catch (e) {}
      Alert.alert(
        '기록 저장 실패',
        '활동 기록을 저장하지 못했습니다. 기록은 임시로 보관했으니, 앱을 다시 열면 저장을 다시 시도할 수 있습니다.\n기기 저장 공간이 부족한지 확인해 주세요.',
      );
      return false;
    }

    await clearDraft();

    // 방문 지역은 부가 정보라 실패해도 기록 저장에는 영향을 주지 않는다
    try {
      const rawVisited = await AsyncStorage.getItem(VISITED_KEY);
      const existingVisited = rawVisited ? JSON.parse(rawVisited) : [];
      const nextVisited = Array.from(
        new Set([
          ...(Array.isArray(existingVisited) ? existingVisited : []),
          ...visitedRegionKeys,
        ]),
      );
      await AsyncStorage.setItem(VISITED_KEY, JSON.stringify(nextVisited));
    } catch (error) {
      console.warn('Failed to save visited regions:', error);
    }
    return true;
  };

  const stopTracking = async () => {
    if (cameraBusyRef.current) {
      Alert.alert('사진 저장 중', '사진 저장이 끝난 뒤 활동을 종료해 주세요.');
      return;
    }
    const startedAt = startTimeRef.current;
    const endedAt = Date.now();

    isTrackingRef.current = false;
    stopDraftTimer();
    stopTrackingNotification();
    try {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }

      await LocationService.stopTracking();
    } catch (error) {
      console.error('Failed to stop tracking:', error);
    }

    setIsTracking(false);

    if (!startedAt) {
      setStartTime(null);
      return;
    }

    setDuration(Math.floor((endedAt - startedAt) / 1000));

    await finalizeActivity({
      activityType: activityRef.current,
      startedAt,
      endedAt,
      distanceM: distanceRef.current,
      elevationM: elevationRef.current,
      weightKg: activityWeightKgRef.current,
      points: [...pointsRef.current],
      photos: [...photosRef.current],
    });

    setStartTime(null);
    startTimeRef.current = null;
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatHistoryDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const currentMeta = ACTIVITY_META[selectedActivity];

  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const startOfWeek = new Date(startOfToday);
  const dayOfWeek = startOfWeek.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysFromMonday);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const periodStart =
    historyPeriod === 'daily'
      ? startOfToday
      : historyPeriod === 'weekly'
        ? startOfWeek
        : historyPeriod === 'monthly'
          ? startOfMonth
          : new Date(0);

  const periodHistory = history.filter(item => {
    const d = new Date(item.startedAt);
    return d >= periodStart && d <= now;
  });

  const periodCount = periodHistory.length;
  const periodDistance = periodHistory.reduce(
    (sum, item) => sum + item.distanceM,
    0,
  );
  const periodDuration = periodHistory.reduce(
    (sum, item) => sum + item.durationSec,
    0,
  );
  const periodCalories = periodHistory.reduce(
    (sum, item) => sum + item.calories,
    0,
  );
  const periodFloors = periodHistory.reduce(
    (sum, item) => sum + (item.estimatedFloors || 0),
    0,
  );

  const periodTitle =
    historyPeriod === 'daily'
      ? '\uC624\uB298'
      : historyPeriod === 'weekly'
        ? '\uC774\uBC88 \uC8FC'
        : historyPeriod === 'monthly'
          ? '\uC774\uBC88 \uB2EC'
          : '\uC804\uCCB4';

  return (
    <ScrollView ref={scrollRef} style={styles.container}>
      <View style={styles.header}>
        <Icon name={currentMeta.icon} size={32} color={currentMeta.color} />
        <Text style={styles.headerText}>활동 기록</Text>
      </View>

      <Text style={styles.sectionTitle}>활동 선택</Text>
      <View style={styles.activityRow}>
        {ACTIVITY_ORDER.map(type => {
          const meta = ACTIVITY_META[type];
          const active = selectedActivity === type;
          return (
            <Button
              key={type}
              mode={active ? 'contained' : 'outlined'}
              icon={meta.icon}
              buttonColor={active ? meta.color : undefined}
              textColor={active ? '#ffffff' : meta.color}
              style={styles.activityButton}
              onPress={() => !isTracking && setSelectedActivity(type)}>
              {meta.label}
            </Button>
          );
        })}
      </View>

      <Card style={styles.mainCard}>
        <Card.Content>
          <View style={styles.currentActivityHeader}>
            <Icon name={currentMeta.icon} size={22} color={currentMeta.color} />
            <Text style={[styles.currentActivityText, {color: currentMeta.color}]}>
              현재 선택: {currentMeta.label}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Icon name="map-marker-distance" size={32} color="#2E7D32" />
              <Text style={styles.statValue}>{(distance / 1000).toFixed(2)}</Text>
              <Text style={styles.statLabel}>km</Text>
            </View>

            <View style={styles.statItem}>
              <Icon name="clock-outline" size={32} color="#2196F3" />
              <Text style={styles.statValue}>{formatTime(duration)}</Text>
              <Text style={styles.statLabel}>시간</Text>
            </View>

            <View style={styles.statItem}>
              <Icon name="elevation-rise" size={32} color="#FF9800" />
              <Text style={styles.statValue}>{elevation.toFixed(0)}</Text>
              <Text style={styles.statLabel}>m 고도</Text>
            </View>

            <View style={styles.statItem}>
              <Icon name="fire" size={32} color="#F44336" />
              <Text style={styles.statValue}>{calories.toFixed(0)}</Text>
              <Text style={styles.statLabel}>kcal</Text>
            </View>

            {selectedActivity === 'building' && (
              <View style={styles.statItemFull}>
                <Icon name="stairs" size={28} color="#6A1B9A" />
                <Text style={styles.statValueSmall}>
                  예상 층수 {estimateFloors(elevation)}층
                </Text>
                <Text style={styles.statLabel}>상승 고도 기준</Text>
              </View>
            )}
          </View>

          {isTracking && (
            <View style={styles.trackingIndicator}>
              <ProgressBar indeterminate color={currentMeta.color} />
              <Text style={[styles.trackingText, {color: currentMeta.color}]}>
                {currentMeta.label} 기록 중...
              </Text>
            </View>
          )}
          <View style={styles.buttonContainer}>
            {!isTracking ? (
              <Button
                mode="contained"
                icon="play"
                buttonColor={currentMeta.color}
                onPress={() => startTracking(selectedActivity)}
                style={styles.button}>
                {currentMeta.label} {'\uC2DC\uC791'}
              </Button>
            ) : (
              <View>
                <Button
                  mode="contained"
                  icon="stop"
                  buttonColor="#F44336"
                  onPress={stopTracking}
                  style={styles.button}>
                  {'\uD65C\uB3D9 \uC885\uB8CC'}
                </Button>


                <TouchableOpacity
                  onPress={takeActivityPhoto}
                  disabled={cameraBusy}
                  style={{
                    marginTop: 12,
                    backgroundColor: '#1976D2',
                    minHeight: 52,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                  }}>
                  <Icon name="camera" size={24} color="#FFFFFF" />
                  <Text style={{
                    marginLeft: 8,
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}>
                    {'\uC0AC\uC9C4 \uCD2C\uC601'} {photos.length > 0 ? '(' + photos.length + '\uC7A5)' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
         </Card.Content>
       </Card>

       <Text
        style={styles.sectionTitle}
        onLayout={event => {
          historySectionYRef.current = event.nativeEvent.layout.y;
        }}>
        {'\uD65C\uB3D9 \uAE30\uB85D \uC870\uD68C'}
      </Text>

      <View style={styles.periodTabs}>
        {(
          [
            ['daily', '\uC624\uB298'],
            ['weekly', '\uC774\uBC88 \uC8FC'],
            ['monthly', '\uC774\uBC88 \uB2EC'],
            ['all', '\uC804\uCCB4'],
          ] as [HistoryPeriod, string][]
        ).map(([period, label]) => {
          const active = historyPeriod === period;
          return (
            <TouchableOpacity
              key={period}
              style={[styles.periodTab, active && styles.periodTabActive]}
              onPress={() => setHistoryPeriod(period)}>
              <Text
                style={[
                  styles.periodTabText,
                  active && styles.periodTabTextActive,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>
        {periodTitle} {'\uD65C\uB3D9 \uAE30\uB85D'}
      </Text>

      {periodHistory.length === 0 ? (
        <Card style={styles.historyCard}>
          <Card.Content>
            <Text style={styles.emptyText}>
              {periodTitle}{'\uC5D0 \uC800\uC7A5\uB41C \uD65C\uB3D9 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'}
            </Text>
          </Card.Content>
        </Card>
      ) : (
        periodHistory.slice(0, historyPeriod === 'all' ? 100 : 20).map(item => {
          const meta = ACTIVITY_META[item.activityType];
          return (
            <Card style={styles.historyCard} key={item.id}>
              <Card.Content>
                <View style={styles.historyTopRow}>
                  <View style={styles.historyTypeBadge}>
                    <Icon name={meta.icon} size={16} color={meta.color} />
                    <Text style={[styles.historyTypeText, {color: meta.color}]}>
                      {item.activityLabel}
                    </Text>
                  </View>
                  <Text style={styles.historyDateText}>
                    {formatDate(item.startedAt)}
                  </Text>
                </View>

                <View style={styles.historyItem}>
                  <View style={styles.historyDate}>
                    <Text style={styles.historyLocation}>
                      {item.locationLabel}
                    </Text>
                  </View>
                  <View style={styles.historyStats}>
                    <Text style={styles.historyStatText}>
                      {(item.distanceM / 1000).toFixed(2)}km {'\u2022'}{' '}
                      {formatHistoryDuration(item.durationSec)}
                    </Text>
                    <Text style={styles.historyStatText}>
                      {'\uACE0\uB3C4'} {item.elevationM}m {'\u2022'} {item.calories}kcal
                    </Text>
                    {item.activityType === 'building' && (
                      <Text style={styles.historyStatText}>
                        {'\uC608\uC0C1 \uCE35\uC218'} {item.estimatedFloors || 0}{'\uCE35'}
                      </Text>
                    )}
                   </View>
                 </View>
                 {(item.hasRoute || item.routePoints?.length || item.photos?.length) ? (
                   <Button icon="map-marker-path" onPress={() => openRecord(item)}>
                     경로·사진 보기 {item.photos?.length ? `(${item.photos.length}장)` : ''}
                   </Button>
                 ) : null}
               </Card.Content>
             </Card>
          );
        })
      )}

      <Text style={styles.sectionTitle}>
        {periodTitle} {'\uD1B5\uACC4'}
      </Text>

      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{'\uCD1D \uD65C\uB3D9 \uD69F\uC218'}</Text>
            <Text style={styles.summaryValue}>{periodCount}{'\uD68C'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{'\uCD1D \uAC70\uB9AC'}</Text>
            <Text style={styles.summaryValue}>
              {(periodDistance / 1000).toFixed(1)}km
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{'\uCD1D \uC2DC\uAC04'}</Text>
            <Text style={styles.summaryValue}>
              {formatHistoryDuration(periodDuration)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {'\uC608\uC0C1 \uC18C\uBAA8 \uCE7C\uB85C\uB9AC'}
            </Text>
            <Text style={styles.summaryValue}>{periodCalories}kcal</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {'\uBE4C\uB529 \uC0C1\uC2B9 \uCE35\uC218'}
            </Text>
            <Text style={styles.summaryValue}>{periodFloors}{'\uCE35'}</Text>
          </View>
        </Card.Content>
      </Card>
      <Modal visible={!!selectedRecord} animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
        <View style={styles.routeModal}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeTitle}>{selectedRecord?.activityLabel || '활동'} 경로·사진</Text>
            <View style={styles.routeHeaderButtons}>
              {selectedRecord ? (
                <Button icon={pro.isPro ? 'export-variant' : 'lock'} onPress={() => exportGpx(selectedRecord)}>GPX</Button>
              ) : null}
              <Button onPress={() => {setSelectedRecord(null); setSelectedPhoto(null);}}>닫기</Button>
            </View>
          </View>
          <ProUpgradeModal
            visible={gpxUpgradeVisible}
            featureName="GPX 경로 내보내기"
            onClose={() => setGpxUpgradeVisible(false)}
          />
          {selectedRecord?.routePoints && selectedRecord.routePoints.length > 0 ? (
            <MapView
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              style={styles.routeMap}
              initialRegion={{
                latitude: selectedRecord.routePoints[0].latitude,
                longitude: selectedRecord.routePoints[0].longitude,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              }}>
              {selectedRecord.routePoints.length > 1 && (
                <Polyline coordinates={selectedRecord.routePoints} strokeColor="#2E7D32" strokeWidth={4} />
              )}
              {selectedRecord.photos?.filter(photo => photo.latitude !== undefined && photo.longitude !== undefined).map(photo => (
                <Marker
                  key={photo.id}
                  coordinate={{latitude: photo.latitude!, longitude: photo.longitude!}}
                  onPress={() => setSelectedPhoto(photo)}
                  title="촬영 사진"
                  description={new Date(photo.timestamp).toLocaleString()} />
              ))}
            </MapView>
          ) : (
            <Text style={styles.noRouteText}>저장된 GPS 경로가 없습니다. 사진은 아래에서 확인할 수 있습니다.</Text>
          )}
          {selectedPhoto && (
            <View style={styles.selectedPhotoBox}>
              <Image source={{uri: resolveAppFileUri(selectedPhoto.uri)}} style={styles.selectedPhotoImage} resizeMode="contain" />
              <Text>{new Date(selectedPhoto.timestamp).toLocaleString()}</Text>
            </View>
          )}
          <ScrollView horizontal style={styles.photoStrip} contentContainerStyle={styles.photoStripContent}>
            {selectedRecord?.photos?.map(photo => (
              <TouchableOpacity key={photo.id} onPress={() => setSelectedPhoto(photo)}>
                <Image source={{uri: resolveAppFileUri(photo.uri)}} style={styles.photoThumbnail} />
                <Text style={styles.photoTime}>{new Date(photo.timestamp).toLocaleTimeString()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
     </ScrollView>
   );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 16,
    marginTop: 16,
    marginBottom: 12,
    color: '#333',
  },
  activityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  activityButton: {
    marginHorizontal: 4,
    marginBottom: 8,
  },
  mainCard: {
    margin: 16,
    elevation: 4,
  },
  currentActivityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentActivityText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
    width: '45%',
    marginBottom: 20,
  },
  statItemFull: {
    alignItems: 'center',
    width: '95%',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statValueSmall: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  trackingIndicator: {
    marginBottom: 16,
  },
  trackingText: {
    textAlign: 'center',
    marginTop: 8,
    fontWeight: 'bold',
  },
  buttonContainer: {
    marginTop: 8,
  },
   button: {
     paddingVertical: 6,
   },
   photoButton: {marginTop: 12},
   routeModal: {flex: 1, backgroundColor: '#fff'},
   routeHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12},
   routeTitle: {fontSize: 18, fontWeight: 'bold', color: '#333', flexShrink: 1},
   routeHeaderButtons: {flexDirection: 'row', alignItems: 'center'},
   routeMap: {flex: 1},
   noRouteText: {flex: 1, padding: 24, textAlign: 'center', color: '#666'},
   selectedPhotoBox: {height: 220, alignItems: 'center', padding: 8},
   selectedPhotoImage: {height: 180, width: '100%'},
   photoStrip: {flexGrow: 0, maxHeight: 120},
   photoStripContent: {padding: 8, gap: 10},
   photoThumbnail: {height: 76, width: 76, borderRadius: 8},
   photoTime: {fontSize: 11, color: '#555'},
  periodTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 4,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
  },
  periodTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  periodTabActive: {
    backgroundColor: '#2E7D32',
  },
  periodTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  historyCard: {
    margin: 12,
    marginBottom: 8,
    elevation: 2,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    alignItems: 'center',
  },
  historyTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  historyTypeText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyDate: {
    flex: 1,
  },
  historyDateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  historyLocation: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  historyStats: {
    flex: 1,
    alignItems: 'flex-end',
  },
  historyStatText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  summaryCard: {
    margin: 16,
    marginBottom: 32,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
});

export default TrackingScreen;
