import { describe, expect, it } from 'vitest';
import { ITEM_NAMES, TEMPLATES, buildCommentary, type CommentaryKind } from './commentary';
import { createRand } from './prng';
import { buildRaceScript } from './race-script';

const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('TEMPLATES', () => {
  it('各種類 3 本以上・合計 30 本以上、start 以外は {name} を含む', () => {
    const kinds = Object.keys(TEMPLATES) as CommentaryKind[];
    expect(kinds.sort()).toEqual(
      [
        'attack',
        'boost',
        'finalComeback',
        'finish',
        'overtake',
        'rocketStart',
        'slowStart',
        'spin',
        'stall',
        'start',
        'weave',
      ].sort(),
    );
    let total = 0;
    for (const kind of kinds) {
      expect(TEMPLATES[kind].length).toBeGreaterThanOrEqual(3);
      total += TEMPLATES[kind].length;
      if (kind !== 'start') {
        for (const line of TEMPLATES[kind]) expect(line).toContain('{name}');
      }
    }
    expect(total).toBeGreaterThanOrEqual(30);
    expect(new Set(Object.values(TEMPLATES).flat()).size).toBe(total);
    expect(TEMPLATES.finish).toContain('ゴール！！ 栄光のトップバッターは {name}！');
  });
});

describe('buildCommentary', () => {
  it('時刻昇順・1.5 秒以上の間隔・本数はイベント数 + 2', () => {
    for (const n of [2, 3, 5, 15, 20]) {
      for (const seed of SEEDS) {
        const script = buildRaceScript(order(n), createRand(seed));
        const cues = buildCommentary(script, createRand(seed + 1000));
        expect(cues).toHaveLength(script.events.length + 2);
        const [min, max] = n >= 3 ? [8, 10] : [7, 9];
        expect(cues.length).toBeGreaterThanOrEqual(min);
        expect(cues.length).toBeLessThanOrEqual(max);
        for (let i = 1; i < cues.length; i++) {
          expect(cues[i]!.t - cues[i - 1]!.t).toBeGreaterThanOrEqual(1.5);
        }
        for (const cue of cues) expect(cue.text).not.toContain('{name}');
      }
    }
  });
  it('先頭は 0.5 秒の開幕、2 本目は開幕イベントの対象、末尾は 1 着の名前', () => {
    const script = buildRaceScript(order(5), createRand(3));
    const cues = buildCommentary(script, createRand(4));
    expect(cues[0]!.t).toBe(0.5);
    expect(cues[1]!.t).toBeCloseTo(3.3, 9);
    expect(cues[1]!.text).toContain(script.racers[script.events[0]!.racer]!.name);
    expect(cues.at(-1)!.t).toBe(script.racers[0]!.finishTime);
    expect(cues.at(-1)!.text).toContain('人0');
    const comeback = cues.find((c) => c.t === 20)!;
    expect(comeback.text).toContain('人0');
  });
  it('攻撃の実況には攻撃者・被弾者・アイテム名が入る', () => {
    for (const seed of SEEDS) {
      const script = buildRaceScript(order(5), createRand(seed));
      const cues = buildCommentary(script, createRand(seed + 7));
      script.events.forEach((event, i) => {
        if (event.kind !== 'attack') return;
        const text = cues[i + 1]!.text;
        expect(text).toContain(script.racers[event.racer]!.name);
        expect(text).toContain(script.racers[event.from!]!.name);
        expect(text).toContain(ITEM_NAMES[event.item!]);
        expect(text).not.toContain('{from}');
        expect(text).not.toContain('{item}');
      });
    }
  });
  it('攻撃テンプレートは {from} と {item} を含む', () => {
    for (const line of TEMPLATES.attack) {
      expect(line).toContain('{from}');
      expect(line).toContain('{item}');
    }
    expect(ITEM_NAMES).toEqual({
      missile: '仕様変更ミサイル',
      bomb: '長文メール爆弾',
      thunder: '差し戻しサンダー',
    });
  });
  it('名前は加工せずそのまま入れる', () => {
    const script = buildRaceScript(
      [
        { id: 'a', name: '<b>太郎</b>' },
        { id: 'b', name: '$& {name}' },
        { id: 'c', name: 'c' },
      ],
      createRand(1),
    );
    const cues = buildCommentary(script, createRand(2));
    expect(cues.at(-1)!.text).toContain('<b>太郎</b>');
    const forB = cues.filter((_, i) => i >= 1 && script.events[i - 1]?.racer === 1);
    for (const cue of forB) expect(cue.text).toContain('$& {name}');
  });
  it('rand が違えば文面が変わる', () => {
    const script = buildRaceScript(order(5), createRand(3));
    const texts = new Set(
      SEEDS.map((seed) =>
        buildCommentary(script, createRand(seed))
          .map((c) => c.text)
          .join('|'),
      ),
    );
    expect(texts.size).toBeGreaterThanOrEqual(10);
  });
});
