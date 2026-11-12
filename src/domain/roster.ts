export type Member = { id: string; name: string; active: boolean };
export type Group = { id: string; name: string; members: Member[] };
export type Store = {
  version: 1;
  groups: Group[];
  lastGroupId: string | null;
  muted: boolean;
};
export type NewId = () => string;

export const NAME_MAX = 20;
export const GROUP_MEMBER_MAX = 30;
export const DRAW_MIN = 2;
export const DRAW_MAX = 20;
export const DEFAULT_GROUP_NAME = 'グループ1';

/** 前後の空白を除き、コードポイント単位で NAME_MAX に切り詰める。空なら null。 */
export function normalizeName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const chars = Array.from(trimmed);
  if (chars.length <= NAME_MAX) return trimmed;
  return chars.slice(0, NAME_MAX).join('').trim() || null;
}

export function createInitialStore(newId: NewId): Store {
  const id = newId();
  return {
    version: 1,
    groups: [{ id, name: DEFAULT_GROUP_NAME, members: [] }],
    lastGroupId: id,
    muted: false,
  };
}

export function currentGroup(store: Store): Group {
  const found = store.groups.find((g) => g.id === store.lastGroupId) ?? store.groups[0];
  if (!found) throw new Error('グループが 1 つもない');
  return found;
}

function hasGroup(store: Store, groupId: string): boolean {
  return store.groups.some((g) => g.id === groupId);
}

function mapGroup(store: Store, groupId: string, fn: (group: Group) => Group): Store {
  let changed = false;
  const groups = store.groups.map((g) => {
    if (g.id !== groupId) return g;
    const next = fn(g);
    if (next !== g) changed = true;
    return next;
  });
  return changed ? { ...store, groups } : store;
}

function mapMember(
  store: Store,
  groupId: string,
  memberId: string,
  fn: (member: Member) => Member,
): Store {
  return mapGroup(store, groupId, (g) => {
    if (!g.members.some((m) => m.id === memberId)) return g;
    return { ...g, members: g.members.map((m) => (m.id === memberId ? fn(m) : m)) };
  });
}

export function selectGroup(store: Store, groupId: string): Store {
  if (!hasGroup(store, groupId) || store.lastGroupId === groupId) return store;
  return { ...store, lastGroupId: groupId };
}

export function addGroup(store: Store, rawName: string, newId: NewId): Store {
  const name = normalizeName(rawName);
  if (name === null) return store;
  const id = newId();
  return { ...store, groups: [...store.groups, { id, name, members: [] }], lastGroupId: id };
}

export function renameGroup(store: Store, groupId: string, rawName: string): Store {
  const name = normalizeName(rawName);
  if (name === null) return store;
  return mapGroup(store, groupId, (g) => ({ ...g, name }));
}

export function removeGroup(store: Store, groupId: string, newId: NewId): Store {
  if (!hasGroup(store, groupId)) return store;
  const groups = store.groups.filter((g) => g.id !== groupId);
  if (groups.length === 0) {
    const id = newId();
    return { ...store, groups: [{ id, name: DEFAULT_GROUP_NAME, members: [] }], lastGroupId: id };
  }
  const lastGroupId = store.lastGroupId === groupId ? groups[0]!.id : store.lastGroupId;
  return { ...store, groups, lastGroupId };
}

export function addMembers(
  store: Store,
  groupId: string,
  rawText: string,
  newId: NewId,
): { store: Store; added: number; dropped: number } {
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return { store, added: 0, dropped: 0 };
  const candidates = rawText
    .split(/\r?\n/)
    .map(normalizeName)
    .filter((n): n is string => n !== null);
  const room = Math.max(0, GROUP_MEMBER_MAX - group.members.length);
  const accepted = candidates.slice(0, room);
  const dropped = candidates.length - accepted.length;
  if (accepted.length === 0) return { store, added: 0, dropped };
  const members = [
    ...group.members,
    ...accepted.map((name) => ({ id: newId(), name, active: true })),
  ];
  return {
    store: mapGroup(store, groupId, (g) => ({ ...g, members })),
    added: accepted.length,
    dropped,
  };
}

export function renameMember(
  store: Store,
  groupId: string,
  memberId: string,
  rawName: string,
): Store {
  const name = normalizeName(rawName);
  if (name === null) return store;
  return mapMember(store, groupId, memberId, (m) => ({ ...m, name }));
}

export function removeMember(store: Store, groupId: string, memberId: string): Store {
  return mapGroup(store, groupId, (g) => {
    if (!g.members.some((m) => m.id === memberId)) return g;
    return { ...g, members: g.members.filter((m) => m.id !== memberId) };
  });
}

export function setMemberActive(
  store: Store,
  groupId: string,
  memberId: string,
  active: boolean,
): Store {
  return mapMember(store, groupId, memberId, (m) => ({ ...m, active }));
}

export function setAllActive(store: Store, groupId: string): Store {
  return mapGroup(store, groupId, (g) => ({
    ...g,
    members: g.members.map((m) => (m.active ? m : { ...m, active: true })),
  }));
}

export function setMuted(store: Store, muted: boolean): Store {
  return store.muted === muted ? store : { ...store, muted };
}

export function activeMembers(group: Group): Member[] {
  return group.members.filter((m) => m.active);
}

export function drawBlockReason(group: Group): string | null {
  const count = activeMembers(group).length;
  if (count < DRAW_MIN) return '参加者を2人以上にしてください';
  if (count > DRAW_MAX) return '抽選に参加できるのは20人までです';
  return null;
}
