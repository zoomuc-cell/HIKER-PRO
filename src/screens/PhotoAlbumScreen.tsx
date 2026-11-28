// 사진첩: 홈에서 찍은 사진 + 활동 중 찍은 사진을 한곳에서 보고, 보내고, 카테고리로 정리한다.
// - 보기: 전체 / 활동별 / 내 카테고리 / 분류 안 됨
// - 보내기: 1장 또는 여러 장 (휴대폰 기본 공유 창). 좌표는 넣지 않는다(기존 공유와 같은 원칙).
// - 카테고리: 풍경·정상·일행·기타 기본, 추가/이름 바꾸기/지우기
import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {loadActivitySummariesSafe} from '../services/ActivityStore';
import {resolveAppFileUri} from '../utils/appFiles';
import {shareErrorMessage, shareImagesContent, toFilePath} from '../utils/nativeShare';
import {
  PhotoCategoryData,
  UNASSIGNED,
  addPhotoCategory,
  categoryOf,
  cleanCategoryName,
  loadPhotoCategories,
  removePhotoCategory,
  renamePhotoCategory,
  setPhotoCategory,
} from '../utils/photoCategories';

const PHOTO_LIBRARY_KEY = 'hiker_photo_library';
const GREEN = '#2E7D32';
const FILTER_ALL = '__all__';
const FILTER_BY_ACTIVITY = '__by_activity__';

const ACTIVITY_LABELS: Record<string, string> = {
  hiking: '등산',
  building: '빌딩 오르기',
  walking: '걷기',
  running: '러닝',
  cycling: '자전거',
};

type AlbumPhoto = {
  key: string; // 카테고리 저장용 고유 key
  uri: string; // file:// (현재 앱 폴더 기준)
  timestamp: number;
  groupId: string; // 활동별 묶음 (홈 사진은 'home')
  groupTitle: string;
  groupTime: number;
};

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));
const formatDateTime = (ms: number) => {
  const d = new Date(ms);
  return (
    d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  );
};
const formatDate = (ms: number) => {
  const d = new Date(ms);
  return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
};
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const fileExists = async (uri: string) => {
  try {
    return await ReactNativeBlobUtil.fs.exists(toFilePath(uri));
  } catch (e) {
    return false;
  }
};

// 홈 사진 + 활동 사진을 읽어 파일이 실제로 있는 것만 돌려준다 (저장소는 읽기만 함)
const loadAlbumPhotos = async (): Promise<AlbumPhoto[]> => {
  const result: AlbumPhoto[] = [];

  try {
    const raw = await AsyncStorage.getItem(PHOTO_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      parsed.forEach((p: any) => {
        if (!p || typeof p.uri !== 'string' || !p.uri) {
          return;
        }
        const id = typeof p.id === 'string' ? p.id : p.uri;
        result.push({
          key: 'home:' + id,
          uri: resolveAppFileUri(p.uri),
          timestamp: num(p.timestamp),
          groupId: 'home',
          groupTitle: '홈에서 찍은 사진',
          groupTime: 0,
        });
      });
    }
  } catch (e) {
    // 홈 사진 목록이 손상되어도 활동 사진은 보여 준다
  }

  const activities = await loadActivitySummariesSafe();
  activities.forEach((r: any) => {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.photos) || r.photos.length === 0) {
      return;
    }
    const label =
      (typeof r.activityLabel === 'string' && r.activityLabel.trim()) || ACTIVITY_LABELS[r.activityType] || '활동';
    const time = num(r.startedAt, num(r.endedAt));
    r.photos.forEach((p: any) => {
      if (!p || typeof p.uri !== 'string' || !p.uri) {
        return;
      }
      const id = typeof p.id === 'string' ? p.id : p.uri;
      result.push({
        key: 'act:' + r.id + ':' + id,
        uri: resolveAppFileUri(p.uri),
        timestamp: num(p.timestamp, time),
        groupId: 'act:' + r.id,
        groupTitle: label + (time ? ' · ' + formatDate(time) : ''),
        groupTime: time,
      });
    });
  });

  const candidates = result.filter(p => p.uri.startsWith('file://'));
  const checks = await Promise.all(candidates.map(p => fileExists(p.uri)));
  return candidates.filter((_, i) => checks[i]).sort((a, b) => b.timestamp - a.timestamp);
};

const PhotoAlbumScreen = () => {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [categories, setCategories] = useState<PhotoCategoryData>({list: [], map: {}});
  const [filter, setFilter] = useState<string>(FILTER_ALL);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<AlbumPhoto | null>(null);
  const [pickFor, setPickFor] = useState<string[] | null>(null);
  const [manageVisible, setManageVisible] = useState(false);
  const [nameDialog, setNameDialog] = useState<{
    title: string;
    initial: string;
    except: string | null;
    onOk: (name: string) => void;
  } | null>(null);
  const [nameText, setNameText] = useState('');

  const reload = useCallback(async () => {
    const [list, cats] = await Promise.all([loadAlbumPhotos(), loadPhotoCategories()]);
    setPhotos(list);
    setCategories(cats);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const catOf = useCallback((p: AlbumPhoto) => categoryOf(categories, p.key), [categories]);

  // 지워진 카테고리를 보고 있었다면 전체로
  const activeFilter =
    filter === FILTER_ALL || filter === FILTER_BY_ACTIVITY || filter === UNASSIGNED || categories.list.includes(filter)
      ? filter
      : FILTER_ALL;

  const visible = useMemo(() => {
    switch (activeFilter) {
      case FILTER_ALL:
      case FILTER_BY_ACTIVITY:
        return photos;
      case UNASSIGNED:
        return photos.filter(p => catOf(p) === null);
      default:
        return photos.filter(p => catOf(p) === activeFilter);
    }
  }, [photos, activeFilter, catOf]);

  const sections = useMemo(() => {
    if (activeFilter !== FILTER_BY_ACTIVITY) {
      return [{id: 'all', title: '', items: visible}];
    }
    const groups = new Map<string, {id: string; title: string; time: number; items: AlbumPhoto[]}>();
    visible.forEach(p => {
      const g = groups.get(p.groupId) || {id: p.groupId, title: p.groupTitle, time: p.groupTime, items: []};
      g.items.push(p);
      groups.set(p.groupId, g);
    });
    // 최근 활동 먼저, 홈 사진은 맨 아래
    return [...groups.values()].sort((a, b) => {
      if (a.id === 'home') return 1;
      if (b.id === 'home') return -1;
      return b.time - a.time;
    });
  }, [visible, activeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let unassigned = 0;
    photos.forEach(p => {
      const name = catOf(p);
      if (name === null) {
        unassigned += 1;
      } else {
        c[name] = (c[name] || 0) + 1;
      }
    });
    return {byName: c, unassigned};
  }, [photos, catOf]);

  // ---- 보내기 ----
  const infoText = (list: AlbumPhoto[]) => {
    const lines = [...list]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p, i) => {
        const head = list.length > 1 ? '[' + (i + 1) + '] ' : '📷 ';
        const parts = [p.timestamp ? formatDateTime(p.timestamp) : null, p.groupId === 'home' ? null : p.groupTitle.split(' · ')[0]];
        const cat = catOf(p);
        if (cat) {
          parts.push(cat);
        }
        return head + parts.filter(Boolean).join(' · ');
      });
    return lines.join('\n') + '\n\nHIKERPRO로 기록했어요 #HIKERPRO';
  };

  const doShare = async (list: AlbumPhoto[], withText: boolean) => {
    try {
      await shareImagesContent(
        list.map(p => p.uri),
        withText ? infoText(list) : undefined,
        'HIKERPRO 사진',
      );
    } catch (e) {
      Alert.alert('보내기 실패', shareErrorMessage(e));
    }
  };

  const askShare = (list: AlbumPhoto[]) => {
    if (list.length === 0) {
      Alert.alert('사진 보내기', '보낼 사진을 선택해 주세요.');
      return;
    }
    Alert.alert(
      list.length === 1 ? '사진 보내기' : '사진 ' + list.length + '장 보내기',
      '촬영시각과 활동 이름도 글로 함께 보낼까요?\n(위치 좌표는 보내지 않습니다)',
      [
        {text: '취소', style: 'cancel'},
        {text: '사진만', onPress: () => doShare(list, false)},
        {text: '글도 함께', onPress: () => doShare(list, true)},
      ],
    );
  };

  // ---- 선택 ----
  const toggle = (p: AlbumPhoto) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p.key)) {
        next.delete(p.key);
      } else {
        next.add(p.key);
      }
      return next;
    });
  };

  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const selectedPhotos = photos.filter(p => selected.has(p.key));

  // ---- 카테고리 ----
  const applyCategory = async (keys: string[], name: string | null) => {
    setCategories(await setPhotoCategory(keys, name));
    setPickFor(null);
    if (selecting) {
      endSelect();
    }
  };

  const openNameDialog = (title: string, initial: string, except: string | null, onOk: (name: string) => void) => {
    setNameText(initial);
    setNameDialog({title, initial, except, onOk});
  };

  const submitName = () => {
    if (!nameDialog) {
      return;
    }
    if (!cleanCategoryName(categories, nameText, nameDialog.except)) {
      Alert.alert('카테고리 이름', '이름이 비었거나 이미 있는 카테고리입니다.');
      return;
    }
    const {onOk} = nameDialog;
    setNameDialog(null);
    onOk(nameText);
  };

  const confirmRemove = (name: string) => {
    Alert.alert(
      "'" + name + "' 카테고리를 지울까요?",
      "사진은 지워지지 않고 '" + UNASSIGNED + "'으로 옮겨집니다.",
      [
        {text: '취소', style: 'cancel'},
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => setCategories(await removePhotoCategory(name)),
        },
      ],
    );
  };

  // ---- 화면 ----
  const chip = (label: string, key: string, count?: number) => {
    const on = activeFilter === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        onPress={() => setFilter(key)}
        style={[styles.chip, on && styles.chipOn]}>
        <Text style={[styles.chipText, on && styles.chipTextOn]}>
          {label}
          {count !== undefined ? ' ' + count : ''}
        </Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GREEN} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {photos.length === 0 ? (
        <View style={styles.center}>
          <Icon name="image-off-outline" size={48} color="#90A4AE" />
          <Text style={styles.emptyText}>
            아직 찍은 사진이 없습니다.{'\n\n'}홈의 '사진' 버튼이나 활동 기록 중 '사진 촬영'으로 사진을 남겨 보세요.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <Text style={styles.count}>
              {activeFilter === FILTER_ALL || activeFilter === FILTER_BY_ACTIVITY
                ? '사진 ' + photos.length + '장'
                : "'" + activeFilter + "' " + visible.length + '장'}
            </Text>
            {selecting ? (
              <>
                <Pressable
                  style={styles.toolButton}
                  onPress={() => {
                    const keys = visible.map(p => p.key);
                    const all = keys.every(k => selected.has(k));
                    setSelected(all ? new Set() : new Set(keys));
                  }}>
                  <Text style={styles.toolText}>전체 선택</Text>
                </Pressable>
                <Pressable style={styles.toolButton} onPress={endSelect}>
                  <Text style={styles.toolText}>선택 취소</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.toolButton} onPress={() => setSelecting(true)}>
                  <Icon name="checkbox-multiple-marked-outline" size={18} color={GREEN} />
                  <Text style={styles.toolText}> 여러 장 선택</Text>
                </Pressable>
                <Pressable style={styles.toolButton} onPress={() => setManageVisible(true)}>
                  <Icon name="tag-multiple-outline" size={18} color={GREEN} />
                  <Text style={styles.toolText}> 카테고리</Text>
                </Pressable>
              </>
            )}
          </View>

          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {chip('전체', FILTER_ALL, photos.length)}
              {chip('활동별', FILTER_BY_ACTIVITY)}
              {categories.list.map(name => chip(name, name, counts.byName[name] || 0))}
              {(counts.unassigned > 0 || activeFilter === UNASSIGNED) && chip(UNASSIGNED, UNASSIGNED, counts.unassigned)}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {visible.length === 0 && (
              <Text style={styles.emptyText}>
                이 카테고리에는 아직 사진이 없습니다.{'\n'}사진을 눌러 '카테고리'로 옮길 수 있습니다.
              </Text>
            )}
            {sections.map(section => (
              <View key={section.id}>
                {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
                <View style={styles.grid}>
                  {section.items.map(p => {
                    const on = selected.has(p.key);
                    const cat = catOf(p);
                    return (
                      <Pressable
                        key={p.key}
                        style={styles.cell}
                        onPress={() => (selecting ? toggle(p) : setViewer(p))}
                        onLongPress={() => {
                          if (!selecting) {
                            setSelecting(true);
                            toggle(p);
                          }
                        }}>
                        <Image
                          source={{uri: p.uri}}
                          style={[styles.thumb, selecting && !on && styles.thumbDim]}
                        />
                        {cat && <Text style={styles.cellTag} numberOfLines={1}>{cat}</Text>}
                        {selecting && (
                          <View style={[styles.check, on && styles.checkOn]}>
                            {on && <Icon name="check" size={18} color="#FFF" />}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {selecting && (
            <View style={styles.selectionBar}>
              <Pressable style={[styles.barButton, styles.barPrimary]} onPress={() => askShare(selectedPhotos)}>
                <Text style={styles.barPrimaryText}>{selectedPhotos.length}장 보내기</Text>
              </Pressable>
              <Pressable
                style={styles.barButton}
                onPress={() => {
                  if (selectedPhotos.length === 0) {
                    Alert.alert('카테고리 옮기기', '옮길 사진을 선택해 주세요.');
                    return;
                  }
                  setPickFor(selectedPhotos.map(p => p.key));
                }}>
                <Text style={styles.barText}>카테고리 옮기기</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* 크게 보기 */}
      <Modal visible={viewer !== null} animationType="fade" onRequestClose={() => setViewer(null)}>
        {viewer && (
          <View style={styles.viewer}>
            <Image source={{uri: viewer.uri}} style={styles.viewerImage} resizeMode="contain" />
            <View style={styles.viewerInfo}>
              <Text style={styles.viewerText}>
                {viewer.timestamp ? formatDateTime(viewer.timestamp) : ''}
                {'  ·  '}
                {viewer.groupTitle}
              </Text>
              <Text style={styles.viewerTag}>🏷 {catOf(viewer) || UNASSIGNED}</Text>
              <View style={styles.viewerButtons}>
                <Pressable style={[styles.barButton, styles.barPrimary]} onPress={() => askShare([viewer])}>
                  <Text style={styles.barPrimaryText}>보내기</Text>
                </Pressable>
                <Pressable style={styles.barButton} onPress={() => setPickFor([viewer.key])}>
                  <Text style={styles.barText}>카테고리</Text>
                </Pressable>
                <Pressable style={styles.barButton} onPress={() => setViewer(null)}>
                  <Text style={styles.barText}>닫기</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* 크게 보기 위에서도 카테고리 고르기가 보이도록 같은 Modal 안에 둔다 */}
        {viewer && pickFor && renderPicker()}
      </Modal>

      {!viewer && pickFor && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPickFor(null)}>
          {renderPicker()}
        </Modal>
      )}

      {/* 카테고리 관리 */}
      <Modal transparent visible={manageVisible} animationType="fade" onRequestClose={() => setManageVisible(false)}>
        <View style={styles.dim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>카테고리 관리</Text>
            <ScrollView style={styles.sheetList}>
              {categories.list.map(name => (
                <View key={name} style={styles.manageRow}>
                  <Text style={styles.manageName}>{name}</Text>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() =>
                      openNameDialog('이름 바꾸기', name, name, async newName => {
                        const next = await renamePhotoCategory(name, newName);
                        if (next) {
                          setCategories(next);
                          if (filter === name) {
                            setFilter(newName.trim());
                          }
                        }
                      })
                    }>
                    <Text style={styles.smallText}>이름</Text>
                  </Pressable>
                  <Pressable style={styles.smallButton} onPress={() => confirmRemove(name)}>
                    <Text style={[styles.smallText, styles.danger]}>지우기</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.addRow}
              onPress={() =>
                openNameDialog('새 카테고리', '', null, async name => {
                  setCategories((await addPhotoCategory(name)).data);
                })
              }>
              <Icon name="plus" size={20} color={GREEN} />
              <Text style={styles.addText}>새 카테고리 만들기</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={() => setManageVisible(false)}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>
          {nameDialog && renderNameDialog()}
        </View>
      </Modal>

      {!manageVisible && !pickFor && nameDialog && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setNameDialog(null)}>
          {renderNameDialog()}
        </Modal>
      )}
    </View>
  );

  function renderPicker() {
    const keys = pickFor || [];
    const current = keys.length === 1 ? categoryOf(categories, keys[0]) : undefined;
    const row = (label: string, value: string | null) => (
      <Pressable key={label} style={styles.pickRow} onPress={() => applyCategory(keys, value)}>
        <Text style={styles.pickText}>{label}</Text>
        {current !== undefined && current === value && <Icon name="check" size={20} color={GREEN} />}
      </Pressable>
    );
    return (
      <View style={styles.dimAbsolute}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {keys.length > 1 ? keys.length + '장을 어느 카테고리로 옮길까요?' : '카테고리 선택'}
          </Text>
          <ScrollView style={styles.sheetList}>
            {categories.list.map(name => row(name, name))}
            {row(UNASSIGNED, null)}
          </ScrollView>
          <Pressable
            style={styles.addRow}
            onPress={() =>
              openNameDialog('새 카테고리', '', null, async name => {
                const {name: added} = await addPhotoCategory(name);
                if (added) {
                  await applyCategory(keys, added);
                }
              })
            }>
            <Icon name="plus" size={20} color={GREEN} />
            <Text style={styles.addText}>새 카테고리 만들기</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={() => setPickFor(null)}>
            <Text style={styles.closeText}>취소</Text>
          </Pressable>
        </View>
        {nameDialog && renderNameDialog()}
      </View>
    );
  }

  function renderNameDialog() {
    return (
      <View style={styles.dimAbsolute}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{nameDialog?.title}</Text>
          <TextInput
            value={nameText}
            onChangeText={setNameText}
            placeholder="예: 북한산, 단풍"
            maxLength={20}
            autoFocus
            style={styles.input}
            onSubmitEditing={submitName}
          />
          <View style={styles.dialogButtons}>
            <Pressable style={styles.barButton} onPress={() => setNameDialog(null)}>
              <Text style={styles.barText}>취소</Text>
            </Pressable>
            <Pressable style={[styles.barButton, styles.barPrimary]} onPress={submitName}>
              <Text style={styles.barPrimaryText}>확인</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F7F6'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  emptyText: {marginTop: 16, textAlign: 'center', color: '#607D8B', fontSize: 16, lineHeight: 23},
  toolbar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, gap: 8},
  count: {flex: 1, fontSize: 16, fontWeight: '800', color: '#263238'},
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
  },
  toolText: {color: GREEN, fontWeight: '700', fontSize: 14},
  chips: {paddingHorizontal: 14, paddingVertical: 12, gap: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  chipOn: {backgroundColor: GREEN, borderColor: GREEN},
  chipText: {fontSize: 15, color: '#37474F'},
  chipTextOn: {color: '#FFF', fontWeight: '800'},
  list: {paddingHorizontal: 10, paddingBottom: 24},
  sectionTitle: {marginTop: 10, marginBottom: 6, marginLeft: 4, fontSize: 15, fontWeight: '800', color: '#37474F'},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {width: '33.33%', padding: 3},
  thumb: {width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#CFD8DC'},
  thumbDim: {opacity: 0.55},
  cellTag: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    maxWidth: '80%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {backgroundColor: GREEN},
  selectionBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  barButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEFF1',
  },
  barPrimary: {backgroundColor: GREEN},
  barText: {fontSize: 15, fontWeight: '700', color: '#37474F'},
  barPrimaryText: {fontSize: 15, fontWeight: '800', color: '#FFF'},
  viewer: {flex: 1, backgroundColor: '#000'},
  viewerImage: {flex: 1, width: '100%'},
  viewerInfo: {padding: 16, paddingBottom: 28, backgroundColor: '#111'},
  viewerText: {color: '#ECEFF1', fontSize: 14},
  viewerTag: {color: '#A5D6A7', fontSize: 15, fontWeight: '700', marginTop: 6},
  viewerButtons: {flexDirection: 'row', gap: 10, marginTop: 14},
  dim: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24},
  dimAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {backgroundColor: '#FFF', borderRadius: 16, padding: 18, maxHeight: '80%'},
  sheetTitle: {fontSize: 18, fontWeight: '900', color: '#263238', marginBottom: 10},
  sheetList: {flexGrow: 0},
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  pickText: {fontSize: 16, color: '#263238'},
  manageRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE'},
  manageName: {flex: 1, fontSize: 16, color: '#263238'},
  smallButton: {paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6, borderRadius: 8, backgroundColor: '#F1F3F4'},
  smallText: {fontSize: 14, fontWeight: '700', color: '#37474F'},
  danger: {color: '#C62828'},
  addRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  addText: {marginLeft: 6, fontSize: 16, fontWeight: '700', color: GREEN},
  closeButton: {alignItems: 'center', paddingVertical: 12, marginTop: 4, borderRadius: 12, backgroundColor: '#ECEFF1'},
  closeText: {fontSize: 15, fontWeight: '700', color: '#37474F'},
  input: {
    borderWidth: 1,
    borderColor: '#B0BEC5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#263238',
  },
  dialogButtons: {flexDirection: 'row', gap: 10, marginTop: 14},
});

export default PhotoAlbumScreen;
