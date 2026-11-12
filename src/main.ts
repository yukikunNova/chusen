import './styles.css';
import { createApp, type RaceRunner } from './app';
import { cryptoRandomInt } from './domain/shuffle';
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

// 演出は後続タスクで差し込む。今は即座に結果を出す。
const runRace: RaceRunner = (_order, onDone) => {
  onDone();
  return { skip: () => undefined };
};

const app = createApp({
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
  onMutedChange: () => undefined,
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || app.screen !== 'race') return;
  e.preventDefault();
  app.skip();
});
