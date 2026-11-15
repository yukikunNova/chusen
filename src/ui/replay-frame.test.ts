import { describe, expect, it } from 'vitest';
import { coverRect } from './replay-frame';

describe('coverRect', () => {
  it('同じ縦横比なら全体を使う', () => {
    expect(coverRect(2560, 1440, 1280, 720)).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
  });
  it('横に長い画面は左右を切り、中央を使う', () => {
    expect(coverRect(3200, 900, 1280, 720)).toEqual({ x: 800, y: 0, width: 1600, height: 900 });
  });
  it('縦に長い画面は上下を切り、中央を使う', () => {
    expect(coverRect(800, 1000, 1280, 720)).toEqual({ x: 0, y: 275, width: 800, height: 450 });
  });
});
