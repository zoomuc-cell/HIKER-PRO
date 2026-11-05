// 활동 기록 저장소
//
// - 활동 목록(hiker_activity_history)에는 요약만 둔다. 경로 지점(routePoints)은 활동마다
//   `hiker_route_<활동 id>` 키에 따로 저장한다. 예전처럼 모든 경로를 한 값에 넣으면 긴 산행이
//   10번 남짓 쌓였을 때 Android 의 한 값 저장 한도(약 2MB)를 넘어 목록을 읽지도 쓰지도 못하게 된다.
// - 예전 형식(목록 안에 routePoints 가 들어 있는 기록)은 읽을 때 자동으로 옮긴다.
// - 기록 중인 활동은 `hiker_tracking_draft` 에 주기적으로 임시 저장해, 앱이 꺼져도 되살릴 수 있다.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HISTORY_KEY = 'hiker_activity_history';
export const ROUTE_KEY_PREFIX = 'hiker_route_';
export const DRAFT_KEY = 'hiker_tracking_draft';

export type RoutePoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
};

export const routeKeyFor = (activityId: string) => ROUTE_KEY_PREFIX + activityId;

const parseArray = (raw: string | null): any[] | null => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
};

const isPoint = (p: any): p is RoutePoint =>
  p &&
  typeof p.latitude === 'number' &&
  typeof p.longitude === 'number' &&
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude);

// 저장 용량을 줄이기 위해 좌표는 소수 6자리(약 10cm), 고도는 0.1m 까지만 남긴다
export const compactPoints = (points: RoutePoint[]): RoutePoint[] =>
  points.filter(isPoint).map(p => ({
    latitude: Math.round(p.latitude * 1e6) / 1e6,
    longitude: Math.round(p.longitude * 1e6) / 1e6,
    altitude: Math.round((Number(p.altitude) || 0) * 10) / 10,
    timestamp: Number(p.timestamp) || 0,
  }));

const toSummary = (record: any) => {
  const {routePoints, ...summary} = record || {};
  const count = Array.isArray(routePoints) ? routePoints.length : Number(summary.pointsCount) || 0;
  return {...summary, pointsCount: count, hasRoute: Array.isArray(routePoints) ? routePoints.length > 0 : !!summary.hasRoute};
};

// 예전 형식의 기록에서 경로를 꺼내 따로 저장하고, 목록은 요약만 남긴다.
// 경로를 모두 안전하게 쓴 뒤에만 목록을 바꾸므로 중간에 실패해도 데이터는 그대로다.
const migrateLegacy = async (list: any[]): Promise<any[]> => {
  const legacy = list.filter(item => item && Array.isArray(item.routePoints));
  if (legacy.length === 0) {
    return list;
  }
  const pairs: [string, string][] = legacy
    .filter(item => item.id)
    .map(item => [routeKeyFor(String(item.id)), JSON.stringify(compactPoints(item.routePoints))]);
  await AsyncStorage.multiSet(pairs);
  const next = list.map(item => (item && Array.isArray(item.routePoints) ? toSummary(item) : item));
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
};

export class HistoryReadError extends Error {}

// 활동 요약 목록 (최신순). 저장된 값을 읽을 수 없으면 HistoryReadError
export const loadActivitySummaries = async (): Promise<any[]> => {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  const list = parseArray(raw);
  if (list === null) {
    throw new HistoryReadError('활동 기록 데이터를 읽을 수 없습니다.');
  }
  let result = list;
  try {
    result = await migrateLegacy(list);
  } catch (e) {
    console.warn('[ActivityStore] route migration failed, keeping old format:', e);
  }
  return result
    .filter(item => item && typeof item === 'object')
    .sort((a, b) => (Number(b.endedAt) || 0) - (Number(a.endedAt) || 0));
};

// 오류가 나도 빈 목록을 돌려주는 버전 (통계 등 읽기 전용 화면용)
export const loadActivitySummariesSafe = async (): Promise<any[]> => {
  try {
    return await loadActivitySummaries();
  } catch (e) {
    console.warn('[ActivityStore] loadActivitySummaries failed:', e);
    return [];
  }
};

// 한 활동의 경로. 예전 형식 기록이면 기록 안의 routePoints 를 그대로 쓴다.
export const loadRoutePoints = async (record: any): Promise<RoutePoint[]> => {
  if (!record) {
    return [];
  }
  if (Array.isArray(record.routePoints)) {
    return record.routePoints.filter(isPoint);
  }
  if (!record.id) {
    return [];
  }
  try {
    const list = parseArray(await AsyncStorage.getItem(routeKeyFor(String(record.id))));
    return (list || []).filter(isPoint);
  } catch (e) {
    console.warn('[ActivityStore] loadRoutePoints failed:', e);
    return [];
  }
};

// 활동 하나를 저장한다: 경로를 먼저 쓰고, 그다음 목록에 요약을 넣는다. 실패하면 예외를 던진다.
export const saveActivity = async (record: any) => {
  const points = Array.isArray(record.routePoints) ? compactPoints(record.routePoints) : [];
  if (points.length > 0) {
    await AsyncStorage.setItem(routeKeyFor(String(record.id)), JSON.stringify(points));
  }
  const existing = await loadActivitySummaries();
  const summary = toSummary({...record, routePoints: points});
  const next = [summary, ...existing.filter(item => item.id !== record.id)].sort(
    (a, b) => (Number(b.endedAt) || 0) - (Number(a.endedAt) || 0),
  );
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
};

// 경로 키 전체 (백업용)
export const listRouteKeys = async (): Promise<string[]> => {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter(key => key.startsWith(ROUTE_KEY_PREFIX));
};

// ---- 기록 중 임시 저장 ----

export type TrackingDraft = {
  version: 1;
  activityType: string;
  startedAt: number;
  savedAt: number;
  distanceM: number;
  elevationM: number;
  weightKg: number;
  points: RoutePoint[];
  photos: any[];
};

export const saveDraft = async (draft: Omit<TrackingDraft, 'version' | 'savedAt'>) => {
  const payload: TrackingDraft = {
    ...draft,
    version: 1,
    savedAt: Date.now(),
    points: compactPoints(draft.points),
  };
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
};

export const loadDraft = async (): Promise<TrackingDraft | null> => {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.startedAt !== 'number' || !Array.isArray(parsed.points)) {
      return null;
    }
    return {
      ...parsed,
      points: parsed.points.filter(isPoint),
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      distanceM: Number(parsed.distanceM) || 0,
      elevationM: Number(parsed.elevationM) || 0,
      weightKg: Number(parsed.weightKg) || 70,
      savedAt: Number(parsed.savedAt) || parsed.startedAt,
    };
  } catch (e) {
    return null;
  }
};

export const clearDraft = async () => {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
};
