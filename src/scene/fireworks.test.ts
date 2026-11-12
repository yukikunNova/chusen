import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, burstSoundAllowed, launchInterval } from './fireworks';

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

describe('burstSoundAllowed', () => {
  it('炸裂音は打ち上げ開始から 10 秒まで（結果画面を映したままでも静かになる）', () => {
    expect(burstSoundAllowed(0)).toBe(true);
    expect(burstSoundAllowed(9.9)).toBe(true);
    expect(burstSoundAllowed(10)).toBe(false);
    expect(burstSoundAllowed(120)).toBe(false);
  });
});
