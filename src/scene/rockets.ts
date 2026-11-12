import * as THREE from 'three';
import { laneOffset, nameTagText, pickVehicles } from './layout';
import type { Stage } from './stage';
import { glowTexture, labelTexture } from './textures';
import { trackFrame } from './track';
import { buildVehicle, createVehiclePalette } from './vehicles';

/** 各 0〜1。spin: 回転、boost: 加速、sway: ふらつき。 */
export type RocketFx = { spin: number; boost: number; sway: number };
export type Rockets = {
  /** i 番目（台本の racer 添字）をコース上 p に置く。 */
  setState(i: number, p: number, fx: RocketFx): void;
  /** i 番目の機体の現在位置（直前の setState の結果）。呼び出し側で書き換えないこと。 */
  positionOf(i: number): THREE.Vector3;
  dispose(): void;
};

const TRAIL_MAX = 2400;
const TAG_HEIGHT = 1.7;
const SPIN_TURNS = 3;
const MODEL_SCALE = 1.35;
/** 遠くの名札も読めるよう、距離に応じて拡大する（最大倍率まで）。 */
const TAG_NEAR = 30;
const TAG_MAX_BOOST = 3.4;

type Rocket = {
  body: THREE.Group;
  flame: THREE.Mesh;
  tag: THREE.Sprite;
  tagAspect: number;
  /** 中心から噴射口までの距離。 */
  tailOffset: number;
  lane: { x: number; y: number };
  color: THREE.Color;
  phase: number;
  tail: THREE.Vector3;
  back: THREE.Vector3;
  boost: number;
  emitDebt: number;
};

function shuffledIndices(count: number): number[] {
  const out = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function createRockets(stage: Stage, names: readonly string[]): Rockets {
  const count = names.length;
  const group = new THREE.Group();
  const tags = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const palette = createVehiclePalette(keep);

  // レーン順から結果が読めないよう、並び順と色はランダムにする
  const lanes = shuffledIndices(count);
  const hues = shuffledIndices(count);
  // 乗り物も毎回ランダム（見た目だけで、順位には関係しない）
  const kinds = pickVehicles(count, Math.random);

  const rockets: Rocket[] = names.map((name, i) => {
    const color = new THREE.Color().setHSL(hues[i]! / count, 0.95, 0.56);
    const bodyMaterial = keep(
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.34,
        roughness: 0.4,
        metalness: 0.25,
      }),
    );

    const { model, flame, tail } = buildVehicle(kinds[i]!, bodyMaterial, palette, keep);
    model.scale.setScalar(MODEL_SCALE);

    const body = new THREE.Group();
    body.add(model);
    group.add(body);

    const label = labelTexture(nameTagText(name), {
      color: '#ffffff',
      background: 'rgba(8,4,26,0.86)',
      border: `#${color.getHexString()}`,
    });
    keep(label.texture);
    const tag = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: label.texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      ),
    );
    tag.scale.set(TAG_HEIGHT * label.aspect, TAG_HEIGHT, 1);
    tag.renderOrder = 10;
    tags.add(tag);

    return {
      body,
      flame,
      tag,
      tagAspect: label.aspect,
      tailOffset: tail * MODEL_SCALE,
      lane: laneOffset(lanes[i]!, count),
      color,
      phase: Math.random() * Math.PI * 2,
      tail: new THREE.Vector3(),
      back: new THREE.Vector3(0, 0, 1),
      boost: 0,
      emitDebt: 0,
    };
  });

  // 噴射炎の粒子（全機で 1 つのバッファを使い回す）
  const trailPositions = new Float32Array(TRAIL_MAX * 3);
  const trailColors = new Float32Array(TRAIL_MAX * 3);
  const velocity = new Float32Array(TRAIL_MAX * 3);
  const life = new Float32Array(TRAIL_MAX);
  const lifeMax = new Float32Array(TRAIL_MAX);
  const baseColor = new Float32Array(TRAIL_MAX * 3);
  trailPositions.fill(1e6);
  const trailGeometry = keep(new THREE.BufferGeometry());
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailTexture = keep(glowTexture());
  const trail = new THREE.Points(
    trailGeometry,
    keep(
      new THREE.PointsMaterial({
        size: 1.5,
        map: trailTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  trail.frustumCulled = false;
  group.add(trail);
  let cursor = 0;
  const white = new THREE.Color(0xffffff);
  const tint = new THREE.Color();

  function emit(rocket: Rocket) {
    const i = cursor;
    cursor = (cursor + 1) % TRAIL_MAX;
    const spread = 0.35;
    trailPositions[i * 3] = rocket.tail.x + (Math.random() - 0.5) * spread;
    trailPositions[i * 3 + 1] = rocket.tail.y + (Math.random() - 0.5) * spread;
    trailPositions[i * 3 + 2] = rocket.tail.z + (Math.random() - 0.5) * spread;
    const speed = 5 + Math.random() * 6 + rocket.boost * 10;
    velocity[i * 3] = rocket.back.x * speed + (Math.random() - 0.5) * 1.6;
    velocity[i * 3 + 1] = rocket.back.y * speed + (Math.random() - 0.5) * 1.6;
    velocity[i * 3 + 2] = rocket.back.z * speed + (Math.random() - 0.5) * 1.6;
    tint
      .copy(rocket.color)
      .lerp(white, 0.2 + Math.random() * 0.3)
      .multiplyScalar(0.55);
    baseColor.set([tint.r, tint.g, tint.b], i * 3);
    lifeMax[i] = 0.45 + Math.random() * 0.45 + rocket.boost * 0.4;
    life[i] = lifeMax[i]!;
  }

  let clock = 0;
  const stop = stage.onFrame((dt) => {
    clock += dt;
    for (const rocket of rockets) {
      rocket.emitDebt += dt * (26 + rocket.boost * 90);
      while (rocket.emitDebt >= 1) {
        rocket.emitDebt -= 1;
        emit(rocket);
      }
    }
    for (let i = 0; i < TRAIL_MAX; i++) {
      const remaining = life[i]!;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      life[i] = next;
      if (next <= 0) {
        trailPositions[i * 3] = 1e6;
        continue;
      }
      trailPositions[i * 3] = trailPositions[i * 3]! + velocity[i * 3]! * dt;
      trailPositions[i * 3 + 1] = trailPositions[i * 3 + 1]! + velocity[i * 3 + 1]! * dt;
      trailPositions[i * 3 + 2] = trailPositions[i * 3 + 2]! + velocity[i * 3 + 2]! * dt;
      const fade = next / lifeMax[i]!;
      trailColors[i * 3] = baseColor[i * 3]! * fade;
      trailColors[i * 3 + 1] = baseColor[i * 3 + 1]! * fade;
      trailColors[i * 3 + 2] = baseColor[i * 3 + 2]! * fade;
    }
    trailGeometry.attributes.position!.needsUpdate = true;
    trailGeometry.attributes.color!.needsUpdate = true;
  });

  stage.scene.add(group);
  stage.overlay.add(tags);
  const target = new THREE.Vector3();
  const origin = new THREE.Vector3();

  return {
    setState(i, p, fx) {
      const rocket = rockets[i];
      if (!rocket) return;
      const frame = trackFrame(p);
      const wobble = stage.reducedMotion ? 0.4 : 1;
      const swayX = Math.sin(clock * 7 + rocket.phase) * fx.sway * 1.5 * wobble;
      const bob = Math.sin(clock * 2.3 + rocket.phase) * 0.16;

      rocket.body.position
        .copy(frame.pos)
        .addScaledVector(frame.right, rocket.lane.x + swayX)
        .addScaledVector(frame.up, rocket.lane.y + bob);
      rocket.body.up.copy(frame.up);
      rocket.body.lookAt(target.copy(rocket.body.position).add(frame.tangent));
      const roll =
        (fx.spin > 0 ? (1 - fx.spin) * Math.PI * 2 * SPIN_TURNS : 0) +
        Math.cos(clock * 7 + rocket.phase) * fx.sway * 0.55 * wobble;
      rocket.body.rotateZ(roll);

      const flicker = 0.85 + Math.random() * 0.3;
      rocket.flame.scale.set(
        1 + fx.boost * 0.6,
        (1 + fx.boost * 2.4) * flicker,
        1 + fx.boost * 0.6,
      );
      rocket.boost = fx.boost;
      rocket.back.copy(frame.tangent).negate();
      rocket.tail.copy(rocket.body.position).addScaledVector(rocket.back, rocket.tailOffset);

      const tagSide = rocket.lane.y < 0 ? -1 : 1;
      const distance = stage.camera.position.distanceTo(rocket.body.position);
      const zoom = Math.min(TAG_MAX_BOOST, Math.max(1, distance / TAG_NEAR));
      rocket.tag.scale.set(TAG_HEIGHT * rocket.tagAspect * zoom, TAG_HEIGHT * zoom, 1);
      rocket.tag.position
        .copy(rocket.body.position)
        .addScaledVector(frame.up, tagSide * (1.5 + TAG_HEIGHT * zoom * 0.62));
    },
    positionOf(i) {
      return rockets[i]?.body.position ?? origin;
    },
    dispose() {
      stop();
      stage.scene.remove(group);
      stage.overlay.remove(tags);
      for (const item of disposables) item.dispose();
    },
  };
}
