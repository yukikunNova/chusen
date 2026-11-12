import { describe, expect, it } from 'vitest';
import { createRand } from '../domain/prng';
import { COURSE_LENGTH, THEME_IDS, generateCourse, type Course, type Vec3 } from './course';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const courses: Course[] = SEEDS.map((seed) => generateCourse(createRand(seed)));

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** 全コースの p を細かくたどり、条件に反した箇所を集める（expect は 1 回だけ呼ぶ）。 */
function violations(check: (course: Course, p: number, prevP: number) => string | null): string[] {
  const out: string[] = [];
  courses.forEach((course, n) => {
    let prevP = -0.05;
    for (let p = -0.05 + 0.002; p <= 1.1; p += 0.002) {
      const problem = check(course, p, prevP);
      if (problem && out.length < 5) out.push(`seed#${n} p=${p.toFixed(3)}: ${problem}`);
      prevP = p;
    }
  });
  return out;
}

describe('generateCourse', () => {
  it('同じ乱数からは同じコースができ、乱数が変われば変わる', () => {
    const a = generateCourse(createRand(42));
    const b = generateCourse(createRand(42));
    const c = generateCourse(createRand(43));
    expect(a.name).toBe(b.name);
    expect(a.frameAt(0.5)).toEqual(b.frameAt(0.5));
    expect(a.frameAt(0.5)).not.toEqual(c.frameAt(0.5));
  });

  it('座標はすべて有限で、向きの 3 軸は直交する単位ベクトル', () => {
    expect(
      violations((course, p) => {
        const f = course.frameAt(p);
        const values = [f.pos, f.tangent, f.right, f.up].flatMap((v) => [v.x, v.y, v.z]);
        if (!values.every(Number.isFinite)) return '有限でない';
        for (const v of [f.tangent, f.right, f.up]) {
          if (Math.abs(len(v) - 1) > 1e-3) return '単位ベクトルでない';
        }
        if (Math.abs(dot(f.tangent, f.right)) > 1e-2) return 'tangent と right が直交しない';
        if (Math.abs(dot(f.tangent, f.up)) > 1e-2) return 'tangent と up が直交しない';
        if (Math.abs(dot(f.right, f.up)) > 1e-2) return 'right と up が直交しない';
        return null;
      }),
    ).toEqual([]);
  });

  it('進むほど必ず奥（-z）へ進む（コース同士が重ならない）', () => {
    expect(
      violations((course, p, prevP) =>
        course.frameAt(p).pos.z < course.frameAt(prevP).pos.z ? null : '前進していない',
      ),
    ).toEqual([]);
  });

  it('向きは急に変わらない（上向きの反転なし）', () => {
    expect(
      violations((course, p, prevP) => {
        const a = course.frameAt(prevP);
        const b = course.frameAt(p);
        if (dot(a.up, b.up) < 0.97) return 'up が飛ぶ';
        if (dot(a.tangent, b.tangent) < 0.99) return 'tangent が飛ぶ';
        return null;
      }),
    ).toEqual([]);
  });

  it('スタート付近とゴール付近は水平な直線', () => {
    expect(
      violations((course, p) => {
        if (p > 0.09 && p < 0.9) return null;
        const f = course.frameAt(p);
        if (Math.abs(f.tangent.y) > 1e-6) return '傾いている';
        if (f.up.y < 0.999999) return 'ロールしている';
        return null;
      }),
    ).toEqual([]);
    for (const course of courses) {
      const a = course.frameAt(0.9);
      const b = course.frameAt(1.1);
      expect(dot(a.tangent, b.tangent)).toBeGreaterThan(0.999999);
    }
  });

  it('スタート線は原点、スタートからゴールまでの道のりは一定', () => {
    const bad: string[] = [];
    courses.forEach((course, n) => {
      if (len(course.frameAt(0).pos) > 1e-6) bad.push(`seed#${n}: 原点でない`);
      let length = 0;
      let prev = course.frameAt(0).pos;
      for (let i = 1; i <= 2000; i++) {
        const cur = course.frameAt(i / 2000).pos;
        length += dist(prev, cur);
        prev = cur;
      }
      if (Math.abs(length - COURSE_LENGTH) > 1) bad.push(`seed#${n}: 道のり ${length}`);
    });
    expect(bad).toEqual([]);
  });

  it('横にそれすぎない', () => {
    expect(
      violations((course, p) => (Math.abs(course.frameAt(p).pos.x) > 220 ? '横にそれた' : null)),
    ).toEqual([]);
  });

  it('どのコースにもカーブがあり、きりもみかジャンプ台が 1 つ以上ある', () => {
    for (const course of courses) {
      const kinds = course.segments.map((s) => s.kind);
      expect(kinds.filter((k) => k === 'curve').length).toBeGreaterThanOrEqual(1);
      expect(kinds.some((k) => k === 'corkscrew' || k === 'jump')).toBe(true);
    }
  });

  it('きりもみ区間ではコースが 1 回転する', () => {
    const course = courses.find((c) => c.segments.some((s) => s.kind === 'corkscrew'))!;
    const seg = course.segments.find((s) => s.kind === 'corkscrew')!;
    const mid = course.frameAt((seg.from + seg.to) / 2);
    expect(mid.up.y).toBeLessThan(-0.9);
  });

  it('ジャンプ台の区間だけ浮き、床が途切れる', () => {
    const course = courses.find((c) => c.segments.some((s) => s.kind === 'jump'))!;
    const seg = course.segments.find((s) => s.kind === 'jump')!;
    const mid = (seg.from + seg.to) / 2;
    expect(course.liftAt(mid)).toBeGreaterThan(3);
    expect(course.liftAt(seg.from)).toBeCloseTo(0, 5);
    expect(course.liftAt(seg.to)).toBeCloseTo(0, 5);
    expect(course.liftAt(seg.from - 0.01)).toBe(0);
    expect(course.hasFloorAt(mid)).toBe(false);
    expect(course.hasFloorAt(seg.from - 0.01)).toBe(true);
    expect(course.hasFloorAt(0)).toBe(true);
    expect(course.hasFloorAt(1)).toBe(true);
  });

  it('テーマと区間の並びがレースごとに変わる', () => {
    expect(new Set(courses.map((c) => c.theme)).size).toBe(THEME_IDS.length);
    expect(
      new Set(courses.map((c) => c.segments.map((s) => s.kind).join(','))).size,
    ).toBeGreaterThan(50);
    expect(new Set(courses.map((c) => c.name)).size).toBeGreaterThan(10);
    for (const course of courses) expect(course.name.length).toBeGreaterThan(0);
  });
});
