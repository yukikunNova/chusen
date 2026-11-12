import * as THREE from 'three';

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** OS の「視差効果を減らす」が有効か。 */
  reducedMotion: boolean;
  /** 毎フレーム呼ばれる。dt は秒（最大 0.1）。戻り値で解除。 */
  onFrame(cb: (dt: number) => void): () => void;
  dispose(): void;
};

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

const MAX_PIXEL_RATIO = 2;
const MAX_DT = 0.1;

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x05030f);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05030f, 260, 900);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 3000);
  scene.add(new THREE.AmbientLight(0xbfc8ff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, 80, 60);
  scene.add(sun);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const callbacks = new Set<(dt: number) => void>();
  let last = performance.now();
  let frame = requestAnimationFrame(function loop(now) {
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    for (const cb of [...callbacks]) cb(dt);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  });

  return {
    scene,
    camera,
    renderer,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onFrame(cb) {
      callbacks.add(cb);
      return () => void callbacks.delete(cb);
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      callbacks.clear();
      renderer.dispose();
    },
  };
}
