import './styles.css';
import { createApp, type App, type RaceRunner } from './app';
import { createSfx, type SfxKind } from './audio/sfx';
import { buildCommentary } from './domain/commentary';
import { createRand } from './domain/prng';
import { buildRaceScript, type RaceEventKind } from './domain/race-script';
import { cryptoRandomInt } from './domain/shuffle';
import { createFireworks } from './scene/fireworks';
import { idleCamera, playRace, type RaceHooks } from './scene/race-player';
import { createSpace } from './scene/space';
import { createStage, isWebGLAvailable, type Stage } from './scene/stage';
import { createTrack } from './scene/track';
import { mountHud, type Hud } from './ui/hud';
import { getBrowserStorage, loadStore } from './storage/store';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app がない');

const newId = () => crypto.randomUUID();
const storage = getBrowserStorage();

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const stage: Stage | null = canvas && isWebGLAvailable() ? createStage(canvas) : null;
if (stage) {
  createSpace(stage);
  createTrack(stage);
}
const sfx = createSfx(() => new AudioContext(), false);
/** イベントの種類ごとの効果音。 */
const EVENT_SOUND: Record<RaceEventKind, SfxKind> = {
  rocketStart: 'boost',
  boost: 'boost',
  overtake: 'boost',
  finalComeback: 'boost',
  spin: 'spin',
  slowStart: 'stall',
  weave: 'stall',
  stall: 'stall',
  attack: 'attack',
};
/** 一斉打ち上げで炸裂音が重なりすぎないよう、間隔を空ける（ミリ秒）。 */
const FIREWORK_SOUND_GAP = 90;
let lastFireworkSound = 0;
const fireworks = stage
  ? createFireworks(stage, () => {
      const now = performance.now();
      if (now - lastFireworkSound < FIREWORK_SOUND_GAP) return;
      lastFireworkSound = now;
      sfx.play('firework');
    })
  : null;

let app: App | null = null;
let hud: Hud | null = null;
let muted = false;
const hooks: RaceHooks = {
  onCount: () => sfx.play('count'),
  onGo: () => {
    sfx.play('go');
    sfx.startBgm();
  },
  onEvent: (event) => sfx.play(EVENT_SOUND[event.kind]),
  onEnd: (skipped) => {
    sfx.stopBgm();
    // スキップ時は 1 着ゴールを通らないので、ここで鳴らす
    if (skipped) sfx.play('fanfare');
  },
  onFirstFinish: () => {
    sfx.stopBgm();
    sfx.play('goal');
    sfx.play('fanfare');
    fireworks?.start();
    fireworks?.salvo();
    fireworks?.burstConfetti();
  },
};

const runRace: RaceRunner = (order, onDone) => {
  // 「抽選スタート」のクリック内で呼ばれるので、ここで音を使えるようにする
  sfx.unlock();
  if (!stage) {
    onDone();
    return { skip: () => undefined };
  }
  // 演出用の乱数。順位は order で確定済みで、ここでは変わらない
  const seed = Date.now();
  const script = buildRaceScript(order, createRand(seed));
  const cues = buildCommentary(script, createRand(seed + 1));
  const raceHud = mountHud(
    root,
    { onSkip: () => app?.skip(), onToggleMute: () => app?.setMuted(!muted) },
    muted,
  );
  hud = raceHud;
  return playRace(stage, script, cues, raceHud, hooks, () => {
    raceHud.destroy();
    if (hud === raceHud) hud = null;
    onDone();
  });
};

app = createApp({
  root,
  storage,
  initial: loadStore(storage, newId),
  randomInt: cryptoRandomInt,
  newId,
  runRace,
  copyText,
  download,
  confirm: (message) => window.confirm(message),
  extraNotice: null,
  onScreenChange: (screen) => {
    if (screen === 'result') {
      // スキップで来た場合もここで始まる（start は二重に呼んでも 1 系統）
      fireworks?.start();
      fireworks?.salvo();
      fireworks?.burstConfetti();
    } else {
      fireworks?.stop();
    }
  },
  onMutedChange: (value) => {
    muted = value;
    sfx.setMuted(value);
    hud?.setMuted(value);
  },
});

if (stage) {
  let time = 0;
  stage.onFrame((dt) => {
    time += dt;
    if (app && app.screen !== 'race')
      idleCamera(stage, app.screen === 'result' ? 'goal' : 'start', time);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || app?.screen !== 'race') return;
  e.preventDefault();
  app.skip();
});
