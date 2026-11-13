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
import { createAttacks } from './attacks';
import {
  PHOTO_SLOW,
  activeCue,
  attackFlight,
  eventFx,
  hookDue,
  rankingVisibleAt,
  shotAt,
  type Shot,
} from './direction';
import {
  COMBO_WINDOW,
  FEVER_FROM,
  activeBox,
  buildBoxes,
  buildHighlights,
  isFever,
  photoState,
  type Box,
  type Highlight,
} from './hype';
import { createItemBoxes } from './item-boxes';
import { laneOffset } from './layout';
import { createRaceClock, createTimeWarp } from './race-clock';
import { createRockets } from './rockets';
import type { Stage } from './stage';
import { currentCourse, trackFrame, type TrackFrame } from './track';

/** 花火と音の差し込み口。各コールバックは該当時刻を過ぎた最初のフレームで 1 回だけ呼ぶ。 */
export type RaceHooks = {
  onCount?(n: 3 | 2 | 1): void;
  onGo?(): void;
  onEvent?(event: RaceEvent): void;
  /** 見せ場（加速・命中・追い抜き）。点数とコンボは飾り。 */
  onHighlight?(highlight: Highlight): void;
  /** アイテム箱を取った瞬間（pick）と、結果が出た瞬間（reveal）。 */
  onBox?(phase: 'pick' | 'reveal', box: Box): void;
  /** フィーバータイムに入った瞬間。 */
  onFever?(): void;
  /** 写真判定のスローに入った。 */
  onPhoto?(): void;
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
const BASE_FOV = 58;
/** 攻撃の着弾後もカメラが被弾機を気にし続ける秒数と、視線を寄せる割合。 */
const ATTACK_LINGER = 0.7;
const ATTACK_PULL = 0.55;
/** フィーバータイム中に広げる画角と、揺れ続ける強さ。 */
const FEVER_FOV = 8;
const FEVER_SHAKE = 0.3;

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
  stage.camera.up.set(0, 1, 0);
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
  cues: readonly Cue[],
  hud: Hud,
  hooks: RaceHooks,
  onDone: () => void,
): { skip(): void } {
  const count = script.racers.length;
  const rockets = createRockets(
    stage,
    script.racers.map((r) => r.name),
  );
  const attacks = createAttacks(stage);
  const highlights = buildHighlights(script);
  const boxes = buildBoxes(script);
  const itemBoxes = createItemBoxes(
    stage,
    boxes.map((box) => {
      // 取る機体が、取る時刻に通る場所へ置く
      const p = progressAt(script.racers[box.racer]!, box.pickT);
      const frame = trackFrame(p);
      const lane = rockets.laneOf(box.racer);
      return {
        pickT: box.pickT,
        position: frame.pos
          .addScaledVector(frame.right, lane.x)
          .addScaledVector(frame.up, lane.y + currentCourse().liftAt(p) + 0.6),
      };
    }),
  );
  const projected = new THREE.Vector3();
  /** 機体の画面上の位置（左上からの割合）。画面の外なら中央やや上。 */
  function screenSpot(racer: number): { x: number; y: number } {
    projected.copy(rockets.positionOf(racer)).project(stage.camera);
    const inside = projected.z < 1 && Math.abs(projected.x) < 0.9 && Math.abs(projected.y) < 0.9;
    return inside ? { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 } : { x: 0.5, y: 0.45 };
  }
  // 写真判定の回は、ゴール前後だけ時間をゆっくり進める（視差軽減の設定ではスローにしない）
  const photoShot = script.photo !== undefined && !stage.reducedMotion;
  const warp = createTimeWarp(TIMELINE.duration, photoShot ? PHOTO_SLOW : null);
  const clock = createRaceClock(() => performance.now(), warp.realDuration);
  const lineupHalfWidth =
    Math.max(...script.racers.map((_, i) => Math.abs(laneOffset(i, count).x))) + 5;

  let done = false;
  let prevT = -1;
  let rankingAt_ = -Infinity;
  let packP = 0;
  let leadP = 0;
  let lastShot: Shot | null = null;
  let shake = 0;
  const lookTarget = new THREE.Vector3();
  /** カメラの上向き。きりもみ区間でコースと一緒に回す。 */
  const cameraUp = new THREE.Vector3(0, 1, 0);
  let attackPull = 0;
  const attackFocus = new THREE.Vector3();
  const crossed = (time: number, t: number) => prevT < time && t >= time;
  /** カメラの位置と上向きに使う「上」。視差軽減の設定では、きりもみでも回さない。 */
  const upOf = (frame: TrackFrame) => (stage.reducedMotion ? frame.levelUp : frame.up);
  const rightOf = (frame: TrackFrame) =>
    stage.reducedMotion
      ? new THREE.Vector3().crossVectors(frame.tangent, frame.levelUp)
      : frame.right;

  function fireHooks(t: number) {
    // 音や揺れの合図は、遅れすぎたら出さない（タブ復帰時に一度に鳴らさない）
    if (hookDue(prevT, t, 0)) hooks.onCount?.(3);
    if (hookDue(prevT, t, 1)) hooks.onCount?.(2);
    if (hookDue(prevT, t, 2)) hooks.onCount?.(1);
    if (hookDue(prevT, t, TIMELINE.countdownEnd)) hooks.onGo?.();
    for (const event of script.events) {
      if (!hookDue(prevT, t, event.t)) continue;
      shake = 1;
      if (event.kind === 'attack' && event.item) {
        shake = 1.8;
        attacks.explode(event.item, rockets.positionOf(event.racer));
      }
      hooks.onEvent?.(event);
    }
    for (const highlight of highlights) {
      if (!hookDue(prevT, t, highlight.t)) continue;
      const spot = screenSpot(highlight.racer);
      hud.popScore(spot.x, spot.y, `+${highlight.points.toLocaleString('en-US')}`);
      if (highlight.kind === 'overtake') {
        const name = script.racers[highlight.racer]?.name ?? '';
        hud.showBanner(`${name} ${highlight.passed ?? 2}人抜き!!`, 'overtake');
        hud.flash();
        shake = Math.max(shake, 1.4);
      }
      hooks.onHighlight?.(highlight);
    }
    for (const box of boxes) {
      if (hookDue(prevT, t, box.pickT)) hooks.onBox?.('pick', box);
      if (hookDue(prevT, t, box.revealT)) {
        if (box.rarity === 'rainbow') hud.flash();
        hooks.onBox?.('reveal', box);
      }
    }
    if (script.photo && hookDue(prevT, t, PHOTO_SLOW.from)) hooks.onPhoto?.();
    const second = script.racers[1];
    if (script.photo && second && hookDue(prevT, t, second.finishTime)) hud.flash();
    if (hookDue(prevT, t, FEVER_FROM)) {
      hud.showBanner('FEVER TIME!!', 'fever');
      hud.flash();
      shake = 1.8;
      hooks.onFever?.();
    }
    const winner = script.racers[0];
    // 1 着ゴールは遅れても必ず知らせる（BGM 停止と花火開始のため）
    if (winner && crossed(winner.finishTime, t)) {
      shake = 1.6;
      hooks.onFirstFinish?.();
    }
  }

  /** 全機を置き、集団の平均と先頭の進行度を返す。 */
  function placeRockets(t: number): { avg: number; lead: number } {
    let sum = 0;
    let lead = 0;
    script.racers.forEach((racer, i) => {
      let p = progressAt(racer, t);
      if (t > racer.finishTime) {
        p = Math.min(OVERRUN_MAX, 1 + (t - racer.finishTime) * OVERRUN_SPEED);
      }
      rockets.setState(i, p, eventFx(script, i, t));
      sum += p;
      lead = Math.max(lead, p);
    });
    return { avg: count > 0 ? sum / count : 0, lead };
  }

  /** 飛んでいる攻撃アイテムを、攻撃した機体から被弾する機体へ運ぶ。 */
  function placeAttacks(t: number, dt: number) {
    let flying = false;
    let watching = false;
    for (const event of script.events) {
      if (event.kind !== 'attack' || event.from === undefined || !event.item) continue;
      const to = rockets.positionOf(event.racer);
      const k = attackFlight(event, t);
      if (k !== null) {
        attacks.fly(event.item, rockets.positionOf(event.from), to, k);
        flying = true;
      }
      if (k !== null || (t >= event.t && t < event.t + ATTACK_LINGER)) {
        attackFocus.copy(to);
        watching = true;
      }
    }
    if (!flying) attacks.hide();
    // カメラの視線を被弾機へ寄せる強さ。急に振らないよう、なめらかに増減させる
    attackPull += ((watching ? ATTACK_PULL : 0) - attackPull) * Math.min(1, dt * 5);
  }

  function placeCamera(t: number, dt: number, avg: number, lead: number) {
    const camera = stage.camera;
    const shot = shotAt(t, photoShot);
    const cut = shot !== lastShot;
    lastShot = shot;
    // カットが変わった瞬間は追従の遅れを捨てて切り替える
    const follow = cut ? 1 : Math.min(1, dt * 4);
    packP += (avg - packP) * follow;
    leadP += (lead - leadP) * follow;
    let fov = BASE_FOV;
    cameraUp.set(0, 1, 0);

    switch (shot) {
      case 'lineup': {
        // 整列カット: 列の正面を横になめる
        const side = ((t / TIMELINE.countdownEnd) * 2 - 1) * lineupHalfWidth;
        const front = trackFrame(0.03);
        const start = trackFrame(0);
        camera.position
          .copy(front.pos)
          .addScaledVector(front.right, side)
          .addScaledVector(front.up, 2.2);
        lookTarget.copy(start.pos).addScaledVector(start.right, side * 0.55);
        break;
      }
      case 'chase': {
        // 追走カット: 集団の少し後ろ上から
        const behind = trackFrame(packP - 0.052);
        camera.position.copy(behind.pos).addScaledVector(upOf(behind), 9.5);
        lookTarget.copy(trackFrame(packP + 0.05).pos);
        cameraUp.copy(upOf(trackFrame(packP)));
        break;
      }
      case 'overhead': {
        // 俯瞰カット: 真上近くから隊列を見下ろす
        const above = trackFrame(packP - 0.03);
        camera.position.copy(above.pos).addScaledVector(upOf(above), 46);
        lookTarget.copy(trackFrame(packP + 0.02).pos);
        // 真下を見るので、画面の上は進行方向にする
        cameraUp.copy(above.tangent);
        break;
      }
      case 'side': {
        // 並走カット: コースの外から横顔を撮る
        const beside = trackFrame(packP + 0.03);
        camera.position
          .copy(beside.pos)
          .addScaledVector(rightOf(beside), 36)
          .addScaledVector(upOf(beside), 6);
        lookTarget.copy(trackFrame(packP - 0.005).pos);
        cameraUp.copy(upOf(beside));
        fov = 50;
        break;
      }
      case 'finalCorner': {
        // 最終コーナー: 先頭の前に回り込み、迫ってくる集団を望遠で撮る（スロー感）
        const ahead = trackFrame(leadP + 0.045);
        camera.position
          .copy(ahead.pos)
          .addScaledVector(upOf(ahead), 3.5)
          .addScaledVector(rightOf(ahead), 9);
        lookTarget.copy(trackFrame(packP + 0.01).pos);
        cameraUp.copy(upOf(ahead));
        fov = 40;
        break;
      }
      case 'goal': {
        // ゴールカット: ゲートの先で待ち構える
        const beyond = trackFrame(1.045);
        camera.position
          .copy(beyond.pos)
          .addScaledVector(beyond.up, 4.5)
          .addScaledVector(beyond.right, 13);
        lookTarget.copy(trackFrame(0.985).pos);
        fov = 52;
        break;
      }
      case 'photo': {
        // 写真判定: ゴール線の真横から望遠で撮る（前後の差がそのまま左右の差に見える）
        const line = trackFrame(1);
        camera.position.copy(line.pos).addScaledVector(line.right, 34).addScaledVector(line.up, 3);
        lookTarget.copy(line.pos).addScaledVector(line.up, 1.5);
        fov = 26;
        break;
      }
      case 'pullback': {
        // 引き: ゲートから空へ（花火へつなぐ）
        const k = Math.min(1, t - 26);
        const beyond = trackFrame(1.045 - k * 0.1);
        camera.position
          .copy(beyond.pos)
          .addScaledVector(beyond.up, 4.5)
          .addScaledVector(beyond.right, 13 * (1 - k));
        const gate = trackFrame(1 + k * 0.02);
        lookTarget.copy(gate.pos).addScaledVector(gate.up, k * 30);
        break;
      }
    }

    if (isFever(t) && !stage.reducedMotion && shot !== 'photo') {
      fov += FEVER_FOV;
      shake = Math.max(shake, FEVER_SHAKE);
    }
    if (camera.fov !== fov) {
      camera.fov = cut ? fov : camera.fov + (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    if (attackPull > 0.001) lookTarget.lerp(attackFocus, attackPull);
    // カットの切り替わり以外は、上向きをなめらかに追わせる
    camera.up.lerp(cameraUp, cut ? 1 : Math.min(1, dt * 6)).normalize();
    camera.lookAt(lookTarget);

    // イベント発生時の画面揺れ
    shake = Math.max(0, shake - dt * 3);
    if (shake > 0 && !stage.reducedMotion && shot !== 'photo') {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
  }

  /** その時刻の状態から決まる表示（コンボ・累計点・ルーレット・フィーバー）。時間が飛んでも食い違わない。 */
  function showHype(t: number) {
    const last = highlights.findLast((h) => h.t <= t);
    if (last) hud.setScore(last.total);
    hud.setCombo(last && t - last.t <= COMBO_WINDOW ? last.combo : 0);
    const box = activeBox(boxes, t);
    const name = box ? (script.racers[box.racer]?.name ?? '') : '';
    hud.setRoulette(
      !box ? null : t < box.revealT ? { name } : { name, label: box.label, rarity: box.rarity },
    );
    hud.setFever(isFever(t) && !warp.slowAt(t));
    hud.setPhoto(photoState(script, t));
    itemBoxes.update(t);
  }

  function finish(skipped: boolean) {
    if (done) return;
    done = true;
    stop();
    rockets.dispose();
    attacks.dispose();
    itemBoxes.dispose();
    stage.camera.fov = BASE_FOV;
    stage.camera.up.set(0, 1, 0);
    stage.camera.updateProjectionMatrix();
    hooks.onEnd?.(skipped);
    onDone();
  }

  const stop = stage.onFrame((dt) => {
    const t = clock.finished() ? TIMELINE.duration : warp.toRace(clock.elapsed());
    fireHooks(t);
    hud.setCountdown(countdownText(t));
    hud.setCourseName(t < TIMELINE.countdownEnd ? currentCourse().name : null);
    if (rankingVisibleAt(t) && t - rankingAt_ >= RANKING_INTERVAL) {
      rankingAt_ = t;
      hud.setRanking(rankingAt(script, t).map((i) => script.racers[i]!));
    }
    hud.setTelop(activeCue(cues, t));
    showHype(t);
    const { avg, lead } = placeRockets(t);
    placeAttacks(t, dt);
    placeCamera(t, dt, avg, lead);
    prevT = t;
    if (clock.finished()) finish(false);
  });

  return {
    skip() {
      finish(true);
    },
  };
}
