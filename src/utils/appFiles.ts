// 앱 내부 파일(사진, 프로필 이미지) 경로
//
// iOS 는 앱을 업데이트하거나 다시 설치할 때마다 앱 폴더 경로
// (/var/mobile/Containers/Data/Application/<무작위 ID>/Documents) 가 바뀐다. 전체 경로를 저장해 두면
// 업데이트 뒤 사진이 모두 '파일 없음'이 되므로, 새로 저장할 때는 Documents 아래의 상대 경로만
// 저장하고, 보여 줄 때 현재 DocumentDir 를 앞에 붙인다. 예전에 저장된 전체 경로도 읽을 때 고친다.
import ReactNativeBlobUtil from 'react-native-blob-util';

// Documents 안에서 앱이 쓰는 폴더·파일 이름 (예전 전체 경로에서 이 부분부터 잘라 다시 붙인다)
const APP_FILE_ROOTS = ['hiker_activity_photos/', 'hiker_photos/', 'hiker_avatar.jpg'];

const documentDir = () => ReactNativeBlobUtil.fs.dirs.DocumentDir;

// 저장용 값: Documents 아래 상대 경로 (예: hiker_photos/libphoto_123.jpg)
export const toStoredFileRef = (absolutePath: string) => {
  const dir = documentDir() + '/';
  return absolutePath.startsWith(dir) ? absolutePath.slice(dir.length) : absolutePath;
};

// 화면 표시·공유용 file:// URI. 상대 경로든 예전 전체 경로든 현재 앱 폴더 기준으로 바꾼다.
export const resolveAppFileUri = (stored: string | null | undefined): string => {
  if (!stored || typeof stored !== 'string') {
    return '';
  }
  // 쿼리(?t=...)는 이미지 캐시를 피하려고 붙인 값이라 그대로 둔다
  const queryIndex = stored.indexOf('?');
  const base = queryIndex >= 0 ? stored.slice(0, queryIndex) : stored;
  const query = queryIndex >= 0 ? stored.slice(queryIndex) : '';

  if (/^(content|https?|data|ph|assets-library):/i.test(base)) {
    return stored;
  }
  const path = base.startsWith('file://') ? base.slice('file://'.length) : base;
  if (!path.startsWith('/')) {
    return 'file://' + documentDir() + '/' + path + query;
  }
  for (const root of APP_FILE_ROOTS) {
    const at = path.lastIndexOf('/' + root);
    if (at >= 0) {
      return 'file://' + documentDir() + path.slice(at) + query;
    }
  }
  return 'file://' + path + query;
};
