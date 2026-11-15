import { describe, expect, it } from 'vitest';
import { createRand } from './prng';
import { RARE_KINDS, RARE_LABELS, drawRare, rareLine } from './rare';

describe('drawRare', () => {
  it('各 1% で 3 種類を引き、それ以外は通常回', () => {
    expect(drawRare(() => 0)).toBe('gold');
    expect(drawRare(() => 0.0099)).toBe('gold');
    expect(drawRare(() => 0.01)).toBe('meteor');
    expect(drawRare(() => 0.0199)).toBe('meteor');
    expect(drawRare(() => 0.02)).toBe('fever');
    expect(drawRare(() => 0.0299)).toBe('fever');
    expect(drawRare(() => 0.03)).toBeNull();
    expect(drawRare(() => 0.999)).toBeNull();
  });
  it('合計の出現率は約 3% で、3 種類とも出る', () => {
    const rand = createRand(7);
    const seen = new Map<string, number>();
    const total = 30000;
    for (let i = 0; i < total; i++) {
      const kind = drawRare(rand);
      if (kind) seen.set(kind, (seen.get(kind) ?? 0) + 1);
    }
    const hits = [...seen.values()].reduce((a, b) => a + b, 0);
    expect(hits / total).toBeGreaterThan(0.024);
    expect(hits / total).toBeLessThan(0.036);
    expect([...seen.keys()].sort()).toEqual([...RARE_KINDS].sort());
  });
});

describe('rareLine', () => {
  it('呼び名と出現率を 1 行にする', () => {
    expect(RARE_LABELS.gold).toBe('黄金レース');
    expect(rareLine('gold')).toBe('激レア回「黄金レース」（出現率1%）');
    expect(rareLine('meteor')).toContain('流星群レース');
    expect(rareLine('fever')).toContain('全編フィーバー');
  });
});
