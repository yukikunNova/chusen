import { el } from './dom';

/** 全員を出し終えるまでの秒数の上限と、1 人あたりの秒数。 */
const MAX_SECONDS = 8;
const SECONDS_PER_NAME = 0.6;
/** 全員が出てから結果画面へ移るまでの秒数。 */
const HOLD_SECONDS = 1;

type Timers = { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

/**
 * 3D が使えない環境向けの簡易演出。確定済みの順位を最後尾から 1 番手へ向かって 1 行ずつ出す。
 * 終わったら（またはスキップで）onDone をちょうど 1 回呼ぶ。
 */
export function runSimpleReveal(
  root: HTMLElement,
  names: readonly string[],
  onDone: () => void,
  timers: Timers = { setTimeout, clearTimeout },
): { skip(): void } {
  // ブラウザのタイマーは this 付きで呼ぶと例外になるので、関数として取り出して呼ぶ
  const { setTimeout: later, clearTimeout: cancel } = timers;
  const rows = names.map((name, i) =>
    el('li', { class: 'reveal-row', testid: 'reveal-row' }, [
      el('span', { class: 'reveal-rank', text: String(i + 1) }),
      el('span', { class: 'reveal-name', text: name }),
    ]),
  );
  const skipButton = el('button', {
    class: 'tool-btn',
    testid: 'reveal-skip',
    text: 'スキップ（Space）',
    type: 'button',
  });
  const container = el('section', { class: 'screen reveal-screen' }, [
    el('h2', { class: 'reveal-title', text: '抽選中…' }),
    el('ol', { class: 'reveal-list' }, rows),
    skipButton,
  ]);
  root.append(container);

  const count = rows.length;
  const total = Math.min(MAX_SECONDS, SECONDS_PER_NAME * count) * 1000;
  const pending: ReturnType<typeof setTimeout>[] = [];
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    for (const id of pending) cancel(id);
    container.remove();
    onDone();
  }

  rows.forEach((_, k) => {
    // k 番目に出すのは後ろから k 番目の人
    const row = rows[count - 1 - k]!;
    const at = Math.round(((k + 1) * total) / count);
    pending.push(later(() => row.classList.add('shown'), at));
  });
  pending.push(later(finish, total + HOLD_SECONDS * 1000));
  skipButton.addEventListener('click', finish);

  return { skip: finish };
}
