import type { RaceEventKind, RaceScript } from '../domain/race-script';
import type { RaceSummary } from '../domain/summary';
import { buildHighlights } from './hype';

/**
 * 称号。台本から開始時に決まる飾りで、順位には関係しない。three に依存しない。
 * 1 人 1 個まで、同じ称号は 1 人だけ。
 */

/** イベントの種類ごとの称号（そのイベントが起きた機体に付く）。上にあるものから先に決める。 */
const EVENT_TITLES: readonly (readonly [RaceEventKind, string])[] = [
  ['spin', '金だらい被害者'],
  ['stall', 'ガス欠の人'],
  ['weave', 'ねむけに負けた人'],
  ['finalComeback', '土壇場の追い上げ'],
  ['rocketStart', 'ロケットスタート'],
  ['slowStart', '出遅れの人'],
  ['attack', '被弾王'],
];

/** 最終順位順の称号。付かない人は null。 */
export function buildTitles(script: RaceScript): (string | null)[] {
  const n = script.racers.length;
  const titles: (string | null)[] = Array.from({ length: n }, () => null);
  /** 候補を順に見て、まだ称号のない最初の機体に付ける。 */
  const give = (title: string, candidates: readonly (number | undefined)[]) => {
    const racer = candidates.find((i) => i !== undefined && i < n && titles[i] === null);
    if (racer !== undefined) titles[racer] = title;
  };

  if (script.photo) give('鼻差の勝者', [0]);
  give('ごぼう抜き王', [script.events.find((e) => e.kind === 'surge')?.racer]);

  const points = Array.from({ length: n }, () => 0);
  for (const h of buildHighlights(script)) points[h.racer] = (points[h.racer] ?? 0) + h.points;
  const best = Math.max(0, ...points);
  if (best > 0) give('ドパ値MVP', [points.indexOf(best)]);

  give(
    'スナイパー',
    script.events.filter((e) => e.kind === 'attack').map((e) => e.from),
  );
  for (const [kind, title] of EVENT_TITLES) {
    give(
      title,
      script.events.filter((e) => e.kind === kind).map((e) => e.racer),
    );
  }
  if (script.photo) give('鼻差で泣いた人', [1]);
  // 最下位は発表順の最後 = 大トリ
  if (n > 1) give('大トリ', [n - 1]);
  return titles;
}

/** レースのまとめ（結果画面・結果カード用）。 */
export function buildSummary(script: RaceScript, courseName: string | null): RaceSummary {
  return {
    courseName,
    score: buildHighlights(script).at(-1)?.total ?? 0,
    titles: buildTitles(script),
    photoGap: script.photo?.gap ?? null,
  };
}
