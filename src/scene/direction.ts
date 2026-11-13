import type { Cue } from '../domain/commentary';
import type { RaceEvent, RaceEventKind, RaceScript } from '../domain/race-script';

/** 演出の時間割（どの実況を出すか、どのカメラか、機体にどの効果を掛けるか）。three に依存しない。 */

const CUE_DURATION = 2.4;
const FX_DURATION = 1.5;

/** 時刻 t に表示する実況。開始から 2.4 秒、または次のキューが始まるまで。 */
export function activeCue(cues: readonly Cue[], t: number): string | null {
  let current: Cue | null = null;
  for (const cue of cues) {
    if (cue.t > t) break;
    current = cue;
  }
  return current && t - current.t < CUE_DURATION ? current.text : null;
}

export type Shot =
  'lineup' | 'chase' | 'overhead' | 'side' | 'finalCorner' | 'goal' | 'pullback' | 'photo';

/** 写真判定のスロー区間（レース内の時刻）。1 着ゴールの前後だけ、1/5 の速さで進める。 */
export const PHOTO_SLOW = { from: 22.8, to: 23.2, rate: 0.2 } as const;

const SHOTS: readonly { from: number; shot: Shot }[] = [
  { from: 26, shot: 'pullback' },
  { from: 23, shot: 'goal' },
  { from: 19, shot: 'finalCorner' },
  { from: 16, shot: 'chase' },
  { from: 12, shot: 'side' },
  { from: 8, shot: 'overhead' },
  { from: 3, shot: 'chase' },
];

/** 時刻 t のカメラカット。photo: 写真判定の回（スロー区間はゴール線の真横から撮る）。 */
export function shotAt(t: number, photo = false): Shot {
  if (photo && t >= PHOTO_SLOW.from && t < PHOTO_SLOW.to) return 'photo';
  return SHOTS.find((s) => t >= s.from)?.shot ?? 'lineup';
}

type Channel = 'spin' | 'boost' | 'sway';
const CHANNEL: Record<RaceEventKind, Channel> = {
  spin: 'spin',
  attack: 'spin',
  boost: 'boost',
  rocketStart: 'boost',
  overtake: 'boost',
  finalComeback: 'boost',
  surge: 'boost',
  weave: 'sway',
  stall: 'sway',
  slowStart: 'sway',
};

/** 機体に掛ける効果の強さ（各 0〜1）。イベント時刻から 1.5 秒かけて 1→0 に減衰する。 */
export function eventFx(
  script: RaceScript,
  racer: number,
  t: number,
): { spin: number; boost: number; sway: number } {
  const fx = { spin: 0, boost: 0, sway: 0 };
  for (const event of script.events) {
    if (event.racer !== racer) continue;
    const age = t - event.t;
    if (age < 0 || age >= FX_DURATION) continue;
    const channel = CHANNEL[event.kind];
    fx[channel] = Math.max(fx[channel], 1 - age / FX_DURATION);
  }
  return fx;
}

/** 攻撃アイテムが飛んでいる時間（秒）。着弾はイベント時刻。 */
export const ATTACK_FLIGHT = 0.9;

/** 攻撃アイテムの飛行の進み具合（0〜1）。飛んでいなければ null。 */
export function attackFlight(event: RaceEvent, t: number): number | null {
  if (event.kind !== 'attack') return null;
  const k = (t - (event.t - ATTACK_FLIGHT)) / ATTACK_FLIGHT;
  return k >= 0 && k < 1 ? k : null;
}

/** これ以上遅れてまたいだ合図は捨てる（秒）。 */
const HOOK_GRACE = 0.5;

/**
 * 時刻 time の合図（効果音など）を今のフレームで出すか。前フレーム prevT から今 t までにまたいだときだけ true。
 * タブを戻した直後などに大きく時間が飛んだ場合、溜まった合図が一度に出ないよう、遅れすぎた分は出さない。
 */
export function hookDue(prevT: number, t: number, time: number): boolean {
  return prevT < time && t >= time && t - time < HOOK_GRACE;
}

/** 暫定順位を出し始める時刻（秒）。「GO!」の表示が消える頃。 */
const RANKING_FROM = 3.8;

/**
 * 暫定順位を画面に出してよいか。
 * スタート前は全員の進行度が 0 で同着になり、同着は添字順（＝確定済みの最終順位）に並ぶため、出すと結果が先に見えてしまう。
 */
export function rankingVisibleAt(t: number): boolean {
  return t >= RANKING_FROM;
}
