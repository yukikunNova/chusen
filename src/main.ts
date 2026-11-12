import './styles.css';
import { createApp, type App, type RaceRunner } from './app';
import { buildCommentary } from './domain/commentary';
import { createRand } from './domain/prng';
import { buildRaceScript } from './domain/race-script';
import { cryptoRandomInt } from './domain/shuffle';
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

let app: App | null = null;
let hud: Hud | null = null;
let muted = false;
const hooks: RaceHooks = {};

const runRace: RaceRunner = (order, onDone) => {
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
  onScreenChange: () => undefined,
  onMutedChange: (value) => {
    muted = value;
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
