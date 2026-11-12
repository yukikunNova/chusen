import { describe, expect, it } from 'vitest';
import type { RaceScript } from '../domain/race-script';
import { activeCue, eventFx, shotAt } from './direction';

describe('activeCue', () => {
  const cues = [
    { t: 3, text: 'A' },
    { t: 8, text: 'B' },
  ];
  it('開始から 2.4 秒だけ表示する', () => {
    expect(activeCue(cues, 2.9)).toBeNull();
    expect(activeCue(cues, 3)).toBe('A');
    expect(activeCue(cues, 5.3)).toBe('A');
    expect(activeCue(cues, 5.5)).toBeNull();
    expect(activeCue(cues, 8)).toBe('B');
  });
  it('次のキューが始まれば切り替える', () => {
    const close = [
      { t: 3, text: 'A' },
      { t: 4.5, text: 'B' },
    ];
    expect(activeCue(close, 4.4)).toBe('A');
    expect(activeCue(close, 4.6)).toBe('B');
  });
  it('キューが無ければ null', () => {
    expect(activeCue([], 5)).toBeNull();
  });
});

describe('shotAt', () => {
  it.each([
    [0, 'lineup'],
    [2.99, 'lineup'],
    [3, 'chase'],
    [10, 'overhead'],
    [14, 'side'],
    [17, 'chase'],
    [20, 'finalCorner'],
    [24, 'goal'],
    [26.5, 'pullback'],
  ] as const)('%f 秒は %s', (t, shot) => {
    expect(shotAt(t)).toBe(shot);
  });
});

describe('eventFx', () => {
  const script = (kind: RaceScript['events'][number]['kind']): RaceScript => ({
    racers: [],
    events: [{ t: 6, kind, racer: 2 }],
  });
  it('spin はイベント時刻から 1.5 秒かけて 1→0 に減衰する', () => {
    const s = script('spin');
    expect(eventFx(s, 2, 5.9)).toEqual({ spin: 0, boost: 0, sway: 0 });
    expect(eventFx(s, 2, 6).spin).toBe(1);
    expect(eventFx(s, 2, 6.75).spin).toBeCloseTo(0.5, 9);
    expect(eventFx(s, 2, 7.6).spin).toBe(0);
  });
  it('対象外の機体には掛からない', () => {
    expect(eventFx(script('spin'), 1, 6.2)).toEqual({ spin: 0, boost: 0, sway: 0 });
  });
  it.each([
    ['boost', 'boost'],
    ['rocketStart', 'boost'],
    ['overtake', 'boost'],
    ['finalComeback', 'boost'],
    ['weave', 'sway'],
    ['stall', 'sway'],
    ['slowStart', 'sway'],
    ['spin', 'spin'],
  ] as const)('%s は %s に効く', (kind, channel) => {
    const fx = eventFx(script(kind), 2, 6);
    expect(fx[channel]).toBe(1);
    expect(fx.spin + fx.boost + fx.sway).toBe(1);
  });
  it('重なったイベントは強い方を採る', () => {
    const s: RaceScript = {
      racers: [],
      events: [
        { t: 6, kind: 'boost', racer: 0 },
        { t: 6.75, kind: 'boost', racer: 0 },
      ],
    };
    expect(eventFx(s, 0, 6.75).boost).toBe(1);
  });
});
