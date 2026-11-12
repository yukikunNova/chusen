import { describe, expect, it } from 'vitest';
import { VEHICLE_KINDS, laneOffset, nameTagText, pickVehicles } from './layout';

const offsets = (count: number) => Array.from({ length: count }, (_, i) => laneOffset(i, count));

describe('laneOffset', () => {
  it('1 人は中央', () => {
    expect(laneOffset(0, 1)).toEqual({ x: 0, y: 0 });
  });
  it('8 人以下は 1 段で x がすべて異なり、左右対称', () => {
    const o = offsets(8);
    expect(o.every((p) => p.y === 0)).toBe(true);
    expect(new Set(o.map((p) => p.x)).size).toBe(8);
    expect(o.reduce((sum, p) => sum + p.x, 0)).toBeCloseTo(0, 9);
  });
  it.each([9, 15, 20])('%i 人は 2 段で、同じ段の x がすべて異なる', (count) => {
    const o = offsets(count);
    const rows = new Map<number, number[]>();
    for (const p of o) rows.set(p.y, [...(rows.get(p.y) ?? []), p.x]);
    expect(rows.size).toBe(2);
    for (const xs of rows.values()) expect(new Set(xs).size).toBe(xs.length);
    expect(Math.max(...o.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(16);
  });
});

describe('nameTagText', () => {
  it('8 文字以下はそのまま', () => {
    expect(nameTagText('佐藤')).toBe('佐藤');
    expect(nameTagText('あいうえおかきく')).toBe('あいうえおかきく');
  });
  it('9 文字以上は先頭 8 文字 + …', () => {
    expect(nameTagText('あいうえおかきくけこ')).toBe('あいうえおかきく…');
  });
  it('サロゲートペアを割らない', () => {
    expect(nameTagText('😀'.repeat(9))).toBe('😀'.repeat(8) + '…');
  });
});

describe('pickVehicles', () => {
  /** 0, 0.1, 0.2 … と進む決まった乱数。 */
  const stepping = () => {
    let n = 0;
    return () => (n++ % 10) / 10;
  };
  it('乗り物は 16 種類', () => {
    expect(VEHICLE_KINDS).toHaveLength(16);
    expect(new Set(VEHICLE_KINDS).size).toBe(16);
  });
  it('人数ぶん返し、種類数以下なら全員ちがう乗り物になる', () => {
    for (let count = 1; count <= VEHICLE_KINDS.length; count++) {
      const picked = pickVehicles(count, stepping());
      expect(picked).toHaveLength(count);
      expect(new Set(picked).size).toBe(count);
      for (const kind of picked) expect(VEHICLE_KINDS).toContain(kind);
    }
  });
  it('種類数を超えたら、どの種類も同じくらい使う', () => {
    const picked = pickVehicles(40, stepping());
    expect(picked).toHaveLength(40);
    for (const kind of VEHICLE_KINDS) {
      const used = picked.filter((k) => k === kind).length;
      expect(used).toBeGreaterThanOrEqual(2);
      expect(used).toBeLessThanOrEqual(3);
    }
  });
  it('乱数が変われば割り当ても変わる', () => {
    const a = pickVehicles(8, () => 0);
    const b = pickVehicles(8, () => 0.999);
    expect(a).not.toEqual(b);
  });
});
