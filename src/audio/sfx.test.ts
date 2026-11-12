import { describe, expect, it } from 'vitest';
import { createSfx, type SfxKind } from './sfx';

/** 生成されたノード数と stop 呼び出しを数える偽 AudioContext。 */
function fakeAudio() {
  const stats = { contexts: 0, nodes: 0, stops: 0, resumes: 0 };
  /** つないだ順の記録（[元, 先]）。 */
  const links: [unknown, unknown][] = [];
  const destination = {};
  /** 音源の開始時刻（予約した順）。 */
  const starts: number[] = [];
  /** 作られた順のノード。最初の 1 つが全体音量。 */
  const created: { gain: { value: number } }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = (kind = 'node') => {
    stats.nodes++;
    const made = {
      kind,
      type: 'sine',
      loop: false,
      buffer: null,
      frequency: param(),
      detune: param(),
      gain: param(),
      Q: param(),
      playbackRate: param(),
      connect: (to: unknown) => void links.push([made, to]),
      threshold: param(),
      ratio: param(),
      delayTime: param(),
      disconnect: () => undefined,
      start: (at?: number) => void starts.push(at ?? 0),
      stop: () => void stats.stops++,
    };
    created.push(made);
    return made;
  };
  const createContext = (modern = true) => {
    stats.contexts++;
    return {
      currentTime: 0,
      sampleRate: 8000,
      state: 'running',
      destination,
      ...(modern
        ? {
            createDynamicsCompressor: () => node('compressor'),
            createDelay: () => node('delay'),
          }
        : {}),
      resume: () => {
        stats.resumes++;
        return Promise.resolve();
      },
      createOscillator: () => node('osc'),
      createGain: () => node('gain'),
      createBufferSource: () => node('source'),
      createBiquadFilter: () => node('filter'),
      createBuffer: (_channels: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
    } as unknown as AudioContext;
  };
  /** from から先へたどって to に着けるか。 */
  const reaches = (from: unknown, to: unknown): boolean => {
    const seen = new Set<unknown>();
    const queue = [from];
    while (queue.length > 0) {
      const at = queue.pop();
      if (at === to) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      for (const [a, b] of links) if (a === at) queue.push(b);
    }
    return false;
  };
  return { stats, createContext, created, links, destination, reaches, starts };
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
  'overtake',
  'combo',
  'box',
  'rare',
  'fever',
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
  it('音割れ防止のコンプレッサーと、響きを足すエコーを通して鳴らす', () => {
    const { createContext, created, links, destination, reaches } = fakeAudio();
    const sfx = createSfx(() => createContext(), false);
    sfx.unlock();
    const kinds = (created as unknown as { kind: string }[]).map((n) => n.kind);
    expect(kinds).toContain('compressor');
    expect(kinds).toContain('delay');
    const before = links.length;
    sfx.play('go');
    // 鳴らした音は、全体音量（最初のノード）を通って出口に着く
    const master = created[0]!;
    const sources = links.slice(before).map(([from]) => from);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(reaches(source, master)).toBe(true);
    expect(reaches(master, destination)).toBe(true);
    // 出口へは全体音量からしかつながない（ミュートで響きの残りも消える）
    expect(links.filter(([, to]) => to === destination).map(([from]) => from)).toEqual([master]);
  });
  it('コンプレッサーやディレイが無い環境でも鳴らせる', () => {
    const { stats, createContext } = fakeAudio();
    const sfx = createSfx(() => createContext(false), false);
    sfx.unlock();
    const before = stats.nodes;
    for (const kind of KINDS) sfx.play(kind);
    expect(stats.nodes).toBeGreaterThan(before);
  });
  it('速い BGM は、同じ音数を短い時間に詰めて予約する', () => {
    const span = (fast: boolean) => {
      const { createContext, starts } = fakeAudio();
      const sfx = createSfx(() => createContext(), false);
      sfx.unlock();
      const before = starts.length;
      sfx.startBgm(fast);
      const times = starts.slice(before);
      return { count: times.length, last: Math.max(...times) };
    };
    const normal = span(false);
    const fast = span(true);
    expect(fast.count).toBe(normal.count);
    expect(fast.last).toBeLessThan(normal.last * 0.8);
  });
  it('コンボ音は回数が増えるほど高くなる', () => {
    const pitch = (level: number) => {
      const { createContext, created } = fakeAudio();
      const seen: number[] = [];
      const context = createContext();
      const makeOsc = context.createOscillator.bind(context);
      context.createOscillator = () => {
        const osc = makeOsc();
        osc.frequency.setValueAtTime = ((value: number) => {
          seen.push(value);
          return osc.frequency;
        }) as typeof osc.frequency.setValueAtTime;
        return osc;
      };
      const sfx = createSfx(() => context, false);
      sfx.unlock();
      sfx.play('combo', level);
      void created;
      return Math.max(...seen);
    };
    expect(pitch(6)).toBeGreaterThan(pitch(2));
  });
});
