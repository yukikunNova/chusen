import { describe, expect, it } from 'vitest';
import { createRand } from '../domain/prng';
import { TIMELINE, buildRaceScript, type RaceScript } from '../domain/race-script';
import { ATTACK_FLIGHT } from './direction';
import {
  FEVER_FROM,
  activeBox,
  buildBoxes,
  buildHighlights,
  buildOvertakes,
  isFever,
  type Box,
} from './hype';

const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const scripts = [2, 4, 6, 12, 20].flatMap((n) =>
  SEEDS.map((seed) => buildRaceScript(order(n), createRand(seed))),
);

/** 4 人。racer 3 だけ 10〜11 秒で最下位から先頭へ出る。ほかは等間隔のまま。 */
const jumpScript: RaceScript = {
  racers: [0, 1, 2, 3].map((i) => ({
    id: `m${i}`,
    name: `人${i}`,
    finishTime: 23 + i * 0.5,
    keys:
      i === 3
        ? [
            { t: 3, p: 0 },
            { t: 10, p: 0.2 },
            { t: 11, p: 0.6 },
            { t: 19, p: 0.7 },
            { t: 24.5, p: 1 },
          ]
        : [
            { t: 3, p: 0 },
            { t: 19, p: 0.8 - i * 0.02 },
            { t: 23 + i * 0.5, p: 1 },
          ],
  })),
  events: [],
};

describe('buildOvertakes', () => {
  it('短い時間に 2 人以上抜いた機体を拾う', () => {
    const overtakes = buildOvertakes(jumpScript);
    const jump = overtakes.find((o) => o.racer === 3);
    expect(jump).toBeDefined();
    expect(jump!.passed).toBe(3);
    expect(jump!.t).toBeGreaterThan(10);
    expect(jump!.t).toBeLessThanOrEqual(11.5);
  });
  it('暫定順位を出す前には出さず、間隔を 1.5 秒以上空ける', () => {
    const bad: string[] = [];
    scripts.forEach((script, n) => {
      const overtakes = buildOvertakes(script);
      overtakes.forEach((o, i) => {
        if (o.t < 4.8) bad.push(`#${n}: ${o.t} 秒は早すぎる`);
        if (o.t > TIMELINE.finishStart) bad.push(`#${n}: ${o.t} 秒はゴール後`);
        if (o.passed < 2) bad.push(`#${n}: ${o.passed} 人抜き`);
        if (i > 0 && o.t - overtakes[i - 1]!.t < 1.5) bad.push(`#${n}: 間隔が短い`);
      });
    });
    expect(bad).toEqual([]);
  });
  it('ごぼう抜きは 3 人以上の追い抜きとして拾われる', () => {
    const bad: string[] = [];
    scripts.forEach((script, n) => {
      const surge = script.events.find((e) => e.kind === 'surge');
      if (!surge) return;
      const hit = buildOvertakes(script).some(
        (o) => o.racer === surge.racer && o.passed >= 3 && o.t >= surge.t && o.t <= surge.t + 3,
      );
      if (!hit) bad.push(`#${n}`);
    });
    expect(bad).toEqual([]);
  });
});

describe('buildBoxes', () => {
  it('箱は 3 個まで。取る時刻 → 結果が出る時刻の順で、結果は元のイベントと合う', () => {
    const bad: string[] = [];
    scripts.forEach((script, n) => {
      const boxes = buildBoxes(script);
      if (boxes.length > 3) bad.push(`#${n}: ${boxes.length} 個`);
      for (const box of boxes) {
        const event = script.events.find((e) =>
          e.kind === 'attack'
            ? Math.abs(e.t - ATTACK_FLIGHT - box.revealT) < 1e-9
            : e.t === box.revealT,
        );
        if (!event) {
          bad.push(`#${n}: 元のイベントがない`);
          continue;
        }
        if (box.pickT >= box.revealT || box.pickT < 3.8) bad.push(`#${n}: 取る時刻が不正`);
        const racer = event.kind === 'attack' ? event.from : event.racer;
        if (box.racer !== racer) bad.push(`#${n}: 取る機体が違う`);
        if (event.kind === 'attack' && box.result !== 'attack') bad.push(`#${n}: 攻撃でない`);
        if (event.kind === 'surge' && box.rarity !== 'rainbow') bad.push(`#${n}: 虹でない`);
        if (['spin', 'stall', 'weave'].includes(event.kind) && box.result !== 'miss')
          bad.push(`#${n}: ハズレでない`);
        if (box.label.length === 0) bad.push(`#${n}: 名前がない`);
      }
    });
    expect(bad).toEqual([]);
  });
  it('2 人以上のレースには箱が 1 個以上ある', () => {
    for (const script of scripts) expect(buildBoxes(script).length).toBeGreaterThanOrEqual(1);
  });
});

describe('activeBox', () => {
  const box = (pickT: number, revealT: number): Box => ({
    pickT,
    revealT,
    racer: 0,
    result: 'boost',
    rarity: 'gold',
    label: 'ターボ',
  });
  const first = box(5, 6.2);
  const second = box(7, 8.2);
  it('取ってから、結果を出して 1.4 秒後まで表示する', () => {
    expect(activeBox([first, second], 4.9)).toBeNull();
    expect(activeBox([first, second], 5)).toBe(first);
    expect(activeBox([first, second], 7.5)).toBe(second);
    expect(activeBox([first, second], 9.59)).toBe(second);
    expect(activeBox([first, second], 9.61)).toBeNull();
  });
  it('前の箱の結果を出している間に次の箱を取ったら、次の箱に切り替える', () => {
    expect(activeBox([first, second], 7.2)).toBe(second);
    expect(activeBox([first, second], 6.9)).toBe(first);
  });
});

describe('buildHighlights', () => {
  it('時刻順で、近い見せ場が続くとコンボが増え、間が空くと 1 に戻る', () => {
    const bad: string[] = [];
    scripts.forEach((script, n) => {
      const list = buildHighlights(script);
      let total = 0;
      list.forEach((h, i) => {
        const prev = list[i - 1];
        if (prev && h.t < prev.t) bad.push(`#${n}: 時刻が逆`);
        const expected = prev && h.t - prev.t <= 3 ? prev.combo + 1 : 1;
        if (h.combo !== expected) bad.push(`#${n}: コンボ ${h.combo}（期待 ${expected}）`);
        if (h.points <= 0 || !Number.isInteger(h.points)) bad.push(`#${n}: 点数 ${h.points}`);
        total += h.points;
        if (h.total !== total) bad.push(`#${n}: 累計が合わない`);
        if (h.racer < 0 || h.racer >= script.racers.length) bad.push(`#${n}: 機体が不正`);
      });
    });
    expect(bad).toEqual([]);
  });
  it('追い抜きには抜いた人数が付き、フィーバー中は点数が 10 倍', () => {
    const list = buildHighlights(jumpScript);
    const jump = list.find((h) => h.kind === 'overtake' && h.racer === 3)!;
    expect(jump.passed).toBe(3);
    const script = scripts.find((s) =>
      buildHighlights(s).some((h) => h.kind === 'boost' && h.t >= FEVER_FROM),
    )!;
    const late = buildHighlights(script).find((h) => h.kind === 'boost' && h.t >= FEVER_FROM)!;
    const early = buildHighlights(script).find((h) => h.kind === 'boost' && h.t < FEVER_FROM)!;
    expect(late.points / late.combo).toBe((early.points / early.combo) * 10);
  });
});

describe('isFever', () => {
  it('最終コーナーから 1 着ゴールまで', () => {
    expect(FEVER_FROM).toBe(TIMELINE.finalCornerStart);
    expect(isFever(18.9)).toBe(false);
    expect(isFever(19)).toBe(true);
    expect(isFever(22.9)).toBe(true);
    expect(isFever(TIMELINE.finishStart)).toBe(false);
  });
});
