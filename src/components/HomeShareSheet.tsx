import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import RouteMapPreview, {
  MIN_ROUTE_POINTS,
  RoutePoint,
  RoutePhotoMarker,
  getPhotoMarkers,
  getValidRoutePoints,
} from './RouteMapPreview';
import {
  shareImageContent,
  shareTextContent,
  shareErrorMessage,
  toFilePath,
  copyTextToClipboard,
  composeActivityCard,
} from '../utils/nativeShare';
import {
  SharedPlanData,
  buildPlanShareMessage,
  isValidPlanDate,
  isValidPlanTime,
} from '../utils/planShare';

// 기존 저장 구조를 읽기만 함 (쓰기 없음)
const PHOTO_LIBRARY_KEY = 'hiker_photo_library';
const HISTORY_KEY = 'hiker_activity_history';
const PLANS_KEY = 'hiker_hiking_plans';

const ACTIVITY_LABELS: Record<string, string> = {
  hiking: '등산',
  building: '빌딩 오르기',
  walking: '걷기',
  running: '러닝',
  cycling: '자전거',
};

const ACTIVITY_ICONS: Record<string, string> = {
  hiking: 'terrain',
  building: 'office-building',
  walking: 'walk',
  running: 'run',
  cycling: 'bike',
};

type Step = 'menu' | 'photos' | 'activities' | 'activityPhotos' | 'route' | 'routeSent' | 'plans';
type ActivityMode = 'route' | 'photoActivity';

type SharePhoto = {id: string; uri: string; timestamp: number | null};

type ActivityItem = {
  id: string;
  raw: any;
  label: string;
  icon: string;
  dateText: string;
  distanceText: string;
  photoCount: number;
  routeCount: number;
};

type PlanItem = {key: string; plan: SharedPlanData};

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

const formatDate = (ms: number) => {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};

const formatDateTime = (ms: number) => {
  const d = new Date(ms);
  return formatDate(ms) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const formatDuration = (sec: number) => {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) {
    return h + '시간' + (m > 0 ? ' ' + m + '분' : '');
  }
  return m + '분';
};

const activityLabelOf = (r: any) => {
  if (typeof r?.activityLabel === 'string' && r.activityLabel.trim()) {
    return r.activityLabel.trim();
  }
  return ACTIVITY_LABELS[r?.activityType] || '';
};

const SUMMARY_FOOTER = 'HIKERPRO로 기록했어요 #HIKERPRO';

// 활동 요약 항목: 실제 저장된 값만 사용. 좌표/지역명/현재 위치는 넣지 않음
// (텍스트 요약과 이미지 요약 카드가 같은 항목을 쓰도록 공통화)
export const buildActivitySummaryRows = (r: any) => {
  const rows: {label: string; value: string}[] = [];
  const label = activityLabelOf(r);
  if (label) {
    rows.push({label: '활동', value: label});
  }
  const dateMs = isFiniteNumber(r?.startedAt) ? r.startedAt : isFiniteNumber(r?.endedAt) ? r.endedAt : null;
  if (dateMs !== null) {
    rows.push({label: '날짜', value: formatDate(dateMs)});
  }
  if (isFiniteNumber(r?.distanceM) && r.distanceM >= 0) {
    rows.push({label: '이동거리', value: (r.distanceM / 1000).toFixed(2) + ' km'});
  }
  if (isFiniteNumber(r?.durationSec) && r.durationSec > 0) {
    rows.push({label: '소요시간', value: formatDuration(r.durationSec)});
  }
  if (isFiniteNumber(r?.elevationM)) {
    rows.push({label: '상승 고도', value: Math.round(r.elevationM) + ' m'});
  }
  if (isFiniteNumber(r?.estimatedFloors)) {
    rows.push({label: '예상 층수', value: r.estimatedFloors + '층'});
  }
  if (isFiniteNumber(r?.calories) && r.calories > 0) {
    rows.push({label: '칼로리', value: Math.round(r.calories) + ' kcal'});
  }
  return rows;
};

export const buildActivitySummary = (r: any) => {
  const lines = ['🥾 HIKERPRO 활동 기록'];
  buildActivitySummaryRows(r).forEach(row => lines.push(row.label + ': ' + row.value));
  lines.push('');
  lines.push(SUMMARY_FOOTER);
  return lines.join('\n');
};

// 저장소 JSON 읽기. 손상 시 null + 안내 (쓰지 않음)
const readJsonArray = async (key: string, what: string): Promise<any[] | null> => {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null || raw === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    // fallthrough
  }
  Alert.alert('데이터 오류', what + ' 데이터를 읽을 수 없습니다. 기존 데이터는 변경하지 않았습니다.');
  return null;
};

const fileExists = async (uri: string) => {
  try {
    return await ReactNativeBlobUtil.fs.exists(toFilePath(uri));
  } catch (e) {
    return false;
  }
};

// 파일이 실제로 있는 사진만 반환
const existingPhotos = async (photos: unknown): Promise<{list: SharePhoto[]; missing: number}> => {
  if (!Array.isArray(photos)) {
    return {list: [], missing: 0};
  }
  const candidates = photos.filter(
    p => p && typeof p.uri === 'string' && p.uri.startsWith('file://'),
  );
  const checks = await Promise.all(candidates.map(p => fileExists(p.uri)));
  const list: SharePhoto[] = [];
  candidates.forEach((p, i) => {
    if (checks[i]) {
      list.push({
        id: typeof p.id === 'string' ? p.id : p.uri,
        uri: p.uri,
        timestamp: isFiniteNumber(p.timestamp) ? p.timestamp : null,
      });
    }
  });
  list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return {list, missing: photos.length - list.length};
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

const HomeShareSheet = ({visible, onClose}: Props) => {
  const mapRef = useRef<MapView | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('menu');
  const [mode, setMode] = useState<ActivityMode>('route');
  const [homePhotos, setHomePhotos] = useState<SharePhoto[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const [activityPhotos, setActivityPhotos] = useState<SharePhoto[]>([]);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [photoMarkers, setPhotoMarkers] = useState<RoutePhotoMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [sentSummary, setSentSummary] = useState('');
  const [sentWithCard, setSentWithCard] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep('menu');
      setSelected(null);
      setHomePhotos([]);
      setActivities([]);
      setActivityPhotos([]);
      setRoutePoints([]);
      setPhotoMarkers([]);
      setPlans([]);
      setMapReady(false);
      setSentSummary('');
    }
  }, [visible]);

  // onMapLoaded 가 오지 않는 기기 대비: 일정 시간 후 공유 버튼 활성화
  useEffect(() => {
    if (step !== 'route') {
      return;
    }
    setMapReady(false);
    const timer = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(timer);
  }, [step]);

  const runBusy = async (task: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const shareText = async (message: string, title: string) => {
    try {
      await shareTextContent(message, title);
      onClose();
    } catch (e) {
      Alert.alert('공유 실패', shareErrorMessage(e));
    }
  };

  const shareImage = async (uri: string, message: string, title: string) => {
    try {
      await shareImageContent(uri, message, title);
      onClose();
    } catch (e) {
      console.warn('Image share error:', e);
      Alert.alert('공유 실패', shareErrorMessage(e));
    }
  };

  // ---- 1. 내가 찍은 사진 ----
  const openHomePhotos = () =>
    runBusy(async () => {
      const raw = await readJsonArray(PHOTO_LIBRARY_KEY, '사진 목록');
      if (raw === null) {
        return;
      }
      const {list, missing} = await existingPhotos(raw);
      if (list.length === 0) {
        Alert.alert(
          '사진 없음',
          '공유할 사진이 없습니다.' + (missing > 0 ? '\n(파일이 삭제된 사진 ' + missing + '장은 제외했습니다.)' : ''),
        );
        return;
      }
      setHomePhotos(list);
      setStep('photos');
    });

  const shareHomePhoto = (photo: SharePhoto) =>
    runBusy(async () => {
      if (!(await fileExists(photo.uri))) {
        Alert.alert('사진 없음', '사진 파일을 찾을 수 없습니다. 삭제되었을 수 있습니다.');
        return;
      }
      // GPS 좌표는 넣지 않음
      const message =
        '📷 HIKERPRO에서 찍은 사진' +
        (photo.timestamp !== null ? ' · ' + formatDateTime(photo.timestamp) : '');
      await shareImage(photo.uri, message, 'HIKERPRO 사진');
    });

  // ---- 2/3. 활동 목록 ----
  const openActivities = (nextMode: ActivityMode) =>
    runBusy(async () => {
      const raw = await readJsonArray(HISTORY_KEY, '활동 기록');
      if (raw === null) {
        return;
      }
      const items: ActivityItem[] = raw
        .filter(r => r && typeof r === 'object' && typeof r.id === 'string')
        .map(r => {
          const dateMs = isFiniteNumber(r.startedAt) ? r.startedAt : isFiniteNumber(r.endedAt) ? r.endedAt : null;
          return {
            id: r.id,
            raw: r,
            label: activityLabelOf(r) || '활동',
            icon: ACTIVITY_ICONS[r.activityType] || 'map-marker-path',
            dateText: dateMs !== null ? formatDateTime(dateMs) : '날짜 정보 없음',
            distanceText: isFiniteNumber(r.distanceM) ? (r.distanceM / 1000).toFixed(2) + ' km' : '',
            photoCount: Array.isArray(r.photos) ? r.photos.length : 0,
            routeCount: getValidRoutePoints(r.routePoints).length,
          };
        });
      if (items.length === 0) {
        Alert.alert('활동 기록 없음', '공유할 활동 기록이 없습니다.');
        return;
      }
      setMode(nextMode);
      setActivities(items);
      setStep('activities');
    });

  const confirmTextOnly = (item: ActivityItem, title: string, reason: string) => {
    Alert.alert(title, reason + '\n활동 요약만 공유할까요?', [
      {text: '취소', style: 'cancel'},
      {
        text: '요약 공유',
        onPress: () => shareText(buildActivitySummary(item.raw), 'HIKERPRO 활동 기록'),
      },
    ]);
  };

  const selectActivity = (item: ActivityItem) =>
    runBusy(async () => {
      setSelected(item);
      if (mode === 'route') {
        const points = getValidRoutePoints(item.raw.routePoints);
        if (points.length < MIN_ROUTE_POINTS) {
          confirmTextOnly(item, '이동경로 없음', '이 활동에는 지도 이미지를 만들 만큼의 이동경로가 없습니다.');
          return;
        }
        setRoutePoints(points);
        setPhotoMarkers(getPhotoMarkers(item.raw.photos));
        setStep('route');
        return;
      }
      // 사진 + 활동 기록
      const {list, missing} = await existingPhotos(item.raw.photos);
      if (list.length === 0) {
        Alert.alert(
          '사진 없음',
          '이 활동에는 공유할 사진이 없습니다.' +
            (missing > 0 ? '\n(파일이 삭제된 사진 ' + missing + '장은 제외했습니다.)' : ''),
        );
        return;
      }
      setActivityPhotos(list);
      setStep('activityPhotos');
    });

  const shareActivityPhoto = (photo: SharePhoto) =>
    runBusy(async () => {
      if (!selected) {
        return;
      }
      if (!(await fileExists(photo.uri))) {
        Alert.alert('사진 없음', '사진 파일을 찾을 수 없습니다. 삭제되었을 수 있습니다.');
        return;
      }
      await shareImage(photo.uri, buildActivitySummary(selected.raw), 'HIKERPRO 활동 기록');
    });

  const shareRouteSnapshot = () =>
    runBusy(async () => {
      if (!selected) {
        return;
      }
      const summary = buildActivitySummary(selected.raw);
      let snapshotUri: string | null = null;
      try {
        if (!mapRef.current) {
          throw new Error('map not ready');
        }
        snapshotUri = await mapRef.current.takeSnapshot({
          format: 'png',
          quality: 1,
          result: 'file',
        });
      } catch (e) {
        console.warn('Route snapshot error:', e);
        snapshotUri = null;
      }
      if (!snapshotUri) {
        confirmTextOnly(selected, '지도 이미지 생성 실패', '이동경로 지도 이미지를 만들지 못했습니다.');
        return;
      }
      const uri = snapshotUri.startsWith('file://') ? snapshotUri : 'file://' + snapshotUri;
      // 공유 직전 snapshot 파일 존재 확인 (PNG)
      if (!uri.toLowerCase().endsWith('.png') || !(await fileExists(uri))) {
        console.warn('Route snapshot file missing:', uri);
        confirmTextOnly(selected, '지도 이미지 없음', '생성한 지도 이미지 파일을 찾을 수 없습니다.');
        return;
      }
      // 지도 아래에 요약 카드를 합성해 이미지 1장으로 만듦. 실패하면 지도 이미지만 공유
      let shareUri = uri;
      let withCard = false;
      try {
        const cardUri = await composeActivityCard(
          uri,
          'HIKERPRO 활동 기록',
          buildActivitySummaryRows(selected.raw),
          SUMMARY_FOOTER,
        );
        if (cardUri && (await fileExists(cardUri))) {
          shareUri = cardUri;
          withCard = true;
        }
      } catch (e) {
        console.warn('Activity card compose error:', e);
      }
      try {
        const result = await shareImageContent(shareUri, summary, 'HIKERPRO 활동 기록');
        // snapshot 파일과 실제 공유한 파일이 같은지 확인 (개발 로그)
        if (result) {
          const same = result.filePath.endsWith(toFilePath(shareUri).split('/').pop() || '');
          console.log('[HikerShare] snapshot:', uri, 'shared:', shareUri, '→', result.contentUri, result.mimeType, 'card:', withCard, 'text:', result.textAttached, 'sameFile:', same);
        }
        // 대상 앱이 이미지와 글을 함께 받지 않을 수 있으므로 요약 텍스트 후속 전달 화면 표시
        setSentSummary(summary);
        setSentWithCard(withCard);
        setStep('routeSent');
      } catch (e) {
        console.warn('Route image share error:', e);
        Alert.alert('공유 실패', shareErrorMessage(e));
      }
    });

  const copySummary = () =>
    runBusy(async () => {
      try {
        await copyTextToClipboard(sentSummary, 'HIKERPRO 활동 기록');
        Alert.alert('복사 완료', '활동 요약을 복사했습니다. 대화창 입력칸을 길게 눌러 붙여넣기 하세요.');
      } catch (e) {
        Alert.alert('복사 실패', shareErrorMessage(e));
      }
    });

  const shareSummarySeparately = () =>
    runBusy(async () => {
      try {
        await shareTextContent(sentSummary, 'HIKERPRO 활동 기록');
      } catch (e) {
        Alert.alert('공유 실패', shareErrorMessage(e));
      }
    });

  // ---- 4. 등산계획 (planShare.ts 재사용) ----
  const openPlans = () =>
    runBusy(async () => {
      const raw = await readJsonArray(PLANS_KEY, '등산계획');
      if (raw === null) {
        return;
      }
      const items: PlanItem[] = raw
        .filter(
          p =>
            p &&
            typeof p.destination === 'string' &&
            p.destination.trim() &&
            typeof p.date === 'string' &&
            isValidPlanDate(p.date),
        )
        .map((p, i) => {
          const party = Math.floor(Number(p.partySize));
          return {
            key: typeof p.id === 'string' ? p.id : 'plan_' + i,
            plan: {
              destination: p.destination.trim(),
              date: p.date,
              startTime:
                typeof p.startTime === 'string' && isValidPlanTime(p.startTime.trim())
                  ? p.startTime.trim()
                  : '',
              expectedDuration: typeof p.expectedDuration === 'string' ? p.expectedDuration : '',
              partySize: Number.isFinite(party) && party >= 1 ? Math.min(party, 99) : 1,
              memo: typeof p.memo === 'string' ? p.memo : '',
            },
          };
        })
        .sort((a, b) =>
          a.plan.date !== b.plan.date
            ? a.plan.date < b.plan.date ? -1 : 1
            : (a.plan.startTime || '99:99') < (b.plan.startTime || '99:99') ? -1 : 1,
        );
      if (items.length === 0) {
        Alert.alert('등산계획 없음', '공유할 등산계획이 없습니다.');
        return;
      }
      setPlans(items);
      setStep('plans');
    });

  const sharePlan = (item: PlanItem) =>
    runBusy(async () => {
      await shareText(buildPlanShareMessage(item.plan), 'HIKERPRO 등산계획');
    });

  const goBack = () => {
    if (step === 'routeSent') {
      onClose();
    } else if (step === 'activityPhotos' || step === 'route') {
      setStep('activities');
    } else {
      setStep('menu');
    }
  };

  const titleByStep: Record<Step, string> = {
    menu: '무엇을 공유할까요?',
    photos: '공유할 사진 선택',
    activities: mode === 'route' ? '공유할 활동 선택' : '활동 선택 (사진 + 기록)',
    activityPhotos: '공유할 활동 사진 선택',
    route: '이동경로 공유',
    routeSent: '활동 요약도 보내기',
    plans: '공유할 등산계획 선택',
  };

  const MENU = [
    {key: 'photo', icon: 'camera', color: '#1565C0', label: '내가 찍은 사진', sub: '홈에서 촬영한 사진 1장', onPress: openHomePhotos},
    {key: 'route', icon: 'map-marker-path', color: '#2E7D32', label: '활동 기록 / 이동경로', sub: '활동 요약 + 경로 지도 이미지', onPress: () => openActivities('route')},
    {key: 'photoActivity', icon: 'image-multiple', color: '#EF6C00', label: '사진 + 활동 기록', sub: '활동 사진 1장 + 활동 요약', onPress: () => openActivities('photoActivity')},
    {key: 'plan', icon: 'calendar-check', color: '#6A1B9A', label: '등산계획', sub: '계획 내용 + HIKERPRO 링크', onPress: openPlans},
  ];

  const renderPhotoRow = (photo: SharePhoto, onPress: () => void) => (
    <Pressable
      key={photo.id}
      accessibilityRole="button"
      accessibilityLabel={'사진 공유 ' + (photo.timestamp !== null ? formatDateTime(photo.timestamp) : '')}
      disabled={busy}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Image source={{uri: photo.uri}} style={styles.thumb} />
      <View style={styles.rowTextBox}>
        <Text style={styles.rowTitle}>
          {photo.timestamp !== null ? formatDateTime(photo.timestamp) : '촬영 시각 정보 없음'}
        </Text>
        <Text style={styles.rowSub}>눌러서 공유하기</Text>
      </View>
      <Icon name="share-variant" size={20} color="#1565C0" />
    </Pressable>
  );

  const renderBody = () => {
    switch (step) {
      case 'menu':
        return MENU.map(item => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            disabled={busy}
            onPress={item.onPress}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.menuIcon, {backgroundColor: item.color + '1A'}]}>
              <Icon name={item.icon} size={24} color={item.color} />
            </View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowTitle}>{item.label}</Text>
              <Text style={styles.rowSub}>{item.sub}</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#90A4AE" />
          </Pressable>
        ));
      case 'photos':
        return homePhotos.map(photo => renderPhotoRow(photo, () => shareHomePhoto(photo)));
      case 'activityPhotos':
        return activityPhotos.map(photo => renderPhotoRow(photo, () => shareActivityPhoto(photo)));
      case 'activities':
        return activities.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label + ' ' + item.dateText}
            disabled={busy}
            onPress={() => selectActivity(item)}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.menuIcon, {backgroundColor: '#E8F5E9'}]}>
              <Icon name={item.icon} size={22} color="#2E7D32" />
            </View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowTitle}>
                {item.label}
                {item.distanceText ? ' · ' + item.distanceText : ''}
              </Text>
              <Text style={styles.rowSub}>
                {item.dateText}
                {mode === 'route'
                  ? item.routeCount >= MIN_ROUTE_POINTS ? ' · 경로 있음' : ' · 경로 없음'
                  : ' · 사진 ' + item.photoCount + '장'}
              </Text>
            </View>
            <Icon name="chevron-right" size={22} color="#90A4AE" />
          </Pressable>
        ));
      case 'route':
        return (
          <View>
            <View style={styles.mapBox}>
              <RouteMapPreview
                ref={mapRef}
                points={routePoints}
                photoMarkers={photoMarkers}
                onMapLoaded={() => setMapReady(true)}
              />
            </View>
            <Text style={styles.notice}>
              지도 아래에 활동 요약 카드를 붙인 이미지 1장과 요약 글이 공유됩니다. 좌표 숫자는 포함되지 않지만, 지도에는 출발·도착 위치가 그대로 보입니다.
            </Text>
            {selected && <Text style={styles.summary}>{buildActivitySummary(selected.raw)}</Text>}
            <Pressable
              accessibilityRole="button"
              disabled={busy || !mapReady}
              onPress={shareRouteSnapshot}
              style={({pressed}) => [
                styles.primaryBtn,
                (pressed || busy || !mapReady) && styles.pressed,
              ]}>
              {busy || !mapReady ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>지도 이미지와 함께 공유</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                selected &&
                runBusy(() => shareText(buildActivitySummary(selected.raw), 'HIKERPRO 활동 기록'))
              }
              style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryBtnText}>활동 요약만 공유</Text>
            </Pressable>
          </View>
        );
      case 'routeSent':
        return (
          <View>
            <View style={styles.sentBox}>
              <Icon name="information-outline" size={20} color="#1565C0" />
              <Text style={styles.sentText}>
                {sentWithCard
                  ? '활동 요약이 들어간 지도 이미지 1장을 공유창에 전달했습니다. 카카오톡처럼 이미지와 글을 함께 받지 않는 앱에서도 요약은 이미지 안에 보입니다.\n요약을 글로도 보내려면 아래 버튼을 사용하세요.'
                  : '요약 이미지를 만들지 못해 지도 이미지만 공유창에 전달했습니다. 카카오톡 등 일부 앱은 이미지와 글을 함께 받지 않아 요약 글이 빠질 수 있으니 아래 버튼으로 따로 보내 주세요.'}
              </Text>
            </View>
            <Text style={styles.summary}>{sentSummary}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={copySummary}
              style={({pressed}) => [styles.primaryBtn, (pressed || busy) && styles.pressed]}>
              <Text style={styles.primaryBtnText}>요약 텍스트 복사</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={shareSummarySeparately}
              style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryBtnText}>요약 텍스트 따로 공유</Text>
            </Pressable>
          </View>
        );
      case 'plans':
        return plans.map(item => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.plan.destination + ' 계획 공유'}
            disabled={busy}
            onPress={() => sharePlan(item)}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.menuIcon, {backgroundColor: '#F3E5F5'}]}>
              <Icon name="terrain" size={22} color="#6A1B9A" />
            </View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.plan.destination}
              </Text>
              <Text style={styles.rowSub}>
                {item.plan.date} · 출발 {item.plan.startTime || '미정'} · {item.plan.partySize}명
              </Text>
            </View>
            <Icon name="share-variant" size={20} color="#6A1B9A" />
          </Pressable>
        ));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={step === 'menu' ? onClose : goBack}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            {step !== 'menu' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} hitSlop={8} style={styles.headerBtn}>
                <Icon name="arrow-left" size={22} color="#37474F" />
              </Pressable>
            ) : (
              <View style={styles.headerBtn}>
                <Icon name="share-variant" size={22} color="#EF6C00" />
              </View>
            )}
            <Text style={styles.title}>{titleByStep[step]}</Text>
            {busy && step !== 'route' && <ActivityIndicator size="small" color="#2E7D32" />}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {renderBody()}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            disabled={busy}
            style={({pressed}) => [styles.cancelBtn, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F3F5F2',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    backgroundColor: '#C8D0CA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  headerBtn: {
    width: 32,
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    color: '#263238',
    fontSize: 18,
    fontWeight: '900',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  pressed: {
    opacity: 0.65,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#DDE5DD',
  },
  rowTextBox: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowTitle: {
    color: '#263238',
    fontSize: 15,
    fontWeight: '800',
  },
  rowSub: {
    marginTop: 3,
    color: '#78909C',
    fontSize: 12,
  },
  mapBox: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#DDE5DD',
  },
  notice: {
    marginTop: 8,
    color: '#607D8B',
    fontSize: 12,
    lineHeight: 17,
  },
  sentBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#E3F2FD',
  },
  sentText: {
    flex: 1,
    marginLeft: 8,
    color: '#0D47A1',
    fontSize: 13,
    lineHeight: 19,
  },
  summary: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    color: '#37474F',
    fontSize: 13,
    lineHeight: 19,
  },
  primaryBtn: {
    height: 52,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryBtn: {
    height: 48,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#E8F0E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#2E7D32',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelBtn: {
    height: 50,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#455A64',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default HomeShareSheet;
