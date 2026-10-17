import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Share,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFocusEffect} from '@react-navigation/native';
import {
  SharedPlanData,
  buildPlanShareMessage,
  parsePlanImportUrl,
} from '../utils/planShare';

// 등산계획 전용 저장 key (다른 저장 데이터와 분리)
const PLANS_KEY = 'hiker_hiking_plans';

type HikingPlan = {
  id: string;
  destination: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM 또는 ''
  expectedDuration: string;
  partySize: number;
  memo: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

type PlanForm = {
  destination: string;
  date: string;
  startTime: string;
  expectedDuration: string;
  partySize: number;
  memo: string;
};

const EMPTY_FORM: PlanForm = {
  destination: '',
  date: '',
  startTime: '',
  expectedDuration: '',
  partySize: 1,
  memo: '',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PARTY_SIZE = 99;
const DURATION_PRESETS = ['2시간', '3시간', '4시간', '6시간'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

class PlanStorageError extends Error {}

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

const toDateString = (d: Date) =>
  d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

const todayString = () => toDateString(new Date());

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateString(d);
};

// YYYY-MM-DD 형식 + 실제 존재하는 날짜인지 검사 (예: 2026-02-30 거부)
const isValidDate = (value: string) => {
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

const isValidTime = (value: string) => TIME_RE.test(value);

// 숫자만 입력해도 YYYY-MM-DD 로 자동 정리
const formatDateInput = (text: string) => {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return digits.slice(0, 4) + '-' + digits.slice(4);
  }
  return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
};

// 숫자만 입력해도 HH:MM 으로 자동 정리
const formatTimeInput = (text: string) => {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return digits.slice(0, 2) + ':' + digits.slice(2);
};

const clampPartySize = (n: unknown) => {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) {
    return 1;
  }
  return Math.min(v, MAX_PARTY_SIZE);
};

const weekdayOf = (date: string) => {
  if (!isValidDate(date)) {
    return '';
  }
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return '-';
  }
  return toDateString(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

// 저장된 항목을 화면용 계획으로 변환 (id/목적지/날짜가 없는 항목은 표시하지 않음)
const toPlan = (item: any): HikingPlan | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  if (typeof item.id !== 'string' || typeof item.destination !== 'string' || typeof item.date !== 'string') {
    return null;
  }
  return {
    id: item.id,
    destination: item.destination,
    date: item.date,
    startTime: typeof item.startTime === 'string' ? item.startTime : '',
    expectedDuration: typeof item.expectedDuration === 'string' ? item.expectedDuration : '',
    partySize: clampPartySize(item.partySize),
    memo: typeof item.memo === 'string' ? item.memo : '',
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
};

// 날짜 → 출발시간(미입력은 뒤로) → 작성시각 순
const sortPlans = (plans: HikingPlan[]) =>
  [...plans].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    const at = a.startTime || '99:99';
    const bt = b.startTime || '99:99';
    if (at !== bt) {
      return at < bt ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

// 저장소 원본 배열 읽기. 손상된 경우 예외 → 호출 측에서 덮어쓰지 않음
const readRawPlans = async (): Promise<any[]> => {
  const raw = await AsyncStorage.getItem(PLANS_KEY);
  if (raw === null || raw === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new PlanStorageError('parse');
  }
  if (!Array.isArray(parsed)) {
    throw new PlanStorageError('not-array');
  }
  return parsed;
};

const STORAGE_ERROR_MESSAGE =
  '저장된 등산계획 데이터를 읽을 수 없습니다. 기존 데이터를 보호하기 위해 저장·수정·삭제를 중단했습니다.';

const HikingPlanScreen = ({navigation, route}: any) => {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const [plans, setPlans] = useState<HikingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const rawList = await readRawPlans();
      const list = rawList.map(toPlan).filter((p): p is HikingPlan => p !== null);
      setPlans(sortPlans(list));
      setLoadError(null);
    } catch (e) {
      console.error('Hiking plan load error:', e);
      setLoadError(STORAGE_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [loadPlans]),
  );

  // ---- 받은 등산계획 (hikerpro://plan/import 딥링크) ----
  // App.tsx 가 navigate('HikingPlan', {importUrl, importRequestId}) 로 전달. 자동 저장하지 않고 확인 Modal 표시
  const [incomingPlan, setIncomingPlan] = useState<SharedPlanData | null>(null);
  const [importing, setImporting] = useState(false);
  const importRequestId = route?.params?.importRequestId;
  const importUrl = route?.params?.importUrl;

  useEffect(() => {
    if (!importRequestId) {
      return;
    }
    // 같은 요청이 다시 처리되지 않도록 params 정리
    navigation.setParams({importUrl: undefined, importRequestId: undefined});
    const result = parsePlanImportUrl(importUrl);
    if (!result.ok) {
      console.warn('Invalid plan link:', result.reason);
      setIncomingPlan(null);
      Alert.alert('링크 오류', '올바른 HIKERPRO 등산계획 링크가 아닙니다.');
      return;
    }
    setIncomingPlan(result.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRequestId]);

  const isSameSchedule = (item: any, p: SharedPlanData) => {
    const existing = toPlan(item);
    return (
      !!existing &&
      existing.destination.trim() === p.destination &&
      existing.date.trim() === p.date &&
      (existing.startTime || '').trim() === p.startTime
    );
  };

  const writeIncomingPlan = async (p: SharedPlanData) => {
    setImporting(true);
    try {
      // 쓰기 직전 최신 데이터 재확인 (손상 시 예외 → 쓰지 않음)
      const rawList = await readRawPlans();
      const now = new Date().toISOString();
      const created: HikingPlan = {
        id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
        destination: p.destination,
        date: p.date,
        startTime: p.startTime,
        expectedDuration: p.expectedDuration,
        partySize: clampPartySize(p.partySize),
        memo: p.memo,
        createdAt: now,
        updatedAt: now,
      };
      await AsyncStorage.setItem(PLANS_KEY, JSON.stringify([...rawList, created]));
      setIncomingPlan(null);
      await loadPlans();
      Alert.alert('저장 완료', '받은 등산계획을 내 등산계획에 담았습니다.');
    } catch (e) {
      console.error('Hiking plan import error:', e);
      if (e instanceof PlanStorageError) {
        setLoadError(STORAGE_ERROR_MESSAGE);
        Alert.alert('저장 실패', STORAGE_ERROR_MESSAGE);
      } else {
        Alert.alert('저장 실패', '받은 등산계획을 저장하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setImporting(false);
    }
  };

  const acceptIncomingPlan = async () => {
    if (!incomingPlan || importing) {
      return;
    }
    const p = incomingPlan;
    let rawList: any[];
    try {
      rawList = await readRawPlans();
    } catch (e) {
      setLoadError(STORAGE_ERROR_MESSAGE);
      Alert.alert('저장 실패', STORAGE_ERROR_MESSAGE);
      return;
    }
    if (rawList.some(item => isSameSchedule(item, p))) {
      Alert.alert('중복 확인', '같은 일정의 계획이 이미 있습니다. 그래도 추가할까요?', [
        {text: '취소', style: 'cancel'},
        {text: '추가', onPress: () => writeIncomingPlan(p)},
      ]);
      return;
    }
    await writeIncomingPlan(p);
  };

  const sharePlan = async (plan: HikingPlan) => {
    try {
      await Share.share({
        title: 'HIKERPRO 등산계획',
        message: buildPlanShareMessage({
          destination: plan.destination,
          date: plan.date,
          startTime: plan.startTime,
          expectedDuration: plan.expectedDuration,
          partySize: plan.partySize,
          memo: plan.memo,
        }),
      });
    } catch (e) {
      Alert.alert('공유 실패', '공유 화면을 열지 못했습니다.');
    }
  };

  const updateForm = (patch: Partial<PlanForm>) => {
    setForm(prev => ({...prev, ...patch}));
  };

  const openNewForm = () => {
    if (loadError) {
      Alert.alert('저장 불가', STORAGE_ERROR_MESSAGE);
      return;
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    scrollRef.current?.scrollTo({y: 0, animated: true});
  };

  const openEditForm = (plan: HikingPlan) => {
    if (loadError) {
      Alert.alert('수정 불가', STORAGE_ERROR_MESSAGE);
      return;
    }
    setEditingId(plan.id);
    setForm({
      destination: plan.destination,
      date: plan.date,
      startTime: plan.startTime,
      expectedDuration: plan.expectedDuration,
      partySize: plan.partySize,
      memo: plan.memo,
    });
    setFormOpen(true);
    scrollRef.current?.scrollTo({y: 0, animated: true});
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const validateForm = (): string | null => {
    if (!form.destination.trim()) {
      return '산 / 목적지를 입력해 주세요.';
    }
    if (!form.date.trim()) {
      return '등산 날짜를 입력해 주세요.';
    }
    if (!isValidDate(form.date.trim())) {
      return '등산 날짜를 YYYY-MM-DD 형식의 올바른 날짜로 입력해 주세요. (예: 2026-10-03)';
    }
    const time = form.startTime.trim();
    if (time && !isValidTime(time)) {
      return '출발 예정시간을 HH:MM 형식(00:00~23:59)으로 입력해 주세요. (예: 07:30)';
    }
    return null;
  };

  const savePlan = async () => {
    if (saving) {
      return;
    }
    const error = validateForm();
    if (error) {
      Alert.alert('입력 확인', error);
      return;
    }
    setSaving(true);
    try {
      // 저장 직전 최신 데이터를 다시 읽어서 수정 (손상 시 덮어쓰지 않음)
      const rawList = await readRawPlans();
      const now = new Date().toISOString();
      const values = {
        destination: form.destination.trim(),
        date: form.date.trim(),
        startTime: form.startTime.trim(),
        expectedDuration: form.expectedDuration.trim(),
        partySize: clampPartySize(form.partySize),
        memo: form.memo.trim(),
      };

      let nextList: any[];
      if (editingId) {
        const index = rawList.findIndex(item => item && item.id === editingId);
        if (index < 0) {
          Alert.alert('수정 실패', '수정하려는 계획을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
          closeForm();
          await loadPlans();
          return;
        }
        const prev = rawList[index];
        const updated: HikingPlan = {
          ...prev,
          ...values,
          id: editingId,
          createdAt: typeof prev.createdAt === 'string' ? prev.createdAt : now,
          updatedAt: now,
        };
        nextList = [...rawList];
        nextList[index] = updated;
      } else {
        const created: HikingPlan = {
          id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
          ...values,
          createdAt: now,
          updatedAt: now,
        };
        nextList = [...rawList, created];
      }

      await AsyncStorage.setItem(PLANS_KEY, JSON.stringify(nextList));
      const wasEditing = !!editingId;
      closeForm();
      await loadPlans();
      Alert.alert('저장 완료', wasEditing ? '등산계획을 수정했습니다.' : '등산계획을 저장했습니다.');
    } catch (e) {
      console.error('Hiking plan save error:', e);
      if (e instanceof PlanStorageError) {
        setLoadError(STORAGE_ERROR_MESSAGE);
        Alert.alert('저장 실패', STORAGE_ERROR_MESSAGE);
      } else {
        Alert.alert('저장 실패', '등산계획을 저장하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (plan: HikingPlan) => {
    try {
      const rawList = await readRawPlans();
      const nextList = rawList.filter(item => !(item && item.id === plan.id));
      await AsyncStorage.setItem(PLANS_KEY, JSON.stringify(nextList));
      if (editingId === plan.id) {
        closeForm();
      }
      if (expandedId === plan.id) {
        setExpandedId(null);
      }
      await loadPlans();
    } catch (e) {
      console.error('Hiking plan delete error:', e);
      if (e instanceof PlanStorageError) {
        setLoadError(STORAGE_ERROR_MESSAGE);
        Alert.alert('삭제 실패', STORAGE_ERROR_MESSAGE);
      } else {
        Alert.alert('삭제 실패', '등산계획을 삭제하지 못했습니다. 다시 시도해 주세요.');
      }
    }
  };

  const confirmDelete = (plan: HikingPlan) => {
    if (loadError) {
      Alert.alert('삭제 불가', STORAGE_ERROR_MESSAGE);
      return;
    }
    Alert.alert(
      '계획 삭제',
      plan.destination + ' (' + plan.date + ') 계획을 삭제할까요?\n삭제한 계획은 되돌릴 수 없습니다.',
      [
        {text: '취소', style: 'cancel'},
        {text: '삭제', style: 'destructive', onPress: () => deletePlan(plan)},
      ],
    );
  };

  const goHome = () => {
    navigation.navigate('Home');
  };

  const today = todayString();

  const renderForm = () => (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <Icon name={editingId ? 'pencil' : 'plus-circle'} size={22} color="#2E7D32" />
        <Text style={styles.formTitle}>{editingId ? '계획 수정' : '새 등산계획'}</Text>
      </View>

      <Text style={styles.label}>
        산 / 목적지 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={form.destination}
        onChangeText={v => updateForm({destination: v})}
        placeholder="예: 북한산 백운대"
        placeholderTextColor="#9AA5A0"
        maxLength={60}
        returnKeyType="next"
      />

      <Text style={styles.label}>
        등산 날짜 <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={form.date}
        onChangeText={v => updateForm({date: formatDateInput(v)})}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9AA5A0"
        keyboardType="number-pad"
        maxLength={10}
      />
      <View style={styles.chipRow}>
        {[
          {label: '오늘', value: addDays(0)},
          {label: '내일', value: addDays(1)},
          {label: '모레', value: addDays(2)},
        ].map(chip => (
          <Pressable
            key={chip.label}
            onPress={() => updateForm({date: chip.value})}
            style={[styles.chip, form.date === chip.value && styles.chipActive]}>
            <Text style={[styles.chipText, form.date === chip.value && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>출발 예정시간</Text>
          <TextInput
            style={styles.input}
            value={form.startTime}
            onChangeText={v => updateForm({startTime: formatTimeInput(v)})}
            placeholder="HH:MM"
            placeholderTextColor="#9AA5A0"
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
        <View style={styles.rowGap} />
        <View style={styles.rowItem}>
          <Text style={styles.label}>동행 인원</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="동행 인원 줄이기"
              onPress={() => updateForm({partySize: clampPartySize(form.partySize - 1)})}
              style={styles.stepperBtn}>
              <Icon name="minus" size={20} color="#2E7D32" />
            </Pressable>
            <Text style={styles.stepperValue}>{form.partySize}명</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="동행 인원 늘리기"
              onPress={() => updateForm({partySize: clampPartySize(form.partySize + 1)})}
              style={styles.stepperBtn}>
              <Icon name="plus" size={20} color="#2E7D32" />
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={styles.label}>예상 소요시간</Text>
      <TextInput
        style={styles.input}
        value={form.expectedDuration}
        onChangeText={v => updateForm({expectedDuration: v})}
        placeholder="예: 4시간 30분"
        placeholderTextColor="#9AA5A0"
        maxLength={30}
      />
      <View style={styles.chipRow}>
        {DURATION_PRESETS.map(preset => (
          <Pressable
            key={preset}
            onPress={() => updateForm({expectedDuration: preset})}
            style={[styles.chip, form.expectedDuration === preset && styles.chipActive]}>
            <Text
              style={[
                styles.chipText,
                form.expectedDuration === preset && styles.chipTextActive,
              ]}>
              {preset}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={[styles.input, styles.memoInput]}
        value={form.memo}
        onChangeText={v => updateForm({memo: v})}
        placeholder="코스, 준비물, 집결 장소 등"
        placeholderTextColor="#9AA5A0"
        multiline
        textAlignVertical="top"
        maxLength={500}
      />

      <View style={styles.formButtons}>
        <Pressable
          accessibilityRole="button"
          onPress={closeForm}
          style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryBtnText}>취소</Text>
        </Pressable>
        <View style={styles.rowGap} />
        <Pressable
          accessibilityRole="button"
          onPress={savePlan}
          disabled={saving}
          style={({pressed}) => [styles.primaryBtn, (pressed || saving) && styles.pressed]}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{editingId ? '수정 저장' : '저장'}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  const renderPlanCard = (plan: HikingPlan) => {
    const expanded = expandedId === plan.id;
    const isPast = plan.date < today;
    const isToday = plan.date === today;
    return (
      <View key={plan.id} style={[styles.planCard, isPast && styles.planCardPast]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={plan.destination + ' 계획 상세 보기'}
          onPress={() => setExpandedId(expanded ? null : plan.id)}>
          <View style={styles.planTop}>
            <Icon name="terrain" size={26} color={isPast ? '#90A4AE' : '#2E7D32'} />
            <Text style={styles.planDestination} numberOfLines={2}>
              {plan.destination}
            </Text>
            {isToday && <Text style={[styles.badge, styles.badgeToday]}>오늘</Text>}
            {isPast && <Text style={[styles.badge, styles.badgePast]}>지난 계획</Text>}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color="#78909C" />
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Icon name="calendar" size={16} color="#546E7A" />
              <Text style={styles.infoText}>
                {plan.date}
                {weekdayOf(plan.date) ? ' (' + weekdayOf(plan.date) + ')' : ''}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Icon name="clock-outline" size={16} color="#546E7A" />
              <Text style={styles.infoText}>출발 {plan.startTime || '미정'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Icon name="timer-sand" size={16} color="#546E7A" />
              <Text style={styles.infoText}>소요 {plan.expectedDuration || '미정'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Icon name="account-group" size={16} color="#546E7A" />
              <Text style={styles.infoText}>{plan.partySize}명</Text>
            </View>
          </View>
        </Pressable>

        {expanded && (
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>메모</Text>
            <Text style={styles.detailText}>{plan.memo || '메모 없음'}</Text>
            <Text style={styles.detailMeta}>
              작성 {formatStamp(plan.createdAt)} · 수정 {formatStamp(plan.updatedAt)}
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={plan.destination + ' 계획 수정'}
            onPress={() => openEditForm(plan)}
            style={({pressed}) => [styles.actionBtn, pressed && styles.pressed]}>
            <Icon name="pencil" size={17} color="#2E7D32" />
            <Text style={styles.actionEdit}>수정</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={plan.destination + ' 계획 공유하기'}
            onPress={() => sharePlan(plan)}
            style={({pressed}) => [styles.actionBtn, pressed && styles.pressed]}>
            <Icon name="share-variant" size={17} color="#1565C0" />
            <Text style={styles.actionShare}>공유하기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={plan.destination + ' 계획 삭제'}
            onPress={() => confirmDelete(plan)}
            style={({pressed}) => [styles.actionBtn, pressed && styles.pressed]}>
            <Icon name="trash-can-outline" size={17} color="#D32F2F" />
            <Text style={styles.actionDelete}>삭제</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="홈으로"
            onPress={goHome}
            hitSlop={8}
            style={({pressed}) => [styles.homeBtn, pressed && styles.pressed]}>
            <Icon name="arrow-left" size={18} color="#FFFFFF" />
            <Text style={styles.homeBtnText}>홈으로</Text>
          </Pressable>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBox}>
              <Text style={styles.logo}>HIKERPRO</Text>
              <Text style={styles.headerTitle}>등산계획</Text>
              <Text style={styles.headerSub}>산행 일정을 미리 정리해 두세요.</Text>
            </View>
            <Icon name="calendar-check" size={38} color="#FFFFFF" />
          </View>
        </View>

        {loadError && (
          <View style={styles.errorCard}>
            <Icon name="alert-circle" size={22} color="#C62828" />
            <View style={styles.errorTextBox}>
              <Text style={styles.errorTitle}>데이터 오류</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable onPress={loadPlans} style={styles.retryBtn}>
                <Text style={styles.retryText}>다시 불러오기</Text>
              </Pressable>
            </View>
          </View>
        )}

        {formOpen ? (
          renderForm()
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={openNewForm}
            style={({pressed}) => [styles.newPlanBtn, pressed && styles.pressed]}>
            <Icon name="plus" size={22} color="#FFFFFF" />
            <Text style={styles.newPlanText}>새 계획 만들기</Text>
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>
          저장된 계획{plans.length > 0 ? ' ' + plans.length + '개' : ''}
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#2E7D32" />
        ) : plans.length === 0 ? (
          !loadError && (
            <View style={styles.emptyCard}>
              <Icon name="map-search-outline" size={36} color="#90A4AE" />
              <Text style={styles.emptyText}>저장된 등산계획이 없습니다.</Text>
              <Text style={styles.emptySub}>"새 계획 만들기"로 첫 산행을 계획해 보세요.</Text>
            </View>
          )
        ) : (
          plans.map(renderPlanCard)
        )}
      </ScrollView>

      <Modal
        visible={!!incomingPlan}
        transparent
        animationType="fade"
        onRequestClose={() => setIncomingPlan(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.formHeader}>
              <Icon name="calendar-import" size={22} color="#2E7D32" />
              <Text style={styles.formTitle}>받은 등산계획</Text>
            </View>
            <Text style={styles.modalNotice}>
              공유받은 계획입니다. 내용을 확인한 뒤 내 등산계획에 담을 수 있습니다.
            </Text>
            {incomingPlan && (
              <ScrollView style={styles.modalBody}>
                {[
                  {label: '산/목적지', value: incomingPlan.destination},
                  {
                    label: '날짜',
                    value:
                      incomingPlan.date +
                      (weekdayOf(incomingPlan.date) ? ' (' + weekdayOf(incomingPlan.date) + ')' : ''),
                  },
                  {label: '출발 예정시간', value: incomingPlan.startTime || '미정'},
                  {label: '예상 소요시간', value: incomingPlan.expectedDuration || '미정'},
                  {label: '동행 인원', value: incomingPlan.partySize + '명'},
                  {label: '메모', value: incomingPlan.memo || '메모 없음'},
                ].map(row => (
                  <View key={row.label} style={styles.modalRow}>
                    <Text style={styles.modalLabel}>{row.label}</Text>
                    <Text style={styles.modalValue}>{row.value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.formButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIncomingPlan(null)}
                disabled={importing}
                style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}>
                <Text style={styles.secondaryBtnText}>취소</Text>
              </Pressable>
              <View style={styles.rowGap} />
              <Pressable
                accessibilityRole="button"
                onPress={acceptIncomingPlan}
                disabled={importing}
                style={({pressed}) => [styles.primaryBtn, (pressed || importing) && styles.pressed]}>
                {importing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>내 등산계획에 담기</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F5F2',
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: '#173D2A',
  },
  homeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 12,
  },
  homeBtnText: {
    marginLeft: 4,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextBox: {
    flex: 1,
  },
  logo: {
    color: '#B8D7C0',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  headerTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  headerSub: {
    marginTop: 4,
    color: '#CFE3D5',
    fontSize: 13,
  },
  errorCard: {
    marginHorizontal: 14,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
    flexDirection: 'row',
  },
  errorTextBox: {
    flex: 1,
    marginLeft: 10,
  },
  errorTitle: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '900',
  },
  errorText: {
    marginTop: 3,
    color: '#5D4037',
    fontSize: 12,
    lineHeight: 17,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  retryText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '800',
  },
  newPlanBtn: {
    marginHorizontal: 14,
    marginTop: 16,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  newPlanText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  formCard: {
    marginHorizontal: 14,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 3,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  formTitle: {
    marginLeft: 8,
    color: '#263238',
    fontSize: 18,
    fontWeight: '900',
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    color: '#37474F',
    fontSize: 13,
    fontWeight: '800',
  },
  required: {
    color: '#D32F2F',
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DDD6',
    backgroundColor: '#F8FAF8',
    color: '#263238',
    fontSize: 15,
  },
  memoInput: {
    minHeight: 96,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#E8F0E9',
  },
  chipActive: {
    backgroundColor: '#2E7D32',
  },
  chipText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
  },
  rowItem: {
    flex: 1,
  },
  rowGap: {
    width: 10,
  },
  stepper: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DDD6',
    backgroundColor: '#F8FAF8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperBtn: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    color: '#263238',
    fontSize: 15,
    fontWeight: '900',
  },
  formButtons: {
    flexDirection: 'row',
    marginTop: 20,
  },
  secondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#455A64',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryBtn: {
    flex: 2,
    height: 50,
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
  pressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    marginHorizontal: 18,
    marginTop: 23,
    marginBottom: 11,
    color: '#263238',
    fontSize: 18,
    fontWeight: '900',
  },
  loader: {
    marginTop: 20,
  },
  emptyCard: {
    marginHorizontal: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    color: '#37474F',
    fontSize: 15,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 4,
    color: '#78909C',
    fontSize: 12,
  },
  planCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 5,
    borderLeftColor: '#2E7D32',
    elevation: 2,
  },
  planCardPast: {
    borderLeftColor: '#B0BEC5',
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planDestination: {
    flex: 1,
    marginLeft: 8,
    color: '#263238',
    fontSize: 17,
    fontWeight: '900',
  },
  badge: {
    marginRight: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '800',
  },
  badgeToday: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
  },
  badgePast: {
    backgroundColor: '#ECEFF1',
    color: '#607D8B',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  infoItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoText: {
    marginLeft: 6,
    color: '#455A64',
    fontSize: 13,
    fontWeight: '700',
  },
  detailBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5F8F5',
  },
  detailLabel: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '900',
  },
  detailText: {
    marginTop: 4,
    color: '#37474F',
    fontSize: 14,
    lineHeight: 20,
  },
  detailMeta: {
    marginTop: 8,
    color: '#90A4AE',
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2EE',
    paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  actionEdit: {
    marginLeft: 4,
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '800',
  },
  actionShare: {
    marginLeft: 4,
    color: '#1565C0',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    maxHeight: '85%',
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  modalNotice: {
    marginTop: 6,
    color: '#607D8B',
    fontSize: 12,
    lineHeight: 17,
  },
  modalBody: {
    marginTop: 10,
  },
  modalRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2EE',
  },
  modalLabel: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '900',
  },
  modalValue: {
    marginTop: 3,
    color: '#263238',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  actionDelete: {
    marginLeft: 4,
    color: '#D32F2F',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default HikingPlanScreen;
