import {
  activeMembers,
  addGroup,
  addMembers,
  currentGroup,
  drawBlockReason,
  removeGroup,
  removeMember,
  renameGroup,
  renameMember,
  selectGroup,
  setAllActive,
  setMemberActive,
  setMuted,
  type Group,
  type Member,
  type NewId,
  type Store,
} from '../domain/roster';
import { el, isComposingEnter } from './dom';

export type RosterViewHandlers = {
  /** notice は変更に伴う一時的なお知らせ（人数超過など）。 */
  onChange(next: Store, notice?: string): void;
  onStart(): void;
  onExport(): void;
  onImport(text: string): void;
  confirm(message: string): boolean;
};
export type RosterView = { render(store: Store, message: string | null): void; destroy(): void };

export function mountRosterView(
  root: HTMLElement,
  handlers: RosterViewHandlers,
  newId: NewId,
): RosterView {
  let store: Store | null = null;

  const tabs = el('div', { class: 'tabs' });
  const groupAdd = el('button', {
    class: 'icon-btn',
    testid: 'group-add',
    text: '＋',
    title: 'グループを追加',
    type: 'button',
  });
  const groupRename = el('button', {
    class: 'icon-btn',
    testid: 'group-rename',
    text: '✎',
    title: 'グループ名を変更',
    type: 'button',
  });
  const groupDelete = el('button', {
    class: 'icon-btn',
    testid: 'group-delete',
    text: '🗑',
    title: 'グループを削除',
    type: 'button',
  });
  const mute = el('button', { class: 'tool-btn', testid: 'mute', type: 'button' });
  const exportBtn = el('button', {
    class: 'tool-btn',
    testid: 'export',
    text: '書き出し',
    title: '名簿を JSON ファイルに保存',
    type: 'button',
  });
  const importInput = el('input', { testid: 'import', type: 'file', hidden: true });
  importInput.accept = 'application/json,.json';
  const importBtn = el('button', {
    class: 'tool-btn',
    text: '読み込み',
    title: 'JSON ファイルから名簿を読み込む',
    type: 'button',
  });
  const message = el('p', { class: 'message', testid: 'message', hidden: true });
  const memberInput = el('input', {
    class: 'member-input',
    testid: 'member-input',
    type: 'text',
    placeholder: '名前を入力して Enter（改行区切りでまとめて貼り付け可）',
  });
  const list = el('ul', { class: 'member-list' });
  const empty = el('p', {
    class: 'empty',
    text: 'まだ誰もいません。上の欄に名前を入れてください。',
  });
  const allOn = el('button', {
    class: 'btn small',
    testid: 'all-on',
    text: '全員オン',
    type: 'button',
  });
  const activeCount = el('span', { class: 'active-count', testid: 'active-count' });
  const blockReason = el('p', { class: 'block-reason', testid: 'block-reason' });
  const start = el('button', {
    class: 'start-btn',
    testid: 'start',
    text: '🚀 抽選スタート',
    type: 'button',
  });

  const container = el('section', { class: 'screen roster-screen' }, [
    el('header', { class: 'roster-header' }, [
      el('div', { class: 'title' }, [
        el('h1', { text: '銀河グランプリ' }),
        el('p', { text: '発表順抽選' }),
      ]),
      el('div', { class: 'tools' }, [mute, exportBtn, importBtn, importInput]),
    ]),
    message,
    el('div', { class: 'group-bar' }, [
      tabs,
      el('div', { class: 'group-actions' }, [groupAdd, groupRename, groupDelete]),
    ]),
    el('div', { class: 'panel' }, [memberInput, list, empty]),
    el('footer', { class: 'roster-footer' }, [
      el('div', { class: 'count-row' }, [activeCount, allOn]),
      start,
      blockReason,
    ]),
  ]);
  root.append(container);

  const change = (next: Store, notice?: string) => {
    if (store && (next !== store || notice)) handlers.onChange(next, notice);
  };
  const group = (): Group | null => (store ? currentGroup(store) : null);

  /** 表示中の要素をその場で入力欄に差し替え、確定で commit を呼ぶ。 */
  function editInline(
    target: HTMLElement,
    value: string,
    testid: string,
    commit: (v: string) => void,
  ) {
    const input = el('input', { class: 'inline-input', testid, type: 'text' });
    input.value = value;
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      const next = input.value;
      input.replaceWith(target);
      if (save && next.trim() !== '' && next !== value) commit(next);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isComposingEnter(e)) finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    target.replaceWith(input);
    input.focus();
    input.select();
  }

  function addFromText(text: string) {
    const g = group();
    if (!store || !g) return;
    const result = addMembers(store, g.id, text, newId);
    const notice =
      result.dropped > 0
        ? `1グループ30人までです（${result.dropped}人を追加できませんでした）`
        : undefined;
    change(result.store, notice);
  }

  memberInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || isComposingEnter(e)) return;
    const text = memberInput.value;
    memberInput.value = '';
    addFromText(text);
  });
  memberInput.addEventListener('paste', (e) => {
    const text = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(text)) return;
    e.preventDefault();
    addFromText(text);
  });

  groupAdd.addEventListener('click', () => {
    if (store) change(addGroup(store, `グループ${store.groups.length + 1}`, newId));
  });
  groupRename.addEventListener('click', () => {
    const g = group();
    const tab = tabs.querySelector<HTMLElement>('.tab.active');
    if (!g || !tab) return;
    editInline(tab, g.name, 'group-name-input', (v) => {
      if (store) change(renameGroup(store, g.id, v));
    });
  });
  groupDelete.addEventListener('click', () => {
    const g = group();
    if (!store || !g) return;
    if (!handlers.confirm(`グループ「${g.name}」を削除しますか？`)) return;
    handlers.onChange(removeGroup(store, g.id, newId));
  });
  mute.addEventListener('click', () => {
    if (store) change(setMuted(store, !store.muted));
  });
  exportBtn.addEventListener('click', () => handlers.onExport());
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    void file.text().then((text) => handlers.onImport(text));
  });
  allOn.addEventListener('click', () => {
    const g = group();
    if (store && g) change(setAllActive(store, g.id));
  });
  start.addEventListener('click', () => handlers.onStart());

  function memberRow(g: Group, member: Member): HTMLElement {
    const name = el('button', {
      class: 'member-name',
      testid: 'member-name',
      text: member.name,
      title: 'クリックで名前を変更',
      type: 'button',
    });
    name.addEventListener('click', () =>
      editInline(name, member.name, 'member-name-input', (v) => {
        if (store) change(renameMember(store, g.id, member.id, v));
      }),
    );
    const toggle = el('input', { testid: 'member-toggle', type: 'checkbox' });
    toggle.checked = member.active;
    toggle.setAttribute('aria-label', `${member.name} の参加`);
    toggle.addEventListener('change', () => {
      if (store) change(setMemberActive(store, g.id, member.id, toggle.checked));
    });
    const del = el('button', {
      class: 'icon-btn',
      testid: 'member-delete',
      text: '✕',
      title: '削除',
      type: 'button',
    });
    del.addEventListener('click', () => {
      if (store) change(removeMember(store, g.id, member.id));
    });
    return el(
      'li',
      { class: member.active ? 'member-row' : 'member-row inactive', testid: 'member-row' },
      [name, el('label', { class: 'switch' }, [toggle, el('span', { class: 'slider' })]), del],
    );
  }

  return {
    render(next, text) {
      store = next;
      const g = currentGroup(next);

      tabs.replaceChildren(
        ...next.groups.map((item) => {
          const tab = el('button', {
            class: item.id === g.id ? 'tab active' : 'tab',
            testid: 'group-tab',
            text: item.name,
            type: 'button',
          });
          tab.addEventListener('click', () => change(selectGroup(next, item.id)));
          return tab;
        }),
      );
      list.replaceChildren(...g.members.map((m) => memberRow(g, m)));
      empty.hidden = g.members.length > 0;

      activeCount.textContent = `参加 ${activeMembers(g).length} / ${g.members.length}人`;
      const reason = drawBlockReason(g);
      start.disabled = reason !== null;
      blockReason.textContent = reason ?? '';

      mute.textContent = next.muted ? '🔇 音オフ' : '🔊 音オン';
      message.textContent = text ?? '';
      message.hidden = text === null;
    },
    destroy() {
      container.remove();
    },
  };
}
