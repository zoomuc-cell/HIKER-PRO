import {describe, expect, it} from '@jest/globals';
import {
  activityStreak,
  elevationProfile,
  findNewRecords,
  formatPace,
  goalProgress,
  isShortActivity,
  kmSplits,
  monthTrend,
  parseWeeklyGoal,
  weekTrend,
  type InsightActivity,
  type InsightPoint,
} from '../src/utils/insights';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const act = (id: string, startedAt: number, distanceM: number, extra: Partial<InsightActivity> = {}): InsightActivity => ({
  id,
  activityType: 'walking',
  startedAt,
  durationSec: 1800,
  distanceM,
  elevationM: 10,
  ...extra,
});

// 2026-11-27 is a Friday
const NOW = new Date(2026, 10, 27, 15);

describe('isShortActivity', () => {
  it('flags under a minute or barely moving', () => {
    expect(isShortActivity(30, 500)).toBe(true);
    expect(isShortActivity(600, 0)).toBe(true);
    expect(isShortActivity(600, 10, 20)).toBe(false); // stairs: climbed but did not move far
    expect(isShortActivity(600, 800)).toBe(false);
  });
});

describe('weekTrend', () => {
  it('compares this week (Mon start) to last week and buckets days', () => {
    const items = [
      act('a', at(2026, 11, 24), 3000), // Tue this week
      act('b', at(2026, 11, 27), 2000), // Fri this week
      act('c', at(2026, 11, 20), 4000), // Fri last week
      act('d', at(2026, 11, 23, 0), 1000), // Mon 00:00 this week
    ];
    const t = weekTrend(items, NOW);
    expect(t.thisWeek.distanceM).toBe(6000);
    expect(t.lastWeek.distanceM).toBe(4000);
    expect(t.changePct).toBe(50);
    expect(t.dailyDistanceM).toEqual([1000, 3000, 0, 0, 2000, 0, 0]);
    expect(t.todayIndex).toBe(4);
  });
  it('has no change percent when last week is empty', () => {
    expect(weekTrend([act('a', at(2026, 11, 25), 1000)], NOW).changePct).toBeNull();
  });
});

describe('monthTrend', () => {
  it('compares months', () => {
    const t = monthTrend([act('a', at(2026, 11, 2), 5000), act('b', at(2026, 10, 30), 10000)], NOW);
    expect(t.thisMonth.distanceM).toBe(5000);
    expect(t.changePct).toBe(-50);
  });
});

describe('activityStreak', () => {
  it('counts consecutive days, keeping the streak if today is not done yet', () => {
    const items = [
      act('a', at(2026, 11, 26), 1000),
      act('b', at(2026, 11, 25), 1000),
      act('b2', at(2026, 11, 25, 18), 1000),
      act('c', at(2026, 11, 24), 1000),
      act('d', at(2026, 11, 10), 1000),
      act('e', at(2026, 11, 11), 1000),
      act('f', at(2026, 11, 12), 1000),
      act('g', at(2026, 11, 13), 1000),
    ];
    expect(activityStreak(items, NOW)).toEqual({current: 3, best: 4, activeToday: false});
  });
  it('is broken after a missed day', () => {
    expect(activityStreak([act('a', at(2026, 11, 25), 1000)], NOW).current).toBe(0);
  });
  it('handles no data', () => {
    expect(activityStreak([], NOW)).toEqual({current: 0, best: 0, activeToday: false});
  });
});

describe('findNewRecords', () => {
  const prev = [
    act('p1', at(2026, 11, 1), 5000, {durationSec: 3000, elevationM: 100}),
    act('p2', at(2026, 11, 2), 3000, {durationSec: 1500, elevationM: 50}),
    act('x', at(2026, 11, 3), 50000, {activityType: 'cycling', durationSec: 9000}),
  ];
  it('reports distance and pace records against the same activity type only', () => {
    const r = findNewRecords(prev, act('n', at(2026, 11, 27), 6000, {durationSec: 2400, elevationM: 80}));
    expect(r.map(x => x.kind)).toEqual(['distance', 'pace']);
    expect(r[0].value).toBe('6.00km');
  });
  it('gives nothing for the first activity of a type or a short one', () => {
    expect(findNewRecords(prev, act('n', at(2026, 11, 27), 9000, {activityType: 'running'}))).toEqual([]);
    expect(findNewRecords(prev, act('n', at(2026, 11, 27), 0, {durationSec: 20}))).toEqual([]);
  });
});

// Points going north: 0.001 deg latitude is about 111.2 m
const line = (count: number, stepSec: number, altitude = (i: number) => 100 + i): InsightPoint[] =>
  Array.from({length: count}, (_, i) => ({
    latitude: 37 + i * 0.001,
    longitude: 127,
    altitude: altitude(i),
    timestamp: 1_000_000 + i * stepSec * 1000,
  }));

describe('kmSplits', () => {
  it('splits a steady 2.2 km walk into 1 km pieces with a partial tail', () => {
    const splits = kmSplits(line(21, 60)); // 20 steps x 111.2 m = 2.22 km, 60 s per step
    expect(splits.length).toBe(3);
    expect(splits[0].partial).toBe(false);
    expect(Math.round(splits[0].paceSecPerKm)).toBe(540); // 60 s / 111.2 m -> 9'00"/km
    expect(splits[2].partial).toBe(true);
    expect(Math.round(splits[2].distanceM)).toBe(224);
  });
  it('returns nothing without enough points', () => {
    expect(kmSplits(line(1, 60))).toEqual([]);
  });
});

describe('elevationProfile', () => {
  it('samples altitude along distance', () => {
    const p = elevationProfile(line(50, 10), 10)!;
    expect(p.samples.length).toBe(10);
    expect(p.minAltitude).toBe(100);
    expect(p.maxAltitude).toBe(149);
  });
  it('is null when there is no altitude data', () => {
    expect(elevationProfile(line(10, 10, () => 0))).toBeNull();
  });
});

describe('formatting and goals', () => {
  it('formats pace', () => {
    expect(formatPace(365)).toBe(`6'05"`);
    expect(formatPace(0)).toBe('-');
  });
  it('parses goals and progress', () => {
    expect(parseWeeklyGoal(null)).toBe(10);
    expect(parseWeeklyGoal('20')).toBe(20);
    expect(parseWeeklyGoal('abc')).toBe(10);
    expect(goalProgress(5000, 10)).toBe(0.5);
    expect(goalProgress(50000, 10)).toBe(1);
  });
});
