import { describe, expect, it, vi } from 'vitest';
import {
  addGroup,
  addMembers,
  createInitialStore,
  removeGroup,
  setMemberActive,
  type Store,
} from '../domain/roster';
import { mountRosterView, type RosterViewHandlers } from './roster-view';

function ids(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function storeWith(names: string[]): Store {
  const newId = ids();
  const s = createInitialStore(newId);
  return addMembers(s, 'id1', names.join('\n'), newId).store;
}

function setup(store: Store, message: string | null = null) {
  const root = document.createElement('div');
  document.body.append(root);
  const handlers = {
    onChange: vi.fn<RosterViewHandlers['onChange']>(),
    onStart: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onImportFailed: vi.fn(),
    confirm: vi.fn(() => true),
  };
  const view = mountRosterView(root, handlers, ids('new'));
  view.render(store, message);
  return { root, handlers, view };
}

const all = (root: HTMLElement, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const one = (root: HTMLElement, id: string) => all(root, id)[0]!;
const key = (el: HTMLElement, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const lastStore = (h: { onChange: { mock: { calls: unknown[][] } } }) =>
  h.onChange.mock.calls.at(-1)![0] as Store;

describe('mountRosterView', () => {
  it('名前を入れて Enter で 1 人追加し、入力欄を空にする', () => {
    const { root, handlers } = setup(storeWith([]));
    const input = one(root, 'member-input') as HTMLInputElement;
    input.value = '佐藤';
    key(input, 'Enter');
    expect(lastStore(handlers).groups[0]!.members.map((m) => m.name)).toEqual(['佐藤']);
    expect(input.value).toBe('');
  });
  it('日本語変換の確定 Enter では追加しない', () => {
    const { root, handlers } = setup(storeWith([]));
    const input = one(root, 'member-input') as HTMLInputElement;
    input.value = 'さとう';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    );
    expect(handlers.onChange).not.toHaveBeenCalled();
  });
  it('複数行の貼り付けでまとめて追加する', () => {
    const { root, handlers } = setup(storeWith([]));
    const input = one(root, 'member-input');
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: () => '佐藤\r\n\r\n 田中 \n鈴木' },
    });
    input.dispatchEvent(ev);
    expect(lastStore(handlers).groups[0]!.members.map((m) => m.name)).toEqual([
      '佐藤',
      '田中',
      '鈴木',
    ]);
    expect(ev.defaultPrevented).toBe(true);
  });
  it('30 人を超える貼り付けは超過人数を通知する', () => {
    const { root, handlers } = setup(storeWith(Array.from({ length: 28 }, (_, i) => `人${i}`)));
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => 'a\nb\nc\nd\ne' } });
    one(root, 'member-input').dispatchEvent(ev);
    expect(lastStore(handlers).groups[0]!.members).toHaveLength(30);
    expect(handlers.onChange.mock.calls.at(-1)![1]).toBe(
      '1グループ30人までです（3人を追加できませんでした）',
    );
  });
  it('名前の HTML 断片は文字として表示する', () => {
    const { root } = setup(storeWith(['<img src=x onerror>']));
    expect(one(root, 'member-row').textContent).toContain('<img src=x onerror>');
    expect(root.querySelector('img')).toBeNull();
  });
  it('参加 1 人ではスタートできず理由を出す', () => {
    const { root, handlers } = setup(storeWith(['a']));
    const start = one(root, 'start') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(one(root, 'block-reason').textContent).toBe('参加者を2人以上にしてください');
    start.click();
    expect(handlers.onStart).not.toHaveBeenCalled();
  });
  it('参加 2 人以上ならスタートを押せる', () => {
    const { root, handlers } = setup(storeWith(['a', 'b']));
    one(root, 'start').click();
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
  });
  it('参加人数を表示し、オフの行に inactive を付ける', () => {
    let s = storeWith(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    s = setMemberActive(s, 'id1', s.groups[0]!.members[1]!.id, false);
    s = setMemberActive(s, 'id1', s.groups[0]!.members[4]!.id, false);
    const { root } = setup(s);
    expect(one(root, 'active-count').textContent).toBe('参加 5 / 7人');
    const rows = all(root, 'member-row');
    expect(rows.map((r) => r.classList.contains('inactive'))).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });
  it('スイッチで参加オンオフが反転する', () => {
    const { root, handlers } = setup(storeWith(['a', 'b']));
    all(root, 'member-toggle')[1]!.click();
    expect(lastStore(handlers).groups[0]!.members.map((m) => m.active)).toEqual([true, false]);
  });
  it('全員オン', () => {
    let s = storeWith(['a', 'b']);
    s = setMemberActive(s, 'id1', s.groups[0]!.members[0]!.id, false);
    const { root, handlers } = setup(s);
    one(root, 'all-on').click();
    expect(lastStore(handlers).groups[0]!.members.every((m) => m.active)).toBe(true);
  });
  it('名前をクリックして編集、Enter で確定', () => {
    const { root, handlers } = setup(storeWith(['佐藤']));
    one(root, 'member-name').click();
    const input = one(root, 'member-name-input') as HTMLInputElement;
    expect(input.value).toBe('佐藤');
    input.value = '田中';
    key(input, 'Enter');
    expect(lastStore(handlers).groups[0]!.members[0]!.name).toBe('田中');
  });
  it('名前編集を Esc で取り消すと変更しない', () => {
    const { root, handlers } = setup(storeWith(['佐藤']));
    one(root, 'member-name').click();
    const input = one(root, 'member-name-input') as HTMLInputElement;
    input.value = '田中';
    key(input, 'Escape');
    expect(handlers.onChange).not.toHaveBeenCalled();
    expect(one(root, 'member-name').textContent).toBe('佐藤');
  });
  it('メンバー削除', () => {
    const { root, handlers } = setup(storeWith(['a', 'b']));
    all(root, 'member-delete')[0]!.click();
    expect(lastStore(handlers).groups[0]!.members.map((m) => m.name)).toEqual(['b']);
  });
  it('グループ追加で新しいグループが選択される', () => {
    const { root, handlers } = setup(storeWith(['a']));
    one(root, 'group-add').click();
    const next = lastStore(handlers);
    expect(next.groups).toHaveLength(2);
    expect(next.lastGroupId).toBe(next.groups[1]!.id);
  });
  it('グループタブで切り替える', () => {
    const { root, handlers, view } = setup(storeWith(['a']));
    one(root, 'group-add').click();
    const two = lastStore(handlers);
    view.render(two, null);
    all(root, 'group-tab')[0]!.click();
    expect(lastStore(handlers).lastGroupId).toBe('id1');
  });
  it('グループ削除は確認し、断られたら何もしない', () => {
    const { root, handlers } = setup(storeWith(['a']));
    handlers.confirm.mockReturnValueOnce(false);
    one(root, 'group-delete').click();
    expect(handlers.confirm).toHaveBeenCalledWith('グループ「グループ1」を削除しますか？');
    expect(handlers.onChange).not.toHaveBeenCalled();
    one(root, 'group-delete').click();
    expect(handlers.onChange).toHaveBeenCalledTimes(1);
  });
  it('グループ名を変更できる', () => {
    const { root, handlers } = setup(storeWith(['a']));
    one(root, 'group-rename').click();
    const input = one(root, 'group-name-input') as HTMLInputElement;
    input.value = '開発定例';
    key(input, 'Enter');
    expect(lastStore(handlers).groups[0]!.name).toBe('開発定例');
  });
  it('ミュート切替', () => {
    const { root, handlers } = setup(storeWith(['a']));
    one(root, 'mute').click();
    expect(lastStore(handlers).muted).toBe(true);
  });
  it('メッセージを表示する', () => {
    const { root, view } = setup(storeWith(['a']), 'お知らせ');
    expect(one(root, 'message').textContent).toBe('お知らせ');
    view.render(storeWith(['a']), null);
    expect(one(root, 'message').hidden).toBe(true);
  });
  it('書き出しボタン', () => {
    const { root, handlers } = setup(storeWith(['a']));
    one(root, 'export').click();
    expect(handlers.onExport).toHaveBeenCalledTimes(1);
  });
  it('1MB を超えるファイルは読まずに失敗を知らせる', () => {
    const { root, handlers } = setup(storeWith(['a']));
    const input = one(root, 'import') as HTMLInputElement;
    const text = vi.fn(async () => '{}');
    const file = { size: 1_000_001, text } as unknown as File;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(text).not.toHaveBeenCalled();
    expect(handlers.onImportFailed).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).not.toHaveBeenCalled();
  });
  it('ファイルを読めなかったら失敗を知らせる', async () => {
    const { root, handlers } = setup(storeWith(['a']));
    const input = one(root, 'import') as HTMLInputElement;
    const file = { size: 10, text: () => Promise.reject(new Error('読めない')) } as unknown as File;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handlers.onImportFailed).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).not.toHaveBeenCalled();
  });
  it('自動で付けるグループ名は既存の名前と重ならない', () => {
    const newId = ids();
    let s = createInitialStore(newId);
    s = addGroup(s, 'グループ2', newId);
    s = addGroup(s, 'グループ3', newId);
    s = removeGroup(s, s.groups[1]!.id, newId);
    const { root, handlers } = setup(s);
    one(root, 'group-add').click();
    expect(lastStore(handlers).groups.map((g) => g.name)).toEqual([
      'グループ1',
      'グループ3',
      'グループ4',
    ]);
  });
  it('続けて選んだとき、先に選んだファイルの遅い読み込み結果は捨てる', async () => {
    const { root, handlers } = setup(storeWith(['a']));
    const input = one(root, 'import') as HTMLInputElement;
    let resolveSlow: (text: string) => void = () => undefined;
    const slow = { size: 10, text: () => new Promise<string>((r) => (resolveSlow = r)) };
    const fast = { size: 10, text: () => Promise.resolve('新しい') };
    Object.defineProperty(input, 'files', { value: [slow], configurable: true });
    input.dispatchEvent(new Event('change'));
    Object.defineProperty(input, 'files', { value: [fast], configurable: true });
    input.dispatchEvent(new Event('change'));
    resolveSlow('古い');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handlers.onImport.mock.calls).toEqual([['新しい']]);
  });
  it('記号だけのボタンに読み上げ用の名前が付く', () => {
    const { root } = setup(storeWith(['佐藤']));
    expect(one(root, 'member-delete').getAttribute('aria-label')).toBe('佐藤 を削除');
    expect(one(root, 'group-add').getAttribute('aria-label')).toBe('グループを追加');
    expect(one(root, 'group-rename').getAttribute('aria-label')).toBe('グループ名を変更');
    expect(one(root, 'group-delete').getAttribute('aria-label')).toBe('グループを削除');
  });
  it('読み込み中に大きすぎるファイルを選んだら、先の読み込み結果も捨てる', async () => {
    const { root, handlers } = setup(storeWith(['a']));
    const input = one(root, 'import') as HTMLInputElement;
    let resolveSlow: (text: string) => void = () => undefined;
    const slow = { size: 10, text: () => new Promise<string>((r) => (resolveSlow = r)) };
    const huge = { size: 1_000_001, text: () => Promise.resolve('{}') };
    Object.defineProperty(input, 'files', { value: [slow], configurable: true });
    input.dispatchEvent(new Event('change'));
    Object.defineProperty(input, 'files', { value: [huge], configurable: true });
    input.dispatchEvent(new Event('change'));
    resolveSlow('古い');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handlers.onImportFailed).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).not.toHaveBeenCalled();
  });
});
