import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** 発光を掛けずに最前面へ描くもの（名札・紙吹雪）を入れる。 */
  overlay: THREE.Scene;
  /** OS の「視差効果を減らす」が有効か。 */
  reducedMotion: boolean;
  /** 毎フレーム呼ばれる。dt は秒（最大 0.1）。戻り値で解除。 */
  onFrame(cb: (dt: number) => void): () => void;
  /** 画面を描き終えた直後に毎フレーム呼ばれる（描いた絵を写し取る用）。戻り値で解除。 */
  onAfterRender(cb: () => void): () => void;
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
  const overlay = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05030f, 260, 900);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 3000);
  scene.add(new THREE.AmbientLight(0xbfc8ff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 80, 60);
  scene.add(sun);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 発光（ブルーム）: ネオンのコース・噴射炎・花火をにじませる
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), reducedMotion ? 0.25 : 0.55, 0.4, 0.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const callbacks = new Set<(dt: number) => void>();
  const afterRender = new Set<() => void>();
  let last = performance.now();
  let frame = requestAnimationFrame(function loop(now) {
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    for (const cb of [...callbacks]) cb(dt);
    composer.render(dt);
    // 文字が白飛びしないよう、名札などは発光処理の後に重ねて描く
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
    renderer.autoClear = true;
    for (const cb of [...afterRender]) cb();
    frame = requestAnimationFrame(loop);
  });

  return {
    scene,
    camera,
    renderer,
    overlay,
    reducedMotion,
    onFrame(cb) {
      callbacks.add(cb);
      return () => void callbacks.delete(cb);
    },
    onAfterRender(cb) {
      afterRender.add(cb);
      return () => void afterRender.delete(cb);
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      callbacks.clear();
      afterRender.clear();
      composer.dispose();
      renderer.dispose();
    },
  };
}
