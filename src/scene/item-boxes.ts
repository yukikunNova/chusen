import * as THREE from 'three';
import type { Stage } from './stage';
import { emojiTexture } from './textures';

/** コース上に置くアイテム箱。pickT に position で取られる。 */
export type BoxSpot = { pickT: number; position: THREE.Vector3 };

/** 取られる何秒前から見せるか。 */
const SHOW_BEFORE = 4;
const SIZE = 2.6;

/** 光る箱をコース上に置き、取られる時刻まで回して見せる。見た目だけで、順位には関係しない。 */
export function createItemBoxes(
  stage: Stage,
  spots: readonly BoxSpot[],
): { update(t: number): void; dispose(): void } {
  const group = new THREE.Group();
  const icons = new THREE.Group();
  const geometry = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4fd8,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const edges = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const texture = emojiTexture('🎁');
  const iconMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });

  const items = spots.map((spot) => {
    const cube = new THREE.Mesh(geometry, material);
    cube.add(new THREE.LineSegments(edges, edgeMaterial));
    cube.position.copy(spot.position);
    cube.visible = false;
    group.add(cube);
    const icon = new THREE.Sprite(iconMaterial);
    icon.position.copy(spot.position);
    icon.scale.setScalar(SIZE * 0.8);
    icon.visible = false;
    icons.add(icon);
    return { spot, cube, icon };
  });
  stage.scene.add(group);
  // 絵文字は発光でにじまないよう、重ね描きの側に置く
  stage.overlay.add(icons);

  return {
    update(t) {
      for (const { spot, cube, icon } of items) {
        const visible = t >= spot.pickT - SHOW_BEFORE && t < spot.pickT;
        cube.visible = visible;
        icon.visible = visible;
        if (!visible) continue;
        cube.rotation.set(t * 1.3, t * 2.1, 0);
        const pulse = 1 + Math.sin(t * 9) * 0.12;
        cube.scale.setScalar(pulse);
      }
    },
    dispose() {
      stage.scene.remove(group);
      stage.overlay.remove(icons);
      for (const item of [geometry, material, edges, edgeMaterial, texture, iconMaterial]) {
        item.dispose();
      }
    },
  };
}
