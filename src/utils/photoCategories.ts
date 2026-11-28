// 사진첩 카테고리 저장소
// 사진 기록(홈 사진 / 활동 사진)은 그대로 두고, 카테고리 목록과 "사진 key → 카테고리 이름"만
// AsyncStorage 한 곳(hiker_photo_categories)에 저장한다. 기존 사진은 자동으로 "분류 안 됨".
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'hiker_photo_categories';

export const UNASSIGNED = '분류 안 됨';
export const MAX_NAME_LENGTH = 20;
export const DEFAULT_CATEGORIES = ['풍경', '정상', '일행', '기타'];

export type PhotoCategoryData = {
  list: string[];
  map: Record<string, string>;
};

export const loadPhotoCategories = async (): Promise<PhotoCategoryData> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.list)
        ? parsed.list.filter((v: unknown) => typeof v === 'string' && v.length > 0)
        : DEFAULT_CATEGORIES;
      const map: Record<string, string> = {};
      if (parsed?.map && typeof parsed.map === 'object') {
        Object.keys(parsed.map).forEach(k => {
          if (typeof parsed.map[k] === 'string') {
            map[k] = parsed.map[k];
          }
        });
      }
      return {list, map};
    }
  } catch (e) {
    // 손상된 값이면 기본값으로 시작 (사진 자체에는 영향 없음)
  }
  return {list: [...DEFAULT_CATEGORIES], map: {}};
};

const save = async (data: PhotoCategoryData) => {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
  return data;
};

// 사진의 카테고리. 없거나 지워진 카테고리면 null(= 분류 안 됨)
export const categoryOf = (data: PhotoCategoryData, photoKey: string): string | null => {
  const name = data.map[photoKey];
  return name && data.list.includes(name) ? name : null;
};

// 이름 정리. 비었거나 이미 있으면 null
export const cleanCategoryName = (data: PhotoCategoryData, input: string, except?: string | null) => {
  const name = input.trim().slice(0, MAX_NAME_LENGTH);
  if (!name || name === UNASSIGNED) {
    return null;
  }
  if (data.list.some(n => n === name && n !== except)) {
    return null;
  }
  return name;
};

export const setPhotoCategory = async (photoKeys: string[], category: string | null) => {
  const data = await loadPhotoCategories();
  const map = {...data.map};
  photoKeys.forEach(k => {
    if (category === null) {
      delete map[k];
    } else {
      map[k] = category;
    }
  });
  return save({...data, map});
};

export const addPhotoCategory = async (input: string) => {
  const data = await loadPhotoCategories();
  const name = cleanCategoryName(data, input);
  if (!name) {
    return {data, name: null as string | null};
  }
  return {data: await save({...data, list: [...data.list, name]}), name};
};

export const renamePhotoCategory = async (oldName: string, input: string) => {
  const data = await loadPhotoCategories();
  const name = cleanCategoryName(data, input, oldName);
  if (!name) {
    return null;
  }
  const map: Record<string, string> = {};
  Object.keys(data.map).forEach(k => {
    map[k] = data.map[k] === oldName ? name : data.map[k];
  });
  return save({list: data.list.map(n => (n === oldName ? name : n)), map});
};

// 카테고리를 지우면 그 사진들은 "분류 안 됨"이 된다. 사진은 지우지 않는다.
export const removePhotoCategory = async (name: string) => {
  const data = await loadPhotoCategories();
  const map: Record<string, string> = {};
  Object.keys(data.map).forEach(k => {
    if (data.map[k] !== name) {
      map[k] = data.map[k];
    }
  });
  return save({list: data.list.filter(n => n !== name), map});
};
