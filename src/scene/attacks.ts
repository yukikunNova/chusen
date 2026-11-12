import * as THREE from 'three';
import type { AttackItem } from '../domain/race-script';
import type { Stage } from './stage';
import { emojiTexture, glowTexture } from './textures';

/** 攻撃アイテムの弾と爆発。台本上、同時に飛ぶ弾は 1 つだけ。 */
export type Attacks = {
  /** 飛行中の弾を置く。k は 0（発射）〜1（着弾）。 */
  fly(item: AttackItem, from: THREE.Vector3, to: THREE.Vector3, k: number): void;
  /** 弾を消す。 */
  hide(): void;
  /** 着弾の爆発。 */
  explode(item: AttackItem, at: THREE.Vector3): void;
  dispose(): void;
};

const MAX_SPARKS = 1200;
/** 着弾の閃光が広がりきるまでの秒数と最大の大きさ。 */
const FLASH_SECONDS = 0.45;
const FLASH_SIZE = 46;
const STYLE: Record<AttackItem, { emoji: string; color: number }> = {
  missile: { emoji: '🚀', color: 0xff5a2e },
  bomb: { emoji: '💣', color: 0xc04dff },
  thunder: { emoji: '⚡', color: 0xffe14d },
};
const ITEMS = Object.keys(STYLE) as AttackItem[];
/** 爆弾の山なりの高さと、落雷が降ってくる高さ。 */
const BOMB_ARC = 13;
const THUNDER_HEIGHT = 55;
const BOLT_SECONDS = 0.35;
const BOLT_POINTS = 12;
const ICON_SIZE = 4.2;

export function createAttacks(stage: Stage): Attacks {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const group = new THREE.Group();
  const overlay = new THREE.Group();

  // 弾: 発光する光球（ブルーム対象）+ 絵文字（発光させず overlay に重ねる）
  const glowMap = keep(glowTexture());
  const glow = new THREE.Sprite(
    keep(
      new THREE.SpriteMaterial({
        map: glowMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    ),
  );
  glow.scale.setScalar(9);
  glow.visible = false;
  group.add(glow);

  const flash = new THREE.Sprite(
    keep(
      new THREE.SpriteMaterial({
        map: glowMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    ),
  );
  flash.visible = false;
  group.add(flash);
  let flashLeft = 0;

  const icons = new Map<AttackItem, THREE.Sprite>();
  for (const item of ITEMS) {
    const icon = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: keep(emojiTexture(STYLE[item].emoji)),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      ),
    );
    icon.renderOrder = 11;
    icon.visible = false;
    icons.set(item, icon);
    overlay.add(icon);
  }

  // 落雷の稲妻
  const boltPositions = new Float32Array(BOLT_POINTS * 3);
  const boltGeometry = keep(new THREE.BufferGeometry());
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3));
  const bolt = new THREE.Line(
    boltGeometry,
    keep(new THREE.LineBasicMaterial({ color: 0xfff6b0, fog: false })),
  );
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);
  let boltLeft = 0;
  const boltTarget = new THREE.Vector3();

  // 火花（弾の尾と爆発で共用）
  const positions = new Float32Array(MAX_SPARKS * 3).fill(1e6);
  const colors = new Float32Array(MAX_SPARKS * 3);
  const base = new Float32Array(MAX_SPARKS * 3);
  const velocity = new Float32Array(MAX_SPARKS * 3);
  const life = new Float32Array(MAX_SPARKS);
  const lifeMax = new Float32Array(MAX_SPARKS);
  const sparkGeometry = keep(new THREE.BufferGeometry());
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sparks = new THREE.Points(
    sparkGeometry,
    keep(
      new THREE.PointsMaterial({
        size: 3.6,
        map: glowMap,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    ),
  );
  sparks.frustumCulled = false;
  group.add(sparks);
  let cursor = 0;
  const tint = new THREE.Color();
  const white = new THREE.Color(0xffffff);

  function spark(
    at: { x: number; y: number; z: number },
    speed: number,
    seconds: number,
    color: THREE.Color,
  ) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_SPARKS;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const v = speed * (0.35 + Math.random() * 0.65);
    positions.set([at.x, at.y, at.z], i * 3);
    velocity.set([s * Math.cos(a) * v, u * v, s * Math.sin(a) * v], i * 3);
    base.set([color.r, color.g, color.b], i * 3);
    life[i] = seconds;
    lifeMax[i] = seconds;
  }

  function redrawBolt() {
    // 上空から着弾点まで、毎フレーム形の変わるジグザグ
    for (let n = 0; n < BOLT_POINTS; n++) {
      const k = n / (BOLT_POINTS - 1);
      const jitter = n === BOLT_POINTS - 1 ? 0 : 5;
      boltPositions.set(
        [
          boltTarget.x + (Math.random() - 0.5) * jitter,
          boltTarget.y + (1 - k) * THUNDER_HEIGHT,
          boltTarget.z + (Math.random() - 0.5) * jitter,
        ],
        n * 3,
      );
    }
    boltGeometry.attributes.position!.needsUpdate = true;
  }

  /** 稲妻の線に沿って光の粒を並べ、太く見せる。 */
  function glowBolt(color: THREE.Color) {
    const at = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < BOLT_POINTS - 1; n++) {
      for (let m = 0; m < 6; m++) {
        const k = m / 6;
        const a = n * 3;
        at.x = boltPositions[a]! + (boltPositions[a + 3]! - boltPositions[a]!) * k;
        at.y = boltPositions[a + 1]! + (boltPositions[a + 4]! - boltPositions[a + 1]!) * k;
        at.z = boltPositions[a + 2]! + (boltPositions[a + 5]! - boltPositions[a + 2]!) * k;
        spark(at, 1.5, BOLT_SECONDS, color);
      }
    }
  }

  const stop = stage.onFrame((dt) => {
    for (let i = 0; i < MAX_SPARKS; i++) {
      const remaining = life[i]!;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      life[i] = next;
      const o = i * 3;
      if (next <= 0) {
        positions[o] = 1e6;
        continue;
      }
      const slow = Math.max(0, 1 - 2.2 * dt);
      velocity[o] = velocity[o]! * slow;
      velocity[o + 1] = velocity[o + 1]! * slow;
      velocity[o + 2] = velocity[o + 2]! * slow;
      positions[o] = positions[o]! + velocity[o]! * dt;
      positions[o + 1] = positions[o + 1]! + velocity[o + 1]! * dt;
      positions[o + 2] = positions[o + 2]! + velocity[o + 2]! * dt;
      const fade = next / lifeMax[i]!;
      colors[o] = base[o]! * fade;
      colors[o + 1] = base[o + 1]! * fade;
      colors[o + 2] = base[o + 2]! * fade;
    }
    sparkGeometry.attributes.position!.needsUpdate = true;
    sparkGeometry.attributes.color!.needsUpdate = true;

    if (flashLeft > 0) {
      flashLeft -= dt;
      const k = Math.max(0, flashLeft / FLASH_SECONDS);
      flash.visible = flashLeft > 0;
      flash.scale.setScalar(FLASH_SIZE * (1 - k * k));
      flash.material.opacity = k;
    }
    if (boltLeft > 0) {
      boltLeft -= dt;
      bolt.visible = boltLeft > 0;
      if (bolt.visible && !stage.reducedMotion) redrawBolt();
    }
  });

  function hide() {
    glow.visible = false;
    for (const icon of icons.values()) icon.visible = false;
  }

  stage.scene.add(group);
  stage.overlay.add(overlay);
  const pos = new THREE.Vector3();

  return {
    fly(item, from, to, k) {
      if (item === 'thunder') {
        pos.copy(to);
        pos.y += (1 - k) * THUNDER_HEIGHT;
      } else {
        pos.lerpVectors(from, to, k);
        if (item === 'bomb') pos.y += Math.sin(k * Math.PI) * BOMB_ARC;
      }
      hide();
      tint.set(STYLE[item].color);
      glow.material.color.copy(tint).multiplyScalar(0.7);
      glow.position.copy(pos);
      glow.visible = true;
      const icon = icons.get(item)!;
      const zoom = Math.min(3, Math.max(1, stage.camera.position.distanceTo(pos) / 30));
      icon.scale.setScalar(ICON_SIZE * zoom);
      icon.position.copy(pos);
      icon.material.rotation = item === 'bomb' ? k * Math.PI * 4 : 0;
      icon.visible = true;
      spark(pos, 4, 0.4, tint.multiplyScalar(0.6));
      spark(pos, 4, 0.4, tint);
    },
    hide,
    explode(item, at) {
      hide();
      tint.set(STYLE[item].color).multiplyScalar(0.75);
      for (let n = 0; n < 260; n++) spark(at, 50, 0.6 + Math.random() * 0.7, tint);
      for (let n = 0; n < 40; n++) spark(at, 18, 0.35, white);
      flash.position.copy(at);
      flash.material.color.copy(tint);
      flashLeft = FLASH_SECONDS;
      if (item === 'thunder') {
        boltTarget.copy(at);
        boltLeft = BOLT_SECONDS;
        bolt.visible = true;
        redrawBolt();
        glowBolt(tint);
      }
    },
    dispose() {
      stop();
      stage.scene.remove(group);
      stage.overlay.remove(overlay);
      for (const item of disposables) item.dispose();
    },
  };
}
