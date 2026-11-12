import { describe, expect, it } from 'vitest';
import { createSfx, type SfxKind } from './sfx';

/** 生成されたノード数と stop 呼び出しを数える偽 AudioContext。 */
function fakeAudio() {
  const stats = { contexts: 0, nodes: 0, stops: 0, resumes: 0 };
  /** 作られた順のノード。最初の 1 つが全体音量。 */
  const created: { gain: { value: number } }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => {
    stats.nodes++;
    const made = {
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
    created.push(made);
    return made;
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
  return { stats, createContext, created };
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
  it('ミュートで全体音量を 0 にし、鳴り始めた音もすぐ消す。解除で戻す', () => {
    const { createContext, created } = fakeAudio();
    const sfx = createSfx(createContext, false);
    sfx.unlock();
    const master = created[0]!;
    expect(master.gain.value).toBeGreaterThan(0);
    sfx.play('fanfare');
    sfx.setMuted(true);
    expect(master.gain.value).toBe(0);
    sfx.setMuted(false);
    expect(master.gain.value).toBeGreaterThan(0);
  });
  it('ミュートで始めた場合も全体音量は 0', () => {
    const { createContext, created } = fakeAudio();
    const sfx = createSfx(createContext, true);
    sfx.unlock();
    expect(created[0]!.gain.value).toBe(0);
  });
});
