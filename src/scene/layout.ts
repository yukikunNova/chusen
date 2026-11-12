/** コース・レーン・名札の配置計算。three に依存しない純粋関数だけを置く。 */

export const TRACK_LENGTH = 520;
export const TRACK_HALF_WIDTH = 19;
const LANE_SPACING_SINGLE = 4.3;
const LANE_SPACING_DOUBLE = 3.5;
const ROW_HEIGHT = 2.6;
const SINGLE_ROW_MAX = 8;
const NAME_TAG_MAX = 8;

/** レーン位置（コース中心からの横・縦のずれ）。8 人以下は 1 段、9 人以上は 2 段。 */
export function laneOffset(index: number, count: number): { x: number; y: number } {
  if (count <= SINGLE_ROW_MAX) {
    return { x: (index - (count - 1) / 2) * LANE_SPACING_SINGLE, y: 0 };
  }
  const upper = Math.ceil(count / 2);
  const inUpper = index < upper;
  const rowCount = inUpper ? upper : count - upper;
  const col = inUpper ? index : index - upper;
  return {
    x: (col - (rowCount - 1) / 2) * LANE_SPACING_DOUBLE,
    y: inUpper ? ROW_HEIGHT : -ROW_HEIGHT,
  };
}

/** コース中心線。p=0 がスタート線、p=1 がゴール線。奥（-z）へ進む。 */
export function trackPoint(p: number): { x: number; y: number; z: number } {
  return {
    x: 34 * Math.sin(p * Math.PI * 2 * 1.1),
    y: 9 * Math.sin(p * Math.PI * 2 * 0.8 + 0.6),
    z: -p * TRACK_LENGTH,
  };
}

/** 名札に出す文字。長い名前は先頭 8 文字 + … にする。 */
export function nameTagText(name: string): string {
  const chars = Array.from(name);
  return chars.length <= NAME_TAG_MAX ? name : `${chars.slice(0, NAME_TAG_MAX).join('')}…`;
}
