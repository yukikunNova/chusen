import * as THREE from 'three';
import type { Cue } from '../domain/commentary';
import {
  TIMELINE,
  progressAt,
  rankingAt,
  type RaceEvent,
  type RaceScript,
} from '../domain/race-script';
import type { Hud } from '../ui/hud';
import { laneOffset } from './layout';
import { createRaceClock } from './race-clock';
import { createRockets } from './rockets';
import type { Stage } from './stage';
import { trackFrame } from './track';

/** 花火と音の差し込み口。各コールバックは該当時刻を過ぎた最初のフレームで 1 回だけ呼ぶ。 */
export type RaceHooks = {
  onCount?(n: 3 | 2 | 1): void;
  onGo?(): void;
  onEvent?(event: RaceEvent): void;
  /** 1 着がゴール線を越えた瞬間。スキップ時は呼ばれない。 */
  onFirstFinish?(): void;
  /** onDone の直前。 */
  onEnd?(skipped: boolean): void;
};

const GO_UNTIL = 3.8;
const RANKING_INTERVAL = 0.25;
/** ゴール後もそのまま走り抜ける速さ（進行度 / 秒）と上限。 */
const OVERRUN_SPEED = 0.045;
const OVERRUN_MAX = 1.09;
const NO_FX = { spin: 0, boost: 0, sway: 0 };

function countdownText(t: number): string | null {
  if (t < 1) return '3';
  if (t < 2) return '2';
  if (t < TIMELINE.countdownEnd) return '1';
  if (t < GO_UNTIL) return 'GO!';
  return null;
}

/** レース外（名簿・結果画面）のゆっくり漂うカメラ。 */
export function idleCamera(stage: Stage, where: 'start' | 'goal', time: number) {
  const drift = stage.reducedMotion ? 0 : 1;
  if (where === 'start') {
    const f = trackFrame(-0.035);
    stage.camera.position
      .copy(f.pos)
      .addScaledVector(f.up, 9 + Math.sin(time * 0.21) * 2 * drift)
      .addScaledVector(f.right, Math.sin(time * 0.13) * 10 * drift);
    stage.camera.lookAt(trackFrame(0.09).pos);
  } else {
    const f = trackFrame(0.93);
    stage.camera.position
      .copy(f.pos)
      .addScaledVector(f.up, 4 + Math.sin(time * 0.17) * 1.5 * drift)
      .addScaledVector(f.right, Math.sin(time * 0.11) * 12 * drift);
    const look = trackFrame(1.02);
    stage.camera.lookAt(look.pos.addScaledVector(look.up, 30));
  }
}

/** 台本を実時間に沿って再生する。結果は台本で決まっており、ここでは変わらない。 */
export function playRace(
  stage: Stage,
  script: RaceScript,
  _cues: readonly Cue[],
  hud: Hud,
  hooks: RaceHooks,
  onDone: () => void,
): { skip(): void } {
  const count = script.racers.length;
  const rockets = createRockets(
    stage,
    script.racers.map((r) => r.name),
  );
  const clock = createRaceClock(() => performance.now(), TIMELINE.duration);
  const lineupHalfWidth =
    Math.max(...script.racers.map((_, i) => Math.abs(laneOffset(i, count).x))) + 5;

  let done = false;
  let prevT = -1;
  let rankingAt_ = -Infinity;
  let packP = 0;
  const lookTarget = new THREE.Vector3();
  const crossed = (time: number, t: number) => prevT < time && t >= time;

  function fireHooks(t: number) {
    if (crossed(0, t)) hooks.onCount?.(3);
    if (crossed(1, t)) hooks.onCount?.(2);
    if (crossed(2, t)) hooks.onCount?.(1);
    if (crossed(TIMELINE.countdownEnd, t)) hooks.onGo?.();
    for (const event of script.events) if (crossed(event.t, t)) hooks.onEvent?.(event);
    const winner = script.racers[0];
    if (winner && crossed(winner.finishTime, t)) hooks.onFirstFinish?.();
  }

  function placeRockets(t: number): number {
    let sum = 0;
    script.racers.forEach((racer, i) => {
      let p = progressAt(racer, t);
      if (t > racer.finishTime) {
        p = Math.min(OVERRUN_MAX, 1 + (t - racer.finishTime) * OVERRUN_SPEED);
      }
      rockets.setState(i, p, NO_FX);
      sum += p;
    });
    return count > 0 ? sum / count : 0;
  }

  function placeCamera(t: number, dt: number, avg: number) {
    const camera = stage.camera;
    if (t < TIMELINE.countdownEnd) {
      // 整列カット: 列の正面を横になめる
      const k = t / TIMELINE.countdownEnd;
      const side = (k * 2 - 1) * lineupHalfWidth;
      const front = trackFrame(0.03);
      const start = trackFrame(0);
      camera.position
        .copy(front.pos)
        .addScaledVector(front.right, side)
        .addScaledVector(front.up, 2.2);
      camera.lookAt(lookTarget.copy(start.pos).addScaledVector(start.right, side * 0.55));
      packP = avg;
      return;
    }
    // 追走カット: 集団の少し後ろ上から
    packP += (avg - packP) * Math.min(1, dt * 4);
    const behind = trackFrame(packP - 0.052);
    camera.position.copy(behind.pos).addScaledVector(behind.up, 9.5);
    camera.lookAt(trackFrame(packP + 0.05).pos);
  }

  function finish(skipped: boolean) {
    if (done) return;
    done = true;
    stop();
    rockets.dispose();
    hooks.onEnd?.(skipped);
    onDone();
  }

  const stop = stage.onFrame((dt) => {
    const t = clock.elapsed();
    fireHooks(t);
    hud.setCountdown(countdownText(t));
    if (t - rankingAt_ >= RANKING_INTERVAL) {
      rankingAt_ = t;
      hud.setRanking(rankingAt(script, t).map((i) => script.racers[i]!));
    }
    const avg = placeRockets(t);
    placeCamera(t, dt, avg);
    prevT = t;
    if (clock.finished()) finish(false);
  });

  return {
    skip() {
      finish(true);
    },
  };
}
