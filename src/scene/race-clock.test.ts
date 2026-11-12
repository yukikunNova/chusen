import { describe, expect, it } from 'vitest';
import { createRaceClock } from './race-clock';

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
