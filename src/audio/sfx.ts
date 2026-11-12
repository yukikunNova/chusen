/** 効果音と BGM。すべて Web Audio の発振器とノイズで合成する（音声ファイルなし）。 */

export type SfxKind =
  'count' | 'go' | 'boost' | 'spin' | 'stall' | 'attack' | 'goal' | 'firework' | 'fanfare';
export type Sfx = {
  /** ユーザー操作のハンドラ内で呼ぶ（AudioContext の生成・resume）。 */
  unlock(): void;
  play(kind: SfxKind): void;
  startBgm(): void;
  stopBgm(): void;
  setMuted(muted: boolean): void;
};

/** 会議で不快にならない程度の全体音量。 */
const MASTER_VOLUME = 0.22;
const BGM_VOLUME = 0.3;
/** BGM は 1 レース分をまとめて予約する（8 分音符の長さと個数）。 */
const BGM_STEP = 0.2;
const BGM_STEPS = 120;
/** コード進行（各 8 ステップ）: Am → F → C → G。値は根音の周波数。 */
const BGM_ROOTS = [110, 87.31, 130.81, 98] as const;
const BGM_ARP = [1, 1.5, 2, 3, 2, 1.5, 2, 3] as const;

type Tone = {
  freq: number;
  /** 終わりの周波数（省略時は一定）。 */
  to?: number;
  at?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
};

export function createSfx(createContext: () => AudioContext, muted: boolean): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let failed = false;
  let noiseBuffer: AudioBuffer | null = null;
  let bgm: { gain: GainNode; sources: OscillatorNode[] } | null = null;

  function tone(c: AudioContext, out: AudioNode, t: Tone): OscillatorNode {
    const start = c.currentTime + (t.at ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    // 立ち上がりと余韻を付けてプチノイズを防ぐ
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(t.vol ?? 0.5, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
    return osc;
  }

  function noise(c: AudioContext, out: AudioNode, dur: number, cutoff: number, vol: number) {
    if (!noiseBuffer) {
      const length = Math.floor(c.sampleRate);
      noiseBuffer = c.createBuffer(1, length, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const start = c.currentTime;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.15), start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(start);
    source.stop(start + dur + 0.02);
  }

  function melody(c: AudioContext, out: AudioNode, notes: readonly [number, number, number][]) {
    for (const [freq, at, dur] of notes) {
      tone(c, out, { freq, at, dur, type: 'square', vol: 0.3 });
      tone(c, out, { freq: freq * 2, at, dur, type: 'triangle', vol: 0.2 });
    }
  }

  const SOUNDS: Record<SfxKind, (c: AudioContext, out: AudioNode) => void> = {
    count: (c, out) => tone(c, out, { freq: 660, dur: 0.14, type: 'square', vol: 0.35 }),
    go: (c, out) => {
      tone(c, out, { freq: 1320, dur: 0.5, type: 'square', vol: 0.35 });
      tone(c, out, { freq: 660, dur: 0.5, type: 'triangle', vol: 0.3 });
    },
    boost: (c, out) => {
      tone(c, out, { freq: 180, to: 950, dur: 0.55, type: 'sawtooth', vol: 0.3 });
      noise(c, out, 0.5, 2400, 0.25);
    },
    spin: (c, out) => {
      for (let n = 0; n < 3; n++) {
        tone(c, out, { freq: 950, to: 380, at: n * 0.16, dur: 0.16, type: 'triangle', vol: 0.4 });
      }
    },
    stall: (c, out) => tone(c, out, { freq: 330, to: 70, dur: 0.7, type: 'sawtooth', vol: 0.3 }),
    attack: (c, out) => {
      noise(c, out, 0.7, 3200, 0.7);
      tone(c, out, { freq: 150, to: 38, dur: 0.6, type: 'sine', vol: 0.8 });
    },
    goal: (c, out) =>
      melody(c, out, [
        [523.25, 0, 0.12],
        [659.25, 0.1, 0.12],
        [783.99, 0.2, 0.12],
        [1046.5, 0.3, 0.5],
      ]),
    firework: (c, out) => {
      noise(c, out, 0.55, 1800, 0.3);
      tone(c, out, { freq: 110, to: 45, dur: 0.4, type: 'sine', vol: 0.35 });
    },
    fanfare: (c, out) =>
      melody(c, out, [
        [392, 0.55, 0.16],
        [523.25, 0.72, 0.16],
        [659.25, 0.89, 0.16],
        [783.99, 1.06, 0.34],
        [659.25, 1.42, 0.16],
        [783.99, 1.6, 0.9],
      ]),
  };

  function stopBgm() {
    if (!bgm) return;
    const { gain, sources } = bgm;
    bgm = null;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // すでに止まっている音源は無視する
      }
    }
    gain.disconnect();
  }

  /** 音を鳴らせる状態なら AudioContext と出力先を返す。 */
  function output(): { c: AudioContext; out: GainNode } | null {
    return ctx && master && !muted ? { c: ctx, out: master } : null;
  }

  return {
    unlock() {
      if (failed) return;
      try {
        if (!ctx) {
          ctx = createContext();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : MASTER_VOLUME;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      } catch {
        // 音が使えない環境では無音で動かす
        failed = true;
        ctx = null;
        master = null;
      }
    },
    play(kind) {
      const o = output();
      if (!o) return;
      try {
        SOUNDS[kind](o.c, o.out);
      } catch {
        // 音の失敗で演出を止めない
      }
    },
    startBgm() {
      const o = output();
      if (!o || bgm) return;
      try {
        const gain = o.c.createGain();
        gain.gain.value = BGM_VOLUME;
        gain.connect(o.out);
        const sources: OscillatorNode[] = [];
        bgm = { gain, sources };
        for (let step = 0; step < BGM_STEPS; step++) {
          const root = BGM_ROOTS[Math.floor(step / 8) % BGM_ROOTS.length]!;
          const at = step * BGM_STEP;
          sources.push(
            tone(o.c, gain, { freq: root, at, dur: BGM_STEP * 0.9, type: 'square', vol: 0.3 }),
            tone(o.c, gain, {
              freq: root * 2 * BGM_ARP[step % BGM_ARP.length]!,
              at,
              dur: BGM_STEP * 0.8,
              type: 'triangle',
              vol: 0.28,
            }),
          );
        }
      } catch {
        stopBgm();
      }
    },
    stopBgm,
    setMuted(next) {
      muted = next;
      // 鳴り始めた単発音もすぐ消えるよう、出口の音量で切る
      if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
      if (muted) stopBgm();
    },
  };
}
