import { el } from './dom';

export type RankingEntry = { id: string; name: string };
export type BannerTone = 'overtake' | 'fever';
/** ルーレットの表示。label が無いあいだは回転中、付いたら結果。 */
export type RouletteState = {
  name: string;
  label?: string;
  rarity?: 'white' | 'gold' | 'rainbow';
};
export type Hud = {
  /** '3' '2' '1' 'GO!' など。null で消す。 */
  setCountdown(text: string | null): void;
  setTelop(text: string | null): void;
  /** 今回のコースの呼び名。null で消す。 */
  setCourseName(name: string | null): void;
  /** 暫定順位。先頭が 1 位。 */
  setRanking(entries: readonly RankingEntry[]): void;
  /** 画面中央の大きな告知（「○○ 3人抜き!!」など）。少し経つと自分で消える。 */
  showBanner(text: string, tone: BannerTone): void;
  /** 連続した見せ場の回数。2 以上で表示する。 */
  setCombo(combo: number): void;
  /** 飾りの累計点。 */
  setScore(total: number): void;
  /** 点数の吹き出し。x・y は画面の左上からの割合（0〜1）。 */
  popScore(x: number, y: number, text: string): void;
  setRoulette(state: RouletteState | null): void;
  setFever(on: boolean): void;
  /** 写真判定の表示。gap が null のあいだは判定中、数字が入ったら着差（秒）。null で消す。 */
  setPhoto(state: { gap: number | null } | null): void;
  /** 画面全体を一瞬光らせる。続けて呼んでも、間隔が短いぶんは光らせない。 */
  flash(): void;
  setMuted(muted: boolean): void;
  destroy(): void;
};

/** 吹き出しを消すまで（ミリ秒）。 */
const POP_LIFE = 1100;
/** 閃光どうしの最小間隔（ミリ秒）。重なって画面が白くなり続けるのを防ぐ。 */
const FLASH_GAP = 900;
const ROULETTE_ICONS = '🚀⚡💣🍀💤🔥🎁⭐';
export type HudHandlers = { onSkip(): void; onToggleMute(): void };

export function mountHud(root: HTMLElement, handlers: HudHandlers, muted: boolean): Hud {
  const countdown = el('div', { class: 'hud-countdown', testid: 'countdown', hidden: true });
  const telop = el('div', { class: 'hud-telop', testid: 'telop', hidden: true });
  const courseName = el('div', { class: 'hud-course', testid: 'course-name', hidden: true });
  const banner = el('div', { class: 'hud-banner', testid: 'banner', hidden: true });
  const combo = el('div', { class: 'hud-combo', testid: 'combo', hidden: true });
  const score = el('div', { class: 'hud-score', testid: 'score', hidden: true });
  const roulette = el('div', { class: 'hud-roulette', testid: 'roulette', hidden: true });
  const photo = el('div', { class: 'hud-photo', testid: 'photo', hidden: true });
  const flash = el('div', { class: 'hud-flash', testid: 'flash' });
  const lines = el('div', { class: 'hud-lines' });
  const pops = el('div', { class: 'hud-pops' });
  // 途中経過の飾り。読み上げの対象にしない
  for (const item of [banner, combo, score, roulette, photo, flash, lines, pops]) {
    item.setAttribute('aria-hidden', 'true');
  }
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
    lines,
    flash,
    pops,
    score,
    combo,
    roulette,
    banner,
    photo,
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
  let lastCombo = 0;
  let lastScore = -1;
  let lastRoulette = '';
  let lastPhoto = '';
  let lastFlash = -Infinity;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** アニメーションを最初からやり直す。 */
  const replay = (node: HTMLElement, name: string) => {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  };

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
    showBanner(text, tone) {
      banner.hidden = false;
      banner.textContent = text;
      banner.dataset.tone = tone;
      replay(banner, 'pop');
    },
    setCombo(value) {
      if (value === lastCombo) return;
      lastCombo = value;
      combo.hidden = value < 2;
      if (value < 2) return;
      combo.replaceChildren(
        el('span', { class: 'hud-combo-label', text: 'COMBO' }),
        el('span', { class: 'hud-combo-count', text: `x${value}` }),
      );
      // 回数が増えるほど大きく
      combo.style.setProperty('--heat', String(Math.min(1, value / 8)));
      replay(combo, 'pop');
    },
    setScore(total) {
      if (total === lastScore) return;
      lastScore = total;
      score.hidden = false;
      score.replaceChildren(
        el('span', { class: 'hud-score-label', text: 'ドパ値' }),
        el('span', { class: 'hud-score-value', text: total.toLocaleString('en-US') }),
      );
      replay(score, 'pop');
    },
    popScore(x, y, text) {
      const pop = el('div', { class: 'hud-pop', text });
      pop.style.left = `${x * 100}%`;
      pop.style.top = `${y * 100}%`;
      pops.append(pop);
      const timer = setTimeout(() => {
        timers.delete(timer);
        pop.remove();
      }, POP_LIFE);
      timers.add(timer);
    },
    setRoulette(state) {
      const key = state ? `${state.name}|${state.label ?? ''}|${state.rarity ?? ''}` : '';
      if (key === lastRoulette) return;
      lastRoulette = key;
      roulette.hidden = state === null;
      if (!state) return;
      const done = state.label !== undefined;
      roulette.dataset.state = done ? (state.rarity ?? 'white') : 'spin';
      roulette.replaceChildren(
        el('span', { class: 'hud-roulette-name', text: `🎁 ${state.name}` }),
        done
          ? el('span', { class: 'hud-roulette-result', text: state.label ?? '' })
          : el('span', { class: 'hud-roulette-reel' }, [
              el('span', { class: 'hud-roulette-strip', text: ROULETTE_ICONS + ROULETTE_ICONS }),
            ]),
      );
      replay(roulette, 'pop');
    },
    setFever(on) {
      container.classList.toggle('fever', on);
    },
    setPhoto(state) {
      const key = state ? `on|${state.gap ?? ''}` : '';
      if (key === lastPhoto) return;
      lastPhoto = key;
      photo.hidden = state === null;
      if (!state) return;
      photo.dataset.state = state.gap === null ? 'judging' : 'result';
      photo.replaceChildren(
        el('span', { class: 'hud-photo-label', text: '📸 写真判定' }),
        ...(state.gap === null
          ? []
          : [el('span', { class: 'hud-photo-gap', text: `${state.gap.toFixed(3)}秒差!!` })]),
      );
      replay(photo, 'pop');
    },
    flash() {
      const now = performance.now();
      if (now - lastFlash < FLASH_GAP) return;
      lastFlash = now;
      replay(flash, 'on');
    },
    setMuted(value) {
      mute.textContent = value ? '🔇 音オフ' : '🔊 音オン';
    },
    destroy() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      container.remove();
    },
  };
  hud.setMuted(muted);
  return hud;
}
