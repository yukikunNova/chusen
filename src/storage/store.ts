import {
  GROUP_MAX,
  GROUP_MEMBER_MAX,
  createInitialStore,
  normalizeName,
  type Group,
  type Member,
  type NewId,
  type Store,
} from '../domain/roster';

export const STORAGE_KEY = 'chusen:v1';
export const BROKEN_KEY = 'chusen:v1:broken';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadNotice = 'none' | 'broken' | 'unavailable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && normalizeName(value) === value;
}

function parseMember(value: unknown): Member | null {
  if (!isRecord(value)) return null;
  const { id, name, active } = value;
  if (!isId(id) || !isName(name) || typeof active !== 'boolean') return null;
  return { id, name, active };
}

function parseGroup(value: unknown): Group | null {
  if (!isRecord(value)) return null;
  const { id, name, members } = value;
  if (!isId(id) || !isName(name) || !Array.isArray(members)) return null;
  if (members.length > GROUP_MEMBER_MAX) return null;
  const parsed: Member[] = [];
  const seen = new Set<string>();
  for (const raw of members) {
    const member = parseMember(raw);
    if (!member || seen.has(member.id)) return null;
    seen.add(member.id);
    parsed.push(member);
  }
  return { id, name, members: parsed };
}

/** 構造を検証し、未知のプロパティを捨てた Store を返す。不正なら null。 */
export function parseStore(value: unknown): Store | null {
  if (!isRecord(value)) return null;
  const { version, groups, lastGroupId, muted } = value;
  if (version !== 1 || !Array.isArray(groups) || groups.length === 0) return null;
  if (groups.length > GROUP_MAX) return null;
  if (typeof muted !== 'boolean') return null;
  const parsed: Group[] = [];
  const seen = new Set<string>();
  for (const raw of groups) {
    const group = parseGroup(raw);
    if (!group || seen.has(group.id)) return null;
    seen.add(group.id);
    parsed.push(group);
  }
  const last = typeof lastGroupId === 'string' && seen.has(lastGroupId) ? lastGroupId : null;
  return { version: 1, groups: parsed, lastGroupId: last ?? parsed[0]!.id, muted };
}

export function loadStore(
  storage: StorageLike | null,
  newId: NewId,
): { store: Store; notice: LoadNotice } {
  if (!storage) return { store: createInitialStore(newId), notice: 'unavailable' };
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { store: createInitialStore(newId), notice: 'unavailable' };
  }
  if (text === null) return { store: createInitialStore(newId), notice: 'none' };
  const store = importStore(text);
  if (store) return { store, notice: 'none' };
  try {
    storage.setItem(BROKEN_KEY, text);
  } catch {
    // 退避できなくても起動は続ける
  }
  return { store: createInitialStore(newId), notice: 'broken' };
}

export function saveStore(storage: StorageLike | null, store: Store): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function exportStore(store: Store): string {
  return JSON.stringify(store, null, 2);
}

export function importStore(text: string): Store | null {
  try {
    return parseStore(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * localStorage を読めるときだけ返す。
 * 書き込めるかはここでは確かめない（容量超過でも保存済みの名簿は開けるようにし、保存の失敗は saveStore が知らせる）。
 */
export function getBrowserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}
