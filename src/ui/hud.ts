import { el } from './dom';

export type RankingEntry = { id: string; name: string };
export type Hud = {
  /** '3' '2' '1' 'GO!' など。null で消す。 */
  setCountdown(text: string | null): void;
  setTelop(text: string | null): void;
  /** 今回のコースの呼び名。null で消す。 */
  setCourseName(name: string | null): void;
  /** 暫定順位。先頭が 1 位。 */
  setRanking(entries: readonly RankingEntry[]): void;
  setMuted(muted: boolean): void;
  destroy(): void;
};
export type HudHandlers = { onSkip(): void; onToggleMute(): void };

export function mountHud(root: HTMLElement, handlers: HudHandlers, muted: boolean): Hud {
  const countdown = el('div', { class: 'hud-countdown', testid: 'countdown', hidden: true });
  const telop = el('div', { class: 'hud-telop', testid: 'telop', hidden: true });
  const courseName = el('div', { class: 'hud-course', testid: 'course-name', hidden: true });
  const ranking = el('ol', { class: 'hud-ranking', testid: 'ranking' });
  // 途中経過の飾り。順位が入れ替わるたびに読み上げられないようにする
  ranking.setAttribute('aria-hidden', 'true');
  const skip = el('button', {
    class: 'btn small',
    testid: 'skip',
    text: 'スキップ（Space）',
    type: 'button',
  });
  const mute = el('button', { class: 'btn small', testid: 'hud-mute', type: 'button' });
  const container = el('section', { class: 'screen hud' }, [
    countdown,
    courseName,
    ranking,
    telop,
    el('div', { class: 'hud-buttons' }, [mute, skip]),
  ]);
  root.append(container);

  skip.addEventListener('click', () => handlers.onSkip());
  mute.addEventListener('click', () => handlers.onToggleMute());

  const rows = new Map<string, HTMLElement>();
  let lastCountdown: string | null = null;
  let lastTelop: string | null = null;
  let lastCourseName: string | null = null;

  const hud: Hud = {
    setCountdown(text) {
      if (text === lastCountdown) return;
      lastCountdown = text;
      countdown.hidden = text === null;
      countdown.textContent = text ?? '';
      if (text !== null) {
        // 数字が変わるたびに飛び出すアニメーションをやり直す
        countdown.classList.remove('pop');
        void countdown.offsetWidth;
        countdown.classList.add('pop');
      }
    },
    setTelop(text) {
      if (text === lastTelop) return;
      lastTelop = text;
      telop.hidden = text === null;
      telop.textContent = text ?? '';
      if (text !== null) {
        telop.classList.remove('pop');
        void telop.offsetWidth;
        telop.classList.add('pop');
      }
    },
    setCourseName(name) {
      if (name === lastCourseName) return;
      lastCourseName = name;
      courseName.hidden = name === null;
      courseName.replaceChildren(
        ...(name === null
          ? []
          : [
              el('span', { class: 'hud-course-label', text: '本日のコース' }),
              el('span', { class: 'hud-course-name', text: name }),
            ]),
      );
    },
    setRanking(entries) {
      // 行は位置を動かして入れ替える（DOM の順は変えない）。読み上げは結果画面の一覧に任せる
      ranking.style.setProperty('--count', String(entries.length));
      const seen = new Set<string>();
      entries.forEach((entry, i) => {
        seen.add(entry.id);
        let row = rows.get(entry.id);
        if (!row) {
          row = el('li', { class: 'hud-rank-row' }, [
            el('span', { class: 'rank' }),
            el('span', { class: 'name', text: entry.name }),
          ]);
          row.dataset.id = entry.id;
          rows.set(entry.id, row);
          ranking.append(row);
        }
        const rank = String(i + 1);
        if (row.dataset.rank !== rank) {
          row.dataset.rank = rank;
          row.firstElementChild!.textContent = rank;
          row.style.setProperty('--pos', String(i));
        }
      });
      for (const [id, row] of rows) {
        if (seen.has(id)) continue;
        row.remove();
        rows.delete(id);
      }
    },
    setMuted(value) {
      mute.textContent = value ? '🔇 音オフ' : '🔊 音オン';
    },
    destroy() {
      container.remove();
    },
  };
  hud.setMuted(muted);
  return hud;
}
