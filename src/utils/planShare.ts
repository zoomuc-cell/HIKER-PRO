// HIKERPRO 등산계획 공유 링크 생성 / 파싱 (외부 입력 검증 포함)
// 형식: hikerpro://plan/import?v=1&destination=..&date=..&startTime=..&expectedDuration=..&partySize=..&memo=..

export const PLAN_IMPORT_BASE = 'hikerpro://plan/import';
const PLAN_LINK_VERSION = '1';

export const PLAN_LIMITS = {
  destination: 60,
  expectedDuration: 30,
  memo: 500,
  partySizeMin: 1,
  partySizeMax: 99,
  urlLength: 4000,
};

export type SharedPlanData = {
  destination: string;
  date: string;
  startTime: string;
  expectedDuration: string;
  partySize: number;
  memo: string;
};

export type PlanImportResult =
  | {ok: true; plan: SharedPlanData}
  | {ok: false; reason: string};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PARTY_RE = /^\d{1,2}$/;
// 제어문자 (메모의 줄바꿈/탭은 별도 허용)
const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const CONTROL_WITH_NEWLINE_RE = /[\x00-\x1F\x7F]/g;

const ALLOWED_KEYS = [
  'v',
  'destination',
  'date',
  'startTime',
  'expectedDuration',
  'partySize',
  'memo',
];

export const isValidPlanDate = (value: string) => {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100) {
    return false;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

export const isValidPlanTime = (value: string) => TIME_RE.test(value);

export const isPlanImportUrl = (url: unknown): url is string =>
  typeof url === 'string' &&
  /^hikerpro:\/\/plan\/import(\?|$)/i.test(url.trim());

export const buildPlanShareUrl = (plan: SharedPlanData) => {
  const params: [string, string][] = [
    ['v', PLAN_LINK_VERSION],
    ['destination', plan.destination.trim()],
    ['date', plan.date.trim()],
  ];
  if (plan.startTime.trim()) {
    params.push(['startTime', plan.startTime.trim()]);
  }
  if (plan.expectedDuration.trim()) {
    params.push(['expectedDuration', plan.expectedDuration.trim()]);
  }
  params.push(['partySize', String(plan.partySize)]);
  if (plan.memo.trim()) {
    params.push(['memo', plan.memo.trim()]);
  }
  return (
    PLAN_IMPORT_BASE +
    '?' +
    params
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&')
  );
};

// 사람이 읽을 수 있는 공유 문구 (저장된 실제 값만 사용)
export const buildPlanShareMessage = (plan: SharedPlanData) => {
  const lines = [
    '🥾 HIKERPRO 등산계획',
    '산/목적지: ' + plan.destination.trim(),
    '날짜: ' + plan.date.trim(),
    '출발 예정시간: ' + (plan.startTime.trim() || '미정'),
    '예상 소요시간: ' + (plan.expectedDuration.trim() || '미정'),
    '동행 인원: ' + plan.partySize + '명',
  ];
  if (plan.memo.trim()) {
    lines.push('메모: ' + plan.memo.trim());
  }
  lines.push('');
  lines.push('HIKERPRO에서 이 계획 열기:');
  lines.push(buildPlanShareUrl(plan));
  return lines.join('\n');
};

const INVALID = (reason: string): PlanImportResult => ({ok: false, reason});

// 받은 링크 파싱 + 검증. 조건을 하나라도 벗어나면 가져오지 않음
export const parsePlanImportUrl = (url: unknown): PlanImportResult => {
  if (!isPlanImportUrl(url)) {
    return INVALID('scheme');
  }
  const trimmed = url.trim();
  if (trimmed.length > PLAN_LIMITS.urlLength) {
    return INVALID('too-long');
  }
  const qIndex = trimmed.indexOf('?');
  if (qIndex < 0) {
    return INVALID('no-query');
  }
  let query = trimmed.slice(qIndex + 1);
  const hashIndex = query.indexOf('#');
  if (hashIndex >= 0) {
    query = query.slice(0, hashIndex);
  }

  const values: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) {
      continue;
    }
    const eq = part.indexOf('=');
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawValue = eq >= 0 ? part.slice(eq + 1) : '';
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch (e) {
      return INVALID('decode');
    }
    if (!ALLOWED_KEYS.includes(key)) {
      continue; // 알 수 없는 값은 사용하지 않음
    }
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return INVALID('duplicate-key');
    }
    values[key] = value;
  }

  if (values.v !== undefined && values.v !== PLAN_LINK_VERSION) {
    return INVALID('version');
  }

  const destination = (values.destination || '').replace(CONTROL_WITH_NEWLINE_RE, ' ').trim();
  if (!destination || destination.length > PLAN_LIMITS.destination) {
    return INVALID('destination');
  }

  const date = (values.date || '').trim();
  if (!isValidPlanDate(date)) {
    return INVALID('date');
  }

  const startTime = (values.startTime || '').trim();
  if (startTime && !isValidPlanTime(startTime)) {
    return INVALID('startTime');
  }

  const expectedDuration = (values.expectedDuration || '')
    .replace(CONTROL_WITH_NEWLINE_RE, ' ')
    .trim();
  if (expectedDuration.length > PLAN_LIMITS.expectedDuration) {
    return INVALID('expectedDuration');
  }

  let partySize = PLAN_LIMITS.partySizeMin;
  if (values.partySize !== undefined && values.partySize.trim() !== '') {
    const rawParty = values.partySize.trim();
    if (!PARTY_RE.test(rawParty)) {
      return INVALID('partySize');
    }
    partySize = Number(rawParty);
    if (partySize < PLAN_LIMITS.partySizeMin || partySize > PLAN_LIMITS.partySizeMax) {
      return INVALID('partySize');
    }
  }

  const memo = (values.memo || '').replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').trim();
  if (memo.length > PLAN_LIMITS.memo) {
    return INVALID('memo');
  }

  return {
    ok: true,
    plan: {destination, date, startTime, expectedDuration, partySize, memo},
  };
};
