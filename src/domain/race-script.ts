import type { Rand } from './prng';

/** レースの時刻表（秒）。人数によらず固定。 */
export const TIMELINE = {
  countdownEnd: 3,
  finalCornerStart: 19,
  finishStart: 23,
  finishEnd: 25.5,
  duration: 27,
} as const;

export type RaceEventKind =
  'slowStart' | 'rocketStart' | 'boost' | 'spin' | 'weave' | 'stall' | 'overtake' | 'finalComeback';
/** racer は最終順位の添字（0 が 1 着）。 */
export type RaceEvent = { t: number; kind: RaceEventKind; racer: number };
/** p: 0 = スタート線、1 = ゴール線。 */
export type Key = { t: number; p: number };
export type Racer = { id: string; name: string; finishTime: number; keys: Key[] };
/** racers は最終順位順。 */
export type RaceScript = { racers: Racer[]; events: RaceEvent[] };

const OPENING_TIME = 3.3;
const MID_START = 5.1;
const MID_END = 18;
const MID_GAP = 1.8;
const COMEBACK_TIME = 20;
const COMEBACK_KEY_TIME = 21;
const MAX_FINISH_GAP = 0.6;
const KEY_TIMES = [3, 7, 11, 15, 19] as const;
const MID_KINDS = ['boost', 'spin', 'weave', 'stall', 'overtake'] as const;
const FAST: readonly RaceEventKind[] = ['rocketStart', 'boost', 'overtake'];
const SLOW: readonly RaceEventKind[] = ['slowStart', 'spin', 'stall'];

function randInt(rand: Rand, maxExclusive: number): number {
  return Math.min(maxExclusive - 1, Math.floor(rand() * maxExclusive));
}

function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 最終コーナー入口での順位（0 が先頭）。3 人以上なら 1 着を下位半分に置く。 */
function cornerRanks(n: number, rand: Rand): number[] {
  const ranks = Array.from({ length: n }, (_, i) => i);
  if (n < 3) return ranks;
  const lowerHalfStart = Math.ceil(n / 2);
  for (;;) {
    const candidate = shuffled(ranks, rand);
    if (candidate[0]! >= lowerHalfStart) return candidate;
  }
}

function buildEvents(n: number, rand: Rand): RaceEvent[] {
  const events: RaceEvent[] = [
    { t: OPENING_TIME, kind: rand() < 0.5 ? 'slowStart' : 'rocketStart', racer: randInt(rand, n) },
  ];

  const count = 4 + randInt(rand, 3);
  const slack = MID_END - MID_START - (count - 1) * MID_GAP;
  const offsets = Array.from({ length: count }, () => rand() * slack).sort((a, b) => a - b);
  // 対象が偏らないよう、並べ替えた機体を順に割り当てる
  let pool: number[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0)
      pool = shuffled(
        Array.from({ length: n }, (_, k) => k),
        rand,
      );
    events.push({
      t: MID_START + i * MID_GAP + offsets[i]!,
      kind: MID_KINDS[randInt(rand, MID_KINDS.length)]!,
      racer: pool.pop()!,
    });
  }

  if (n >= 3) events.push({ t: COMEBACK_TIME, kind: 'finalComeback', racer: 0 });
  return events;
}

export function buildRaceScript(
  order: readonly { id: string; name: string }[],
  rand: Rand,
): RaceScript {
  const n = order.length;
  const gap =
    n > 1 ? Math.min(MAX_FINISH_GAP, (TIMELINE.finishEnd - TIMELINE.finishStart) / (n - 1)) : 0;
  const ranks = cornerRanks(n, rand);
  const events = buildEvents(n, rand);

  const racers = order.map(({ id, name }, i): Racer => {
    const finishTime = TIMELINE.finishStart + gap * i;
    const p19 = n > 1 ? 0.8 - (0.1 * ranks[i]!) / (n - 1) : 0.8;

    // 区間ごとの進み具合。イベントのある区間は速く／遅くする
    const weights = KEY_TIMES.slice(1).map((end, seg) => {
      const startT = KEY_TIMES[seg]!;
      let w = 0.8 + rand() * 0.4;
      for (const e of events) {
        if (e.racer !== i || e.t < startT || e.t >= end) continue;
        if (FAST.includes(e.kind)) w *= 1.6;
        else if (SLOW.includes(e.kind)) w *= 0.4;
      }
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);

    const keys: Key[] = [{ t: KEY_TIMES[0], p: 0 }];
    let p = 0;
    weights.forEach((w, seg) => {
      p += (w / total) * p19;
      keys.push({ t: KEY_TIMES[seg + 1]!, p: seg === weights.length - 1 ? p19 : p });
    });
    if (events.some((e) => e.kind === 'finalComeback' && e.racer === i)) {
      // 最終コーナー前半は溜め、後半で一気に伸びる
      keys.push({ t: COMEBACK_KEY_TIME, p: p19 + (1 - p19) * 0.3 });
    }
    keys.push({ t: finishTime, p: 1 });
    return { id, name, finishTime, keys };
  });

  return { racers, events };
}

/** 時刻 t の進行度（線形補間）。スタート前は 0、ゴール後は 1。 */
export function progressAt(racer: Racer, t: number): number {
  const keys = racer.keys;
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first.t) return first.p;
  if (t >= last.t) return last.p;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t > b.t) continue;
    const a = keys[i - 1]!;
    return a.p + ((b.p - a.p) * (t - a.t)) / (b.t - a.t);
  }
  return last.p;
}

/** 時刻 t の暫定順位（racer 添字を進行度の降順に並べる。同値は添字の小さい順）。 */
export function rankingAt(script: RaceScript, t: number): number[] {
  const progress = script.racers.map((r) => progressAt(r, t));
  return progress.map((_, i) => i).sort((a, b) => progress[b]! - progress[a]! || a - b);
}
