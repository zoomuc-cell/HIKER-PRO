// 기록 백업·복원 (Pro)
// 활동 기록, 등산 계획, 프로필 등 기기에 저장된 데이터를 JSON 파일 하나로 내보내고 다시 불러온다.
// 사진 파일 자체는 용량 문제로 포함하지 않는다. 결제·관리자 정보도 포함하지 않는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {pickTextFile, shareFileContent} from './nativeShare';

const BACKUP_APP = 'HIKERPRO';
const BACKUP_VERSION = 1;

export const BACKUP_KEYS = [
  'hiker_activity_history',
  'hiker_visited_regions',
  'hiker_hiking_plans',
  'hiker_user',
  'hiker_emergency_contact',
  'hiker_noti',
  'hiker_weight_history',
  'hiker_photo_library',
];

type BackupFile = {
  app: string;
  version: number;
  createdAt: string;
  data: Record<string, string>;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const exportBackup = async () => {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const data: Record<string, string> = {};
  pairs.forEach(([key, value]) => {
    if (typeof value === 'string') {
      data[key] = value;
    }
  });
  const now = new Date();
  const backup: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    data,
  };
  const fileName = `HIKERPRO_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(path, JSON.stringify(backup), 'utf8');
  await shareFileContent('file://' + path, 'application/json', 'HIKERPRO 기록 백업');
  return Object.keys(data).length;
};

export type ParsedBackup = {
  createdAt: string;
  data: Record<string, string>;
  activityCount: number;
  planCount: number;
};

const countArray = (raw?: string) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (e) {
    return 0;
  }
};

export class BackupError extends Error {}

// 파일을 고르고 내용을 검사한다. 취소하면 null
export const pickBackup = async (): Promise<ParsedBackup | null> => {
  const text = await pickTextFile();
  if (text === null || text === undefined) {
    return null;
  }
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new BackupError('HIKERPRO 백업 파일이 아닙니다.');
  }
  if (!parsed || parsed.app !== BACKUP_APP || typeof parsed.data !== 'object' || !parsed.data) {
    throw new BackupError('HIKERPRO 백업 파일이 아닙니다.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new BackupError('이 앱 버전에서 열 수 없는 백업 파일입니다. 앱을 업데이트해 주세요.');
  }
  // 허용된 키의 문자열 값만 사용 (결제·관리자 정보 등은 복원하지 않음)
  const data: Record<string, string> = {};
  BACKUP_KEYS.forEach(key => {
    if (typeof parsed.data[key] === 'string') {
      data[key] = parsed.data[key];
    }
  });
  return {
    createdAt: parsed.createdAt,
    data,
    activityCount: countArray(data.hiker_activity_history),
    planCount: countArray(data.hiker_hiking_plans),
  };
};

// 현재 기기 데이터를 백업 내용으로 바꾼다 (백업에 없는 항목은 그대로 둠)
export const restoreBackup = async (backup: ParsedBackup) => {
  await AsyncStorage.multiSet(Object.entries(backup.data));
};
