import * as THREE from 'three';
import type { Stage } from './stage';
import { glowTexture } from './textures';

/** 流星群（激レア回「流星群レース」）。カメラのまわりに流れ星を降らせ続ける。見た目だけ。 */

const COUNT = 110;
/** 視差軽減の設定では数を減らす。 */
const COUNT_REDUCED = 24;
/** 流れる向き（斜め下）。 */
const DIRECTION = new THREE.Vector3(-0.55, -0.72, 0.42).normalize();
/** カメラを中心に、流れ星を出す範囲。 */
const RANGE = 130;
const HEIGHT_MIN = 5;
const HEIGHT_MAX = 95;
/** 出す範囲の中心を、カメラの前へどれだけずらすか（映る所に降らせる）。 */
const AHEAD = 90;

export function createMeteors(stage: Stage): { dispose(): void } {
  const count = stage.reducedMotion ? COUNT_REDUCED : COUNT;
  // 1 本ごとに頭と尾の 2 点
  const positions = new Float32Array(count * 6).fill(1e6);
  const colors = new Float32Array(count * 6);
  const head = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  const length = new Float32Array(count);
  const life = new Float32Array(count);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  stage.scene.add(lines);

  // 頭の光の粒。線だけだと細くて目立たない
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute('position', new THREE.BufferAttribute(head, 3));
  const headTexture = glowTexture();
  const headMaterial = new THREE.PointsMaterial({
    size: 5,
    map: headTexture,
    color: 0xdff6ff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const heads = new THREE.Points(headGeometry, headMaterial);
  heads.frustumCulled = false;
  stage.scene.add(heads);
  const forward = new THREE.Vector3();

  const tint = new THREE.Color();
  function respawn(i: number, stagger: boolean) {
    const camera = stage.camera.position;
    stage.camera.getWorldDirection(forward);
    head[i * 3] = camera.x + forward.x * AHEAD + (Math.random() - 0.5) * 2 * RANGE;
    head[i * 3 + 1] = camera.y + HEIGHT_MIN + Math.random() * (HEIGHT_MAX - HEIGHT_MIN);
    head[i * 3 + 2] = camera.z + forward.z * AHEAD + (Math.random() - 0.5) * 2 * RANGE;
    speed[i] = 70 + Math.random() * 90;
    length[i] = 14 + Math.random() * 22;
    // 最初は時間をずらし、一斉に流れないようにする
    life[i] = (0.9 + Math.random() * 0.9) * (stagger ? Math.random() : 1);
    // 頭は白に近い水色〜金、尾は暗くして消えていくように見せる
    tint.setHSL(Math.random() < 0.3 ? 0.12 : 0.55, 0.9, 0.78);
    colors.set([tint.r, tint.g, tint.b, 0, 0, 0], i * 6);
  }
  for (let i = 0; i < count; i++) respawn(i, true);

  const stop = stage.onFrame((dt) => {
    for (let i = 0; i < count; i++) {
      life[i] = life[i]! - dt;
      if (life[i]! <= 0) respawn(i, false);
      const step = speed[i]! * dt;
      const x = (head[i * 3] = head[i * 3]! + DIRECTION.x * step);
      const y = (head[i * 3 + 1] = head[i * 3 + 1]! + DIRECTION.y * step);
      const z = (head[i * 3 + 2] = head[i * 3 + 2]! + DIRECTION.z * step);
      const tail = length[i]!;
      positions.set(
        [x, y, z, x - DIRECTION.x * tail, y - DIRECTION.y * tail, z - DIRECTION.z * tail],
        i * 6,
      );
    }
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    headGeometry.attributes.position!.needsUpdate = true;
  });

  return {
    dispose() {
      stop();
      stage.scene.remove(lines, heads);
      geometry.dispose();
      material.dispose();
      headGeometry.dispose();
      headMaterial.dispose();
      headTexture.dispose();
    },
  };
}
