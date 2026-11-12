import { describe, expect, it } from 'vitest';
import { createSfx, type SfxKind } from './sfx';

/** 生成されたノード数と stop 呼び出しを数える偽 AudioContext。 */
function fakeAudio() {
  const stats = { contexts: 0, nodes: 0, stops: 0, resumes: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => {
    stats.nodes++;
    return {
      type: 'sine',
      loop: false,
      buffer: null,
      frequency: param(),
      detune: param(),
      gain: param(),
      Q: param(),
      playbackRate: param(),
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => void stats.stops++,
    };
  };
  const createContext = () => {
    stats.contexts++;
    return {
      currentTime: 0,
      sampleRate: 8000,
      state: 'running',
      destination: {},
      resume: () => {
        stats.resumes++;
        return Promise.resolve();
      },
      createOscillator: node,
      createGain: node,
      createBufferSource: node,
      createBiquadFilter: node,
      createBuffer: (_channels: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
    } as unknown as AudioContext;
  };
  return { stats, createContext };
}

const KINDS: SfxKind[] = [
  'count',
  'go',
  'boost',
  'spin',
  'stall',
  'attack',
  'goal',
  'firework',
  'fanfare',
];

describe('createSfx', () => {
  it('unlock 前の play は AudioContext を作らない', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.play('go');
    sfx.startBgm();
    expect(stats.contexts).toBe(0);
  });
  it('unlock を何度呼んでも AudioContext は 1 つ', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    sfx.unlock();
    sfx.unlock();
    expect(stats.contexts).toBe(1);
  });
  it('ミュート中は play も startBgm も音源ノードを作らない', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, true);
    sfx.unlock();
    const before = stats.nodes;
    sfx.play('go');
    sfx.startBgm();
    expect(stats.nodes).toBe(before);
  });
  it.each(KINDS)('ミュートでなければ play(%s) でノードを作る', (kind) => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    const before = stats.nodes;
    sfx.play(kind);
    expect(stats.nodes).toBeGreaterThan(before);
  });
  it('BGM 再生中に setMuted(true) で BGM のノードが止まる', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    sfx.startBgm();
    // 各音は終了時刻を予約済み。ミュートで改めて全部止める
    const scheduled = stats.stops;
    sfx.setMuted(true);
    expect(stats.stops).toBeGreaterThan(scheduled);
  });
  it('stopBgm で BGM のノードが止まり、二度目は何もしない', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    sfx.startBgm();
    const scheduled = stats.stops;
    sfx.stopBgm();
    const stops = stats.stops;
    expect(stops).toBeGreaterThan(scheduled);
    sfx.stopBgm();
    expect(stats.stops).toBe(stops);
  });
  it('startBgm を続けて呼んでも BGM は 1 系統', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    sfx.startBgm();
    const nodes = stats.nodes;
    sfx.startBgm();
    expect(stats.nodes).toBe(nodes);
  });
  it('ミュートを解除すると再び鳴らせる', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(createContext, true);
    sfx.unlock();
    sfx.setMuted(false);
    const before = stats.nodes;
    sfx.play('goal');
    expect(stats.nodes).toBeGreaterThan(before);
  });
  it('AudioContext を作れない環境でも例外を出さない', () => {
    const sfx = createSfx(() => {
      throw new Error('AudioContext なし');
    }, false);
    expect(() => {
      sfx.unlock();
      sfx.play('go');
      sfx.startBgm();
      sfx.stopBgm();
      sfx.setMuted(true);
    }).not.toThrow();
  });
});
