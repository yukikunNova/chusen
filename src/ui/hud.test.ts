import { describe, expect, it, vi } from 'vitest';
import { mountHud } from './hud';

const one = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

function setup(muted = false) {
  const root = document.createElement('div');
  const handlers = { onSkip: vi.fn(), onToggleMute: vi.fn() };
  const hud = mountHud(root, handlers, muted);
  return { root, handlers, hud };
}

describe('mountHud', () => {
  it('テロップを出し、null で消す', () => {
    const { root, hud } = setup();
    expect(one(root, 'telop').hidden).toBe(true);
    hud.setTelop('田中、謎の出遅れ！');
    expect(one(root, 'telop').textContent).toBe('田中、謎の出遅れ！');
    expect(one(root, 'telop').hidden).toBe(false);
    hud.setTelop(null);
    expect(one(root, 'telop').hidden).toBe(true);
  });
  it('コース名を出し、null で消す', () => {
    const { root, hud } = setup();
    expect(one(root, 'course-name').hidden).toBe(true);
    hud.setCourseName('マグマきりもみ街道');
    expect(one(root, 'course-name').textContent).toContain('マグマきりもみ街道');
    expect(one(root, 'course-name').hidden).toBe(false);
    hud.setCourseName(null);
    expect(one(root, 'course-name').hidden).toBe(true);
  });
  it('カウントダウンを出し、null で消す', () => {
    const { root, hud } = setup();
    hud.setCountdown('3');
    expect(one(root, 'countdown').textContent).toBe('3');
    expect(one(root, 'countdown').hidden).toBe(false);
    hud.setCountdown(null);
    expect(one(root, 'countdown').hidden).toBe(true);
  });
  it('順位表は名前を文字として表示し、順番どおり番号を振る', () => {
    const { root, hud } = setup();
    hud.setRanking([
      { id: 'a', name: '<i>a</i>' },
      { id: 'b', name: 'b' },
    ]);
    const ranking = one(root, 'ranking');
    expect(ranking.querySelector('i')).toBeNull();
    expect(ranking.textContent).toContain('<i>a</i>');
    const row = (id: string) => ranking.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    expect(row('a').dataset.rank).toBe('1');
    expect(row('b').dataset.rank).toBe('2');
    hud.setRanking([
      { id: 'b', name: 'b' },
      { id: 'a', name: '<i>a</i>' },
    ]);
    expect(row('a').dataset.rank).toBe('2');
    expect(row('b').dataset.rank).toBe('1');
    expect(ranking.querySelectorAll('[data-id]')).toHaveLength(2);
  });
  it('スキップとミュートのボタンがハンドラを呼ぶ', () => {
    const { root, handlers } = setup();
    one(root, 'skip').click();
    one(root, 'hud-mute').click();
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleMute).toHaveBeenCalledTimes(1);
  });
  it('ミュート表示を切り替える', () => {
    const { root, hud } = setup(true);
    expect(one(root, 'hud-mute').textContent).toContain('🔇');
    hud.setMuted(false);
    expect(one(root, 'hud-mute').textContent).toContain('🔊');
  });
  it('destroy で片付ける', () => {
    const { root, hud } = setup();
    hud.destroy();
    expect(root.children).toHaveLength(0);
  });
});
