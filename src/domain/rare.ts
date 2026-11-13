/** 激レア回。ごくまれに、レース全体の見た目が変わる。見た目だけで、順位・ドパ値・称号には関係しない。 */

export type RareKind = 'gold' | 'meteor' | 'fever';
export const RARE_KINDS: readonly RareKind[] = ['gold', 'meteor', 'fever'];
/** 1 種類あたりの出現率。合計は種類の数だけ掛けた値（約 3%）。 */
export const RARE_CHANCE = 0.01;
export const RARE_LABELS: Record<RareKind, string> = {
  gold: '黄金レース',
  meteor: '流星群レース',
  fever: '全編フィーバー',
};

/** 激レア回を引く。通常回は null。rand は 1 回だけ使う。 */
export function drawRare(rand: () => number): RareKind | null {
  return RARE_KINDS[Math.floor(rand() / RARE_CHANCE)] ?? null;
}

/** 結果画面・画像・投稿文に出す 1 行。 */
export function rareLine(kind: RareKind): string {
  return `激レア回「${RARE_LABELS[kind]}」（出現率${Math.round(RARE_CHANCE * 100)}%）`;
}
