import { describe, expect, it } from 'vitest';
import { createRand } from '../domain/prng';
import { TIMELINE, buildRaceScript } from '../domain/race-script';
import { REPLAY_FROM, replayTelop } from './replay';

const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));

describe('replayTelop', () => {
  const plain = buildRaceScript(order(5), createRand(3));
  it('録画はフィーバーの少し前から始める', () => {
    expect(REPLAY_FROM).toBeLessThan(TIMELINE.finalCornerStart);
    expect(TIMELINE.duration - REPLAY_FROM).toBeCloseTo(10, 9);
  });
  it('1 着がゴールするまでは何も出さない', () => {
    expect(replayTelop(plain, 22.9)).toEqual({ winner: null, photo: null, podium: null });
  });
  it('1 着がゴールしたら名前を出す', () => {
    expect(replayTelop(plain, TIMELINE.finishStart).winner).toBe('人0');
    expect(replayTelop(plain, 25).winner).toBe('人0');
  });
  it('最後の 1.5 秒は上位 3 人を出す', () => {
    expect(replayTelop(plain, 25.4).podium).toBeNull();
    expect(replayTelop(plain, 25.5).podium).toEqual(['人0', '人1', '人2']);
    expect(replayTelop(plain, TIMELINE.duration).podium).toEqual(['人0', '人1', '人2']);
  });
  it('2 人なら上位は 2 人だけ', () => {
    const two = buildRaceScript(order(2), createRand(3));
    expect(replayTelop(two, 26).podium).toEqual(['人0', '人1']);
  });
  it('写真判定の回は、判定が出るまで 1 着の名前を伏せ、出たら着差と一緒に出す', () => {
    const photo = buildRaceScript(order(5), createRand(3), 0.004);
    const second = photo.racers[1]!.finishTime;
    expect(replayTelop(photo, 22.9)).toEqual({ winner: null, photo: { gap: null }, podium: null });
    expect(replayTelop(photo, TIMELINE.finishStart).winner).toBeNull();
    expect(replayTelop(photo, second)).toEqual({
      winner: '人0',
      photo: { gap: 0.004 },
      podium: null,
    });
  });
});
