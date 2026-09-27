// HIKERPRO Android 공유 모듈(HikerShare) JS 래퍼
// - 이미지: ACTION_SEND + EXTRA_STREAM(content:// via FileProvider) + 선택 EXTRA_TEXT
// - 텍스트: 모듈이 없으면 React Native 기본 Share 로 대체
import {NativeModules, Platform, Share} from 'react-native';

export type ImageShareResult = {
  filePath: string; // 실제 공유한 파일 (canonical path)
  contentUri: string; // 대상 앱에 전달한 content:// URI
  mimeType: string;
  textAttached: boolean; // EXTRA_TEXT 포함 여부 (대상 앱이 무시할 수 있음)
};

type HikerShareNative = {
  shareText: (message: string, title: string | null) => Promise<boolean>;
  shareImage: (
    path: string,
    message: string | null,
    title: string | null,
  ) => Promise<ImageShareResult | boolean>;
  copyText?: (text: string, label: string | null) => Promise<boolean>;
  composeActivityCard?: (
    mapPath: string,
    title: string | null,
    rows: {label: string; value: string}[],
    footer: string | null,
  ) => Promise<string>;
};

const HikerShare: HikerShareNative | undefined = NativeModules.HikerShare;

export const isImageShareAvailable = () => Platform.OS === 'android' && !!HikerShare;

export class ShareError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  E_FILE_NOT_FOUND: '공유할 파일을 찾을 수 없습니다. 삭제되었을 수 있습니다.',
  E_INVALID_PATH: '공유할 파일 경로가 올바르지 않습니다.',
  E_PATH_NOT_ALLOWED: '앱 내부에 저장된 파일만 공유할 수 있습니다.',
  E_NO_PROVIDER: '공유용 파일 주소를 만들 수 없습니다. (FileProvider 없음)',
  E_URI: '공유용 파일 주소를 만들지 못했습니다.',
  E_NO_APP: '공유할 수 있는 앱이 없습니다.',
  E_EMPTY: '공유할 내용이 없습니다.',
  E_UNAVAILABLE: '이미지 공유 기능을 사용할 수 없습니다. 앱을 다시 빌드해 설치해 주세요.',
  E_CLIPBOARD: '클립보드에 복사하지 못했습니다.',
  E_COMPOSE: '요약 이미지를 만들지 못했습니다.',
};

export const shareErrorMessage = (error: unknown) => {
  const code = (error as any)?.code;
  if (typeof code === 'string' && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  return '공유 화면을 열지 못했습니다. 다시 시도해 주세요.';
};

// 텍스트 공유. 사용자가 chooser 를 닫아도 오류로 취급하지 않음
export const shareTextContent = async (message: string, title?: string) => {
  if (Platform.OS === 'android' && HikerShare) {
    await HikerShare.shareText(message, title || null);
    return;
  }
  await Share.share({title, message});
};

// 이미지 1장 + 텍스트 공유 (Android 전용 네이티브 모듈)
export const shareImageContent = async (
  fileUri: string,
  message?: string,
  title?: string,
) => {
  if (!isImageShareAvailable() || !HikerShare) {
    throw new ShareError('E_UNAVAILABLE', ERROR_MESSAGES.E_UNAVAILABLE);
  }
  const result = await HikerShare.shareImage(fileUri, message || null, title || null);
  return typeof result === 'object' && result !== null ? result : null;
};

// 지도 PNG + 활동 요약 카드를 이미지 1장으로 합성 (네이티브 Canvas). 결과: file:// PNG (cacheDir)
export const composeActivityCard = async (
  mapUri: string,
  title: string,
  rows: {label: string; value: string}[],
  footer?: string,
) => {
  if (Platform.OS !== 'android' || !HikerShare?.composeActivityCard) {
    throw new ShareError('E_UNAVAILABLE', ERROR_MESSAGES.E_UNAVAILABLE);
  }
  return HikerShare.composeActivityCard(mapUri, title, rows, footer || null);
};

// 텍스트 클립보드 복사 (네이티브 모듈)
export const copyTextToClipboard = async (text: string, label?: string) => {
  if (Platform.OS !== 'android' || !HikerShare?.copyText) {
    throw new ShareError('E_UNAVAILABLE', ERROR_MESSAGES.E_UNAVAILABLE);
  }
  await HikerShare.copyText(text, label || null);
};

export const toFilePath = (uri: string) =>
  uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri;
