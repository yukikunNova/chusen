import * as THREE from 'three';
import type { Stage } from './stage';
import { glowTexture } from './textures';

/** 花火の粒子数の上限。固定長バッファを使い回す。 */
export const MAX_PARTICLES = 6000;

/** 打ち上げ間隔（秒）。最初の 30 秒は連発し、その後は控えめにする。 */
export function launchInterval(secondsSinceFirst: number): number {
  return secondsSinceFirst < 30 ? 0.35 : 2.5;
}

export type Fireworks = {
  /** 打ち上げ開始。すでに始まっていれば何もしない。 */
  start(): void;
  /** 打ち上げを止める（空中の花火は消えるまで残る）。 */
  stop(): void;
  /** 大玉を一斉に打ち上げる。 */
  salvo(): void;
  burstConfetti(): void;
  dispose(): void;
};

type Shell = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  color: THREE.Color;
  kind: 'sphere' | 'ring' | 'willow';
  /** 大玉。粒が多く、大きく開く。 */
  big: boolean;
  trailDebt: number;
};

const GRAVITY = 14;
const CONFETTI_COUNT = 520;
/** 開幕の一斉打ち上げの数と、通常打ち上げで大玉になる割合。 */
const SALVO = 6;
const BIG_RATE = 0.3;
const CONFETTI_COLORS = [0xff2e93, 0x29e0ff, 0xffd60a, 0x9d4dff, 0x4dff88, 0xffffff];

export function createFireworks(stage: Stage, onBurst?: () => void): Fireworks {
  const positions = new Float32Array(MAX_PARTICLES * 3).fill(1e6);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const base = new Float32Array(MAX_PARTICLES * 3);
  const velocity = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const lifeMax = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES);
  const fall = new Float32Array(MAX_PARTICLES);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sprite = glowTexture();
  const material = new THREE.PointsMaterial({
    size: 14,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  stage.scene.add(points);

  // 紙吹雪はカメラの前の空間に降らせる（カットが変わっても画面に残る）
  const confettiPositions = new Float32Array(CONFETTI_COUNT * 3).fill(1e6);
  const confettiColors = new Float32Array(CONFETTI_COUNT * 3);
  const confettiPhase = new Float32Array(CONFETTI_COUNT);
  const confettiSpeed = new Float32Array(CONFETTI_COUNT);
  const confettiGeometry = new THREE.BufferGeometry();
  confettiGeometry.setAttribute('position', new THREE.BufferAttribute(confettiPositions, 3));
  confettiGeometry.setAttribute('color', new THREE.BufferAttribute(confettiColors, 3));
  const confettiMaterial = new THREE.PointsMaterial({
    size: 0.36,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const confetti = new THREE.Points(confettiGeometry, confettiMaterial);
  confetti.frustumCulled = false;
  confetti.renderOrder = 6;
  confetti.visible = false;
  stage.overlay.add(confetti);
  let confettiTime = Infinity;

  let cursor = 0;
  const shells: Shell[] = [];
  let running = false;
  let sinceFirst = 0;
  let untilNext = 0;
  const tmp = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  /** 打ち上げの軌跡の色（白飛びしない程度の金色）。 */
  const trailColor = new THREE.Color(0x8a6a2a);
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();

  function spawn(
    pos: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    seconds: number,
    airDrag: number,
    gravityScale: number,
  ) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    positions.set([pos.x, pos.y, pos.z], i * 3);
    velocity.set([vx, vy, vz], i * 3);
    base.set([color.r, color.g, color.b], i * 3);
    life[i] = seconds;
    lifeMax[i] = seconds;
    drag[i] = airDrag;
    fall[i] = gravityScale;
  }

  function launch(big = Math.random() < BIG_RATE) {
    // カメラの前方、左右に散らした位置から打ち上げる
    stage.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    side.set(-forward.z, 0, forward.x);
    // 大玉は手前に上げて画面いっぱいに開かせる
    const distance = big ? 90 + Math.random() * 70 : 100 + Math.random() * 160;
    const lateral = (Math.random() - 0.5) * distance * (big ? 0.9 : 1.35);
    const pos = stage.camera.position
      .clone()
      .addScaledVector(forward, distance)
      .addScaledVector(side, lateral);
    pos.y = stage.camera.position.y - 12;
    const fuse = 0.85 + Math.random() * 0.45;
    const rise = 85 + Math.random() * 60;
    const kinds = ['sphere', 'sphere', 'ring', 'willow'] as const;
    shells.push({
      pos,
      vel: new THREE.Vector3((Math.random() - 0.5) * 8, rise, (Math.random() - 0.5) * 8),
      fuse,
      color: new THREE.Color().setHSL(Math.random(), 1, 0.6),
      kind: kinds[Math.floor(Math.random() * kinds.length)]!,
      big,
      trailDebt: 0,
    });
  }

  function burst(shell: Shell) {
    const count = shell.big
      ? 520 + Math.floor(Math.random() * 160)
      : 200 + Math.floor(Math.random() * 150);
    const speed = shell.big ? 78 + Math.random() * 24 : 42 + Math.random() * 26;
    const long = shell.big ? 1.5 : 1;
    const second = new THREE.Color().setHSL(Math.random(), 1, 0.62);
    // リング花火の向き
    const tilt = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    const dir = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      if (shell.kind === 'ring') {
        const a = (n / count) * Math.PI * 2;
        dir.set(Math.cos(a), Math.sin(a), 0).applyEuler(tilt);
      } else {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        dir.set(s * Math.cos(a), u, s * Math.sin(a));
      }
      const v = speed * (shell.kind === 'ring' ? 1 : 0.55 + Math.random() * 0.45);
      tmp
        .copy(n % 3 === 0 ? second : shell.color)
        .lerp(white, Math.random() * 0.2)
        // 大玉は粒が重なって白飛びしやすいので暗めにする
        .multiplyScalar(shell.big ? 0.5 : 0.8);
      if (shell.kind === 'willow') {
        spawn(
          shell.pos,
          dir.x * v * 0.6,
          dir.y * v * 0.6,
          dir.z * v * 0.6,
          tmp,
          (2.6 + Math.random() * 0.9) * long,
          1.1,
          1.5,
        );
      } else {
        const seconds = (1.5 + Math.random() * 0.9) * long;
        spawn(shell.pos, dir.x * v, dir.y * v, dir.z * v, tmp, seconds, 1.7, 1);
      }
    }
    if (shell.big) {
      // 大玉は芯にもう 1 色の小さい玉を重ねる
      tmp.copy(second).lerp(white, 0.35).multiplyScalar(0.5);
      for (let n = 0; n < 140; n++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const v = speed * 0.38;
        spawn(shell.pos, s * Math.cos(a) * v, u * v, s * Math.sin(a) * v, tmp, 2.2, 1.7, 0.6);
      }
    }
    // 中心の閃光
    const flash = shell.big ? 20 : 6;
    for (let n = 0; n < (shell.big ? 22 : 14); n++) {
      spawn(
        shell.pos,
        (Math.random() - 0.5) * flash,
        (Math.random() - 0.5) * flash,
        (Math.random() - 0.5) * flash,
        white,
        shell.big ? 0.5 : 0.35,
        3,
        0,
      );
    }
    onBurst?.();
  }

  function resetConfetti() {
    const color = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      confettiPositions.set(
        [(Math.random() - 0.5) * 46, 10 + Math.random() * 26, -9 - Math.random() * 22],
        i * 3,
      );
      color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!);
      confettiColors.set([color.r, color.g, color.b], i * 3);
      confettiPhase[i] = Math.random() * Math.PI * 2;
      confettiSpeed[i] = 5 + Math.random() * 5;
    }
    confettiGeometry.attributes.color!.needsUpdate = true;
  }

  const stopFrame = stage.onFrame((dt) => {
    if (running) {
      sinceFirst += dt;
      untilNext -= dt;
      while (untilNext <= 0) {
        launch();
        untilNext += launchInterval(sinceFirst);
      }
    }

    // 打ち上げ中の玉（軌跡を残して上がり、導火線が尽きたら炸裂）
    for (let s = shells.length - 1; s >= 0; s--) {
      const shell = shells[s]!;
      shell.fuse -= dt;
      shell.vel.y -= GRAVITY * dt;
      shell.pos.addScaledVector(shell.vel, dt);
      shell.trailDebt += dt * 70;
      while (shell.trailDebt >= 1) {
        shell.trailDebt -= 1;
        spawn(
          shell.pos,
          (Math.random() - 0.5) * 3,
          -4 - Math.random() * 6,
          (Math.random() - 0.5) * 3,
          trailColor,
          0.45,
          2,
          0.3,
        );
      }
      if (shell.fuse <= 0) {
        burst(shell);
        shells.splice(s, 1);
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const remaining = life[i]!;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      life[i] = next;
      const o = i * 3;
      if (next <= 0) {
        positions[o] = 1e6;
        continue;
      }
      const slow = Math.max(0, 1 - drag[i]! * dt);
      velocity[o] = velocity[o]! * slow;
      velocity[o + 1] = velocity[o + 1]! * slow - GRAVITY * fall[i]! * dt;
      velocity[o + 2] = velocity[o + 2]! * slow;
      positions[o] = positions[o]! + velocity[o]! * dt;
      positions[o + 1] = positions[o + 1]! + velocity[o + 1]! * dt;
      positions[o + 2] = positions[o + 2]! + velocity[o + 2]! * dt;
      // 尾を引いて消え、消え際にちらつく
      const k = next / lifeMax[i]!;
      const twinkle = k < 0.35 && !stage.reducedMotion ? 0.45 + Math.random() * 0.55 : 1;
      const fade = Math.min(1, k * 1.6) * twinkle;
      colors[o] = base[o]! * fade;
      colors[o + 1] = base[o + 1]! * fade;
      colors[o + 2] = base[o + 2]! * fade;
    }
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;

    if (confettiTime < 9) {
      confettiTime += dt;
      confetti.position.copy(stage.camera.position);
      confetti.quaternion.copy(stage.camera.quaternion);
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        const o = i * 3;
        confettiPositions[o] =
          confettiPositions[o]! + Math.sin(confettiTime * 3 + confettiPhase[i]!) * dt * 2.4;
        confettiPositions[o + 1] = confettiPositions[o + 1]! - confettiSpeed[i]! * dt;
      }
      confettiGeometry.attributes.position!.needsUpdate = true;
      confettiMaterial.opacity = Math.min(1, (9 - confettiTime) / 2);
    } else if (confetti.visible) {
      confetti.visible = false;
    }
  });

  return {
    start() {
      if (running) return;
      running = true;
      sinceFirst = 0;
      untilNext = 0;
    },
    stop() {
      running = false;
    },
    salvo() {
      for (let n = 0; n < SALVO; n++) launch(true);
    },
    burstConfetti() {
      resetConfetti();
      confettiTime = 0;
      confetti.visible = true;
    },
    dispose() {
      stopFrame();
      stage.scene.remove(points);
      stage.overlay.remove(confetti);
      geometry.dispose();
      material.dispose();
      sprite.dispose();
      confettiGeometry.dispose();
      confettiMaterial.dispose();
    },
  };
}
