import * as THREE from 'three';
import { TRACK_HALF_WIDTH, TRACK_LENGTH, trackPoint } from './layout';
import type { Stage } from './stage';
import { checkerTexture, gridTexture, labelTexture } from './textures';

export type TrackFrame = {
  pos: THREE.Vector3;
  /** 進行方向 */
  tangent: THREE.Vector3;
  /** 進行方向に向かって右 */
  right: THREE.Vector3;
  up: THREE.Vector3;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const EPS = 0.002;

function point(p: number): THREE.Vector3 {
  const { x, y, z } = trackPoint(p);
  return new THREE.Vector3(x, y, z);
}

/** コース上 p の位置と向き。 */
export function trackFrame(p: number): TrackFrame {
  const pos = point(p);
  const tangent = point(p + EPS)
    .sub(point(p - EPS))
    .normalize();
  const right = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
  return { pos, tangent, right, up };
}

const P_MIN = -0.05;
const P_MAX = 1.1;
const SEGMENTS = 260;
const FLOOR_DROP = 3.4;

function edgeCurve(side: number, lift: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const f = trackFrame(P_MIN + ((P_MAX - P_MIN) * i) / SEGMENTS);
    pts.push(
      f.pos
        .clone()
        .addScaledVector(f.right, side * TRACK_HALF_WIDTH)
        .addScaledVector(f.up, lift),
    );
  }
  return new THREE.CatmullRomCurve3(pts);
}

function orient(object: THREE.Object3D, frame: TrackFrame) {
  object.position.copy(frame.pos);
  object.up.copy(frame.up);
  object.lookAt(frame.pos.clone().add(frame.tangent));
}

/** ネオンのコース・リング・スタート線・ゴールゲートを作る。 */
export function createTrack(stage: Stage): { dispose(): void } {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // 床（格子模様の帯）
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const p = P_MIN + ((P_MAX - P_MIN) * i) / SEGMENTS;
    const f = trackFrame(p);
    for (const side of [-1, 1]) {
      const v = f.pos
        .clone()
        .addScaledVector(f.right, side * TRACK_HALF_WIDTH)
        .addScaledVector(f.up, -FLOOR_DROP);
      positions.push(v.x, v.y, v.z);
      uvs.push(side < 0 ? 0 : 4, (p * TRACK_LENGTH) / 9.5);
    }
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const floorGeometry = keep(new THREE.BufferGeometry());
  floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  floorGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  floorGeometry.setIndex(indices);
  const floorMaterial = keep(
    new THREE.MeshBasicMaterial({
      map: keep(gridTexture()),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  group.add(new THREE.Mesh(floorGeometry, floorMaterial));

  // 両端の光るレール
  for (const [side, color] of [
    [-1, 0x29e0ff],
    [1, 0xff2e93],
  ] as const) {
    const rail = keep(new THREE.TubeGeometry(edgeCurve(side, -FLOOR_DROP + 0.5), 400, 0.42, 8));
    group.add(new THREE.Mesh(rail, keep(new THREE.MeshBasicMaterial({ color }))));
  }

  // コースをくぐるネオンリング
  const ringGeometry = keep(new THREE.TorusGeometry(TRACK_HALF_WIDTH + 5, 0.5, 10, 64));
  const ringColors = [0x9d4dff, 0x29e0ff, 0xff2e93, 0xffd60a];
  for (let i = 1; i < 14; i++) {
    const material = keep(
      new THREE.MeshBasicMaterial({ color: ringColors[i % ringColors.length] }),
    );
    const ring = new THREE.Mesh(ringGeometry, material);
    orient(ring, trackFrame(i / 14));
    group.add(ring);
  }

  // スタート線
  const startLine = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 3)),
    keep(new THREE.MeshBasicMaterial({ map: keep(checkerTexture(24, 2)), side: THREE.DoubleSide })),
  );
  const startFrame = trackFrame(0);
  orient(startLine, startFrame);
  startLine.rotateX(-Math.PI / 2);
  startLine.position.addScaledVector(startFrame.up, -FLOOR_DROP + 0.05);
  group.add(startLine);

  // ゴールゲート
  const goal = new THREE.Group();
  const gold = keep(new THREE.MeshBasicMaterial({ color: 0xffd60a }));
  const arch = new THREE.Mesh(
    keep(new THREE.TorusGeometry(TRACK_HALF_WIDTH + 6, 1.3, 14, 80)),
    gold,
  );
  goal.add(arch);
  const banner = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 + 6, 5)),
    keep(new THREE.MeshBasicMaterial({ map: keep(checkerTexture(20, 2)), side: THREE.DoubleSide })),
  );
  banner.position.y = TRACK_HALF_WIDTH + 1;
  goal.add(banner);
  const label = labelTexture('GOAL', {
    color: '#ffd60a',
    background: 'rgba(10,4,30,0.9)',
    border: '#ffd60a',
  });
  keep(label.texture);
  const sign = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(9 * label.aspect, 9)),
    keep(
      new THREE.MeshBasicMaterial({
        map: label.texture,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    ),
  );
  sign.position.y = TRACK_HALF_WIDTH + 11;
  sign.rotation.y = Math.PI;
  goal.add(sign);
  const goalLine = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 4)),
    keep(new THREE.MeshBasicMaterial({ map: keep(checkerTexture(24, 3)), side: THREE.DoubleSide })),
  );
  goalLine.rotation.x = -Math.PI / 2;
  goalLine.position.y = -FLOOR_DROP + 0.05;
  goal.add(goalLine);
  orient(goal, trackFrame(1));
  group.add(goal);

  stage.scene.add(group);
  return {
    dispose() {
      stage.scene.remove(group);
      for (const item of disposables) item.dispose();
    },
  };
}
