import * as THREE from 'three';
import { TRACK_LENGTH } from './layout';
import type { Stage } from './stage';
import { glowTexture } from './textures';

function starLayer(
  count: number,
  size: number,
  place: (out: THREE.Vector3) => void,
  sprite: THREE.Texture,
): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    place(v);
    positions.set([v.x, v.y, v.z], i * 3);
    color.setHSL(0.5 + Math.random() * 0.35, 0.7, 0.72 + Math.random() * 0.28);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Points(geometry, material);
}

function onSphere(radius: number, out: THREE.Vector3) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  out.set(s * Math.cos(a) * radius, u * radius, s * Math.sin(a) * radius);
}

/** 星空・星雲・惑星。遠景はカメラに付いて回り、近景の星は流れて速度感を出す。 */
export function createSpace(stage: Stage): { dispose(): void } {
  const sprite = glowTexture();
  const far = new THREE.Group();
  const near = new THREE.Group();

  far.add(starLayer(3500, 5, (v) => onSphere(1400, v), sprite));
  far.add(starLayer(700, 11, (v) => onSphere(1300, v), sprite));

  const nebulaColors = [0xff2e93, 0x29e0ff, 0x9d4dff, 0x3d5bff, 0xff7a00, 0x29e0ff, 0xff2e93];
  const v = new THREE.Vector3();
  for (const color of nebulaColors) {
    const material = new THREE.SpriteMaterial({
      map: sprite,
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const nebula = new THREE.Sprite(material);
    onSphere(1100, v);
    nebula.position.copy(v);
    nebula.scale.setScalar(900 + Math.random() * 700);
    far.add(nebula);
  }

  // コース沿いに散らした近い星（カメラが進むと流れる）
  near.add(
    starLayer(
      2600,
      2.6,
      (out) => {
        const radius = 55 + Math.random() * 330;
        const a = Math.random() * Math.PI * 2;
        out.set(
          Math.cos(a) * radius,
          Math.sin(a) * radius,
          160 - Math.random() * (TRACK_LENGTH + 520),
        );
      },
      sprite,
    ),
  );

  // 輪のある惑星
  const planet = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(70, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0x6b3fd6,
      emissive: 0x2a0f66,
      roughness: 0.85,
      fog: false,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(95, 150, 96),
    new THREE.MeshBasicMaterial({
      color: 0xffb3e6,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  ring.rotation.x = Math.PI / 2.3;
  planet.add(globe, ring);
  planet.position.set(-300, 120, -TRACK_LENGTH - 260);
  planet.rotation.z = 0.35;
  near.add(planet);

  stage.scene.add(far, near);
  const stop = stage.onFrame((dt) => {
    far.position.copy(stage.camera.position);
    far.rotation.y += dt * 0.004;
    globe.rotation.y += dt * 0.05;
  });

  return {
    dispose() {
      stop();
      stage.scene.remove(far, near);
      for (const group of [far, near]) {
        group.traverse((object) => {
          const item = object as THREE.Mesh;
          item.geometry?.dispose();
          const material = item.material as THREE.Material | undefined;
          material?.dispose();
        });
      }
      sprite.dispose();
    },
  };
}
