export type RaceClock = {
  /** 開始からの経過秒。duration を超えない。 */
  elapsed(): number;
  finished(): boolean;
  skip(): void;
};

/** 実時間基準のレース時計。フレームが落ちても尺は変わらない。now はミリ秒を返す。 */
export function createRaceClock(now: () => number, duration: number): RaceClock {
  const startedAt = now();
  let skipped = false;
  const elapsed = () => (skipped ? duration : Math.min(duration, (now() - startedAt) / 1000));
  return {
    elapsed,
    finished: () => elapsed() >= duration,
    skip() {
      skipped = true;
    },
  };
}

/** スロー区間。from〜to はレース内の時刻（秒）、rate は進みの倍率（0.2 なら 1/5 の速さ）。 */
export type SlowZone = { from: number; to: number; rate: number };
export type TimeWarp = {
  /** スローで伸びた分を含む、実時間での尺。 */
  realDuration: number;
  /** 実時間の経過秒 → レース内の時刻。 */
  toRace(real: number): number;
  /** レース内の時刻 t がスロー区間か。 */
  slowAt(t: number): boolean;
};

/** 実時間とレース内の時刻の対応。スロー区間だけ時間をゆっくり進める。slow が null なら等速。 */
export function createTimeWarp(duration: number, slow: SlowZone | null): TimeWarp {
  if (!slow) return { realDuration: duration, toRace: (real) => real, slowAt: () => false };
  const slowReal = (slow.to - slow.from) / slow.rate;
  const extra = slowReal - (slow.to - slow.from);
  return {
    realDuration: duration + extra,
    toRace(real) {
      if (real <= slow.from) return real;
      if (real < slow.from + slowReal) return slow.from + (real - slow.from) * slow.rate;
      return real - extra;
    },
    slowAt: (t) => t >= slow.from && t < slow.to,
  };
}
