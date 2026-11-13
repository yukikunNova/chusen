import { describe, expect, it } from 'vitest';
import { createRaceClock, createTimeWarp } from './race-clock';

function fakeNow() {
  let ms = 1000;
  return { now: () => ms, set: (v: number) => (ms = 1000 + v) };
}

describe('createRaceClock', () => {
  it('実時間で進む', () => {
    const time = fakeNow();
    const clock = createRaceClock(time.now, 27);
    expect(clock.elapsed()).toBe(0);
    time.set(5000);
    expect(clock.elapsed()).toBe(5);
    expect(clock.finished()).toBe(false);
  });
  it('スリープ復帰などで時刻が飛んだら duration で止まり、終了になる', () => {
    const time = fakeNow();
    const clock = createRaceClock(time.now, 27);
    time.set(60000);
    expect(clock.elapsed()).toBe(27);
    expect(clock.finished()).toBe(true);
  });
  it('ちょうど duration で終了', () => {
    const time = fakeNow();
    const clock = createRaceClock(time.now, 27);
    time.set(26999);
    expect(clock.finished()).toBe(false);
    time.set(27000);
    expect(clock.finished()).toBe(true);
  });
  it('skip 後は時刻に関係なく終了', () => {
    const time = fakeNow();
    const clock = createRaceClock(time.now, 27);
    time.set(2000);
    clock.skip();
    expect(clock.finished()).toBe(true);
    expect(clock.elapsed()).toBe(27);
  });
});

describe('createTimeWarp', () => {
  it('スローなしは恒等で、尺も変わらない', () => {
    const warp = createTimeWarp(27, null);
    expect(warp.realDuration).toBe(27);
    for (const r of [0, 3, 22.9, 27]) expect(warp.toRace(r)).toBe(r);
  });
  it('スロー区間だけ進みが遅く、前後は等速。尺は伸びた分だけ長い', () => {
    const warp = createTimeWarp(27, { from: 22.8, to: 23.2, rate: 0.2 });
    expect(warp.realDuration).toBeCloseTo(28.6, 9);
    expect(warp.toRace(10)).toBe(10);
    expect(warp.toRace(22.8)).toBeCloseTo(22.8, 9);
    expect(warp.toRace(23.8)).toBeCloseTo(23, 9);
    expect(warp.toRace(24.8)).toBeCloseTo(23.2, 9);
    expect(warp.toRace(25.8)).toBeCloseTo(24.2, 9);
    expect(warp.toRace(warp.realDuration)).toBeCloseTo(27, 9);
  });
  it('単調に増え、途中で飛ばない', () => {
    const warp = createTimeWarp(27, { from: 22.8, to: 23.2, rate: 0.2 });
    let prev = warp.toRace(0);
    for (let r = 0.01; r <= warp.realDuration; r += 0.01) {
      const t = warp.toRace(r);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t - prev).toBeLessThan(0.011);
      prev = t;
    }
  });
  it('スロー中かどうかを答える', () => {
    const warp = createTimeWarp(27, { from: 22.8, to: 23.2, rate: 0.2 });
    expect(warp.slowAt(22.7)).toBe(false);
    expect(warp.slowAt(23)).toBe(true);
    expect(warp.slowAt(23.2)).toBe(false);
    expect(createTimeWarp(27, null).slowAt(23)).toBe(false);
  });
});
