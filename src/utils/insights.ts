// 활동 인사이트 계산 (화면과 분리된 순수 함수들)
//
// - 주간·월간 추세: 이번 주(월요일 시작)와 지난 주, 이번 달과 지난 달 비교
// - 연속 기록: 하루에 한 번 이상 활동한 날이 며칠 이어졌는지
// - 신기록: 새 활동이 같은 종류의 이전 기록보다 길거나 높거나 빠른지
// - 1km 구간 기록과 고도 그래프: 저장된 경로 지점(위도·경도·고도·시각)으로 계산

export type InsightActivity = {
  id: string;
  activityType: string;
  startedAt: number;
  durationSec: number;
  distanceM: number;
  elevationM: number;
};

export type InsightPoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// 너무 짧은 기록: 1분 미만이거나, 50m 미만으로 움직였고 고도도 거의 오르지 않은 경우
export const SHORT_MIN_DURATION_SEC = 60;
export const SHORT_MIN_DISTANCE_M = 50;
export const SHORT_MIN_ELEVATION_M = 3;

export const isShortActivity = (durationSec: number, distanceM: number, elevationM = 0) =>
  durationSec < SHORT_MIN_DURATION_SEC ||
  (distanceM < SHORT_MIN_DISTANCE_M && elevationM < SHORT_MIN_ELEVATION_M);

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

// 월요일 0시
export const startOfWeek = (date: Date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export type PeriodTotals = {count: number; distanceM: number; durationSec: number; elevationM: number};

const totals = (items: InsightActivity[], from: Date, to: Date): PeriodTotals => {
  const result: PeriodTotals = {count: 0, distanceM: 0, durationSec: 0, elevationM: 0};
  items.forEach(item => {
    const t = num(item.startedAt);
    if (t >= from.getTime() && t < to.getTime()) {
      result.count += 1;
      result.distanceM += num(item.distanceM);
      result.durationSec += num(item.durationSec);
      result.elevationM += num(item.elevationM);
    }
  });
  return result;
};

// 지난 기간 대비 거리 변화율(%). 지난 기간이 0이면 비교할 수 없어 null
export const changePercent = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

export type WeekTrend = {
  thisWeek: PeriodTotals;
  lastWeek: PeriodTotals;
  changePct: number | null;
  // 이번 주 월~일 하루별 거리(m)
  dailyDistanceM: number[];
  // 오늘이 몇 번째 칸인지 (월=0 … 일=6)
  todayIndex: number;
};

export const weekTrend = (items: InsightActivity[], now: Date = new Date()): WeekTrend => {
  const thisStart = startOfWeek(now);
  const nextStart = new Date(thisStart);
  nextStart.setDate(nextStart.getDate() + 7);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);

  const thisWeek = totals(items, thisStart, nextStart);
  const lastWeek = totals(items, lastStart, thisStart);
  const dailyDistanceM = [0, 0, 0, 0, 0, 0, 0];
  items.forEach(item => {
    const t = num(item.startedAt);
    if (t >= thisStart.getTime() && t < nextStart.getTime()) {
      const d = new Date(t).getDay();
      dailyDistanceM[d === 0 ? 6 : d - 1] += num(item.distanceM);
    }
  });
  const today = now.getDay();
  return {
    thisWeek,
    lastWeek,
    changePct: changePercent(thisWeek.distanceM, lastWeek.distanceM),
    dailyDistanceM,
    todayIndex: today === 0 ? 6 : today - 1,
  };
};

export type MonthTrend = {thisMonth: PeriodTotals; lastMonth: PeriodTotals; changePct: number | null};

export const monthTrend = (items: InsightActivity[], now: Date = new Date()): MonthTrend => {
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonth = totals(items, thisStart, nextStart);
  const lastMonth = totals(items, lastStart, thisStart);
  return {thisMonth, lastMonth, changePct: changePercent(thisMonth.distanceM, lastMonth.distanceM)};
};

export type Streak = {current: number; best: number; activeToday: boolean};

// 연속 활동일. 오늘 아직 활동하지 않았어도 어제까지 이어졌으면 끊긴 것으로 보지 않는다.
export const activityStreak = (items: InsightActivity[], now: Date = new Date()): Streak => {
  const days = new Set<string>();
  items.forEach(item => {
    const t = num(item.startedAt);
    if (t > 0) {
      days.add(dayKey(new Date(t)));
    }
  });
  if (days.size === 0) {
    return {current: 0, best: 0, activeToday: false};
  }

  const today = startOfDay(now);
  const activeToday = days.has(dayKey(today));
  let current = 0;
  const cursor = new Date(today);
  if (!activeToday) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 최고 연속 기록: 활동한 날들을 날짜순으로 훑는다
  const sorted = Array.from(days)
    .map(key => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    // 서머타임이 없는 지역도 있으니 반올림해서 하루 차이를 센다
    const gap = Math.round((sorted[i] - sorted[i - 1]) / DAY_MS);
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return {current, best: Math.max(best, current), activeToday};
};

export type RecordKind = 'distance' | 'elevation' | 'duration' | 'pace';

export type NewRecord = {kind: RecordKind; label: string; value: string; previous: string};

export const formatKm = (meters: number) => `${(num(meters) / 1000).toFixed(2)}km`;

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(num(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

// 1km 당 걸린 시간을 6'05" 형식으로
export const formatPace = (secPerKm: number) => {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) {
    return '-';
  }
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"`;
};

const paceOf = (item: InsightActivity) =>
  num(item.distanceM) >= 1000 && num(item.durationSec) > 0
    ? num(item.durationSec) / (num(item.distanceM) / 1000)
    : null;

// 새 활동이 같은 종류의 이전 기록보다 나은 항목들. 처음 하는 종류는 비교 대상이 없어 빈 목록.
export const findNewRecords = (previous: InsightActivity[], record: InsightActivity): NewRecord[] => {
  if (isShortActivity(num(record.durationSec), num(record.distanceM), num(record.elevationM))) {
    return [];
  }
  const same = previous.filter(
    item => item.id !== record.id && item.activityType === record.activityType,
  );
  if (same.length === 0) {
    return [];
  }
  const result: NewRecord[] = [];
  const best = (pick: (item: InsightActivity) => number) =>
    same.reduce((max, item) => Math.max(max, pick(item)), 0);

  const bestDistance = best(item => num(item.distanceM));
  if (num(record.distanceM) > bestDistance && bestDistance > 0) {
    result.push({kind: 'distance', label: '최장 거리', value: formatKm(record.distanceM), previous: formatKm(bestDistance)});
  }
  const bestElevation = best(item => num(item.elevationM));
  if (num(record.elevationM) > bestElevation && bestElevation > 0) {
    result.push({kind: 'elevation', label: '최고 상승 고도', value: `${Math.round(num(record.elevationM))}m`, previous: `${Math.round(bestElevation)}m`});
  }
  const bestDuration = best(item => num(item.durationSec));
  if (num(record.durationSec) > bestDuration && bestDuration > 0) {
    result.push({kind: 'duration', label: '최장 시간', value: formatDuration(record.durationSec), previous: formatDuration(bestDuration)});
  }
  const pace = paceOf(record);
  const previousPaces = same.map(paceOf).filter((p): p is number => p !== null);
  if (pace !== null && previousPaces.length > 0) {
    const bestPace = Math.min(...previousPaces);
    if (pace < bestPace) {
      result.push({kind: 'pace', label: '최고 페이스', value: `${formatPace(pace)}/km`, previous: `${formatPace(bestPace)}/km`});
    }
  }
  return result;
};

// 두 지점 사이 거리(m)
export const distanceBetween = (a: InsightPoint, b: InsightPoint) => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export type Split = {
  index: number; // 1부터
  distanceM: number; // 이 구간 거리 (마지막 구간은 1km 미만일 수 있음)
  durationSec: number;
  paceSecPerKm: number;
  partial: boolean;
};

// 1km 구간 기록. 시각이 없거나 거꾸로 된 지점은 건너뛴다.
export const kmSplits = (points: InsightPoint[], splitM = 1000): Split[] => {
  const valid = points.filter(p => num(p.timestamp) > 0);
  if (valid.length < 2) {
    return [];
  }
  const splits: Split[] = [];
  let splitStartTime = valid[0].timestamp;
  let splitDistance = 0;
  for (let i = 1; i < valid.length; i += 1) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const step = distanceBetween(prev, cur);
    const stepTime = cur.timestamp - prev.timestamp;
    if (stepTime < 0) {
      continue;
    }
    let remainingStep = step;
    let stepStartTime = prev.timestamp;
    while (splitDistance + remainingStep >= splitM && remainingStep > 0) {
      const need = splitM - splitDistance;
      const ratio = need / remainingStep;
      const crossTime = stepStartTime + (cur.timestamp - stepStartTime) * ratio;
      const durationSec = (crossTime - splitStartTime) / 1000;
      splits.push({
        index: splits.length + 1,
        distanceM: splitM,
        durationSec,
        paceSecPerKm: durationSec / (splitM / 1000),
        partial: false,
      });
      splitStartTime = crossTime;
      stepStartTime = crossTime;
      remainingStep -= need;
      splitDistance = 0;
    }
    splitDistance += remainingStep;
  }
  // 남은 구간이 100m 이상이면 짧은 마지막 구간으로 보여 준다
  if (splitDistance >= 100) {
    const durationSec = (valid[valid.length - 1].timestamp - splitStartTime) / 1000;
    splits.push({
      index: splits.length + 1,
      distanceM: splitDistance,
      durationSec,
      paceSecPerKm: durationSec / (splitDistance / 1000),
      partial: true,
    });
  }
  return splits;
};

export type ElevationProfile = {
  samples: {distanceM: number; altitude: number}[];
  minAltitude: number;
  maxAltitude: number;
  totalDistanceM: number;
};

// 고도 그래프용 표본. 고도 정보가 없으면(모두 0) null
export const elevationProfile = (points: InsightPoint[], sampleCount = 40): ElevationProfile | null => {
  if (points.length < 2 || points.every(p => !num(p.altitude))) {
    return null;
  }
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distanceBetween(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(2, Math.min(sampleCount, points.length));
  const samples: {distanceM: number; altitude: number}[] = [];
  let j = 0;
  for (let s = 0; s < count; s += 1) {
    const target = total > 0 ? (total * s) / (count - 1) : 0;
    if (total > 0) {
      while (j < cumulative.length - 1 && cumulative[j + 1] < target) {
        j += 1;
      }
    } else {
      j = Math.round(((points.length - 1) * s) / (count - 1));
    }
    // 마지막 표본은 소수점 오차와 상관없이 마지막 지점으로
    const point = s === count - 1 ? points[points.length - 1] : points[j];
    samples.push({distanceM: target, altitude: num(point.altitude)});
  }
  const altitudes = samples.map(sample => sample.altitude);
  return {
    samples,
    minAltitude: Math.min(...altitudes),
    maxAltitude: Math.max(...altitudes),
    totalDistanceM: total,
  };
};

// 주간 목표 (km)
export const WEEKLY_GOAL_KEY = 'hiker_weekly_goal_km';
export const DEFAULT_WEEKLY_GOAL_KM = 10;
export const WEEKLY_GOAL_OPTIONS_KM = [5, 10, 20, 30, 50];

export const parseWeeklyGoal = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1000 ? n : DEFAULT_WEEKLY_GOAL_KM;
};

export const goalProgress = (distanceM: number, goalKm: number) =>
  goalKm > 0 ? Math.min(1, num(distanceM) / (goalKm * 1000)) : 0;
