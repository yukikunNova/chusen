import * as THREE from 'three';
import { COURSE_LENGTH, generateCourse, type Course, type Vec3 } from './course';
import { TRACK_HALF_WIDTH } from './layout';
import type { Stage } from './stage';
import { checkerTexture, gridTexture, labelTexture } from './textures';
import { THEMES, type Theme } from './themes';

export type TrackFrame = {
  pos: THREE.Vector3;
  /** 進行方向 */
  tangent: THREE.Vector3;
  /** 進行方向に向かって右 */
  right: THREE.Vector3;
  up: THREE.Vector3;
  /** ロール（きりもみの回転）を含まない上向き。 */
  levelUp: THREE.Vector3;
};

/** いま舞台に出ているコース。createTrack が差し替える。 */
let current: Course = generateCourse(Math.random);

export function currentCourse(): Course {
  return current;
}

const vec = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

/** いまのコース上 p の位置と向き。 */
export function trackFrame(p: number): TrackFrame {
  const f = current.frameAt(p);
  return {
    pos: vec(f.pos),
    tangent: vec(f.tangent),
    right: vec(f.right),
    up: vec(f.up),
    levelUp: vec(f.levelUp),
  };
}

const P_MIN = -0.05;
const P_MAX = 1.1;
const SEGMENTS = 520;
const FLOOR_DROP = 3.4;
const RING_COUNT = 14;
const PROP_COUNT = 90;

function edgeCurve(side: number, lift: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const f = trackFrame(P_MIN + ((P_MAX - P_MIN) * i) / SEGMENTS);
    pts.push(f.pos.addScaledVector(f.right, side * TRACK_HALF_WIDTH).addScaledVector(f.up, lift));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function orient(object: THREE.Object3D, frame: TrackFrame) {
  object.position.copy(frame.pos);
  object.up.copy(frame.up);
  object.lookAt(frame.pos.clone().add(frame.tangent));
}

type Keep = <T extends { dispose(): void }>(item: T) => T;

/** 沿道の飾り。テーマごとに形を変え、コースの両脇に散らす。 */
function createProps(theme: Theme, keep: Keep): THREE.Object3D {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const pickColor = () =>
    color.setHex(theme.propColors[Math.floor(Math.random() * theme.propColors.length)]!);

  /** 1 つの形をコース沿いに count 個置く。place が大きさと追加の向きを決める。 */
  const scatter = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    place: (object: THREE.Object3D, frame: TrackFrame, side: number) => void,
  ): THREE.InstancedMesh => {
    // インスタンス用のバッファも解放されるよう、mesh 自体も破棄対象にする
    const mesh = keep(new THREE.InstancedMesh(keep(geometry), keep(material), count));
    for (let i = 0; i < count; i++) {
      const p = P_MIN + (P_MAX - P_MIN) * ((i + Math.random()) / count);
      const frame = trackFrame(p);
      const side = i % 2 === 0 ? -1 : 1;
      dummy.position.copy(frame.pos);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      place(dummy, frame, side);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, pickColor());
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 広い範囲に散るので、まとめての視錐台判定はしない
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  /** コースの外側へ out、上へ up だけ離す。 */
  const offset = (
    object: THREE.Object3D,
    frame: TrackFrame,
    side: number,
    out: number,
    up: number,
  ) =>
    object.position
      .addScaledVector(frame.right, side * (TRACK_HALF_WIDTH + out))
      .addScaledVector(frame.up, up);
  const rnd = (min: number, max: number) => min + Math.random() * (max - min);

  switch (theme.prop) {
    case 'cubes':
      scatter(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ wireframe: true }),
        PROP_COUNT,
        (o, f, side) => {
          offset(o, f, side, rnd(14, 60), rnd(-14, 30));
          o.scale.setScalar(rnd(3, 9));
          o.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
        },
      );
      break;
    case 'rocks':
      scatter(
        new THREE.ConeGeometry(1, 1, 6),
        new THREE.MeshStandardMaterial({
          color: 0x2a1410,
          emissive: 0xff4a00,
          emissiveIntensity: 0.45,
          roughness: 0.9,
          flatShading: true,
        }),
        PROP_COUNT,
        (o, f, side) => {
          offset(o, f, side, rnd(10, 55), rnd(-16, -4));
          o.scale.set(rnd(4, 9), rnd(12, 34), rnd(4, 9));
          o.rotation.y = rnd(0, 3);
        },
      );
      // 舞い上がる火の粉のかわりに、宙に浮く溶岩のかけら
      scatter(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshBasicMaterial(),
        PROP_COUNT,
        (o, f, side) => {
          offset(o, f, side, rnd(8, 70), rnd(0, 40));
          o.scale.setScalar(rnd(0.5, 1.8));
        },
      );
      break;
    case 'crystals':
      scatter(
        new THREE.OctahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x2f8fff,
          emissiveIntensity: 0.55,
          roughness: 0.2,
          transparent: true,
          opacity: 0.85,
          flatShading: true,
        }),
        PROP_COUNT,
        (o, f, side) => {
          offset(o, f, side, rnd(10, 55), rnd(-12, 6));
          o.scale.set(rnd(2.5, 5), rnd(9, 24), rnd(2.5, 5));
          o.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3));
        },
      );
      break;
    case 'sweets': {
      // あめ玉とドーナツ
      scatter(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshStandardMaterial({ roughness: 0.35, emissive: 0x402040 }),
        PROP_COUNT / 2,
        (o, f, side) => {
          offset(o, f, side, rnd(10, 55), rnd(-10, 22));
          o.scale.setScalar(rnd(2.5, 6));
        },
      );
      scatter(
        new THREE.TorusGeometry(1, 0.42, 10, 24),
        new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x402040 }),
        PROP_COUNT / 2,
        (o, f, side) => {
          offset(o, f, side, rnd(12, 65), rnd(6, 36));
          o.scale.setScalar(rnd(2.5, 5.5));
          o.rotation.set(rnd(0, 3), rnd(0, 3), 0);
        },
      );
      break;
    }
    case 'curtains':
      scatter(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          transparent: true,
          // 重なると白く飛ぶので、薄く・少なめにする
          opacity: 0.07,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
        PROP_COUNT / 2,
        (o, f, side) => {
          offset(o, f, side, rnd(20, 90), rnd(20, 70));
          o.scale.set(rnd(18, 40), rnd(50, 110), 1);
          o.rotation.y = rnd(-0.6, 0.6);
        },
      );
      break;
  }
  return group;
}

/**
 * course を舞台に出す（床・レール・リング・スタート線・ゴールゲート・沿道の飾り）。
 * 以後 trackFrame はこのコースを返す。背景と霧の色もテーマに合わせる。
 */
export function createTrack(stage: Stage, course: Course): { dispose(): void } {
  current = course;
  const theme = THEMES[course.theme];
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep: Keep = (item) => {
    disposables.push(item);
    return item;
  };

  stage.renderer.setClearColor(theme.sky);
  if (stage.scene.fog) stage.scene.fog.color.setHex(theme.sky);

  // 床（格子模様の帯）。ジャンプ台の途中は床を張らない
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
      uvs.push(side < 0 ? 0 : 4, (p * COURSE_LENGTH) / 9.5);
    }
    if (i < SEGMENTS && course.hasFloorAt(p + (P_MAX - P_MIN) / SEGMENTS / 2)) {
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
      map: keep(gridTexture(theme.floor, theme.grid, theme.band)),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  group.add(new THREE.Mesh(floorGeometry, floorMaterial));

  // 両端の光るレール
  theme.rails.forEach((color, i) => {
    const side = i === 0 ? -1 : 1;
    const rail = keep(new THREE.TubeGeometry(edgeCurve(side, -FLOOR_DROP + 0.5), 600, 0.42, 8));
    group.add(new THREE.Mesh(rail, keep(new THREE.MeshBasicMaterial({ color }))));
  });

  // コースをくぐるリング。きりもみ区間は間隔を詰めてトンネルのように見せる
  const ringGeometry = keep(new THREE.TorusGeometry(TRACK_HALF_WIDTH + 5, 0.5, 10, 64));
  const ringMaterials = theme.rings.map((color) => keep(new THREE.MeshBasicMaterial({ color })));
  const ringAt: number[] = [];
  for (let i = 1; i < RING_COUNT; i++) ringAt.push(i / RING_COUNT);
  for (const segment of course.segments) {
    if (segment.kind !== 'corkscrew') continue;
    for (let i = 0; i <= 8; i++) ringAt.push(segment.from + ((segment.to - segment.from) * i) / 8);
  }
  ringAt.forEach((p, i) => {
    const ring = new THREE.Mesh(ringGeometry, ringMaterials[i % ringMaterials.length]);
    orient(ring, trackFrame(p));
    group.add(ring);
  });

  // ジャンプ台: 踏み切りと着地に光る板を置く
  const padGeometry = keep(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 5));
  const padMaterial = keep(
    new THREE.MeshBasicMaterial({ color: 0xffd60a, side: THREE.DoubleSide }),
  );
  for (const segment of course.segments) {
    if (segment.kind !== 'jump') continue;
    const length = segment.to - segment.from;
    for (const u of [0.2, 0.85]) {
      const frame = trackFrame(segment.from + length * u);
      const pad = new THREE.Mesh(padGeometry, padMaterial);
      orient(pad, frame);
      pad.rotateX(-Math.PI / 2);
      pad.position.addScaledVector(frame.up, -FLOOR_DROP + 0.08);
      group.add(pad);
    }
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

  group.add(createProps(theme, keep));

  stage.scene.add(group);
  return {
    dispose() {
      stage.scene.remove(group);
      for (const item of disposables) item.dispose();
    },
  };
}
