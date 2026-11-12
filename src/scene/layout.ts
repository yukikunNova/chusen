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

/** 乗り物の種類。宇宙もの、会議室にある物、ネタ枠の順。 */
export const VEHICLE_KINDS = [
  'rocket',
  'ufo',
  'shuttle',
  'satellite',
  'comet',
  'saturn',
  'rover',
  'chair',
  'box',
  'cup',
  'keyboard',
  'laptop',
  'duck',
  'sushi',
  'donut',
  'toilet',
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/**
 * 各機体の乗り物を決める。種類数以下の人数なら全員ちがう乗り物、超えたらどの種類も同じくらい使う。
 * 見た目だけの割り当てで、順位には関係しない。
 */
export function pickVehicles(count: number, rand: () => number): VehicleKind[] {
  const out: VehicleKind[] = [];
  while (out.length < count) {
    const round = [...VEHICLE_KINDS];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rand() * (i + 1)));
      [round[i], round[j]] = [round[j]!, round[i]!];
    }
    out.push(...round);
  }
  return out.slice(0, count);
}
