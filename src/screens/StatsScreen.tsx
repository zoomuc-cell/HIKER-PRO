// 상세 통계 (Pro): 연도별·월별 합계, 활동 종류별 합계, 개인 최고 기록
import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ProUpgradeModal from '../components/ProUpgradeModal';
import {usePro} from '../services/ProService';

const HISTORY_KEY = 'hiker_activity_history';

type Activity = {
  id: string;
  activityType: string;
  activityLabel?: string;
  startedAt: number;
  durationSec: number;
  distanceM: number;
  elevationM: number;
  calories?: number;
};

const TYPE_META: Record<string, {label: string; icon: string; color: string}> = {
  hiking: {label: '등산', icon: 'terrain', color: '#2E7D32'},
  building: {label: '빌딩 오르기', icon: 'office-building', color: '#6A1B9A'},
  walking: {label: '걷기', icon: 'walk', color: '#00897B'},
  running: {label: '러닝', icon: 'run', color: '#EF6C00'},
  cycling: {label: '자전거', icon: 'bike', color: '#1565C0'},
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const formatKm = (meters: number) => (meters / 1000).toFixed(1);

const formatHours = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

const formatDate = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

const loadActivities = async (): Promise<Activity[]> => {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .filter((item: any) => item && typeof item.startedAt === 'number')
      .map((item: any) => ({
        id: String(item.id),
        activityType: String(item.activityType || 'hiking'),
        activityLabel: item.activityLabel,
        startedAt: item.startedAt,
        durationSec: num(item.durationSec),
        distanceM: num(item.distanceM),
        elevationM: num(item.elevationM),
        calories: num(item.calories),
      }));
  } catch (e) {
    return [];
  }
};

const StatsScreen = () => {
  const pro = usePro();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadActivities().then(list => {
        if (active) {
          setActivities(list);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const yearActivities = useMemo(
    () => activities.filter(a => new Date(a.startedAt).getFullYear() === year),
    [activities, year],
  );

  const totals = useMemo(
    () =>
      yearActivities.reduce(
        (sum, a) => ({
          count: sum.count + 1,
          distanceM: sum.distanceM + a.distanceM,
          elevationM: sum.elevationM + a.elevationM,
          durationSec: sum.durationSec + a.durationSec,
          calories: sum.calories + num(a.calories),
        }),
        {count: 0, distanceM: 0, elevationM: 0, durationSec: 0, calories: 0},
      ),
    [yearActivities],
  );

  const monthly = useMemo(() => {
    const months = Array.from({length: 12}, () => ({distanceM: 0, count: 0}));
    yearActivities.forEach(a => {
      const m = new Date(a.startedAt).getMonth();
      months[m].distanceM += a.distanceM;
      months[m].count += 1;
    });
    return months;
  }, [yearActivities]);
  const maxMonthDistance = Math.max(1, ...monthly.map(m => m.distanceM));

  const byType = useMemo(() => {
    const map: Record<string, {count: number; distanceM: number}> = {};
    yearActivities.forEach(a => {
      map[a.activityType] = map[a.activityType] || {count: 0, distanceM: 0};
      map[a.activityType].count += 1;
      map[a.activityType].distanceM += a.distanceM;
    });
    return Object.entries(map).sort((a, b) => b[1].distanceM - a[1].distanceM);
  }, [yearActivities]);

  const bests = useMemo(() => {
    const pick = (key: 'distanceM' | 'elevationM' | 'durationSec') =>
      activities.reduce<Activity | null>((best, a) => (!best || a[key] > best[key] ? a : best), null);
    return {
      distance: pick('distanceM'),
      elevation: pick('elevationM'),
      duration: pick('durationSec'),
    };
  }, [activities]);

  const years = useMemo(() => {
    const set = new Set(activities.map(a => new Date(a.startedAt).getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => a - b);
  }, [activities]);
  const yearIndex = years.indexOf(year);

  if (!pro.isPro) {
    return (
      <View style={styles.locked}>
        <Icon name="lock-outline" size={48} color="#90A4AE" />
        <Text style={styles.lockedTitle}>상세 통계는 Pro 기능입니다</Text>
        <Text style={styles.lockedText}>월별·연도별 기록과 개인 최고 기록을 한눈에 볼 수 있습니다.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setUpgradeVisible(true)}>
          <Text style={styles.primaryBtnText}>Pro 알아보기</Text>
        </TouchableOpacity>
        <ProUpgradeModal
          visible={upgradeVisible}
          onClose={() => setUpgradeVisible(false)}
          featureName="상세 통계"
        />
      </View>
    );
  }

  const bestRow = (title: string, icon: string, item: Activity | null, value: (a: Activity) => string) => (
    <View style={styles.bestRow} key={title}>
      <Icon name={icon} size={22} color="#2E7D32" />
      <View style={styles.bestBody}>
        <Text style={styles.bestTitle}>{title}</Text>
        <Text style={styles.bestSub}>
          {item ? `${TYPE_META[item.activityType]?.label || item.activityLabel || '활동'} · ${formatDate(item.startedAt)}` : '기록 없음'}
        </Text>
      </View>
      <Text style={styles.bestValue}>{item ? value(item) : '-'}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.yearRow}>
        <TouchableOpacity
          disabled={yearIndex <= 0}
          onPress={() => setYear(years[yearIndex - 1])}
          style={styles.yearBtn}>
          <Icon name="chevron-left" size={30} color={yearIndex <= 0 ? '#CFD8DC' : '#2E7D32'} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}년</Text>
        <TouchableOpacity
          disabled={yearIndex >= years.length - 1}
          onPress={() => setYear(years[yearIndex + 1])}
          style={styles.yearBtn}>
          <Icon name="chevron-right" size={30} color={yearIndex >= years.length - 1 ? '#CFD8DC' : '#2E7D32'} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {[
          {label: '활동', value: `${totals.count}회`},
          {label: '거리', value: `${formatKm(totals.distanceM)}km`},
          {label: '누적 고도', value: `${Math.round(totals.elevationM).toLocaleString()}m`},
          {label: '시간', value: formatHours(totals.durationSec)},
          {label: '칼로리', value: `${Math.round(totals.calories).toLocaleString()}kcal`},
        ].map(item => (
          <View style={styles.tile} key={item.label}>
            <Text style={styles.tileValue}>{item.value}</Text>
            <Text style={styles.tileLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>월별 거리 (km)</Text>
        <View style={styles.chart}>
          {monthly.map((m, index) => (
            <View style={styles.barCol} key={index}>
              <Text style={styles.barValue}>{m.distanceM > 0 ? formatKm(m.distanceM) : ''}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, {height: `${(m.distanceM / maxMonthDistance) * 100}%`}]} />
              </View>
              <Text style={styles.barLabel}>{index + 1}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>활동 종류별</Text>
        {byType.length === 0 ? (
          <Text style={styles.empty}>{year}년에 저장된 활동이 없습니다.</Text>
        ) : (
          byType.map(([type, value]) => (
            <View style={styles.typeRow} key={type}>
              <Icon name={TYPE_META[type]?.icon || 'walk'} size={20} color={TYPE_META[type]?.color || '#455A64'} />
              <Text style={styles.typeLabel}>{TYPE_META[type]?.label || type}</Text>
              <Text style={styles.typeValue}>
                {value.count}회 · {formatKm(value.distanceM)}km
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>개인 최고 기록 (전체 기간)</Text>
        {bestRow('가장 긴 거리', 'map-marker-distance', bests.distance, a => `${formatKm(a.distanceM)}km`)}
        {bestRow('가장 많이 오른 고도', 'trending-up', bests.elevation, a => `${Math.round(a.elevationM)}m`)}
        {bestRow('가장 긴 활동 시간', 'timer-outline', bests.duration, a => formatHours(a.durationSec))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F5F7F5'},
  content: {padding: 16, paddingBottom: 40},
  locked: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F5F7F5'},
  lockedTitle: {fontSize: 19, fontWeight: '800', color: '#263238', marginTop: 12},
  lockedText: {fontSize: 14, color: '#607D8B', textAlign: 'center', marginTop: 8, lineHeight: 20},
  primaryBtn: {backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 20},
  primaryBtnText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  yearRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  yearBtn: {padding: 6},
  yearText: {fontSize: 22, fontWeight: '800', color: '#1B5E20', marginHorizontal: 16},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  tile: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  tileValue: {fontSize: 16, fontWeight: '800', color: '#263238'},
  tileLabel: {fontSize: 12, color: '#78909C', marginTop: 4},
  card: {backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginTop: 6, marginBottom: 8},
  cardTitle: {fontSize: 16, fontWeight: '800', color: '#263238', marginBottom: 12},
  chart: {flexDirection: 'row', height: 160, alignItems: 'flex-end'},
  barCol: {flex: 1, alignItems: 'center', height: '100%'},
  barValue: {fontSize: 9, color: '#607D8B', height: 14},
  barTrack: {flex: 1, width: '60%', justifyContent: 'flex-end'},
  bar: {width: '100%', backgroundColor: '#66BB6A', borderTopLeftRadius: 4, borderTopRightRadius: 4},
  barLabel: {fontSize: 11, color: '#78909C', marginTop: 4},
  empty: {fontSize: 14, color: '#90A4AE'},
  typeRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  typeLabel: {flex: 1, marginLeft: 10, fontSize: 15, color: '#37474F'},
  typeValue: {fontSize: 15, fontWeight: '700', color: '#263238'},
  bestRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10},
  bestBody: {flex: 1, marginLeft: 12},
  bestTitle: {fontSize: 15, fontWeight: '700', color: '#37474F'},
  bestSub: {fontSize: 12, color: '#90A4AE', marginTop: 2},
  bestValue: {fontSize: 16, fontWeight: '800', color: '#1B5E20'},
});

export default StatsScreen;
