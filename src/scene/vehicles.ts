import * as THREE from 'three';
import type { VehicleKind } from './layout';

/** 乗り物の 3D モデル。機首が +Z を向く形で作る。 */
export type Vehicle = {
  model: THREE.Group;
  /** 噴射炎。ローカル Y 方向が長さ。 */
  flame: THREE.Mesh;
  /** 中心から噴射口までの距離（噴射粒子の出る位置）。 */
  tail: number;
};

/** 全機で共有する素材。 */
export type VehiclePalette = {
  white: THREE.Material;
  dark: THREE.Material;
  glass: THREE.Material;
  lamp: THREE.Material;
  cardboard: THREE.Material;
  panel: THREE.Material;
  flame: THREE.Material;
};

type Keep = <T extends { dispose(): void }>(item: T) => T;

export function createVehiclePalette(keep: Keep): VehiclePalette {
  return {
    white: keep(new THREE.MeshStandardMaterial({ color: 0xd8dcf0, roughness: 0.45 })),
    dark: keep(new THREE.MeshStandardMaterial({ color: 0x2b2b3a, metalness: 0.6 })),
    glass: keep(
      new THREE.MeshStandardMaterial({
        color: 0xbff4ff,
        emissive: 0x29e0ff,
        emissiveIntensity: 0.7,
      }),
    ),
    lamp: keep(
      new THREE.MeshStandardMaterial({
        color: 0xfff2a8,
        emissive: 0xffd60a,
        emissiveIntensity: 0.9,
      }),
    ),
    cardboard: keep(new THREE.MeshStandardMaterial({ color: 0xc79a5b, roughness: 0.9 })),
    panel: keep(
      new THREE.MeshStandardMaterial({
        color: 0x2a4fd0,
        emissive: 0x16308f,
        emissiveIntensity: 0.5,
        metalness: 0.4,
      }),
    ),
    flame: keep(
      new THREE.MeshBasicMaterial({
        color: 0xffa52e,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  };
}

/** 部品を足していく小さな組み立て役。 */
function builder(keep: Keep) {
  const model = new THREE.Group();
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(keep(geometry), material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  return { model, add };
}

/** 後ろ向き（-Z）に噴く炎を付ける。 */
function addFlame(
  b: ReturnType<typeof builder>,
  palette: VehiclePalette,
  rear: number,
  size = 1,
): THREE.Mesh {
  const flame = b.add(new THREE.ConeGeometry(0.42 * size, 2.2 * size, 14), palette.flame);
  // 円すいの先（+Y）を後ろ（-Z）へ向ける
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -(rear + 1.1 * size);
  return flame;
}

type Build = (body: THREE.Material, palette: VehiclePalette, keep: Keep) => Vehicle;

const BUILDERS: Record<VehicleKind, Build> = {
  rocket(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.CylinderGeometry(0.62, 0.5, 2.3, 20), body).rotation.x = Math.PI / 2;
    b.add(new THREE.ConeGeometry(0.62, 1.25, 20), palette.white, 0, 0, 1.775).rotation.x =
      Math.PI / 2;
    b.add(new THREE.CylinderGeometry(0.38, 0.55, 0.45, 16), palette.dark, 0, 0, -1.35).rotation.x =
      Math.PI / 2;
    b.add(new THREE.SphereGeometry(0.3, 16, 12), palette.glass, 0, 0.5, 0.45);
    for (let k = 0; k < 3; k++) {
      const pivot = new THREE.Group();
      const fin = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.95, 1.15)), body);
      fin.position.set(0, 0.95, -0.85);
      pivot.add(fin);
      pivot.rotation.z = (k * Math.PI * 2) / 3;
      b.model.add(pivot);
    }
    return { model: b.model, flame: addFlame(b, palette, 1.5), tail: 2.2 };
  },

  ufo(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.SphereGeometry(1.55, 28, 14), body).scale.y = 0.26;
    b.add(
      new THREE.SphereGeometry(0.75, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      palette.glass,
      0,
      0.2,
      0,
    );
    b.add(new THREE.CylinderGeometry(0.7, 0.45, 0.3, 20), palette.dark, 0, -0.4, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.add(
        new THREE.SphereGeometry(0.13, 8, 6),
        palette.lamp,
        Math.cos(a) * 1.15,
        -0.22,
        Math.sin(a) * 1.15,
      );
    }
    return { model: b.model, flame: addFlame(b, palette, 1.2, 0.8), tail: 1.8 };
  },

  shuttle(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.CylinderGeometry(0.58, 0.58, 2.6, 20), palette.white).rotation.x = Math.PI / 2;
    b.add(new THREE.SphereGeometry(0.58, 20, 14), palette.white, 0, 0, 1.3).scale.z = 1.5;
    b.add(new THREE.BoxGeometry(3.4, 0.1, 1.5), body, 0, -0.25, -0.55);
    b.add(new THREE.BoxGeometry(0.1, 1.05, 0.9), body, 0, 0.8, -0.95);
    b.add(new THREE.BoxGeometry(0.7, 0.3, 0.5), palette.glass, 0, 0.42, 1.2);
    b.add(new THREE.CylinderGeometry(0.34, 0.48, 0.4, 14), palette.dark, 0, 0, -1.5).rotation.x =
      Math.PI / 2;
    return { model: b.model, flame: addFlame(b, palette, 1.6), tail: 2.3 };
  },

  satellite(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(1.1, 1.1, 1.5), body);
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.7, 0.08, 0.08), palette.dark, side * 0.9, 0, 0);
      b.add(new THREE.BoxGeometry(1.9, 0.06, 1.0), palette.panel, side * 2.15, 0, 0);
    }
    b.add(new THREE.ConeGeometry(0.6, 0.45, 20, 1, true), palette.white, 0, 0, 1.05).rotation.x =
      -Math.PI / 2;
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), palette.white, 0.3, 0.95, -0.3);
    b.add(new THREE.SphereGeometry(0.1, 8, 6), palette.lamp, 0.3, 1.4, -0.3);
    return { model: b.model, flame: addFlame(b, palette, 0.75, 0.8), tail: 1.4 };
  },

  comet(body, palette, keep) {
    const b = builder(keep);
    // 氷の核と、後ろへ伸びる尾
    b.add(new THREE.IcosahedronGeometry(0.95, 1), body, 0, 0, 0.5);
    b.add(new THREE.IcosahedronGeometry(0.45, 0), palette.white, 0.55, 0.45, 0.9);
    b.add(new THREE.ConeGeometry(0.85, 2.6, 16, 1, true), palette.glass, 0, 0, -1.1).rotation.x =
      -Math.PI / 2;
    b.add(new THREE.SphereGeometry(0.16, 8, 6), palette.lamp, -0.5, 0.3, 1.2);
    return { model: b.model, flame: addFlame(b, palette, 2.2, 0.9), tail: 2.6 };
  },

  saturn(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.SphereGeometry(1.0, 24, 16), body);
    // 輪は少し傾ける
    const ring = b.add(new THREE.TorusGeometry(1.75, 0.2, 6, 40), palette.cardboard);
    ring.scale.z = 0.25;
    ring.rotation.x = Math.PI / 2 - 0.35;
    const inner = b.add(new THREE.TorusGeometry(1.35, 0.1, 6, 40), palette.lamp);
    inner.scale.z = 0.25;
    inner.rotation.x = Math.PI / 2 - 0.35;
    return { model: b.model, flame: addFlame(b, palette, 0.9), tail: 1.6 };
  },

  rover(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(1.5, 0.5, 2.3), body, 0, 0.1, 0);
    for (const side of [-1, 1]) {
      for (const z of [-0.85, 0, 0.85]) {
        b.add(
          new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14),
          palette.dark,
          side * 0.95,
          -0.4,
          z,
        ).rotation.z = Math.PI / 2;
      }
    }
    b.add(new THREE.BoxGeometry(1.3, 0.06, 1.0), palette.panel, 0, 0.42, -0.5);
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), palette.white, 0.35, 0.85, 0.6);
    b.add(new THREE.BoxGeometry(0.45, 0.28, 0.3), palette.glass, 0.35, 1.35, 0.65);
    b.add(
      new THREE.ConeGeometry(0.4, 0.3, 16, 1, true),
      palette.white,
      -0.4,
      0.75,
      0.7,
    ).rotation.x = Math.PI;
    return { model: b.model, flame: addFlame(b, palette, 1.15, 0.9), tail: 1.9 };
  },

  // ここから会議室の物
  chair(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(1.4, 0.2, 1.4), body, 0, 0, 0.1);
    b.add(new THREE.BoxGeometry(1.4, 1.5, 0.18), body, 0, 0.85, -0.6);
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.12, 0.1, 0.9), palette.dark, side * 0.72, 0.45, 0);
      b.add(new THREE.BoxGeometry(0.1, 0.4, 0.1), palette.dark, side * 0.72, 0.22, 0.3);
    }
    b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10), palette.dark, 0, -0.45, 0.1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leg = b.add(
        new THREE.BoxGeometry(0.9, 0.1, 0.16),
        palette.dark,
        Math.cos(a) * 0.45,
        -0.8,
        0.1 + Math.sin(a) * 0.45,
      );
      leg.rotation.y = -a;
      b.add(
        new THREE.SphereGeometry(0.13, 8, 6),
        palette.white,
        Math.cos(a) * 0.9,
        -0.92,
        0.1 + Math.sin(a) * 0.9,
      );
    }
    return { model: b.model, flame: addFlame(b, palette, 0.7, 0.9), tail: 1.4 };
  },

  box(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(1.7, 1.25, 2.1), palette.cardboard);
    // ガムテープは機体の色
    b.add(new THREE.BoxGeometry(0.36, 1.27, 2.12), body);
    for (const side of [-1, 1]) {
      const flap = b.add(
        new THREE.BoxGeometry(0.85, 0.06, 2.1),
        palette.cardboard,
        side * 1.15,
        0.85,
        0,
      );
      flap.rotation.z = side * -0.75;
    }
    b.add(new THREE.BoxGeometry(0.7, 0.35, 0.02), palette.white, 0.35, 0.1, 1.06);
    return { model: b.model, flame: addFlame(b, palette, 1.05), tail: 1.8 };
  },

  cup(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.CylinderGeometry(0.85, 0.6, 1.6, 24), palette.white);
    // スリーブは機体の色
    b.add(new THREE.CylinderGeometry(0.82, 0.68, 0.7, 24), body, 0, -0.05, 0);
    b.add(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 24), palette.dark, 0, 0.86, 0);
    b.add(new THREE.CylinderGeometry(0.6, 0.75, 0.16, 24), palette.dark, 0, 0.98, 0);
    b.add(new THREE.TorusGeometry(0.36, 0.09, 8, 18), palette.white, 0, 0.05, 0.95).rotation.y =
      Math.PI / 2;
    return { model: b.model, flame: addFlame(b, palette, 0.75, 0.9), tail: 1.5 };
  },

  keyboard(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(1.5, 0.22, 3.0), palette.dark);
    // キーの列は機体の色
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 9; col++) {
        b.add(
          new THREE.BoxGeometry(0.26, 0.12, 0.24),
          body,
          -0.51 + row * 0.34,
          0.17,
          -1.24 + col * 0.31,
        );
      }
    }
    b.add(new THREE.BoxGeometry(0.2, 0.06, 0.2), palette.lamp, 0.6, 0.14, 1.36);
    b.model.rotation.z = 0.25;
    return { model: b.model, flame: addFlame(b, palette, 1.5), tail: 2.2 };
  },

  laptop(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.BoxGeometry(2.2, 0.14, 1.5), palette.dark, 0, -0.3, 0.2);
    b.add(new THREE.BoxGeometry(1.9, 0.03, 0.8), palette.white, 0, -0.22, 0.4);
    // 開いた画面。天板（背面）は機体の色
    const lid = new THREE.Group();
    lid.position.set(0, -0.25, -0.55);
    lid.rotation.x = -0.3;
    const cover = new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 1.45, 0.1)), body);
    cover.position.y = 0.72;
    const screen = new THREE.Mesh(keep(new THREE.BoxGeometry(1.95, 1.2, 0.02)), palette.glass);
    screen.position.set(0, 0.72, 0.06);
    lid.add(cover, screen);
    b.model.add(lid);
    return { model: b.model, flame: addFlame(b, palette, 0.9), tail: 1.6 };
  },

  // ここからネタ枠
  duck(body, palette, keep) {
    const b = builder(keep);
    const torso = b.add(new THREE.SphereGeometry(1.0, 20, 14), body, 0, -0.15, -0.1);
    torso.scale.set(0.95, 0.8, 1.25);
    b.add(new THREE.SphereGeometry(0.6, 18, 12), body, 0, 0.75, 0.75);
    const beak = b.add(new THREE.ConeGeometry(0.26, 0.5, 12), palette.lamp, 0, 0.68, 1.45);
    beak.rotation.x = Math.PI / 2;
    beak.scale.z = 0.55;
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.09, 8, 6), palette.dark, side * 0.3, 0.95, 1.2);
      const wing = b.add(new THREE.SphereGeometry(0.5, 12, 8), body, side * 0.85, -0.05, -0.2);
      wing.scale.set(0.3, 0.6, 1.1);
    }
    const tail = b.add(new THREE.ConeGeometry(0.3, 0.6, 10), body, 0, 0.35, -1.25);
    tail.rotation.x = -0.9;
    return { model: b.model, flame: addFlame(b, palette, 1.2, 0.9), tail: 1.9 };
  },

  sushi(body, palette, keep) {
    const b = builder(keep);
    const rice = b.add(new THREE.CapsuleGeometry(0.62, 1.5, 6, 14), palette.white, 0, -0.2, 0);
    rice.rotation.x = Math.PI / 2;
    rice.scale.z = 0.8;
    // ネタは機体の色
    const topping = b.add(new THREE.BoxGeometry(1.25, 0.34, 3.0), body, 0, 0.4, 0);
    topping.rotation.x = -0.04;
    b.add(new THREE.BoxGeometry(1.36, 1.2, 0.5), palette.dark, 0, 0, -0.1);
    return { model: b.model, flame: addFlame(b, palette, 1.5), tail: 2.2 };
  },

  donut(body, palette, keep) {
    const b = builder(keep);
    b.add(new THREE.TorusGeometry(0.95, 0.5, 14, 30), palette.cardboard);
    // 糖衣は機体の色
    const icing = b.add(new THREE.TorusGeometry(0.95, 0.42, 12, 30), body, 0, 0, 0.16);
    icing.scale.z = 0.75;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = 0.8 + (k % 3) * 0.14;
      const sprinkle = b.add(
        new THREE.BoxGeometry(0.2, 0.07, 0.07),
        k % 2 === 0 ? palette.white : palette.lamp,
        Math.cos(a) * r,
        Math.sin(a) * r,
        0.5,
      );
      sprinkle.rotation.z = a * 2.3;
    }
    return { model: b.model, flame: addFlame(b, palette, 0.5, 0.9), tail: 1.2 };
  },

  toilet(body, palette, keep) {
    const b = builder(keep);
    const bowl = b.add(
      new THREE.CylinderGeometry(0.85, 0.5, 0.9, 20),
      palette.white,
      0,
      -0.25,
      0.4,
    );
    bowl.scale.z = 1.3;
    // 便座とふたは機体の色
    const seat = b.add(new THREE.TorusGeometry(0.7, 0.14, 8, 24), body, 0, 0.24, 0.4);
    seat.rotation.x = Math.PI / 2;
    seat.scale.y = 1.3;
    const lid = b.add(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 20), body, 0, 0.95, -0.55);
    lid.rotation.x = Math.PI / 2 - 0.15;
    b.add(new THREE.BoxGeometry(1.5, 1.3, 0.6), palette.white, 0, 0.4, -1.0);
    b.add(new THREE.BoxGeometry(0.3, 0.08, 0.12), palette.lamp, 0.55, 0.8, -0.66);
    b.add(new THREE.CylinderGeometry(0.4, 0.55, 0.5, 16), palette.white, 0, -0.9, 0.2);
    return { model: b.model, flame: addFlame(b, palette, 1.3), tail: 2.0 };
  },
};

/** kind の乗り物を作る。body は機体ごとの色の素材。 */
export function buildVehicle(
  kind: VehicleKind,
  body: THREE.Material,
  palette: VehiclePalette,
  keep: Keep,
): Vehicle {
  return BUILDERS[kind](body, palette, keep);
}
