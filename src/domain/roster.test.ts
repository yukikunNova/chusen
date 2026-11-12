import { describe, expect, it } from 'vitest';
import {
  GROUP_MAX,
  activeMembers,
  addGroup,
  addMembers,
  createInitialStore,
  currentGroup,
  drawBlockReason,
  normalizeName,
  removeGroup,
  removeMember,
  renameGroup,
  renameMember,
  selectGroup,
  setAllActive,
  setMemberActive,
  setMuted,
  type Store,
} from './roster';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function storeWith(names: string[]): { store: Store; groupId: string; newId: () => string } {
  const newId = ids();
  const initial = createInitialStore(newId);
  const groupId = initial.groups[0]!.id;
  const { store } = addMembers(initial, groupId, names.join('\n'), newId);
  return { store, groupId, newId };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => `人${i + 1}`);

describe('normalizeName', () => {
  it('前後の空白とタブを除く', () => {
    expect(normalizeName('  佐藤 \t')).toBe('佐藤');
  });
  it('空白だけなら null', () => {
    expect(normalizeName('   ')).toBeNull();
  });
  it('21 コードポイント以上は先頭 20 に切り詰め、サロゲートペアを割らない', () => {
    expect(normalizeName('😀'.repeat(25))).toBe('😀'.repeat(20));
  });
});

describe('createInitialStore', () => {
  it('空の「グループ1」を 1 つ持つ', () => {
    const s = createInitialStore(ids());
    expect(s).toEqual({
      version: 1,
      groups: [{ id: 'id1', name: 'グループ1', members: [] }],
      lastGroupId: 'id1',
      muted: false,
    });
  });
});

describe('addMembers', () => {
  it('CRLF・空行・空白・タブ混じりの貼り付けを受ける', () => {
    const newId = ids();
    const s0 = createInitialStore(newId);
    const r = addMembers(s0, 'id1', '佐藤\r\n\r\n  田中  \n\t\n鈴木', newId);
    expect(r.added).toBe(3);
    expect(r.dropped).toBe(0);
    expect(r.store.groups[0]!.members.map((m) => m.name)).toEqual(['佐藤', '田中', '鈴木']);
    expect(r.store.groups[0]!.members.every((m) => m.active)).toBe(true);
  });
  it('30 人を超える分は追加せず dropped に数える', () => {
    const { store, groupId, newId } = storeWith(names(28));
    const r = addMembers(store, groupId, 'a\nb\nc\nd\ne', newId);
    expect(r.added).toBe(2);
    expect(r.dropped).toBe(3);
    expect(r.store.groups[0]!.members).toHaveLength(30);
  });
  it('HTML 断片はそのまま名前になる', () => {
    const { store } = storeWith(['<img src=x onerror>']);
    expect(store.groups[0]!.members[0]!.name).toBe('<img src=x onerror>');
  });
  it('同名を 2 人追加できる', () => {
    const { store } = storeWith(['佐藤', '佐藤']);
    expect(store.groups[0]!.members).toHaveLength(2);
    expect(store.groups[0]!.members[0]!.id).not.toBe(store.groups[0]!.members[1]!.id);
  });
});

describe('メンバー操作', () => {
  it('setMemberActive は該当者だけ変え、元の store を変更しない', () => {
    const { store, groupId } = storeWith(['a', 'b']);
    const before = structuredClone(store);
    const memberId = store.groups[0]!.members[1]!.id;
    const next = setMemberActive(store, groupId, memberId, false);
    expect(next.groups[0]!.members.map((m) => m.active)).toEqual([true, false]);
    expect(store).toEqual(before);
  });
  it('setAllActive は全員オンにし、元の store を変更しない', () => {
    const { store, groupId } = storeWith(['a', 'b']);
    const off = setMemberActive(store, groupId, store.groups[0]!.members[0]!.id, false);
    const before = structuredClone(off);
    const next = setAllActive(off, groupId);
    expect(next.groups[0]!.members.every((m) => m.active)).toBe(true);
    expect(off).toEqual(before);
  });
  it('renameMember は名前を正規化して変え、不正な名前なら変更しない', () => {
    const { store, groupId } = storeWith(['a']);
    const before = structuredClone(store);
    const memberId = store.groups[0]!.members[0]!.id;
    expect(renameMember(store, groupId, memberId, ' 田中 ').groups[0]!.members[0]!.name).toBe(
      '田中',
    );
    expect(renameMember(store, groupId, memberId, '  ')).toBe(store);
    expect(store).toEqual(before);
  });
  it('removeMember は該当者を消し、元の store を変更しない', () => {
    const { store, groupId } = storeWith(['a', 'b']);
    const before = structuredClone(store);
    const next = removeMember(store, groupId, store.groups[0]!.members[0]!.id);
    expect(next.groups[0]!.members.map((m) => m.name)).toEqual(['b']);
    expect(store).toEqual(before);
  });
  it('存在しない ID なら同一参照を返す', () => {
    const { store, groupId, newId } = storeWith(['a']);
    expect(setMemberActive(store, groupId, 'ない', false)).toBe(store);
    expect(setMemberActive(store, 'ない', 'ない', false)).toBe(store);
    expect(removeMember(store, groupId, 'ない')).toBe(store);
    expect(renameMember(store, groupId, 'ない', 'x')).toBe(store);
    expect(setAllActive(store, 'ない')).toBe(store);
    expect(renameGroup(store, 'ない', 'x')).toBe(store);
    expect(selectGroup(store, 'ない')).toBe(store);
    expect(removeGroup(store, 'ない', newId)).toBe(store);
    expect(addMembers(store, 'ない', 'x', newId)).toEqual({ store, added: 0, dropped: 0 });
  });
});

describe('グループ操作', () => {
  it('addGroup は追加したグループを選択する。名前不正なら変更なし', () => {
    const newId = ids();
    const s0 = createInitialStore(newId);
    const s1 = addGroup(s0, ' 全体会議 ', newId);
    expect(s1.groups.map((g) => g.name)).toEqual(['グループ1', '全体会議']);
    expect(currentGroup(s1).name).toBe('全体会議');
    expect(addGroup(s1, '   ', newId)).toBe(s1);
  });
  it('グループは 50 個まで。超える追加は変更なし', () => {
    const newId = ids();
    let s = createInitialStore(newId);
    for (let i = 1; i < GROUP_MAX; i++) s = addGroup(s, `G${i}`, newId);
    expect(GROUP_MAX).toBe(50);
    expect(s.groups).toHaveLength(50);
    expect(addGroup(s, 'あふれ', newId)).toBe(s);
  });
  it('renameGroup / selectGroup', () => {
    const newId = ids();
    const s1 = addGroup(createInitialStore(newId), 'B', newId);
    const first = s1.groups[0]!.id;
    expect(renameGroup(s1, first, '開発定例').groups[0]!.name).toBe('開発定例');
    expect(currentGroup(selectGroup(s1, first)).id).toBe(first);
  });
  it('選択中のグループを削除すると残りが選択される', () => {
    const newId = ids();
    const s1 = addGroup(createInitialStore(newId), 'B', newId);
    const s2 = removeGroup(s1, currentGroup(s1).id, newId);
    expect(s2.groups.map((g) => g.name)).toEqual(['グループ1']);
    expect(s2.lastGroupId).toBe(s2.groups[0]!.id);
  });
  it('最後の 1 つを削除すると「グループ1」が作り直される', () => {
    const newId = ids();
    const s0 = renameGroup(createInitialStore(newId), 'id1', '旧');
    const s1 = removeGroup(s0, 'id1', newId);
    expect(s1.groups).toHaveLength(1);
    expect(s1.groups[0]!.name).toBe('グループ1');
    expect(s1.groups[0]!.id).not.toBe('id1');
    expect(s1.lastGroupId).toBe(s1.groups[0]!.id);
  });
  it('currentGroup は lastGroupId が無効なら先頭を返す', () => {
    const s = { ...createInitialStore(ids()), lastGroupId: 'ない' };
    expect(currentGroup(s).id).toBe('id1');
  });
});

describe('抽選対象', () => {
  it('activeMembers はオフを除き登録順を保つ', () => {
    const { store, groupId } = storeWith(['a', 'b', 'c']);
    const next = setMemberActive(store, groupId, store.groups[0]!.members[1]!.id, false);
    expect(activeMembers(next.groups[0]!).map((m) => m.name)).toEqual(['a', 'c']);
  });
  it('drawBlockReason: 1 人は不可、2 人と 20 人は可、21 人は不可', () => {
    expect(drawBlockReason(storeWith(names(1)).store.groups[0]!)).toBe(
      '参加者を2人以上にしてください',
    );
    expect(drawBlockReason(storeWith(names(2)).store.groups[0]!)).toBeNull();
    expect(drawBlockReason(storeWith(names(20)).store.groups[0]!)).toBeNull();
    expect(drawBlockReason(storeWith(names(21)).store.groups[0]!)).toBe(
      '抽選に参加できるのは20人までです',
    );
  });
});

describe('setMuted', () => {
  it('muted を切り替える', () => {
    const s = createInitialStore(ids());
    expect(setMuted(s, true).muted).toBe(true);
    expect(s.muted).toBe(false);
  });
});
