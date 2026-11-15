import { rareLine } from './rare';
import type { RaceSummary } from './summary';

/** 結果を X などで共有するための中身（画像に描く内容と投稿文）。 */

/** 公開先。投稿文の最後に付ける。 */
export const SHARE_URL = 'https://yukikunnova.github.io/chusen/';
export const SHARE_TAG = '#ドパ抽';
/** 画像に載せる人数の上限。超えた分は「ほか N 人」にする。 */
export const SHARE_MAX_ROWS = 10;
/** 投稿文に入れる名前の長さの上限（X の字数に収めるため）。 */
const TEXT_NAME_MAX = 10;
const MEDALS = ['🥇', '🥈', '🥉'] as const;

export type ShareRow = { rank: number; name: string; title: string | null };
export type ShareModel = {
  courseName: string | null;
  score: number;
  photoGap: number | null;
  /** 激レア回の 1 行（呼び名と出現率）。通常回は null。 */
  rare: string | null;
  rows: ShareRow[];
  /** 画像に載せきれなかった人数。 */
  more: number;
};

/** 伏せ字の名前。A さん、B さん … Z さん、AA さん … と続ける。 */
export function hiddenNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    let label = '';
    for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
      label = String.fromCharCode(65 + (n % 26)) + label;
    }
    return `${label}さん`;
  });
}

/**
 * 共有する中身を作る。hidden なら名前を伏せ字に置き換える（順位と称号はそのまま）。
 * 実名はここを通ったあとに残らないので、画像にも投稿文にも出ない。
 */
export function buildShareModel(
  names: readonly string[],
  summary: RaceSummary | null,
  hidden: boolean,
): ShareModel {
  const shown = hidden ? hiddenNames(names.length) : names;
  const rows = shown.slice(0, SHARE_MAX_ROWS).map((name, i) => ({
    rank: i + 1,
    name,
    title: summary?.titles[i] ?? null,
  }));
  return {
    courseName: summary?.courseName ?? null,
    score: summary?.score ?? 0,
    photoGap: summary?.photoGap ?? null,
    rare: summary?.rare ? rareLine(summary.rare) : null,
    rows,
    more: names.length - rows.length,
  };
}

const clip = (text: string, max: number) => {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
};

/** 点数の表記（3 桁区切り）。 */
export function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/** 着差の表記。 */
export function formatGap(gap: number): string {
  return `${gap.toFixed(3)}秒差`;
}

/** X の投稿の上限（全角 1 字を 2 と数えた重み）と、URL 1 つぶんの重み。 */
const POST_LIMIT = 280;
const URL_WEIGHT = 23;

/** X の数え方での投稿文の重み。全角は 2、半角は 1、URL は長さによらず一定。 */
export function postWeight(text: string): number {
  return [...text.replace(SHARE_URL, '')].reduce(
    (sum, ch) => sum + (ch.charCodeAt(0) > 0x7f ? 2 : 1),
    URL_WEIGHT,
  );
}

/** 上限に収めるために削る段階。上から順に試す。 */
const TRIMS = [
  { course: true, score: true, title: true, nameMax: TEXT_NAME_MAX },
  { course: false, score: true, title: true, nameMax: TEXT_NAME_MAX },
  { course: false, score: false, title: true, nameMax: TEXT_NAME_MAX },
  { course: false, score: false, title: false, nameMax: TEXT_NAME_MAX },
  { course: false, score: false, title: false, nameMax: 6 },
] as const;

function composeText(model: ShareModel, trim: (typeof TRIMS)[number]): string {
  const lines = ['ドパ抽で発表順が決まった！'];
  model.rows.slice(0, MEDALS.length).forEach((row, i) => {
    const title = trim.title && i === 0 && row.title ? `（${row.title}）` : '';
    lines.push(`${MEDALS[i]} ${clip(row.name, trim.nameMax)}${title}`);
  });
  const facts: string[] = [];
  if (trim.score && model.score > 0) facts.push(`ドパ値 ${formatScore(model.score)}`);
  if (trim.course && model.courseName) facts.push(`コース: ${model.courseName}`);
  if (facts.length > 0) lines.push(facts.join(' / '));
  if (model.photoGap !== null) lines.push(`📸 写真判定 ${formatGap(model.photoGap)}`);
  if (model.rare) lines.push(`🌈 ${model.rare}`);
  lines.push(SHARE_TAG, SHARE_URL);
  return lines.join('\n');
}

/**
 * 投稿文。上位 3 人と、ドパ値・コース名・写真判定・激レア回・タグ・URL。
 * X の上限を超えるときは、コース名 → ドパ値 → 称号 → 名前の長さ、の順に削る
 * （上位 3 人・写真判定・激レア回・タグ・URL は残す）。
 */
export function shareText(model: ShareModel): string {
  const texts = TRIMS.map((trim) => composeText(model, trim));
  return texts.find((text) => postWeight(text) <= POST_LIMIT) ?? texts.at(-1)!;
}

/** X の投稿画面を、投稿文を入れた状態で開く URL。画像は付けられない。 */
export function postUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
