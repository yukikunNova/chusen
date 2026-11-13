import './styles.css';
import { createApp, type App, type RaceRunner } from './app';
import { createSfx, type SfxKind } from './audio/sfx';
import { buildCommentary } from './domain/commentary';
import { createRand } from './domain/prng';
import { buildRaceScript, type RaceEventKind } from './domain/race-script';
import { cryptoRandomInt } from './domain/shuffle';
import { generateCourse } from './scene/course';
import { createFireworks } from './scene/fireworks';
import { idleCamera, playRace, type RaceHooks } from './scene/race-player';
import { createSpace } from './scene/space';
import { createStage, isWebGLAvailable, type Stage } from './scene/stage';
import { createTrack } from './scene/track';
import { mountHud, type Hud } from './ui/hud';
import { runSimpleReveal } from './ui/simple-reveal';
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
/** 3D が使えるときだけ舞台を作る。作れなければ簡易表示で動かす。 */
function tryCreateStage(): Stage | null {
  if (!canvas || !isWebGLAvailable()) return null;
  try {
    return createStage(canvas);
  } catch {
    return null;
  }
}
const stage = tryCreateStage();
if (stage) createSpace(stage);
/** 舞台に出ているコース。抽選のたびに作り直す。 */
let track = stage ? createTrack(stage, generateCourse(Math.random)) : null;
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
  surge: 'boost',
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
/** レース中で BGM を鳴らすべき区間か（ミュート解除時に鳴らし直すため）。 */
let bgmWanted = false;
/** フィーバータイムの速い BGM か。 */
let bgmFast = false;
const hooks: RaceHooks = {
  onCount: () => sfx.play('count'),
  onGo: () => {
    sfx.play('go');
    bgmWanted = true;
    bgmFast = false;
    sfx.startBgm();
  },
  onHighlight: (highlight) => {
    if (highlight.kind === 'overtake') sfx.play('overtake');
    if (highlight.combo >= 2) sfx.play('combo', highlight.combo);
  },
  onBox: (phase, box) => {
    if (phase === 'pick') sfx.play('box');
    else if (box.rarity !== 'white') sfx.play('rare');
  },
  onFever: () => {
    sfx.play('fever');
    // BGM は予約済みなので、止めて速いテンポで鳴らし直す
    bgmFast = true;
    sfx.stopBgm();
    sfx.startBgm(true);
  },
  onPhoto: () => {
    // 音楽を止めて、心臓の音だけにする
    bgmWanted = false;
    sfx.stopBgm();
    sfx.play('photo');
  },
  onEvent: (event) => sfx.play(EVENT_SOUND[event.kind]),
  onEnd: (skipped) => {
    bgmWanted = false;
    sfx.stopBgm();
    if (skipped) {
      // 予約済みの音（フィーバーの一発など）が結果画面で鳴らないよう切る
      sfx.cutEffects();
      // スキップ時は 1 着ゴールを通らないので、ここで鳴らす
      sfx.play('fanfare');
    }
  },
  onFirstFinish: () => {
    bgmWanted = false;
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
    return runSimpleReveal(
      root,
      order.map((m) => m.name),
      () => {
        sfx.play('fanfare');
        onDone();
      },
    );
  }
  // 演出用の乱数。順位は order で確定済みで、ここでは変わらない
  const seed = Date.now();
  const script = buildRaceScript(order, createRand(seed));
  const cues = buildCommentary(script, createRand(seed + 1));
  // コースも毎回作り直す（見た目だけで、順位には関係しない）
  track?.dispose();
  track = createTrack(stage, generateCourse(createRand(seed + 3)));
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
  extraNotice: stage ? null : '3D表示が使えないため簡易表示で動作します',
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
    if (!value && bgmWanted) sfx.startBgm(bgmFast);
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
