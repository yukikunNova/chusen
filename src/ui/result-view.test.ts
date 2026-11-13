import { describe, expect, it, vi } from 'vitest';
import { mountResultView } from './result-view';

const handlers = () => ({
  onCopy: vi.fn(),
  onRedraw: vi.fn(),
  onBack: vi.fn(),
  onToggleMute: vi.fn(),
  onHideNames: vi.fn(),
  onSaveImage: vi.fn(),
  onCopyImage: vi.fn(),
  onPost: vi.fn(),
  onSaveVideo: vi.fn(),
});
const all = (root: HTMLElement, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const one = (root: HTMLElement, id: string) => all(root, id)[0]!;
const names = (n: number) => Array.from({ length: n }, (_, i) => `人${i + 1}`);

describe('mountResultView', () => {
  it('9 人以上は 2 列、1 番手に first が付く', () => {
    const root = document.createElement('div');
    mountResultView(root, names(9), null, handlers(), false);
    const items = all(root, 'result-item');
    expect(items).toHaveLength(9);
    expect(items[0]!.classList.contains('first')).toBe(true);
    expect(items[1]!.classList.contains('first')).toBe(false);
    expect(items[0]!.textContent).toContain('人1');
    expect(items[0]!.parentElement!.classList.contains('two-columns')).toBe(true);
  });
  it('8 人以下は 1 列', () => {
    const root = document.createElement('div');
    mountResultView(root, names(8), null, handlers(), false);
    expect(one(root, 'result-item').parentElement!.classList.contains('two-columns')).toBe(false);
  });
  it('名前の HTML 断片は文字として表示する', () => {
    const root = document.createElement('div');
    mountResultView(root, ['<img src=x onerror>', 'b'], null, handlers(), false);
    expect(one(root, 'result-item').textContent).toContain('<img src=x onerror>');
    expect(one(root, 'result-item').querySelector('img')).toBeNull();
  });
  it('ボタンが各ハンドラを呼ぶ', () => {
    const root = document.createElement('div');
    const h = handlers();
    mountResultView(root, names(2), null, h, false);
    one(root, 'copy').click();
    one(root, 'redraw').click();
    one(root, 'back').click();
    expect(h.onCopy).toHaveBeenCalledTimes(1);
    expect(h.onRedraw).toHaveBeenCalledTimes(1);
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });
  it('showCopyFallback で結果テキストを表示する', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), null, handlers(), false);
    expect(one(root, 'copy-fallback').hidden).toBe(true);
    view.showCopyFallback('1. 人1\n2. 人2');
    const area = one(root, 'copy-fallback') as HTMLTextAreaElement;
    expect(area.hidden).toBe(false);
    expect(area.value).toBe('1. 人1\n2. 人2');
  });
  it('destroy で DOM を片付ける', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), null, handlers(), false);
    view.destroy();
    expect(root.children).toHaveLength(0);
  });
  it('音の切替ボタンが現在の状態を示し、押すと onToggleMute を呼ぶ', () => {
    const root = document.createElement('div');
    const h = handlers();
    const view = mountResultView(root, names(2), null, h, false);
    const mute = root.querySelector<HTMLElement>('[data-testid=result-mute]')!;
    expect(mute.textContent).toBe('🔊 音オン');
    mute.click();
    expect(h.onToggleMute).toHaveBeenCalledTimes(1);
    view.setMuted(true);
    expect(mute.textContent).toBe('🔇 音オフ');
  });
  it('手動コピー用の欄に読み上げ用の名前が付く', () => {
    const root = document.createElement('div');
    mountResultView(root, names(2), null, handlers(), false);
    expect(root.querySelector('[data-testid=copy-fallback]')?.getAttribute('aria-label')).toBe(
      '抽選結果（手動コピー用）',
    );
  });
  it('称号を名前の横に出す。称号のない人には出さない', () => {
    const root = document.createElement('div');
    const summary = {
      courseName: 'ネオン峠',
      score: 12345,
      titles: ['ドパ値MVP', null],
      photoGap: null,
    };
    mountResultView(root, names(2), summary, handlers(), false);
    const items = all(root, 'result-item');
    expect(items[0]!.querySelector('[data-testid=title-badge]')!.textContent).toBe('ドパ値MVP');
    expect(items[1]!.querySelector('[data-testid=title-badge]')).toBeNull();
    // 名前の欄そのものは変えない
    expect(items[0]!.querySelector('.name')!.textContent).toBe('人1');
  });
  it('コース名・ドパ値・写真判定の着差を出す。まとめが無ければ出さない', () => {
    const root = document.createElement('div');
    const summary = { courseName: 'ネオン峠', score: 12345, titles: [null, null], photoGap: 0.003 };
    mountResultView(root, names(2), summary, handlers(), false);
    const info = one(root, 'result-info').textContent!;
    expect(info).toContain('ネオン峠');
    expect(info).toContain('12,345');
    expect(info).toContain('0.003秒差');

    const plain = document.createElement('div');
    mountResultView(plain, names(2), null, handlers(), false);
    expect(one(plain, 'result-info').hidden).toBe(true);
  });
  it('共有: 名前を伏せる切替と 3 つのボタンが各ハンドラを呼ぶ', () => {
    const root = document.createElement('div');
    // チェックボックスの change は、文書につながっているときだけ出る
    document.body.append(root);
    const h = handlers();
    const view = mountResultView(root, names(2), null, h, false);
    // 画像ができるまで共有のボタンは押せない
    view.setCard('data:image/png;base64,AAAA');
    const hide = one(root, 'hide-names') as HTMLInputElement;
    expect(hide.checked).toBe(false);
    hide.click();
    expect(h.onHideNames).toHaveBeenLastCalledWith(true);
    hide.click();
    expect(h.onHideNames).toHaveBeenLastCalledWith(false);
    one(root, 'save-image').click();
    one(root, 'copy-image').click();
    one(root, 'post').click();
    expect(h.onSaveImage).toHaveBeenCalledTimes(1);
    expect(h.onCopyImage).toHaveBeenCalledTimes(1);
    expect(h.onPost).toHaveBeenCalledTimes(1);
  });
  it('共有: 画像ができるまでボタンは押せず、できたら見本を出して押せるようにする', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), null, handlers(), false);
    const preview = one(root, 'card-preview') as HTMLImageElement;
    const buttons = ['save-image', 'copy-image', 'post'].map(
      (id) => one(root, id) as HTMLButtonElement,
    );
    expect(preview.hidden).toBe(true);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    view.setCard('data:image/png;base64,AAAA');
    expect(preview.hidden).toBe(false);
    expect(preview.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    view.setCard(null);
    expect(preview.hidden).toBe(true);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
  it('共有: 案内文を出す', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), null, handlers(), false);
    expect(one(root, 'share-note').textContent).toBe('');
    view.setShareNote('画像をコピーしました');
    expect(one(root, 'share-note').textContent).toBe('画像をコピーしました');
  });
  it('動画: 無い回はボタンを出さない', () => {
    const root = document.createElement('div');
    mountResultView(root, names(2), null, handlers(), false);
    expect(one(root, 'save-video').hidden).toBe(true);
    expect(one(root, 'video-note').textContent).toBe('');
  });
  it('動画: 準備中は押せず、できたら押せる。保存できない間は理由を出す', () => {
    const root = document.createElement('div');
    const h = handlers();
    const view = mountResultView(root, names(2), null, h, false);
    const button = one(root, 'save-video') as HTMLButtonElement;
    view.setVideo('pending');
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('動画を準備中…');
    view.setVideo('ready', 'WebM 形式です');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('動画を保存');
    expect(one(root, 'video-note').textContent).toBe('WebM 形式です');
    button.click();
    expect(h.onSaveVideo).toHaveBeenCalledTimes(1);
    view.setVideo('blocked', '名前を伏せている間は保存できません');
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(true);
    expect(one(root, 'video-note').textContent).toBe('名前を伏せている間は保存できません');
    view.setVideo('none');
    expect(button.hidden).toBe(true);
    expect(one(root, 'video-note').textContent).toBe('');
  });
});
