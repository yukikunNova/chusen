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
