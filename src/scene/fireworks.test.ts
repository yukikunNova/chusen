import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, launchInterval } from './fireworks';

describe('launchInterval', () => {
  it('最初の 30 秒は 0.35 秒間隔、以降は 2.5 秒間隔', () => {
    expect(launchInterval(0)).toBe(0.35);
    expect(launchInterval(29.9)).toBe(0.35);
    expect(launchInterval(30)).toBe(2.5);
    expect(launchInterval(600)).toBe(2.5);
  });
});

describe('MAX_PARTICLES', () => {
  it('粒子数の上限は 6000', () => {
    expect(MAX_PARTICLES).toBe(6000);
  });
});
