import { describe, expect, it } from 'vitest';
import {
  SHARE_MAX_ROWS,
  SHARE_TAG,
  SHARE_URL,
  buildShareModel,
  hiddenNames,
  postUrl,
  postWeight,
  shareText,
} from './share';
import type { RaceSummary } from './summary';

const names = (n: number) => Array.from({ length: n }, (_, i) => `実名${i + 1}太郎`);
const summary = (n: number, over: Partial<RaceSummary> = {}): RaceSummary => ({
  courseName: 'ネオン峠',
  score: 123456,
  titles: Array.from({ length: n }, (_, i) =>
    i === 0 ? 'ドパ値MVP' : i === n - 1 ? '大トリ' : null,
  ),
  photoGap: null,
  rare: null,
  ...over,
});

describe('hiddenNames', () => {
  it('A さんから順に付け、26 人を超えたら AA さん…と続ける', () => {
    expect(hiddenNames(3)).toEqual(['Aさん', 'Bさん', 'Cさん']);
    const many = hiddenNames(60);
    expect(many[25]).toBe('Zさん');
    expect(many[26]).toBe('AAさん');
    expect(many[27]).toBe('ABさん');
    expect(new Set(many).size).toBe(60);
  });
});

describe('buildShareModel', () => {
  it('順位・名前・称号を並べ、コース名・ドパ値・写真判定を持つ', () => {
    const model = buildShareModel(names(3), summary(3, { photoGap: 0.003 }), false);
    expect(model.rows).toEqual([
      { rank: 1, name: '実名1太郎', title: 'ドパ値MVP' },
      { rank: 2, name: '実名2太郎', title: null },
      { rank: 3, name: '実名3太郎', title: '大トリ' },
    ]);
    expect(model.courseName).toBe('ネオン峠');
    expect(model.score).toBe(123456);
    expect(model.photoGap).toBe(0.003);
    expect(model.more).toBe(0);
  });
  it('多人数は先頭だけ載せ、残りは人数にする', () => {
    const model = buildShareModel(names(25), summary(25), false);
    expect(model.rows).toHaveLength(SHARE_MAX_ROWS);
    expect(model.more).toBe(25 - SHARE_MAX_ROWS);
  });
  it('まとめが無くても作れる', () => {
    const model = buildShareModel(names(2), null, false);
    expect(model.rows.map((r) => r.title)).toEqual([null, null]);
    expect(model.courseName).toBeNull();
    expect(model.score).toBe(0);
    expect(model.photoGap).toBeNull();
  });
  it('名前を伏せると、画像の中身にも投稿文にも投稿先の URL にも実名が出ない', () => {
    for (const n of [1, 2, 5, 30]) {
      const model = buildShareModel(names(n), summary(n, { photoGap: 0.005 }), true);
      const text = shareText(model);
      const everything = JSON.stringify(model) + text + decodeURIComponent(postUrl(text));
      expect(everything).not.toContain('実名');
      expect(everything).not.toContain('太郎');
      expect(model.rows[0]!.name).toBe('Aさん');
      // 称号と順位はそのまま
      expect(model.rows[0]!.title).toBe('ドパ値MVP');
    }
  });
});

describe('shareText', () => {
  it('上位 3 人・ドパ値・コース名・タグ・URL を入れる', () => {
    const text = shareText(buildShareModel(names(5), summary(5), false));
    expect(text).toContain('🥇 実名1太郎（ドパ値MVP）');
    expect(text).toContain('🥈 実名2太郎');
    expect(text).toContain('🥉 実名3太郎');
    expect(text).not.toContain('実名4太郎');
    expect(text).toContain('ドパ値 123,456');
    expect(text).toContain('ネオン峠');
    expect(text).toContain('#ドパ抽');
    expect(text).toContain(SHARE_URL);
    expect(text).not.toContain('写真判定');
  });
  it('写真判定の回は着差を入れる。コースや点数が無ければ書かない', () => {
    const text = shareText(
      buildShareModel(names(2), summary(2, { photoGap: 0.007, courseName: null, score: 0 }), false),
    );
    expect(text).toContain('写真判定 0.007秒差');
    expect(text).not.toContain('コース');
    expect(text).not.toContain('ドパ値 ');
  });
  it('投稿文は X の上限（全角 140 字相当）に収まる', () => {
    const long = Array.from({ length: 5 }, (_, i) => `とても長い名前の参加者さん${i}`.repeat(3));
    const text = shareText(buildShareModel(long, summary(5, { photoGap: 0.001 }), false));
    // 全角は 2、半角は 1、URL は 23 として数える
    const weight = [...text.replace(SHARE_URL, '')].reduce(
      (sum, ch) => sum + (ch.charCodeAt(0) > 0x7f ? 2 : 1),
      23,
    );
    expect(weight).toBeLessThanOrEqual(280);
  });
});

describe('投稿文の長さ（激レア回・写真判定つき）', () => {
  // 全角は 2、半角は 1、URL は 23 として数える
  const weight = (text: string) =>
    [...text.replace(SHARE_URL, '')].reduce(
      (sum, ch) => sum + (ch.charCodeAt(0) > 0x7f ? 2 : 1),
      23,
    );
  const long = Array.from({ length: 5 }, (_, i) => `とても長い名前の参加者さん${i}`.repeat(3));

  it('激レア回と写真判定が重なっても上限に収まり、激レアの行・タグ・URL は残す', () => {
    for (const rare of ['gold', 'meteor', 'fever'] as const) {
      const text = shareText(
        buildShareModel(
          long,
          summary(5, {
            rare,
            photoGap: 0.001,
            score: 1234567,
            courseName: 'オーロラきりもみサーキット',
          }),
          false,
        ),
      );
      expect(weight(text)).toBeLessThanOrEqual(280);
      expect(text).toContain('激レア回');
      expect(text).toContain('🥇');
      expect(text).toContain(SHARE_TAG);
      expect(text).toContain(SHARE_URL);
    }
  });
  it('名前が URL の形（a.com など）でも上限に収まる。X は URL を 1 つ 23 と数える', () => {
    const text = shareText(
      buildShareModel(
        ['a.com', 'b.com', 'c.com'],
        summary(3, {
          rare: 'gold',
          photoGap: 0.001,
          score: 1234567,
          courseName: 'オーロラきりもみサーキット特別編その2',
          titles: ['金だらい被害者', null, null],
        }),
        false,
      ),
    );
    // 実装の数え方に頼らず、名前の URL を 23 字ぶんの半角に置き換えてから数える
    const expanded = text.replace(/\b[abc]\.com\b/g, 'x'.repeat(23));
    expect(expanded).not.toBe(text);
    expect(weight(expanded)).toBeLessThanOrEqual(280);
    expect(text).toContain('激レア回');
    expect(text).toContain('🥇 a.com');
  });
  it('URL の形の並びは、長さによらず 1 つ 23 として数える', () => {
    expect(postWeight('abc あ')).toBe(3 + 1 + 2);
    expect(postWeight('a.com')).toBe(23);
    expect(postWeight('https://example.com/x あ')).toBe(23 + 1 + 2);
    expect(postWeight(`#ドパ抽\n${SHARE_URL}`)).toBe(1 + 6 + 1 + 23);
  });
  it('収まるときは何も削らない', () => {
    const text = shareText(
      buildShareModel(['あ', 'い', 'う'], summary(3, { rare: 'gold', photoGap: 0.001 }), false),
    );
    expect(text).toContain('コース: ネオン峠');
    expect(text).toContain('ドパ値 123,456');
    expect(text).toContain('写真判定');
    expect(text).toContain('（ドパ値MVP）');
  });
});

describe('postUrl', () => {
  it('X の投稿画面を、投稿文を入れた状態で開く URL', () => {
    const url = new URL(postUrl('こんにちは #ドパ抽\nhttps://example.com/'));
    expect(url.origin).toBe('https://x.com');
    expect(url.pathname).toBe('/intent/post');
    expect(url.searchParams.get('text')).toBe('こんにちは #ドパ抽\nhttps://example.com/');
  });
});

describe('激レア回の共有', () => {
  it('激レア回は、画像の中身と投稿文に呼び名と出現率を入れる', () => {
    const model = buildShareModel(names(3), summary(3, { rare: 'gold' }), false);
    expect(model.rare).toBe('激レア回「黄金レース」（出現率1%）');
    expect(shareText(model)).toContain('🌈 激レア回「黄金レース」（出現率1%）');
  });
  it('通常回には入れない', () => {
    const model = buildShareModel(names(3), summary(3), false);
    expect(model.rare).toBeNull();
    expect(shareText(model)).not.toContain('激レア');
    expect(buildShareModel(names(3), null, false).rare).toBeNull();
  });
});
