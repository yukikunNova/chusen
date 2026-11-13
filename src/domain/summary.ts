/** レースのまとめ。結果画面と結果カード画像に出す。すべて飾りで、順位には関係しない。 */
export type RaceSummary = {
  /** コース名。簡易表示（3D なし）のときは null。 */
  courseName: string | null;
  /** ドパ値（飾りの累計点）。 */
  score: number;
  /** 最終順位順の称号。付かない人は null。 */
  titles: (string | null)[];
  /** 写真判定の回の着差（秒）。写真判定でなければ null。 */
  photoGap: number | null;
};
