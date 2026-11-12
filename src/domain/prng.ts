/** [0, 1) の擬似乱数。演出用であり、抽選の公平性には使わない。 */
export type Rand = () => number;

/** mulberry32。同じ seed からは同じ列が出る。 */
export function createRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
