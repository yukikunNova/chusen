/** 0 以上 maxExclusive 未満の整数を返す乱数源。 */
export type RandomInt = (maxExclusive: number) => number;

const UINT32_RANGE = 2 ** 32;

/** 暗号学的乱数から偏りなく整数を得る（棄却サンプリング）。 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError(`maxExclusive は 1 以上の整数: ${maxExclusive}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % maxExclusive;
  }
};

/** Fisher–Yates シャッフル。入力は変更しない。 */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
