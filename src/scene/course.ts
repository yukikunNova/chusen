/**
 * レースごとに作るコース。区間（直線・カーブ・起伏・きりもみ・ジャンプ台）をランダムにつなぐ。
 * 見た目だけのもので、順位には関係しない。three に依存しない純粋な計算だけを置く。
 */

export type Vec3 = { x: number; y: number; z: number };
/** コース上のある地点の位置と向き。right は進行方向に向かって右。 */
export type CourseFrame = {
  pos: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
  /** ロール（きりもみの回転）を含まない上向き。カメラを回したくないときに使う。 */
  levelUp: Vec3;
};

export const THEME_IDS = ['neon', 'lava', 'ice', 'candy', 'aurora'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type SegmentKind = 'straight' | 'curve' | 'hill' | 'corkscrew' | 'jump';
/** from / to は進行度 p（0 = スタート線、1 = ゴール線）。 */
export type Segment = { kind: SegmentKind; from: number; to: number };

export type Course = {
  theme: ThemeId;
  /** 「マグマきりもみ街道」のような呼び名。 */
  name: string;
  segments: readonly Segment[];
  /** p の位置と向き。スタート前（負）とゴール後（1 超）もまっすぐ続く。 */
  frameAt(p: number): CourseFrame;
  /** ジャンプ台で機体が浮く高さ。ジャンプ台の外では 0。 */
  liftAt(p: number): number;
  /** 床があるか。ジャンプ台の途中だけ false。 */
  hasFloorAt(p: number): boolean;
};

/** スタート線からゴール線までの道のり。 */
export const COURSE_LENGTH = 520;
/** スタート後とゴール前の、水平な直線の長さ。 */
const START_STRAIGHT = 60;
const END_STRAIGHT = 70;
/** 位置の表を持つ範囲（道のり）と刻み。 */
const S_MIN = -0.08 * COURSE_LENGTH;
const S_MAX = 1.14 * COURSE_LENGTH;
const STEP = 0.5;
/** 進行方向が正面からそれる角度の上限（ラジアン）。これ以下なら必ず奥へ進む。 */
const MAX_HEADING = 0.6;
/** カーブの急さの上限（長さ 1 あたりの向きの変化）。内側の縁が折り重ならない半径にする。 */
const MAX_TURN_PER_LENGTH = 0.02;
const JUMP_HEIGHT = 7;
/** ジャンプ台の区間のうち、床が無い部分（区間内の割合）。 */
const JUMP_GAP = [0.25, 0.8] as const;

const THEME_WORDS: Record<ThemeId, string> = {
  neon: 'ネオン',
  lava: 'マグマ',
  ice: 'アイス',
  candy: 'スイーツ',
  aurora: 'オーロラ',
};
const FEATURE_WORDS: Record<Exclude<SegmentKind, 'straight'>, string> = {
  curve: 'くねくね',
  hill: 'アップダウン',
  corkscrew: 'きりもみ',
  jump: '大ジャンプ',
};
const SUFFIXES = [
  '街道',
  'サーキット',
  'ハイウェイ',
  'バイパス',
  'スカイライン',
  'ロード',
] as const;

type Rand = () => number;
/** 道のり（長さ）で表した区間と、その形を決める値。 */
type Piece = {
  kind: SegmentKind;
  a: number;
  b: number;
  /** curve: 向きの変化量。hill: 傾きの最大値。corkscrew: 回る向き（±1）。 */
  amount: number;
};

function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))]!;
}

function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const between = (rand: Rand, min: number, max: number) => min + rand() * (max - min);

/** 区間の種類と長さを決める。カーブと、それ以外（起伏・きりもみ・ジャンプ台・直線）を交互に並べる。 */
function planPieces(rand: Rand): Piece[] {
  const others: SegmentKind[] = [pick(['corkscrew', 'jump'] as const, rand)];
  const extra = rand() < 0.6 ? 2 : 3;
  for (let i = 0; i < extra; i++) {
    const options: SegmentKind[] = ['hill', 'hill', 'jump', 'straight'];
    // きりもみは 1 コースに 1 回まで
    if (!others.includes('corkscrew')) options.push('corkscrew', 'corkscrew');
    others.push(pick(options, rand));
  }
  const kinds: SegmentKind[] = ['curve'];
  for (const kind of shuffled(others, rand)) kinds.push(kind, 'curve');

  const raw = kinds.map((kind) => {
    switch (kind) {
      case 'curve':
        return between(rand, 42, 60);
      case 'hill':
        return between(rand, 55, 75);
      case 'corkscrew':
        return between(rand, 85, 105);
      case 'jump':
        return between(rand, 55, 70);
      case 'straight':
        return between(rand, 25, 40);
    }
  });
  const scale =
    (COURSE_LENGTH - START_STRAIGHT - END_STRAIGHT) / raw.reduce((sum, v) => sum + v, 0);

  const pieces: Piece[] = [{ kind: 'straight', a: S_MIN, b: START_STRAIGHT, amount: 0 }];
  let s = START_STRAIGHT;
  let heading = 0;
  /** 横へのずれの見積もり（カーブの向きを決めるのに使う）。 */
  let drift = 0;
  kinds.forEach((kind, i) => {
    const length = raw[i]! * scale;
    let amount = 0;
    if (kind === 'curve') {
      // 外へそれていたら内へ、そうでなければ今と逆へ曲げて S 字にする
      const side =
        Math.abs(drift) > 30
          ? -Math.sign(drift)
          : heading === 0
            ? pick([-1, 1], rand)
            : -Math.sign(heading);
      const target = side * between(rand, 0.3, MAX_HEADING);
      const limit = MAX_TURN_PER_LENGTH * length;
      amount = Math.max(-limit, Math.min(limit, target - heading));
      drift += Math.sin(heading + amount / 2) * length;
      heading += amount;
    } else {
      drift += Math.sin(heading) * length;
      if (kind === 'hill') amount = pick([-1, 1], rand) * between(rand, 0.16, 0.3);
      if (kind === 'corkscrew') amount = pick([-1, 1], rand);
    }
    pieces.push({ kind, a: s, b: s + length, amount });
    s += length;
  });
  pieces.push({ kind: 'straight', a: s, b: S_MAX, amount: 0 });
  return pieces;
}

function courseName(theme: ThemeId, pieces: readonly Piece[], rand: Rand): string {
  const features = (['corkscrew', 'jump', 'hill', 'curve'] as const).filter((kind) =>
    pieces.some((piece) => piece.kind === kind),
  );
  // 目立つ区間（きりもみ・ジャンプ台）を名前にしやすくする
  const feature = rand() < 0.7 ? features[0]! : pick(features, rand);
  return `${THEME_WORDS[theme]}${FEATURE_WORDS[feature]}${pick(SUFFIXES, rand)}`;
}

export function generateCourse(rand: Rand): Course {
  const theme = pick(THEME_IDS, rand);
  const pieces = planPieces(rand);
  const name = courseName(theme, pieces, rand);

  /** 道のり s での向き（進行方向の角度・上下の傾き・ロール）。 */
  function attitude(s: number): { heading: number; pitch: number; roll: number } {
    let heading = 0;
    let pitch = 0;
    let roll = 0;
    for (const piece of pieces) {
      if (s <= piece.a) break;
      const u = Math.min(1, (s - piece.a) / (piece.b - piece.a));
      if (piece.kind === 'curve') heading += piece.amount * smooth(u);
      else if (piece.kind === 'hill' && u < 1) pitch = piece.amount * Math.sin(u * Math.PI * 2);
      else if (piece.kind === 'corkscrew' && u < 1) roll = piece.amount * Math.PI * 2 * smooth(u);
    }
    return { heading, pitch, roll };
  }

  function tangentAt(s: number): Vec3 {
    const { heading, pitch } = attitude(s);
    return {
      x: Math.sin(heading) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(heading) * Math.cos(pitch),
    };
  }

  // 位置は向きを積み上げて求める。スタート線（s = 0）が原点になるよう、手前の直線の端から始める
  const count = Math.ceil((S_MAX - S_MIN) / STEP) + 1;
  const table = new Float64Array(count * 3);
  table[2] = -S_MIN;
  for (let i = 1; i < count; i++) {
    const t = tangentAt(S_MIN + (i - 0.5) * STEP);
    table[i * 3] = table[(i - 1) * 3]! + t.x * STEP;
    table[i * 3 + 1] = table[(i - 1) * 3 + 1]! + t.y * STEP;
    table[i * 3 + 2] = table[(i - 1) * 3 + 2]! + t.z * STEP;
  }

  function positionAt(s: number): Vec3 {
    const f = Math.max(0, Math.min(count - 1.000001, (s - S_MIN) / STEP));
    const i = Math.floor(f);
    const k = f - i;
    const at = (axis: number) => table[i * 3 + axis]! * (1 - k) + table[(i + 1) * 3 + axis]! * k;
    return { x: at(0), y: at(1), z: at(2) };
  }

  const toP = (s: number) => s / COURSE_LENGTH;
  const segments: Segment[] = pieces.map((piece) => ({
    kind: piece.kind,
    from: toP(Math.max(piece.a, 0)),
    to: toP(Math.min(piece.b, COURSE_LENGTH)),
  }));
  const jumps = segments.filter((segment) => segment.kind === 'jump');
  const jumpAt = (p: number) => jumps.find((jump) => p >= jump.from && p <= jump.to);

  return {
    theme,
    name,
    segments,
    frameAt(p) {
      const s = Math.max(S_MIN, Math.min(S_MAX, p * COURSE_LENGTH));
      const { heading, pitch, roll } = attitude(s);
      const tangent = tangentAt(s);
      // ロール前の右と上
      const right0 = { x: Math.cos(heading), y: 0, z: Math.sin(heading) };
      const up0 = {
        x: -Math.sin(heading) * Math.sin(pitch),
        y: Math.cos(pitch),
        z: Math.cos(heading) * Math.sin(pitch),
      };
      const c = Math.cos(roll);
      const d = Math.sin(roll);
      return {
        pos: positionAt(s),
        tangent,
        levelUp: up0,
        right: {
          x: right0.x * c + up0.x * d,
          y: right0.y * c + up0.y * d,
          z: right0.z * c + up0.z * d,
        },
        up: {
          x: up0.x * c - right0.x * d,
          y: up0.y * c - right0.y * d,
          z: up0.z * c - right0.z * d,
        },
      };
    },
    liftAt(p) {
      const jump = jumpAt(p);
      if (!jump) return 0;
      const u = (p - jump.from) / (jump.to - jump.from);
      return JUMP_HEIGHT * 4 * u * (1 - u);
    },
    hasFloorAt(p) {
      const jump = jumpAt(p);
      if (!jump) return true;
      const u = (p - jump.from) / (jump.to - jump.from);
      return u < JUMP_GAP[0] || u > JUMP_GAP[1];
    },
  };
}
