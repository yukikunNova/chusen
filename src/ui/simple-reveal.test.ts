import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSimpleReveal } from './simple-reveal';

const names = (n: number) => Array.from({ length: n }, (_, i) => `人${i + 1}`);
const shown = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-testid=reveal-row].shown')].map(
    (row) => row.querySelector('.reveal-name')?.textContent,
  );

describe('runSimpleReveal', () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    document.body.append(root);
  });
  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it('最後尾から順に出て、5 人なら 3 秒で全員、最後が 1 番手', () => {
    runSimpleReveal(root, names(5), () => undefined);
    expect(root.querySelectorAll('[data-testid=reveal-row]')).toHaveLength(5);
    expect(shown(root)).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(shown(root)).toEqual(['人5']);
    vi.advanceTimersByTime(2300);
    expect(shown(root)).toEqual(['人2', '人3', '人4', '人5']);
    vi.advanceTimersByTime(100);
    expect(shown(root)).toEqual(['人1', '人2', '人3', '人4', '人5']);
  });
  it('全員表示の 1 秒後に onDone を 1 回呼び、表示を片付ける', () => {
    const onDone = vi.fn();
    runSimpleReveal(root, names(5), onDone);
    vi.advanceTimersByTime(3999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0);
    vi.advanceTimersByTime(10000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it('skip で即 onDone、その後タイマーが進んでも 2 回目は呼ばれない', () => {
    const onDone = vi.fn();
    const reveal = runSimpleReveal(root, names(5), onDone);
    vi.advanceTimersByTime(1000);
    reveal.skip();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0);
    reveal.skip();
    vi.advanceTimersByTime(10000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it('20 人でも表示完了は 8 秒', () => {
    const onDone = vi.fn();
    runSimpleReveal(root, names(20), onDone);
    vi.advanceTimersByTime(7999);
    expect(shown(root)).toHaveLength(19);
    vi.advanceTimersByTime(1);
    expect(shown(root)).toHaveLength(20);
    vi.advanceTimersByTime(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it('名前は HTML として解釈しない', () => {
    runSimpleReveal(root, ['<img src=x onerror>', 'b'], () => undefined);
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.reveal-name')?.textContent).toBe('<img src=x onerror>');
  });
  it('既定のタイマーを this なしで呼ぶ（ブラウザは this 付きの呼び出しを拒否する）', () => {
    vi.useRealTimers();
    const calls: number[] = [];
    function strictSetTimeout(this: unknown, _fn: () => void, ms: number) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(ms);
      return 1;
    }
    function strictClearTimeout(this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    }
    vi.stubGlobal('setTimeout', strictSetTimeout);
    vi.stubGlobal('clearTimeout', strictClearTimeout);
    try {
      const reveal = runSimpleReveal(root, names(2), () => undefined);
      expect(calls).toHaveLength(3);
      expect(() => reveal.skip()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('渡したタイマーを使う', () => {
    const timers = { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() };
    const reveal = runSimpleReveal(
      root,
      names(2),
      () => undefined,
      timers as unknown as { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout },
    );
    expect(timers.setTimeout).toHaveBeenCalled();
    reveal.skip();
    expect(timers.clearTimeout).toHaveBeenCalled();
  });
});
