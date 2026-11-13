import { formatResult } from './domain/result-text';
import { buildShareModel, postUrl, shareText, type ShareModel } from './domain/share';
import type { RaceSummary } from './domain/summary';
import type { ReplayVideo } from './media/replay-recorder';
import {
  activeMembers,
  currentGroup,
  drawBlockReason,
  setMuted,
  type Member,
  type NewId,
  type Store,
} from './domain/roster';
import { shuffle, type RandomInt } from './domain/shuffle';
import {
  exportStore,
  importStore,
  saveStore,
  type LoadNotice,
  type StorageLike,
} from './storage/store';
import { mountResultView, type ResultView } from './ui/result-view';
import { mountRosterView, type RosterView } from './ui/roster-view';

export type Screen = 'roster' | 'race' | 'result';
/**
 * 確定済みの順位を演出として再生する。終わったら onDone を呼ぶ。
 * summary はレースのまとめ（称号など）で、結果画面の飾りに使う。
 * replay はゴール前のリプレイ動画。録っていない回は渡さない。録れなかった回は null になる。
 */
export type RaceRunner = (
  order: Member[],
  onDone: (summary?: RaceSummary, replay?: Promise<ReplayVideo | null>) => void,
) => { skip(): void };

/** 共有する結果画像。dataUrl は見本の表示用。 */
export type CardImage = { blob: Blob; dataUrl: string };
export type ShareDeps = {
  /** 結果画像を描く。描けない環境では null。 */
  renderCard(model: ShareModel): Promise<CardImage | null>;
  /** ファイルとして保存する（画像・動画）。 */
  saveFile(blob: Blob, filename: string): void;
  copyImage(blob: Blob): Promise<boolean>;
  /** 投稿画面を新しいタブで開く。開けなかった（ブロックされた）ら false。 */
  openPost(url: string): boolean;
};

export type AppDeps = {
  root: HTMLElement;
  storage: StorageLike | null;
  initial: { store: Store; notice: LoadNotice };
  randomInt: RandomInt;
  newId: NewId;
  runRace: RaceRunner;
  copyText(text: string): Promise<boolean>;
  download(filename: string, text: string): void;
  confirm(message: string): boolean;
  share: ShareDeps;
  /** 起動時に名簿画面へ出す追加通知。 */
  extraNotice: string | null;
  /** 画面が変わるたび 1 回。 */
  onScreenChange(screen: Screen): void;
  /** 起動時に 1 回 + ミュート設定が変わるたび。 */
  onMutedChange(muted: boolean): void;
};

export type App = {
  readonly screen: Screen;
  start(): void;
  skip(): void;
  redraw(): void;
  back(): void;
  setMuted(muted: boolean): void;
  importText(text: string): void;
};

export const EXPORT_FILENAME = 'chusen-roster.json';
export const CARD_FILENAME = 'dopachu-result.png';
export const REPLAY_FILENAME = 'dopachu-replay';
const MSG_CARD_FAILED = '画像を作れませんでした。「結果をコピー」を使ってください';
const MSG_IMAGE_COPIED = '画像をコピーしました';
const MSG_IMAGE_COPY_FAILED = 'コピーできませんでした。「画像を保存」を使ってください';
const MSG_POST_PASTE = '画像をコピーしました。投稿画面で貼り付けてください（Ctrl+V / ⌘V）';
const MSG_POST_BLOCKED =
  '投稿画面を開けませんでした。ポップアップを許可してから、もう一度押してください';
const MSG_POST_ATTACH = '投稿画面を開きました。「画像を保存」した画像を投稿に添付してください';
const MSG_VIDEO_HIDDEN = '動画には名札が映るため、名前を伏せている間は保存できません';
const MSG_VIDEO_WEBM = 'このブラウザでは WebM 形式の動画になります（X には投稿できない形式です）';
const MSG_VIDEO_SAVED = '動画を保存しました。X の投稿画面で添付してください';
const MSG_BROKEN = '保存データが壊れていたため初期化しました';
const MSG_UNSAVABLE = 'このブラウザでは名簿を保存できません（閉じると消えます）';
const MSG_IMPORT_FAILED = '読み込めないファイルです。名簿は変更していません';
const MSG_IMPORT_CONFIRM = '現在の名簿をすべて置き換えます。よろしいですか？';

export function createApp(deps: AppDeps): App {
  let store = deps.initial.store;
  let screen: Screen = 'roster';
  let rosterView: RosterView | null = null;
  let resultView: ResultView | null = null;
  let race: { skip(): void } | null = null;
  let raceToken = 0;

  /** 保存できない・初期化した等、消えずに出し続ける通知。 */
  const standing: string[] = [];
  if (deps.extraNotice) standing.push(deps.extraNotice);
  if (deps.initial.notice === 'broken') standing.push(MSG_BROKEN);
  if (deps.initial.notice === 'unavailable') standing.push(MSG_UNSAVABLE);

  function messageWith(notice?: string): string | null {
    const lines = notice ? [notice, ...standing] : standing;
    return lines.length > 0 ? lines.join('\n') : null;
  }

  function renderRoster(notice?: string) {
    rosterView?.render(store, messageWith(notice));
  }

  function commit(next: Store, notice?: string) {
    const mutedChanged = next.muted !== store.muted;
    const changed = next !== store;
    store = next;
    if (changed && !saveStore(deps.storage, store) && !standing.includes(MSG_UNSAVABLE)) {
      standing.push(MSG_UNSAVABLE);
    }
    if (mutedChanged) {
      deps.onMutedChange(store.muted);
      resultView?.setMuted(store.muted);
    }
    renderRoster(notice);
  }

  function importText(text: string) {
    const incoming = importStore(text);
    if (!incoming) {
      renderRoster(MSG_IMPORT_FAILED);
      return;
    }
    if (!deps.confirm(MSG_IMPORT_CONFIRM)) return;
    commit(incoming);
  }

  function setScreen(next: Screen) {
    screen = next;
    deps.onScreenChange(next);
  }

  function showRoster() {
    rosterView = mountRosterView(
      deps.root,
      {
        onChange: commit,
        onStart: start,
        onExport: () => deps.download(EXPORT_FILENAME, exportStore(store)),
        onImport: importText,
        onImportFailed: () => renderRoster(MSG_IMPORT_FAILED),
        confirm: deps.confirm,
      },
      deps.newId,
    );
    renderRoster();
  }

  function showResult(
    order: readonly Member[],
    summary: RaceSummary | null,
    replay: Promise<ReplayVideo | null> | null,
  ) {
    const names = order.map((m) => m.name);
    const text = formatResult(names);
    let hidden = false;
    /** 今の設定（名前を伏せるか）で作った画像。作り直し中は null。 */
    let card: CardImage | null = null;
    let cardToken = 0;
    const model = () => buildShareModel(names, summary, hidden);
    function refreshCard() {
      const token = ++cardToken;
      card = null;
      view.setCard(null);
      void deps.share
        .renderCard(model())
        .catch(() => null)
        .then((image) => {
          // 作っている間に設定が変わった・画面を離れた場合は捨てる
          if (token !== cardToken || resultView !== view) return;
          card = image;
          view.setCard(image?.dataUrl ?? null);
          if (!image) view.setShareNote(MSG_CARD_FAILED);
        });
    }
    /** リプレイ動画。準備中は 'pending'、無い回は null。 */
    let video: ReplayVideo | 'pending' | null = replay ? 'pending' : null;
    function showVideo(saved = false) {
      if (video === null) view.setVideo('none');
      else if (video === 'pending') view.setVideo('pending');
      else if (hidden) view.setVideo('blocked', MSG_VIDEO_HIDDEN);
      else if (video.format === 'webm') view.setVideo('ready', MSG_VIDEO_WEBM);
      else view.setVideo('ready', saved ? MSG_VIDEO_SAVED : '');
    }
    const view = mountResultView(
      deps.root,
      names,
      summary,
      {
        onCopy: () => {
          void deps.copyText(text).then((ok) => {
            if (ok) view.setCopied();
            else view.showCopyFallback(text);
          });
        },
        onRedraw: redraw,
        onBack: back,
        onToggleMute: () => commit(setMuted(store, !store.muted)),
        onHideNames: (value) => {
          hidden = value;
          view.setShareNote('');
          refreshCard();
          showVideo();
        },
        onSaveVideo: () => {
          if (video === null || video === 'pending' || hidden) return;
          deps.share.saveFile(video.blob, `${REPLAY_FILENAME}.${video.format}`);
          showVideo(true);
        },
        onSaveImage: () => {
          if (card) deps.share.saveFile(card.blob, CARD_FILENAME);
        },
        onCopyImage: () => {
          if (!card) return;
          void deps.share.copyImage(card.blob).then((ok) => {
            if (resultView === view)
              view.setShareNote(ok ? MSG_IMAGE_COPIED : MSG_IMAGE_COPY_FAILED);
          });
        },
        onPost: () => {
          if (!card) return;
          const url = postUrl(shareText(model()));
          // 投稿画面は画像を受け取れないので、先にクリップボードへ入れてから開く
          void deps.share.copyImage(card.blob).then((ok) => {
            const opened = deps.share.openPost(url);
            if (resultView !== view) return;
            view.setShareNote(!opened ? MSG_POST_BLOCKED : ok ? MSG_POST_PASTE : MSG_POST_ATTACH);
          });
        },
      },
      store.muted,
    );
    resultView = view;
    refreshCard();
    showVideo();
    void replay
      ?.catch(() => null)
      .then((made) => {
        // 画面を離れたあとにできた動画は捨てる
        if (resultView !== view) return;
        video = made;
        showVideo();
      });
  }

  function beginRace() {
    const order = shuffle(activeMembers(currentGroup(store)), deps.randomInt);
    const token = ++raceToken;
    race = null;
    setScreen('race');
    const handle = deps.runRace(order, (summary, replay) => {
      if (token !== raceToken || screen !== 'race') return;
      race = null;
      showResult(order, summary ?? null, replay ?? null);
      setScreen('result');
    });
    if (token === raceToken && screen === 'race') race = handle;
  }

  function start() {
    if (screen !== 'roster' || drawBlockReason(currentGroup(store)) !== null) return;
    rosterView?.destroy();
    rosterView = null;
    beginRace();
  }

  function redraw() {
    if (screen !== 'result') return;
    resultView?.destroy();
    resultView = null;
    beginRace();
  }

  function back() {
    if (screen !== 'result') return;
    resultView?.destroy();
    resultView = null;
    showRoster();
    setScreen('roster');
  }

  showRoster();
  deps.onMutedChange(store.muted);

  return {
    get screen() {
      return screen;
    },
    start,
    skip() {
      if (screen === 'race') race?.skip();
    },
    redraw,
    back,
    setMuted(muted) {
      commit(setMuted(store, muted));
    },
    importText,
  };
}
