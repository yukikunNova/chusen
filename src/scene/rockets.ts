import * as THREE from 'three';
import { laneOffset, nameTagText } from './layout';
import type { Stage } from './stage';
import { glowTexture, labelTexture } from './textures';
import { trackFrame } from './track';

/** 各 0〜1。spin: 回転、boost: 加速、sway: ふらつき。 */
export type RocketFx = { spin: number; boost: number; sway: number };
export type Rockets = {
  /** i 番目（台本の racer 添字）をコース上 p に置く。 */
  setState(i: number, p: number, fx: RocketFx): void;
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

  // 機首が +Z を向く形で作り、lookAt で進行方向へ向ける
  const bodyGeometry = keep(new THREE.CylinderGeometry(0.62, 0.5, 2.3, 20));
  const noseGeometry = keep(new THREE.ConeGeometry(0.62, 1.25, 20));
  const finGeometry = keep(new THREE.BoxGeometry(0.1, 0.95, 1.15));
  const windowGeometry = keep(new THREE.SphereGeometry(0.3, 16, 12));
  const nozzleGeometry = keep(new THREE.CylinderGeometry(0.38, 0.55, 0.45, 16));
  const flameGeometry = keep(new THREE.ConeGeometry(0.42, 2.2, 14));
  const windowMaterial = keep(
    new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x29e0ff, emissiveIntensity: 0.7 }),
  );
  const nozzleMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x2b2b3a, metalness: 0.6 }));
  const noseMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xd8dcf0, roughness: 0.45 }));
  const flameMaterial = keep(
    new THREE.MeshBasicMaterial({
      color: 0xffa52e,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // レーン順から結果が読めないよう、並び順と色はランダムにする
  const lanes = shuffledIndices(count);
  const hues = shuffledIndices(count);

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

    const model = new THREE.Group();
    const hull = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 1.775;
    const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
    nozzle.position.y = -1.35;
    const porthole = new THREE.Mesh(windowGeometry, windowMaterial);
    porthole.position.set(0, 0.45, 0.5);
    model.add(hull, nose, nozzle, porthole);
    for (let k = 0; k < 3; k++) {
      const pivot = new THREE.Group();
      const fin = new THREE.Mesh(finGeometry, bodyMaterial);
      fin.position.set(0, -0.85, 0.95);
      pivot.add(fin);
      pivot.rotation.y = (k * Math.PI * 2) / 3;
      model.add(pivot);
    }
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.rotation.x = Math.PI;
    flame.position.y = -2.6;
    model.add(flame);
    model.rotation.x = Math.PI / 2;
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
      rocket.tail.copy(rocket.body.position).addScaledVector(rocket.back, 2.2 * MODEL_SCALE);

      const tagSide = rocket.lane.y < 0 ? -1 : 1;
      const distance = stage.camera.position.distanceTo(rocket.body.position);
      const zoom = Math.min(TAG_MAX_BOOST, Math.max(1, distance / TAG_NEAR));
      rocket.tag.scale.set(TAG_HEIGHT * rocket.tagAspect * zoom, TAG_HEIGHT * zoom, 1);
      rocket.tag.position
        .copy(rocket.body.position)
        .addScaledVector(frame.up, tagSide * (1.5 + TAG_HEIGHT * zoom * 0.62));
    },
    dispose() {
      stop();
      stage.scene.remove(group);
      stage.overlay.remove(tags);
      for (const item of disposables) item.dispose();
    },
  };
}
