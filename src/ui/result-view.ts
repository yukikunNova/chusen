import { rareLine } from '../domain/rare';
import { formatGap, formatScore } from '../domain/share';
import type { RaceSummary } from '../domain/summary';
import { el } from './dom';

export type ResultViewHandlers = {
  onCopy(): void;
  onRedraw(): void;
  onBack(): void;
  onToggleMute(): void;
  /** 共有する画像と投稿文で、名前を伏せるかどうかが変わった。 */
  onHideNames(hidden: boolean): void;
  onSaveImage(): void;
  onCopyImage(): void;
  onPost(): void;
  onSaveVideo(): void;
};
/** リプレイ動画のボタンの状態。none: 動画なし／pending: 準備中／ready: 保存できる／blocked: 今は保存できない。 */
export type VideoState = 'none' | 'pending' | 'ready' | 'blocked';
export type ResultView = {
  showCopyFallback(text: string): void;
  setCopied(): void;
  setMuted(muted: boolean): void;
  /** 共有する画像の見本。null のあいだは見本を消し、共有のボタンを押せなくする。 */
  setCard(dataUrl: string | null): void;
  /** 共有の案内文（コピーできた、など）。 */
  setShareNote(text: string): void;
  /** リプレイ動画のボタンと、その案内文。 */
  setVideo(state: VideoState, note?: string): void;
  destroy(): void;
};

const TWO_COLUMN_MIN = 9;

export function mountResultView(
  root: HTMLElement,
  names: readonly string[],
  summary: RaceSummary | null,
  handlers: ResultViewHandlers,
  muted: boolean,
): ResultView {
  const muteLabel = (value: boolean) => (value ? '🔇 音オフ' : '🔊 音オン');
  const list = el(
    'ol',
    { class: names.length >= TWO_COLUMN_MIN ? 'result-list two-columns' : 'result-list' },
    names.map((name, i) => {
      const title = summary?.titles[i] ?? null;
      const item = el(
        'li',
        { class: i === 0 ? 'result-item first' : 'result-item', testid: 'result-item' },
        [
          el('span', { class: 'rank', text: String(i + 1) }),
          el('span', { class: 'name', text: name }),
          ...(title
            ? [el('span', { class: 'title-badge', testid: 'title-badge', text: title })]
            : []),
        ],
      );
      item.style.setProperty('--i', String(i));
      return item;
    }),
  );
  const rows = names.length >= TWO_COLUMN_MIN ? Math.ceil(names.length / 2) : names.length;
  list.style.setProperty('--rows', String(Math.max(1, rows)));

  const copy = el('button', { class: 'btn', testid: 'copy', text: '結果をコピー', type: 'button' });
  const redraw = el('button', {
    class: 'btn',
    testid: 'redraw',
    text: 'もう一度抽選',
    type: 'button',
  });
  const back = el('button', { class: 'btn', testid: 'back', text: '名簿に戻る', type: 'button' });
  const mute = el('button', {
    class: 'btn',
    testid: 'result-mute',
    text: muteLabel(muted),
    type: 'button',
  });
  const fallback = el('textarea', {
    class: 'copy-fallback',
    testid: 'copy-fallback',
    hidden: true,
  });
  fallback.readOnly = true;
  fallback.setAttribute('aria-label', '抽選結果（手動コピー用）');

  // レースのまとめ（コース名・ドパ値・写真判定）
  const facts: string[] = [];
  if (summary?.rare) facts.push(`🌈 ${rareLine(summary.rare)}`);
  if (summary?.courseName) facts.push(`コース: ${summary.courseName}`);
  if (summary && summary.score > 0) facts.push(`ドパ値 ${formatScore(summary.score)}`);
  if (summary && summary.photoGap !== null) {
    facts.push(`📸 写真判定 ${formatGap(summary.photoGap)}`);
  }
  const info = el('p', {
    class: 'result-info',
    testid: 'result-info',
    text: facts.join('　'),
    hidden: facts.length === 0,
  });

  // 共有（画像と X への投稿）
  const preview = el('img', { class: 'share-preview', testid: 'card-preview', hidden: true });
  preview.alt = '共有する結果画像の見本';
  const hide = el('input', { testid: 'hide-names', type: 'checkbox' });
  const saveImage = el('button', {
    class: 'btn small',
    testid: 'save-image',
    text: '画像を保存',
    type: 'button',
  });
  const copyImage = el('button', {
    class: 'btn small',
    testid: 'copy-image',
    text: '画像をコピー',
    type: 'button',
  });
  const post = el('button', {
    class: 'btn small',
    testid: 'post',
    text: 'X に投稿',
    type: 'button',
  });
  const saveVideo = el('button', {
    class: 'btn small',
    testid: 'save-video',
    text: '動画を保存',
    type: 'button',
    hidden: true,
  });
  const videoNote = el('p', { class: 'share-note', testid: 'video-note' });
  videoNote.setAttribute('role', 'status');
  const shareButtons = [saveImage, copyImage, post];
  for (const button of shareButtons) button.disabled = true;
  const note = el('p', { class: 'share-note', testid: 'share-note' });
  note.setAttribute('role', 'status');
  const share = el('div', { class: 'share' }, [
    preview,
    el('div', { class: 'share-controls' }, [
      el('label', { class: 'share-hide' }, [
        hide,
        el('span', { text: '共有では名前を伏せる（Aさん・Bさん…）' }),
      ]),
      el('div', { class: 'share-buttons' }, [...shareButtons, saveVideo]),
      note,
      videoNote,
    ]),
  ]);

  hide.addEventListener('change', () => handlers.onHideNames(hide.checked));
  saveImage.addEventListener('click', () => handlers.onSaveImage());
  copyImage.addEventListener('click', () => handlers.onCopyImage());
  post.addEventListener('click', () => handlers.onPost());
  saveVideo.addEventListener('click', () => handlers.onSaveVideo());
  copy.addEventListener('click', () => handlers.onCopy());
  redraw.addEventListener('click', () => handlers.onRedraw());
  back.addEventListener('click', () => handlers.onBack());
  mute.addEventListener('click', () => handlers.onToggleMute());

  const container = el('section', { class: 'screen result-screen' }, [
    el('h1', { class: 'result-title', text: '発表順 決定！' }),
    info,
    list,
    el('div', { class: 'result-actions' }, [copy, redraw, back, mute]),
    share,
    fallback,
  ]);
  root.append(container);

  return {
    showCopyFallback(text) {
      fallback.value = text;
      fallback.hidden = false;
      fallback.rows = Math.min(10, names.length);
      fallback.focus();
      fallback.select();
    },
    setCopied() {
      copy.textContent = 'コピーしました ✓';
    },
    setMuted(value) {
      mute.textContent = muteLabel(value);
    },
    setCard(dataUrl) {
      preview.hidden = dataUrl === null;
      if (dataUrl === null) preview.removeAttribute('src');
      else preview.src = dataUrl;
      for (const button of shareButtons) button.disabled = dataUrl === null;
    },
    setShareNote(text) {
      note.textContent = text;
    },
    setVideo(state, text = '') {
      saveVideo.hidden = state === 'none';
      saveVideo.disabled = state !== 'ready';
      saveVideo.textContent = state === 'pending' ? '動画を準備中…' : '動画を保存';
      videoNote.textContent = state === 'none' ? '' : text;
    },
    destroy() {
      container.remove();
    },
  };
}
