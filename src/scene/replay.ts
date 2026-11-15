import { TIMELINE, type RaceScript } from '../domain/race-script';
import { photoState } from './hype';

/**
 * リプレイ動画（ゴール前の約 10 秒）の時間割と、動画に焼き込む文字の中身。
 * 画面の実況や順位表は HTML なので動画に映らない。要点だけを動画用に決める。three に依存しない。
 */

/** 録画を始めるレース内の時刻。フィーバー突入の少し前。 */
export const REPLAY_FROM = TIMELINE.duration - 10;
/** 最後に上位を出しておく秒数と人数。 */
const PODIUM_LAST = 1.5;
const PODIUM_COUNT = 3;

export type ReplayTelop = {
  /** 1 着の名前。ゴール前と、写真判定の結果待ちのあいだは null。 */
  winner: string | null;
  /** 写真判定の表示。gap が null のあいだは判定中。 */
  photo: { gap: number | null } | null;
  /** 最後に出す上位の名前（着順）。 */
  podium: string[] | null;
};

export function replayTelop(script: RaceScript, t: number): ReplayTelop {
  const first = script.racers[0];
  const photo = photoState(script, t);
  const judging = photo !== null && photo.gap === null;
  return {
    winner: first && t >= first.finishTime && !judging ? first.name : null,
    photo,
    podium:
      t >= TIMELINE.duration - PODIUM_LAST
        ? script.racers.slice(0, PODIUM_COUNT).map((r) => r.name)
        : null,
  };
}
