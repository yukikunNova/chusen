import { el } from './dom';

export type ResultViewHandlers = { onCopy(): void; onRedraw(): void; onBack(): void };
export type ResultView = {
  showCopyFallback(text: string): void;
  setCopied(): void;
  destroy(): void;
};

const TWO_COLUMN_MIN = 9;

export function mountResultView(
  root: HTMLElement,
  names: readonly string[],
  handlers: ResultViewHandlers,
): ResultView {
  const list = el(
    'ol',
    { class: names.length >= TWO_COLUMN_MIN ? 'result-list two-columns' : 'result-list' },
    names.map((name, i) => {
      const item = el(
        'li',
        { class: i === 0 ? 'result-item first' : 'result-item', testid: 'result-item' },
        [
          el('span', { class: 'rank', text: String(i + 1) }),
          el('span', { class: 'name', text: name }),
        ],
      );
      item.style.setProperty('--i', String(i));
      return item;
    }),
  );
  list.style.setProperty('--count', String(names.length));

  const copy = el('button', { class: 'btn', testid: 'copy', text: '結果をコピー', type: 'button' });
  const redraw = el('button', {
    class: 'btn',
    testid: 'redraw',
    text: 'もう一度抽選',
    type: 'button',
  });
  const back = el('button', { class: 'btn', testid: 'back', text: '名簿に戻る', type: 'button' });
  const fallback = el('textarea', {
    class: 'copy-fallback',
    testid: 'copy-fallback',
    hidden: true,
  });
  fallback.readOnly = true;

  copy.addEventListener('click', () => handlers.onCopy());
  redraw.addEventListener('click', () => handlers.onRedraw());
  back.addEventListener('click', () => handlers.onBack());

  const container = el('section', { class: 'screen result-screen' }, [
    el('h1', { class: 'result-title', text: '発表順 決定！' }),
    list,
    el('div', { class: 'result-actions' }, [copy, redraw, back]),
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
    destroy() {
      container.remove();
    },
  };
}
