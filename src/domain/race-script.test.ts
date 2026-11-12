import { describe, expect, it } from 'vitest';
import { createRand } from './prng';
import { TIMELINE, buildRaceScript, progressAt, rankingAt } from './race-script';

const COUNTS = [2, 3, 5, 15, 20];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));
const cases = COUNTS.flatMap((n) => SEEDS.map((seed) => ({ n, seed })));
const build = (n: number, seed: number) => buildRaceScript(order(n), createRand(seed));

describe('TIMELINE', () => {
  it('仕様の時刻', () => {
    expect(TIMELINE).toEqual({
      countdownEnd: 3,
      finalCornerStart: 19,
      finishStart: 23,
      finishEnd: 25.5,
      duration: 27,
    });
  });
});

describe('buildRaceScript', () => {
  it('racers は最終順位順で、ゴール時刻は狭義単調増加かつ 23〜25.5 秒', () => {
    for (const { n, seed } of cases) {
      const s = build(n, seed);
      expect(s.racers.map((r) => r.id)).toEqual(order(n).map((o) => o.id));
      expect(s.racers.map((r) => r.name)).toEqual(order(n).map((o) => o.name));
      for (let i = 0; i < n; i++) {
        const t = s.racers[i]!.finishTime;
        expect(t).toBeGreaterThanOrEqual(23);
        expect(t).toBeLessThanOrEqual(25.5 + 1e-9);
        if (i > 0) expect(t).toBeGreaterThan(s.racers[i - 1]!.finishTime);
      }
    }
  });
  it('ゴール間隔は min(0.6, 2.5/(N-1))', () => {
    const five = build(5, 1).racers;
    expect(five[1]!.finishTime - five[0]!.finishTime).toBeCloseTo(0.6, 9);
    const fifteen = build(15, 1).racers;
    expect(fifteen[1]!.finishTime - fifteen[0]!.finishTime).toBeCloseTo(2.5 / 14, 9);
    expect(fifteen[14]!.finishTime).toBeCloseTo(25.5, 9);
    const two = build(2, 1).racers;
    expect(two[1]!.finishTime - two[0]!.finishTime).toBeCloseTo(0.6, 9);
  });
  it('進行度は単調非減少で、3 秒で 0、ゴール時刻で 1', () => {
    for (const { n, seed } of cases) {
      const s = build(n, seed);
      for (const r of s.racers) {
        expect(progressAt(r, 0)).toBe(0);
        expect(progressAt(r, 3)).toBe(0);
        expect(progressAt(r, r.finishTime)).toBe(1);
        expect(progressAt(r, 27)).toBe(1);
        // 時刻ごとに expect を呼ぶと数百万回になり遅いので、違反した時刻だけ集めて 1 回で確かめる
        const violations: number[] = [];
        let prev = 0;
        for (let t = 0; t <= 27; t += 0.05) {
          const p = progressAt(r, t);
          if (!(p >= prev && p <= 1)) violations.push(t);
          prev = p;
        }
        expect(violations).toEqual([]);
      }
    }
  });
  it('3 人以上なら最終コーナー入口で 1 着は下位半分にいる（逆転が起きる）', () => {
    for (const { n, seed } of cases) {
      if (n < 3) continue;
      const ranking = rankingAt(build(n, seed), 19);
      expect(ranking[0]).not.toBe(0);
      expect(ranking.indexOf(0)).toBeGreaterThanOrEqual(Math.ceil(n / 2));
    }
  });
  it('全員ゴール後の順位は最終順位', () => {
    for (const { n, seed } of cases) {
      expect(rankingAt(build(n, seed), 26)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
  it('ゴール窓の途中では、すでにゴールした機体が上位に最終順位どおり並ぶ', () => {
    const s = build(5, 3);
    const t = s.racers[2]!.finishTime;
    expect(rankingAt(s, t).slice(0, 3)).toEqual([0, 1, 2]);
  });
  it('同じ seed なら同じ台本、seed が違えば展開が変わる', () => {
    for (const n of COUNTS) {
      expect(build(n, 5)).toEqual(build(n, 5));
      const variety = new Set(
        SEEDS.map((seed) =>
          build(n, seed)
            .events.map((e) => `${e.kind}:${e.racer}`)
            .join(','),
        ),
      );
      expect(variety.size).toBeGreaterThanOrEqual(10);
    }
  });
  it('イベントは時刻昇順・本数と間隔が仕様どおり', () => {
    for (const { n, seed } of cases) {
      const { events } = build(n, seed);
      const [min, max] = n >= 3 ? [6, 8] : [5, 7];
      expect(events.length).toBeGreaterThanOrEqual(min);
      expect(events.length).toBeLessThanOrEqual(max);
      expect(['slowStart', 'rocketStart']).toContain(events[0]!.kind);
      expect(events[0]!.t).toBeCloseTo(3.3, 9);
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        expect(Number.isInteger(e.racer) && e.racer >= 0 && e.racer < n).toBe(true);
        if (i > 0) expect(e.t - events[i - 1]!.t).toBeGreaterThanOrEqual(1.5);
      }
      const comeback = events.filter((e) => e.kind === 'finalComeback');
      if (n >= 3) {
        expect(comeback).toEqual([{ t: 20, kind: 'finalComeback', racer: 0 }]);
        expect(events.at(-1)!.kind).toBe('finalComeback');
      } else {
        expect(comeback).toEqual([]);
      }
      for (const e of events.slice(1, n >= 3 ? -1 : undefined)) {
        expect(e.t).toBeGreaterThanOrEqual(5.1);
        expect(e.t).toBeLessThanOrEqual(18);
        expect(['boost', 'spin', 'weave', 'stall', 'overtake', 'attack', 'surge']).toContain(
          e.kind,
        );
      }
    }
  });
  it('4 人以上なら、最下位から 2 秒で 3 人以上を抜く「ごぼう抜き」が 1 回ある', () => {
    const bad: string[] = [];
    for (const n of [4, 5, 8, 15, 20]) {
      for (const seed of SEEDS) {
        const s = build(n, seed);
        const surges = s.events.filter((e) => e.kind === 'surge');
        if (surges.length !== 1) {
          bad.push(`n=${n} seed=${seed}: ${surges.length} 回`);
          continue;
        }
        const { t, racer } = surges[0]!;
        const before = rankingAt(s, t).indexOf(racer);
        const after = rankingAt(s, t + 2).indexOf(racer);
        if (before !== n - 1) bad.push(`n=${n} seed=${seed}: 開始時 ${before + 1} 位`);
        if (before - after < 3) bad.push(`n=${n} seed=${seed}: ${before - after} 人抜き`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('3 人以下ではごぼう抜きなし', () => {
    for (const n of [1, 2, 3]) {
      for (const seed of SEEDS) {
        expect(build(n, seed).events.filter((e) => e.kind === 'surge')).toEqual([]);
      }
    }
  });
  it('順位の入れ替わりが多く、終盤（19〜23 秒）にも起きる', () => {
    /** from〜to 秒の間に、暫定順位の並びが変わった回数。 */
    const changes = (n: number, seed: number, from: number, to: number) => {
      const s = build(n, seed);
      let count = 0;
      let prev = rankingAt(s, from).join();
      for (let t = from + 0.25; t <= to; t += 0.25) {
        const cur = rankingAt(s, t).join();
        if (cur !== prev) count++;
        prev = cur;
      }
      return count;
    };
    const mean = (from: number, to: number) =>
      SEEDS.reduce((sum, seed) => sum + changes(6, seed, from, to), 0) / SEEDS.length;
    expect(mean(4, 19)).toBeGreaterThanOrEqual(14);
    expect(mean(19, 23)).toBeGreaterThanOrEqual(3);
  });
  it('2 人以上なら攻撃が最低 1 回あり、攻撃者は被弾者と別の機体', () => {
    for (const { n, seed } of cases) {
      const { events } = build(n, seed);
      const attacks = events.filter((e) => e.kind === 'attack');
      expect(attacks.length).toBeGreaterThanOrEqual(1);
      for (const e of attacks) {
        expect(Number.isInteger(e.from) && e.from! >= 0 && e.from! < n).toBe(true);
        expect(e.from).not.toBe(e.racer);
        expect(['missile', 'bomb', 'thunder']).toContain(e.item);
      }
      for (const e of events.filter((x) => x.kind !== 'attack')) {
        expect(e.from).toBeUndefined();
        expect(e.item).toBeUndefined();
      }
    }
  });
  it('攻撃アイテムは 3 種類とも出る', () => {
    const items = new Set(
      SEEDS.flatMap((seed) =>
        build(5, seed)
          .events.map((e) => e.item)
          .filter(Boolean),
      ),
    );
    expect([...items].sort()).toEqual(['bomb', 'missile', 'thunder']);
  });
  it('1 人のときは攻撃なし', () => {
    for (const seed of SEEDS) {
      expect(build(1, seed).events.some((e) => e.kind === 'attack')).toBe(false);
    }
  });
  it('1 人でも壊れない', () => {
    const s = build(1, 1);
    expect(s.racers).toHaveLength(1);
    expect(s.racers[0]!.finishTime).toBe(23);
    expect(progressAt(s.racers[0]!, 23)).toBe(1);
  });
});
