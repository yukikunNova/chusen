import { describe, expect, it } from 'vitest';
import { cryptoRandomInt, shuffle } from './shuffle';

describe('shuffle', () => {
  it('Fisher–Yates: 後ろから i を下げ j=randomInt(i+1) と交換する', () => {
    expect(shuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('randomInt には i+1 を渡す', () => {
    const seen: number[] = [];
    shuffle([1, 2, 3, 4], (n) => (seen.push(n), n - 1));
    expect(seen).toEqual([4, 3, 2]);
  });
  it('入力を変更しない', () => {
    const src = [1, 2, 3];
    shuffle(src, () => 0);
    expect(src).toEqual([1, 2, 3]);
  });
  it('空と 1 件はそのまま', () => {
    expect(shuffle([], cryptoRandomInt)).toEqual([]);
    expect(shuffle(['x'], cryptoRandomInt)).toEqual(['x']);
  });
  it('3 件で 6 通りすべてが出て、偏りが小さい', () => {
    const count = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const k = shuffle(['a', 'b', 'c'], cryptoRandomInt).join('');
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    expect(count.size).toBe(6);
    for (const n of count.values()) expect(n).toBeGreaterThan(800); // 期待値 1000
  });
});

describe('cryptoRandomInt', () => {
  it('0 以上 maxExclusive 未満の整数', () => {
    for (let i = 0; i < 2000; i++) {
      const v = cryptoRandomInt(7);
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true);
    }
  });
  it('不正な上限は RangeError', () => {
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
    expect(() => cryptoRandomInt(1.5)).toThrow(RangeError);
  });
});
