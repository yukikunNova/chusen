import type { RaceScript } from '../domain/race-script';
import { REPLAY_FROM, replayTelop, type ReplayTelop } from '../scene/replay';
import type { ReplayVideo } from './replay-recorder';

/** 録画 1 回ぶん。frame は描画が終わるたびに呼び、その時点の画面を動画に写す。 */
export type ReplayCapture = {
  frame(telop: ReplayTelop): void;
  stop(): Promise<ReplayVideo | null>;
  cancel(): void;
};

export type ReplaySessionDeps = {
  script: RaceScript;
  /** 録画を始める。録画できない環境では null。 */
  begin(): ReplayCapture | null;
  /** 画面を描き終えた直後に呼ばれる。戻り値で解除。 */
  onAfterRender(cb: () => void): () => void;
  /** タブが隠れたときに呼ばれる。戻り値で解除。 */
  onHidden(cb: () => void): () => void;
};

export type ReplaySession = {
  /** 毎フレーム、レース内の時刻を知らせる。 */
  tick(t: number): void;
  /** レースが終わった。動画が無い回（スキップ・途中でタブを隠した・録画できない）は null。 */
  end(skipped: boolean): Promise<ReplayVideo | null>;
};

/** 開始がこれより遅れたら録らない（タブ復帰などで時刻が飛んだ回。途中からの動画は出さない）。 */
const LATE_LIMIT = 0.5;

/** レース 1 回ぶんの録画の進行。ゴール前の約 10 秒だけを録る。 */
export function createReplaySession(deps: ReplaySessionDeps): ReplaySession {
  let capture: ReplayCapture | null = null;
  /** もう録らない（遅れた・捨てた・終わった）。 */
  let closed = false;
  let now = 0;
  const unsubscribe: (() => void)[] = [];

  function release() {
    closed = true;
    for (const off of unsubscribe.splice(0)) off();
  }

  function discard() {
    capture?.cancel();
    capture = null;
    release();
  }

  function begin() {
    capture = deps.begin();
    if (!capture) {
      release();
      return;
    }
    unsubscribe.push(
      deps.onAfterRender(() => capture?.frame(replayTelop(deps.script, now))),
      // 隠れている間は描画が止まり、動画が固まるので捨てる
      deps.onHidden(discard),
    );
  }

  return {
    tick(t) {
      now = t;
      if (closed || capture || t < REPLAY_FROM) return;
      if (t - REPLAY_FROM > LATE_LIMIT) release();
      else begin();
    },
    end(skipped) {
      const active = capture;
      if (!active || skipped) {
        discard();
        return Promise.resolve(null);
      }
      capture = null;
      release();
      return active.stop().catch(() => null);
    },
  };
}
