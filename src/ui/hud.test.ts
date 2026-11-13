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
  it('写真判定の表示を出し、着差が決まったら数字を出し、null で消す', () => {
    const { root, hud } = setup();
    expect(one(root, 'photo').hidden).toBe(true);
    hud.setPhoto({ gap: null });
    expect(one(root, 'photo').hidden).toBe(false);
    expect(one(root, 'photo').textContent).toContain('写真判定');
    expect(one(root, 'photo').textContent).not.toContain('秒差');
    hud.setPhoto({ gap: 0.003 });
    expect(one(root, 'photo').textContent).toContain('0.003秒差');
    hud.setPhoto(null);
    expect(one(root, 'photo').hidden).toBe(true);
  });
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
  it('告知バナーを出す。出すたびに文面が入れ替わる', () => {
    const { root, hud } = setup();
    expect(one(root, 'banner').hidden).toBe(true);
    hud.showBanner('田中 3人抜き!!', 'overtake');
    expect(one(root, 'banner').hidden).toBe(false);
    expect(one(root, 'banner').textContent).toBe('田中 3人抜き!!');
    expect(one(root, 'banner').dataset.tone).toBe('overtake');
    hud.showBanner('FEVER TIME!!', 'fever');
    expect(one(root, 'banner').textContent).toBe('FEVER TIME!!');
    expect(one(root, 'banner').dataset.tone).toBe('fever');
  });
  it('コンボは 2 以上で表示し、1 以下で消す', () => {
    const { root, hud } = setup();
    expect(one(root, 'combo').hidden).toBe(true);
    hud.setCombo(1);
    expect(one(root, 'combo').hidden).toBe(true);
    hud.setCombo(4);
    expect(one(root, 'combo').hidden).toBe(false);
    expect(one(root, 'combo').textContent).toContain('4');
    hud.setCombo(0);
    expect(one(root, 'combo').hidden).toBe(true);
  });
  it('累計点は 3 桁区切りで表示する', () => {
    const { root, hud } = setup();
    expect(one(root, 'score').hidden).toBe(true);
    hud.setScore(1234500);
    expect(one(root, 'score').hidden).toBe(false);
    expect(one(root, 'score').textContent).toContain('1,234,500');
  });
  it('点数の吹き出しを指定の位置に出し、時間が経つと消す', () => {
    vi.useFakeTimers();
    const { root, hud } = setup();
    hud.popScore(0.25, 0.5, '+1,500');
    const pops = root.querySelectorAll<HTMLElement>('.hud-pop');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.textContent).toBe('+1,500');
    expect(pops[0]!.style.left).toBe('25%');
    expect(pops[0]!.style.top).toBe('50%');
    vi.advanceTimersByTime(2000);
    expect(root.querySelectorAll('.hud-pop')).toHaveLength(0);
    vi.useRealTimers();
  });
  it('ルーレットは回転中 → 結果 → 消去と切り替わる', () => {
    const { root, hud } = setup();
    expect(one(root, 'roulette').hidden).toBe(true);
    hud.setRoulette({ name: '田中' });
    expect(one(root, 'roulette').hidden).toBe(false);
    expect(one(root, 'roulette').dataset.state).toBe('spin');
    expect(one(root, 'roulette').textContent).toContain('田中');
    hud.setRoulette({ name: '田中', label: '超ターボ', rarity: 'rainbow' });
    expect(one(root, 'roulette').dataset.state).toBe('rainbow');
    expect(one(root, 'roulette').textContent).toContain('超ターボ');
    hud.setRoulette(null);
    expect(one(root, 'roulette').hidden).toBe(true);
  });
  it('フィーバーの切り替えと閃光', () => {
    const { root, hud } = setup();
    const screen = root.querySelector<HTMLElement>('.hud')!;
    hud.setFever(true);
    expect(screen.classList.contains('fever')).toBe(true);
    hud.setFever(false);
    expect(screen.classList.contains('fever')).toBe(false);
    expect(one(root, 'flash').classList.contains('on')).toBe(false);
    hud.flash();
    expect(one(root, 'flash').classList.contains('on')).toBe(true);
  });
  it('destroy で吹き出しのタイマーも止める', () => {
    vi.useFakeTimers();
    const { root, hud } = setup();
    hud.popScore(0.5, 0.5, '+500');
    hud.destroy();
    expect(root.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
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
