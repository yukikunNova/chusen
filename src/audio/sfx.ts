/** 効果音と BGM。すべて Web Audio の発振器とノイズで合成する（音声ファイルなし）。 */

export type SfxKind =
  | 'count'
  | 'go'
  | 'boost'
  | 'spin'
  | 'stall'
  | 'attack'
  | 'goal'
  | 'firework'
  | 'fanfare'
  | 'overtake'
  | 'combo'
  | 'box'
  | 'rare'
  | 'fever';
export type Sfx = {
  /** ユーザー操作のハンドラ内で呼ぶ（AudioContext の生成・resume）。 */
  unlock(): void;
  /** level は音の高さの段階（コンボの回数など）。使わない音では無視する。 */
  play(kind: SfxKind, level?: number): void;
  /** fast: フィーバータイム用の速いテンポ。 */
  startBgm(fast?: boolean): void;
  stopBgm(): void;
  /** 予約済みのものを含め、鳴っている単発音をすべて切る（スキップ時）。BGM は止めない。 */
  cutEffects(): void;
  setMuted(muted: boolean): void;
};

/** 全体音量。派手に鳴らすぶん、音割れはコンプレッサーで抑える。 */
const MASTER_VOLUME = 0.3;
/** エコー（響き）の遅れ・繰り返しの強さ・混ぜる量。 */
const ECHO_TIME = 0.17;
const ECHO_FEEDBACK = 0.32;
const ECHO_MIX = 0.28;
const BGM_VOLUME = 0.3;
/** BGM は 1 レース分をまとめて予約する（8 分音符の長さと個数）。 */
const BGM_STEP = 0.2;
const BGM_FAST_STEP = 0.13;
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
  /** 音源のつなぎ先。ここからコンプレッサーとエコーを経て master に入る。 */
  let input: AudioNode | null = null;
  /** 単発音の束ね先。切るときは丸ごと外して作り直す。 */
  let effects: GainNode | null = null;
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

  function noise(
    c: AudioContext,
    out: AudioNode,
    dur: number,
    cutoff: number,
    vol: number,
    at = 0,
    type: BiquadFilterType = 'lowpass',
  ) {
    if (!noiseBuffer) {
      const length = Math.floor(c.sampleRate);
      noiseBuffer = c.createBuffer(1, length, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const start = c.currentTime + at;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
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

  /** 少しずらした 2 本を重ねて太くした音。 */
  function fat(c: AudioContext, out: AudioNode, t: Tone) {
    tone(c, out, {
      ...t,
      freq: t.freq * 0.994,
      ...(t.to !== undefined ? { to: t.to * 0.994 } : {}),
    });
    tone(c, out, {
      ...t,
      freq: t.freq * 1.006,
      ...(t.to !== undefined ? { to: t.to * 1.006 } : {}),
    });
  }

  /** 主旋律に 3 度上のハモりと 1 オクターブ下の土台を重ねる。 */
  function melody(c: AudioContext, out: AudioNode, notes: readonly [number, number, number][]) {
    for (const [freq, at, dur] of notes) {
      fat(c, out, { freq, at, dur, type: 'square', vol: 0.22 });
      tone(c, out, { freq: freq * 2, at, dur, type: 'triangle', vol: 0.2 });
      tone(c, out, { freq: freq * 1.26, at, dur, type: 'triangle', vol: 0.14 });
      tone(c, out, { freq: freq / 2, at, dur, type: 'sawtooth', vol: 0.16 });
    }
  }

  /** きらきらと駆け上がる短い音の列。 */
  function sparkle(c: AudioContext, out: AudioNode, base: number, count: number, at = 0) {
    for (let n = 0; n < count; n++) {
      tone(c, out, {
        freq: base * 2 ** (n / 4),
        at: at + n * 0.045,
        dur: 0.12,
        type: 'triangle',
        vol: 0.22,
      });
    }
  }

  /** 腹に響く低い一発。 */
  function boom(c: AudioContext, out: AudioNode, at = 0, vol = 0.9) {
    tone(c, out, { freq: 170, to: 34, at, dur: 0.7, type: 'sine', vol });
    tone(c, out, { freq: 90, to: 28, at, dur: 0.9, type: 'triangle', vol: vol * 0.5 });
  }

  const SOUNDS: Record<SfxKind, (c: AudioContext, out: AudioNode, level: number) => void> = {
    count: (c, out) => {
      fat(c, out, { freq: 660, dur: 0.18, type: 'square', vol: 0.3 });
      tone(c, out, { freq: 1320, dur: 0.12, type: 'triangle', vol: 0.25 });
      tone(c, out, { freq: 110, to: 55, dur: 0.22, type: 'sine', vol: 0.6 });
      noise(c, out, 0.06, 6000, 0.3, 0, 'highpass');
    },
    go: (c, out) => {
      // 和音の一斉発射 → 駆け上がり → 低音の一発
      for (const freq of [523.25, 659.25, 783.99, 1046.5]) {
        fat(c, out, { freq, dur: 0.7, type: 'sawtooth', vol: 0.16 });
      }
      tone(c, out, { freq: 1320, dur: 0.6, type: 'square', vol: 0.25 });
      sparkle(c, out, 1046.5, 8, 0.05);
      boom(c, out, 0, 0.8);
      noise(c, out, 0.9, 5000, 0.45);
    },
    boost: (c, out) => {
      fat(c, out, { freq: 160, to: 1400, dur: 0.6, type: 'sawtooth', vol: 0.26 });
      tone(c, out, { freq: 320, to: 2800, dur: 0.6, type: 'square', vol: 0.1 });
      noise(c, out, 0.7, 3200, 0.35);
      sparkle(c, out, 1318.5, 6, 0.3);
      boom(c, out, 0, 0.5);
    },
    spin: (c, out) => {
      for (let n = 0; n < 5; n++) {
        tone(c, out, {
          freq: 1100 - n * 90,
          to: 360 - n * 30,
          at: n * 0.11,
          dur: 0.13,
          type: 'triangle',
          vol: 0.4,
        });
      }
      tone(c, out, { freq: 900, to: 150, dur: 0.6, type: 'sine', vol: 0.3 });
      noise(c, out, 0.5, 1800, 0.2);
    },
    stall: (c, out) => {
      // がっかりの 3 段下がり
      const steps = [311.13, 293.66, 277.18] as const;
      steps.forEach((freq, n) => {
        fat(c, out, { freq, at: n * 0.2, dur: 0.2, type: 'sawtooth', vol: 0.24 });
      });
      fat(c, out, { freq: 261.63, to: 110, at: 0.6, dur: 0.7, type: 'sawtooth', vol: 0.26 });
      tone(c, out, { freq: 130, to: 50, at: 0.6, dur: 0.7, type: 'sine', vol: 0.4 });
    },
    attack: (c, out) => {
      // 着弾の破裂 → 低音 → ぱらぱらと残る破片
      noise(c, out, 0.08, 7000, 0.8, 0, 'highpass');
      noise(c, out, 1.1, 4200, 0.8);
      boom(c, out, 0, 1);
      fat(c, out, { freq: 880, to: 60, dur: 0.35, type: 'sawtooth', vol: 0.22 });
      for (let n = 0; n < 6; n++) {
        noise(c, out, 0.07, 5000, 0.3, 0.25 + n * 0.09, 'highpass');
      }
    },
    goal: (c, out) => {
      melody(c, out, [
        [523.25, 0, 0.12],
        [659.25, 0.1, 0.12],
        [783.99, 0.2, 0.12],
        [1046.5, 0.3, 0.7],
      ]);
      sparkle(c, out, 1046.5, 10, 0.3);
      boom(c, out, 0.3, 0.8);
      noise(c, out, 1.2, 7000, 0.3, 0.3, 'highpass');
    },
    firework: (c, out) => {
      boom(c, out, 0, 0.7);
      noise(c, out, 0.7, 2400, 0.4);
      // 開いたあとのぱちぱち
      for (let n = 0; n < 7; n++) {
        noise(c, out, 0.05, 6000, 0.22, 0.18 + n * 0.07 + Math.random() * 0.03, 'highpass');
      }
    },
    fanfare: (c, out) => {
      melody(c, out, [
        [392, 0.55, 0.16],
        [523.25, 0.72, 0.16],
        [659.25, 0.89, 0.16],
        [783.99, 1.06, 0.34],
        [659.25, 1.42, 0.16],
        [783.99, 1.6, 1.1],
      ]);
      // 締めの和音とシンバル
      for (const freq of [523.25, 659.25, 1046.5]) {
        fat(c, out, { freq, at: 1.6, dur: 1.1, type: 'sawtooth', vol: 0.12 });
      }
      sparkle(c, out, 1567.98, 10, 1.6);
      boom(c, out, 1.6, 0.8);
      noise(c, out, 1.4, 8000, 0.3, 1.6, 'highpass');
    },
    overtake: (c, out) => {
      // しゅっと抜き去る音 → きらきら
      fat(c, out, { freq: 420, to: 1680, dur: 0.22, type: 'sawtooth', vol: 0.24 });
      noise(c, out, 0.25, 6000, 0.3, 0, 'highpass');
      sparkle(c, out, 1318.5, 5, 0.12);
    },
    combo: (c, out, level) => {
      // 回数が増えるほど半音ずつ高くなる
      const freq = 660 * 2 ** (Math.min(level, 14) / 12);
      tone(c, out, { freq, dur: 0.1, type: 'square', vol: 0.28 });
      tone(c, out, { freq: freq * 1.5, at: 0.07, dur: 0.16, type: 'square', vol: 0.28 });
      tone(c, out, { freq: freq * 2, at: 0.07, dur: 0.16, type: 'triangle', vol: 0.2 });
    },
    box: (c, out) => {
      // ルーレットが回る音
      for (let n = 0; n < 9; n++) {
        tone(c, out, {
          freq: n % 2 === 0 ? 1046.5 : 1318.5,
          at: n * 0.12,
          dur: 0.06,
          type: 'square',
          vol: 0.2,
        });
      }
      noise(c, out, 0.12, 5000, 0.3, 0, 'highpass');
    },
    rare: (c, out) => {
      // 当たりのジングル
      melody(c, out, [
        [783.99, 0, 0.1],
        [1046.5, 0.09, 0.1],
        [1318.5, 0.18, 0.1],
        [1567.98, 0.27, 0.5],
      ]);
      sparkle(c, out, 2093, 12, 0.27);
      boom(c, out, 0.27, 0.6);
    },
    fever: (c, out) => {
      // せり上がり → 一発
      fat(c, out, { freq: 110, to: 1760, dur: 0.9, type: 'sawtooth', vol: 0.22 });
      noise(c, out, 0.9, 8000, 0.3, 0, 'highpass');
      for (const freq of [523.25, 659.25, 783.99, 1046.5]) {
        fat(c, out, { freq, at: 0.9, dur: 0.8, type: 'sawtooth', vol: 0.14 });
      }
      boom(c, out, 0.9, 1);
      sparkle(c, out, 1046.5, 12, 0.9);
    },
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
  function output(): { c: AudioContext; out: AudioNode } | null {
    return ctx && input && !muted ? { c: ctx, out: input } : null;
  }

  /** 単発音の出力先。 */
  function effectsOutput(): { c: AudioContext; out: AudioNode } | null {
    const o = output();
    if (!o) return null;
    if (!effects) {
      effects = o.c.createGain();
      effects.gain.value = 1;
      effects.connect(o.out);
    }
    return { c: o.c, out: effects };
  }

  /**
   * 音源 → コンプレッサー（音割れ防止）→ master → 出口、の経路を作り、音源のつなぎ先を返す。
   * エコーも master の手前に入れるので、ミュートすれば響きの残りも消える。
   */
  function buildChain(c: AudioContext, out: GainNode): AudioNode {
    if (!c.createDynamicsCompressor || !c.createDelay) return out;
    const bus = c.createGain();
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    const delay = c.createDelay();
    delay.delayTime.value = ECHO_TIME;
    const feedback = c.createGain();
    feedback.gain.value = ECHO_FEEDBACK;
    const wet = c.createGain();
    wet.gain.value = ECHO_MIX;
    bus.connect(compressor);
    bus.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(compressor);
    compressor.connect(out);
    return bus;
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
          input = buildChain(ctx, master);
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      } catch {
        // 音が使えない環境では無音で動かす
        failed = true;
        ctx = null;
        master = null;
        input = null;
        effects = null;
      }
    },
    play(kind, level = 0) {
      const o = effectsOutput();
      if (!o) return;
      try {
        SOUNDS[kind](o.c, o.out, level);
      } catch {
        // 音の失敗で演出を止めない
      }
    },
    startBgm(fast = false) {
      const o = output();
      if (!o || bgm) return;
      const stepLength = fast ? BGM_FAST_STEP : BGM_STEP;
      try {
        const gain = o.c.createGain();
        gain.gain.value = BGM_VOLUME;
        gain.connect(o.out);
        const sources: OscillatorNode[] = [];
        bgm = { gain, sources };
        for (let step = 0; step < BGM_STEPS; step++) {
          const root = BGM_ROOTS[Math.floor(step / 8) % BGM_ROOTS.length]!;
          const at = step * stepLength;
          sources.push(
            tone(o.c, gain, { freq: root, at, dur: stepLength * 0.9, type: 'square', vol: 0.3 }),
            tone(o.c, gain, {
              freq: root * 2 * BGM_ARP[step % BGM_ARP.length]!,
              at,
              dur: stepLength * 0.8,
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
    cutEffects() {
      effects?.disconnect();
      effects = null;
    },
    setMuted(next) {
      muted = next;
      // 鳴り始めた単発音もすぐ消えるよう、出口の音量で切る
      if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
      if (muted) stopBgm();
    },
  };
}
