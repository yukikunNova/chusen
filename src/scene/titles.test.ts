import { describe, expect, it } from 'vitest';
import { createRand } from '../domain/prng';
import { buildRaceScript, type RaceEvent, type RaceScript } from '../domain/race-script';
import { buildHighlights } from './hype';
import { buildSummary, buildTitles } from './titles';

const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

/** 進み方は全員同じ形で、イベントだけ指定する台本。 */
function scriptOf(n: number, events: RaceEvent[], photoGap?: number): RaceScript {
  return {
    racers: order(n).map((o, i) => ({
      ...o,
      finishTime: 23 + i * 0.5,
      keys: [
        { t: 3, p: 0 },
        { t: 19, p: 0.8 - i * 0.01 },
        { t: 23 + i * 0.5, p: 1 },
      ],
    })),
    events,
    ...(photoGap === undefined ? {} : { photo: { gap: photoGap } }),
  };
}

describe('buildTitles', () => {
  it('称号は 1 人 1 個まで、同じ称号は 1 人だけ', () => {
    const bad: string[] = [];
    for (const n of [1, 2, 3, 6, 20]) {
      for (const seed of SEEDS) {
        const script = buildRaceScript(
          order(n),
          createRand(seed),
          seed % 3 === 0 ? 0.004 : undefined,
        );
        const titles = buildTitles(script);
        if (titles.length !== n) bad.push(`n=${n} seed=${seed}: 長さ ${titles.length}`);
        const given = titles.filter((t): t is string => t !== null);
        if (new Set(given).size !== given.length) bad.push(`n=${n} seed=${seed}: 重複 ${given}`);
        if (given.some((t) => t.length === 0)) bad.push(`n=${n} seed=${seed}: 空の称号`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ごぼう抜きした機体は「ごぼう抜き王」', () => {
    const titles = buildTitles(scriptOf(5, [{ t: 10, kind: 'surge', racer: 2 }]));
    expect(titles[2]).toBe('ごぼう抜き王');
  });

  it('攻撃した側は「スナイパー」、スピンした機体は「金だらい被害者」', () => {
    const titles = buildTitles(
      scriptOf(6, [
        // 0 番が点数を稼ぐので、ドパ値MVP は 0 番
        { t: 5, kind: 'boost', racer: 0 },
        { t: 6, kind: 'boost', racer: 0 },
        { t: 7, kind: 'boost', racer: 0 },
        { t: 16, kind: 'attack', racer: 4, from: 3, item: 'bomb' },
        { t: 12, kind: 'spin', racer: 2 },
        { t: 14, kind: 'stall', racer: 1 },
      ]),
    );
    expect(titles[3]).toBe('スナイパー');
    expect(titles[2]).toBe('金だらい被害者');
    expect(titles[1]).toBe('ガス欠の人');
  });

  it('点数がいちばん多い機体は「ドパ値MVP」', () => {
    const script = scriptOf(4, [
      { t: 6, kind: 'boost', racer: 1 },
      { t: 7, kind: 'boost', racer: 1 },
      { t: 14, kind: 'boost', racer: 3 },
    ]);
    expect(buildTitles(script)[1]).toBe('ドパ値MVP');
  });

  it('最下位は「大トリ」。1 人だけのときは付けない', () => {
    expect(buildTitles(scriptOf(4, []))[3]).toBe('大トリ');
    expect(buildTitles(scriptOf(1, []))).toEqual([null]);
  });

  it('「鼻差の勝者」は写真判定の回だけ、1 着に付く', () => {
    expect(buildTitles(scriptOf(3, [], 0.003))[0]).toBe('鼻差の勝者');
    expect(buildTitles(scriptOf(3, []))).not.toContain('鼻差の勝者');
  });

  it('2 人で写真判定でも重複しない', () => {
    const titles = buildTitles(scriptOf(2, [], 0.003));
    expect(titles[0]).toBe('鼻差の勝者');
    expect(titles[1]).not.toBe(titles[0]);
  });
});

describe('buildSummary', () => {
  it('コース名・累計点・称号・写真判定の差をまとめる', () => {
    const script = buildRaceScript(order(6), createRand(5), 0.007);
    const summary = buildSummary(script, 'ネオン峠');
    expect(summary.courseName).toBe('ネオン峠');
    expect(summary.score).toBe(buildHighlights(script).at(-1)?.total ?? 0);
    expect(summary.titles).toEqual(buildTitles(script));
    expect(summary.photoGap).toBe(0.007);
  });
  it('写真判定なし・コースなしは null', () => {
    const summary = buildSummary(buildRaceScript(order(3), createRand(5)), null);
    expect(summary.courseName).toBeNull();
    expect(summary.photoGap).toBeNull();
  });
  it('激レア回の種類をまとめに入れる。指定が無ければ通常回', () => {
    const script = buildRaceScript(order(3), createRand(5));
    expect(buildSummary(script, 'ネオン峠', 'meteor').rare).toBe('meteor');
    expect(buildSummary(script, 'ネオン峠').rare).toBeNull();
  });
});
