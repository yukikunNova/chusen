import { describe, expect, it, vi } from 'vitest';
import { mountResultView } from './result-view';

const handlers = () => ({
  onCopy: vi.fn(),
  onRedraw: vi.fn(),
  onBack: vi.fn(),
  onToggleMute: vi.fn(),
});
const all = (root: HTMLElement, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const one = (root: HTMLElement, id: string) => all(root, id)[0]!;
const names = (n: number) => Array.from({ length: n }, (_, i) => `人${i + 1}`);

describe('mountResultView', () => {
  it('9 人以上は 2 列、1 番手に first が付く', () => {
    const root = document.createElement('div');
    mountResultView(root, names(9), handlers(), false);
    const items = all(root, 'result-item');
    expect(items).toHaveLength(9);
    expect(items[0]!.classList.contains('first')).toBe(true);
    expect(items[1]!.classList.contains('first')).toBe(false);
    expect(items[0]!.textContent).toContain('人1');
    expect(items[0]!.parentElement!.classList.contains('two-columns')).toBe(true);
  });
  it('8 人以下は 1 列', () => {
    const root = document.createElement('div');
    mountResultView(root, names(8), handlers(), false);
    expect(one(root, 'result-item').parentElement!.classList.contains('two-columns')).toBe(false);
  });
  it('名前の HTML 断片は文字として表示する', () => {
    const root = document.createElement('div');
    mountResultView(root, ['<img src=x onerror>', 'b'], handlers(), false);
    expect(one(root, 'result-item').textContent).toContain('<img src=x onerror>');
    expect(root.querySelector('img')).toBeNull();
  });
  it('ボタンが各ハンドラを呼ぶ', () => {
    const root = document.createElement('div');
    const h = handlers();
    mountResultView(root, names(2), h, false);
    one(root, 'copy').click();
    one(root, 'redraw').click();
    one(root, 'back').click();
    expect(h.onCopy).toHaveBeenCalledTimes(1);
    expect(h.onRedraw).toHaveBeenCalledTimes(1);
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });
  it('showCopyFallback で結果テキストを表示する', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), handlers(), false);
    expect(one(root, 'copy-fallback').hidden).toBe(true);
    view.showCopyFallback('1. 人1\n2. 人2');
    const area = one(root, 'copy-fallback') as HTMLTextAreaElement;
    expect(area.hidden).toBe(false);
    expect(area.value).toBe('1. 人1\n2. 人2');
  });
  it('destroy で DOM を片付ける', () => {
    const root = document.createElement('div');
    const view = mountResultView(root, names(2), handlers(), false);
    view.destroy();
    expect(root.children).toHaveLength(0);
  });
  it('音の切替ボタンが現在の状態を示し、押すと onToggleMute を呼ぶ', () => {
    const root = document.createElement('div');
    const h = handlers();
    const view = mountResultView(root, names(2), h, false);
    const mute = root.querySelector<HTMLElement>('[data-testid=result-mute]')!;
    expect(mute.textContent).toBe('🔊 音オン');
    mute.click();
    expect(h.onToggleMute).toHaveBeenCalledTimes(1);
    view.setMuted(true);
    expect(mute.textContent).toBe('🔇 音オフ');
  });
  it('手動コピー用の欄に読み上げ用の名前が付く', () => {
    const root = document.createElement('div');
    mountResultView(root, names(2), handlers(), false);
    expect(root.querySelector('[data-testid=copy-fallback]')?.getAttribute('aria-label')).toBe(
      '抽選結果（手動コピー用）',
    );
  });
});
