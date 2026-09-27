import React, {useEffect, useRef, useState} from 'react';
import {View, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Modal, PermissionsAndroid, Platform} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import {launchCamera} from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Text, Card, Button, ProgressBar} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationService from '../services/LocationService';
import {requestLocationPermission} from '../utils/permissions';

const HISTORY_KEY = 'hiker_activity_history';
const VISITED_KEY = 'hiker_visited_regions';

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

type HistoryPeriod = 'daily' | 'weekly' | 'monthly';

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
  const [cameraBusy, setCameraBusy] = useState(false);

  const watchRef = useRef<{remove: () => void} | null>(null);
  const pointsRef = useRef<TrackingPoint[]>([]);
  const photosRef = useRef<ActivityPhoto[]>([]);
  const cameraBusyRef = useRef(false);
  const lastLocationRef = useRef<{latitude: number; longitude: number; timestamp: number; accuracy: number} | null>(null);
  const distanceRef = useRef(0);
  const elevationRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const activityRef = useRef<ActivityType>('hiking');
  const activityWeightKgRef = useRef(70);

  useEffect(() => {
    loadHistory();

    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
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
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.sort((a, b) => b.endedAt - a.endedAt);
        setHistory(parsed);
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to load activity history:', error);
      setHistory([]);
    }
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

    const prev = pointsRef.current[pointsRef.current.length - 1];

    if (prev) {
      const segment = getDistanceMeters(prev, point);
      if (segment > 0.5 && segment < 250) {
        distanceRef.current += segment;
        setDistance(distanceRef.current);
      }

      const climb = Math.max(0, point.altitude - prev.altitude);
      if (climb > 0 && climb < 120) {
        elevationRef.current += climb;
        setElevation(elevationRef.current);
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
        Alert.alert('사진 촬영 실패', result.errorMessage || result.errorCode);
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
      const location = lastLocationRef.current;
      const validLocation = location &&
        capturedAt - location.timestamp <= 30000 &&
        location.accuracy <= 50 &&
        Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
      const photo: ActivityPhoto = {
        id: 'photo_' + capturedAt,
        uri: 'file://' + path,
        timestamp: capturedAt,
        ...(validLocation ? {latitude: location!.latitude, longitude: location!.longitude} : {}),
      };
      photosRef.current = [...photosRef.current, photo];
      setPhotos([...photosRef.current]);
    } catch (error) {
      console.error('Activity photo error:', error);
      Alert.alert('사진 저장 실패', '사진을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      cameraBusyRef.current = false;
      setCameraBusy(false);
    }
  };

  const startTracking = async (activityType?: ActivityType) => {
  try {
    const permissionGranted = await requestLocationPermission();

    if (!permissionGranted) {
      return;
    }

      const nextActivity = activityType || selectedActivity;
      
      setSelectedActivity(nextActivity);
      activityRef.current = nextActivity;

      let activityWeightKg = 70;
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
      activityWeightKgRef.current = activityWeightKg;

      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }

      const now = Date.now();

      pointsRef.current = [];
      photosRef.current = [];
      lastLocationRef.current = null;
      setPhotos([]);
      distanceRef.current = 0;
      elevationRef.current = 0;
      startTimeRef.current = now;

      setIsTracking(true);
      setStartTime(now);
      setDistance(0);
      setDuration(0);
      setElevation(0);
      setCalories(0);

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
    } catch (error) {
      console.error('Failed to start tracking:', error);
      setIsTracking(false);
      setStartTime(null);
      startTimeRef.current = null;
    }
  };

   const stopTracking = async () => {
    if (cameraBusyRef.current) {
      Alert.alert('사진 저장 중', '사진 저장이 끝난 뒤 활동을 종료해 주세요.');
      return;
    }
    const startedAt = startTimeRef.current;
    const endedAt = Date.now();
    const finalActivity = activityRef.current;

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

    const finalDuration = Math.max(
      duration,
      Math.floor((endedAt - startedAt) / 1000),
    );
    setDuration(finalDuration);

    const points = [...pointsRef.current];
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1] || firstPoint;

    const visitedRegionKeys = Array.from(
      new Set(points.map(point => makeRegionKey(point))),
    );

    const finalCalories = estimateCalories(
      distanceRef.current,
      elevationRef.current,
      finalDuration,
      finalActivity,
      activityWeightKgRef.current,
    );

    const record: ActivityRecord = {
      id: `activity_${endedAt}`,
      activityType: finalActivity,
      activityLabel: ACTIVITY_META[finalActivity].label,
      startedAt,
      endedAt,
      durationSec: finalDuration,
      distanceM: Math.round(distanceRef.current),
      elevationM: Math.round(elevationRef.current),
      calories: finalCalories,
      weightKgUsed: activityWeightKgRef.current,
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
           ? estimateFloors(Math.round(elevationRef.current))
           : undefined,
       routePoints: points,
       photos: [...photosRef.current],
    };

    try {
      const rawHistory = await AsyncStorage.getItem(HISTORY_KEY);
      const existingHistory = rawHistory ? JSON.parse(rawHistory) : [];
      const nextHistory = Array.isArray(existingHistory)
        ? [record, ...existingHistory].sort((a, b) => b.endedAt - a.endedAt)
        : [record];

      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      setHistory(nextHistory);

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
      console.error('Failed to save activity result:', error);
    }

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
        : startOfMonth;

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
        : '\uC774\uBC88 \uB2EC';

  return (
    <ScrollView style={styles.container}>
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

       <Text style={styles.sectionTitle}>
        {'\uD65C\uB3D9 \uAE30\uB85D \uC870\uD68C'}
      </Text>

      <View style={styles.periodTabs}>
        {(
          [
            ['daily', '\uC624\uB298'],
            ['weekly', '\uC774\uBC88 \uC8FC'],
            ['monthly', '\uC774\uBC88 \uB2EC'],
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
        periodHistory.slice(0, 20).map(item => {
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
                 {(item.routePoints?.length || item.photos?.length) ? (
                   <Button icon="map-marker-path" onPress={() => {setSelectedRecord(item); setSelectedPhoto(null);}}>
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
            <Button onPress={() => {setSelectedRecord(null); setSelectedPhoto(null);}}>닫기</Button>
          </View>
          {selectedRecord?.routePoints && selectedRecord.routePoints.length > 0 ? (
            <MapView
              provider={PROVIDER_GOOGLE}
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
              <Image source={{uri: selectedPhoto.uri}} style={styles.selectedPhotoImage} resizeMode="contain" />
              <Text>{new Date(selectedPhoto.timestamp).toLocaleString()}</Text>
            </View>
          )}
          <ScrollView horizontal style={styles.photoStrip} contentContainerStyle={styles.photoStripContent}>
            {selectedRecord?.photos?.map(photo => (
              <TouchableOpacity key={photo.id} onPress={() => setSelectedPhoto(photo)}>
                <Image source={{uri: photo.uri}} style={styles.photoThumbnail} />
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
   routeTitle: {fontSize: 18, fontWeight: 'bold', color: '#333'},
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
