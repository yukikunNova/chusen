import type { ThemeId } from './course';

/** 沿道の飾りの形。 */
export type PropKind = 'cubes' | 'rocks' | 'crystals' | 'sweets' | 'curtains';

/** コースの見た目（色と沿道の飾り）。 */
export type Theme = {
  /** 背景と霧の色。 */
  sky: number;
  /** 床の地の色・格子の色・横帯の色（CSS の色）。 */
  floor: string;
  grid: string;
  band: string;
  /** 左右のレールの色。 */
  rails: readonly [number, number];
  rings: readonly number[];
  prop: PropKind;
  propColors: readonly number[];
};

export const THEMES: Record<ThemeId, Theme> = {
  neon: {
    sky: 0x05030f,
    floor: 'rgba(14,6,44,0.78)',
    grid: 'rgba(120,90,255,0.9)',
    band: 'rgba(41,224,255,0.95)',
    rails: [0x29e0ff, 0xff2e93],
    rings: [0x9d4dff, 0x29e0ff, 0xff2e93, 0xffd60a],
    prop: 'cubes',
    propColors: [0x29e0ff, 0xff2e93, 0x9d4dff],
  },
  lava: {
    sky: 0x160503,
    floor: 'rgba(40,8,4,0.85)',
    grid: 'rgba(255,90,20,0.9)',
    band: 'rgba(255,210,60,0.95)',
    rails: [0xff5a14, 0xffc21a],
    rings: [0xff3b0a, 0xff8a00, 0xffd60a, 0xff2e4d],
    prop: 'rocks',
    propColors: [0xff4a00, 0xff8a00, 0xffc21a],
  },
  ice: {
    sky: 0x04121c,
    floor: 'rgba(6,30,52,0.8)',
    grid: 'rgba(150,225,255,0.9)',
    band: 'rgba(170,235,255,0.95)',
    // 白は発光でにじんで画面が飛ぶので、淡い青にとどめる
    rails: [0x58c8ff, 0x7f9bff],
    rings: [0x58c8ff, 0x3a8cff, 0x7fd8e8, 0x8f86ff],
    prop: 'crystals',
    propColors: [0x8fe9ff, 0x4aa8ff, 0xdff6ff],
  },
  candy: {
    sky: 0x1c0820,
    floor: 'rgba(60,16,56,0.8)',
    grid: 'rgba(255,150,210,0.9)',
    band: 'rgba(255,240,140,0.95)',
    rails: [0xff7ac8, 0x7af0ff],
    rings: [0xff7ac8, 0xfff07a, 0x7af0ff, 0xb48cff, 0x8cffb0],
    prop: 'sweets',
    propColors: [0xff7ac8, 0xfff07a, 0x7af0ff, 0x8cffb0],
  },
  aurora: {
    sky: 0x021410,
    floor: 'rgba(4,34,30,0.8)',
    grid: 'rgba(80,255,180,0.9)',
    band: 'rgba(190,130,255,0.95)',
    rails: [0x4dffb4, 0xb07aff],
    rings: [0x4dffb4, 0x35d0ff, 0xb07aff, 0xff7ad9],
    prop: 'curtains',
    propColors: [0x4dffb4, 0x35d0ff, 0xb07aff],
  },
};
