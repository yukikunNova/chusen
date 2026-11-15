import { ITEM_NAMES } from '../domain/commentary';
import type { RareKind } from '../domain/rare';
import {
  SURGE_DURATION,
  TIMELINE,
  rankingAt,
  type RaceEvent,
  type RaceEventKind,
  type RaceScript,
} from '../domain/race-script';
import { ATTACK_FLIGHT, PHOTO_SLOW } from './direction';

/**
 * 盛り上げ演出の時間割（追い抜きの告知・アイテム箱・コンボと点数・フィーバー）。
 * すべて台本から開始時に 1 回だけ計算する。見た目だけで、順位には関係しない。three に依存しない。
 */

/** 追い抜きを数え始める時刻。スタート直後は差がほとんどなく、抜いた実感がないので少し待つ。 */
const OVERTAKE_FROM = 6.5;
const OVERTAKE_STEP = 0.25;
/** 何秒前の順位と比べるか。 */
const OVERTAKE_WINDOW = 1;
const OVERTAKE_MIN_PASSED = 2;
/** 告知どうしの最小間隔（秒）。 */
const OVERTAKE_GAP = 1.5;

export type Overtake = { t: number; racer: number; passed: number };

/** 短い時間に 2 人以上抜いた瞬間の一覧（時刻順）。近すぎるものは、抜いた人数の多いほうを残す。 */
export function buildOvertakes(script: RaceScript): Overtake[] {
  const candidates: Overtake[] = [];
  for (let t = OVERTAKE_FROM; t <= TIMELINE.finishStart; t += OVERTAKE_STEP) {
    const before = rankingAt(script, t - OVERTAKE_WINDOW);
    const now = rankingAt(script, t);
    now.forEach((racer, rank) => {
      const passed = before.indexOf(racer) - rank;
      if (passed >= OVERTAKE_MIN_PASSED) candidates.push({ t, racer, passed });
    });
  }
  const kept: Overtake[] = [];
  // ごぼう抜きは 2 秒かけて抜くので、抜き終わりの時刻に必ず 1 件として入れる
  const surge = script.events.find((e) => e.kind === 'surge');
  if (surge) {
    const t = surge.t + SURGE_DURATION;
    const passed =
      rankingAt(script, surge.t).indexOf(surge.racer) - rankingAt(script, t).indexOf(surge.racer);
    if (passed >= OVERTAKE_MIN_PASSED) kept.push({ t, racer: surge.racer, passed });
  }
  for (const candidate of candidates.sort((a, b) => b.passed - a.passed || a.t - b.t)) {
    if (kept.every((o) => Math.abs(o.t - candidate.t) >= OVERTAKE_GAP)) kept.push(candidate);
  }
  return kept.sort((a, b) => a.t - b.t);
}

export type BoxResult = 'boost' | 'attack' | 'miss';
export type BoxRarity = 'white' | 'gold' | 'rainbow';
export type Box = {
  /** 箱を取る時刻（ルーレットが回り始める）。 */
  pickT: number;
  /** 結果が出る時刻。 */
  revealT: number;
  /** 箱を取る機体。 */
  racer: number;
  result: BoxResult;
  rarity: BoxRarity;
  /** 出たものの名前。 */
  label: string;
};

/** 箱を取ってから結果が出るまで（秒）。 */
const BOX_SPIN = 1.2;
const BOX_MAX = 3;
const BOX_FROM = 3.8;
const BOX_OUTCOME: Partial<
  Record<RaceEventKind, { result: BoxResult; rarity: BoxRarity; label: string }>
> = {
  surge: { result: 'boost', rarity: 'rainbow', label: '超ターボ' },
  boost: { result: 'boost', rarity: 'gold', label: 'ターボ' },
  overtake: { result: 'boost', rarity: 'gold', label: 'ターボ' },
  spin: { result: 'miss', rarity: 'white', label: '金だらい' },
  stall: { result: 'miss', rarity: 'white', label: 'ガス欠' },
  weave: { result: 'miss', rarity: 'white', label: 'ねむけ' },
};

/**
 * アイテム箱の一覧（時刻順、3 個まで）。既存のイベントの直前に「箱を取る → ルーレット → 結果」を付ける前振りで、
 * 結果は元のイベント（加速・攻撃・スピンなど）と必ず一致する。
 */
export function buildBoxes(script: RaceScript): Box[] {
  const boxes: Box[] = [];
  const add = (event: RaceEvent) => {
    if (boxes.length >= BOX_MAX) return;
    let box: Box | null = null;
    if (event.kind === 'attack' && event.from !== undefined && event.item) {
      // 攻撃は、撃つ瞬間に結果が出る
      const revealT = event.t - ATTACK_FLIGHT;
      box = {
        pickT: revealT - BOX_SPIN,
        revealT,
        racer: event.from,
        result: 'attack',
        rarity: 'gold',
        label: ITEM_NAMES[event.item],
      };
    } else {
      const outcome = BOX_OUTCOME[event.kind];
      if (outcome) {
        box = { pickT: event.t - BOX_SPIN, revealT: event.t, racer: event.racer, ...outcome };
      }
    }
    if (box && box.pickT >= BOX_FROM && !boxes.includes(box)) boxes.push(box);
  };
  const mid = script.events.filter((e) => e.t >= 5 && e.t <= TIMELINE.finalCornerStart);
  // 目立つもの（ごぼう抜き・攻撃）を優先し、残りは時刻順に埋める
  const priority = [
    ...mid.filter((e) => e.kind === 'surge'),
    ...mid.filter((e) => e.kind === 'attack').slice(0, 1),
  ];
  for (const event of priority) add(event);
  for (const event of mid) if (!priority.includes(event)) add(event);
  return boxes.sort((a, b) => a.pickT - b.pickT);
}

/** ルーレットの結果を出しておく秒数。 */
const ROULETTE_LINGER = 1.4;

/** 時刻 t にルーレットを表示する箱。重なったら、あとから取ったほうを優先する。 */
export function activeBox(boxes: readonly Box[], t: number): Box | null {
  const box = boxes.findLast((b) => b.pickT <= t);
  return box && t < box.revealT + ROULETTE_LINGER ? box : null;
}

export const FEVER_FROM = TIMELINE.finalCornerStart;

/** フィーバータイム中か。最終コーナーから 1 着ゴールまで。 */
export function isFever(t: number): boolean {
  return t >= FEVER_FROM && t < TIMELINE.finishStart;
}

/** フィーバーの見た目（虹色・集中線）にするか。全編フィーバーの回は、スタートから 1 着ゴールまで。点数には関係しない。 */
export function isFeverLook(t: number, rare: RareKind | null): boolean {
  if (rare === 'fever') return t >= TIMELINE.countdownEnd && t < TIMELINE.finishStart;
  return isFever(t);
}

export type HighlightKind = 'overtake' | 'boost' | 'hit' | 'jackpot';
export type Highlight = {
  t: number;
  /** 点数が入る機体。 */
  racer: number;
  kind: HighlightKind;
  /** 追い抜きのときだけ、抜いた人数。 */
  passed?: number;
  /** 連続何回目の見せ場か。 */
  combo: number;
  /** この見せ場の点数（コンボ倍率・フィーバー倍率込み）。 */
  points: number;
  /** ここまでの累計。 */
  total: number;
};

/** この秒数以内に次の見せ場が来ればコンボが続く。 */
export const COMBO_WINDOW = 3;
const FEVER_MULTIPLIER = 10;
const BASE_POINTS: Record<HighlightKind, number> = {
  overtake: 300,
  boost: 500,
  hit: 800,
  jackpot: 2000,
};
const EVENT_HIGHLIGHT: Partial<Record<RaceEventKind, HighlightKind>> = {
  rocketStart: 'boost',
  boost: 'boost',
  overtake: 'boost',
  finalComeback: 'boost',
  surge: 'jackpot',
  attack: 'hit',
};

/** 見せ場（加速・命中・追い抜き）の一覧と、コンボ・点数。点数は飾りで、順位には関係しない。 */
export function buildHighlights(script: RaceScript): Highlight[] {
  const raw: { t: number; racer: number; kind: HighlightKind; passed?: number }[] = [];
  for (const event of script.events) {
    const kind = EVENT_HIGHLIGHT[event.kind];
    if (!kind) continue;
    // 命中の点数は攻撃した側に入る
    raw.push({ t: event.t, racer: event.from ?? event.racer, kind });
  }
  for (const o of buildOvertakes(script)) {
    raw.push({ t: o.t, racer: o.racer, kind: 'overtake', passed: o.passed });
  }
  raw.sort((a, b) => a.t - b.t);

  let total = 0;
  let combo = 0;
  let last = -Infinity;
  return raw.map((item) => {
    combo = item.t - last <= COMBO_WINDOW ? combo + 1 : 1;
    last = item.t;
    const base = BASE_POINTS[item.kind] * (item.passed ?? 1);
    const points = base * combo * (isFever(item.t) ? FEVER_MULTIPLIER : 1);
    total += points;
    return { ...item, combo, points, total };
  });
}

/** 着差を出しておく秒数（レース内の時刻）。 */
const PHOTO_LINGER = 2;

/**
 * 写真判定の表示。スローに入ったら「写真判定」、2 着がゴールしたら着差（gap）を出す。出さないときは null。
 */
export function photoState(script: RaceScript, t: number): { gap: number | null } | null {
  const second = script.racers[1];
  if (!script.photo || !second || t < PHOTO_SLOW.from) return null;
  if (t < second.finishTime) return { gap: null };
  return t < second.finishTime + PHOTO_LINGER ? { gap: script.photo.gap } : null;
}
