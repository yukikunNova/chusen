import { describe, expect, it } from 'vitest';
import { createRand } from './prng';

describe('createRand', () => {
  it('同じ seed なら同じ列', () => {
    const a = createRand(42);
    const b = createRand(42);
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  });
  it('seed が違えば違う列', () => {
    expect(createRand(1)()).not.toBe(createRand(2)());
  });
  it('0 以上 1 未満', () => {
    const r = createRand(7);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
