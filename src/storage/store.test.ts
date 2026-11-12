import { describe, expect, it } from 'vitest';
import { addMembers, createInitialStore, type Store } from '../domain/roster';
import {
  BROKEN_KEY,
  STORAGE_KEY,
  exportStore,
  importStore,
  loadStore,
  parseStore,
  saveStore,
  type StorageLike,
} from './store';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  return { storage, map };
}

function sample(): Store {
  const newId = ids();
  const s = createInitialStore(newId);
  return addMembers(s, 'id1', '佐藤\n田中', newId).store;
}

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    groups: [{ id: 'g1', name: 'A', members: [{ id: 'm1', name: '佐藤', active: true }] }],
    lastGroupId: 'g1',
    muted: false,
    ...overrides,
  };
}

describe('saveStore / loadStore', () => {
  it('往復で同値、notice は none', () => {
    const { storage } = fakeStorage();
    const s = sample();
    expect(saveStore(storage, s)).toBe(true);
    expect(loadStore(storage, ids())).toEqual({ store: s, notice: 'none' });
  });
  it('キーが無ければ初期ストアで notice は none', () => {
    const { storage } = fakeStorage();
    const r = loadStore(storage, ids());
    expect(r.notice).toBe('none');
    expect(r.store).toEqual(createInitialStore(ids()));
  });
  it('JSON が壊れていたら退避して初期化する', () => {
    const { storage, map } = fakeStorage({ [STORAGE_KEY]: '{oops' });
    const r = loadStore(storage, ids());
    expect(r.notice).toBe('broken');
    expect(map.get(BROKEN_KEY)).toBe('{oops');
    expect(r.store).toEqual(createInitialStore(ids()));
  });
  it('version が 1 でなければ broken', () => {
    const text = JSON.stringify(raw({ version: 2 }));
    const { storage, map } = fakeStorage({ [STORAGE_KEY]: text });
    expect(loadStore(storage, ids()).notice).toBe('broken');
    expect(map.get(BROKEN_KEY)).toBe(text);
  });
  it('storage が null なら unavailable、保存は false', () => {
    expect(loadStore(null, ids()).notice).toBe('unavailable');
    expect(saveStore(null, sample())).toBe(false);
  });
  it('setItem が例外を投げても saveStore は false を返すだけ', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(saveStore(storage, sample())).toBe(false);
  });
  it('getItem が例外を投げたら unavailable', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(loadStore(storage, ids()).notice).toBe('unavailable');
  });
});

describe('exportStore / importStore', () => {
  it('往復で同値', () => {
    const s = sample();
    expect(importStore(exportStore(s))).toEqual(s);
  });
  it.each([
    ['JSON でない', 'こんにちは'],
    ['配列', '[]'],
    ['グループが空', '{"version":1,"groups":[],"lastGroupId":null,"muted":false}'],
    ['version 2', JSON.stringify(raw({ version: 2 }))],
    [
      '名前 21 文字',
      JSON.stringify(
        raw({
          groups: [
            { id: 'g1', name: 'A', members: [{ id: 'm1', name: 'あ'.repeat(21), active: true }] },
          ],
        }),
      ),
    ],
    [
      '名前が未 trim',
      JSON.stringify(
        raw({
          groups: [{ id: 'g1', name: 'A', members: [{ id: 'm1', name: ' 佐藤', active: true }] }],
        }),
      ),
    ],
    [
      'メンバー 31 人',
      JSON.stringify(
        raw({
          groups: [
            {
              id: 'g1',
              name: 'A',
              members: Array.from({ length: 31 }, (_, i) => ({
                id: `m${i}`,
                name: `人${i}`,
                active: true,
              })),
            },
          ],
        }),
      ),
    ],
    [
      'グループ ID 重複',
      JSON.stringify(
        raw({
          groups: [
            { id: 'g1', name: 'A', members: [] },
            { id: 'g1', name: 'B', members: [] },
          ],
        }),
      ),
    ],
    [
      'メンバー ID 重複',
      JSON.stringify(
        raw({
          groups: [
            {
              id: 'g1',
              name: 'A',
              members: [
                { id: 'm1', name: 'a', active: true },
                { id: 'm1', name: 'b', active: true },
              ],
            },
          ],
        }),
      ),
    ],
    [
      'active が文字列',
      JSON.stringify(
        raw({
          groups: [{ id: 'g1', name: 'A', members: [{ id: 'm1', name: '佐藤', active: 'yes' }] }],
        }),
      ),
    ],
    ['muted が数値', JSON.stringify(raw({ muted: 1 }))],
    ['グループ名が空', JSON.stringify(raw({ groups: [{ id: 'g1', name: '', members: [] }] }))],
    ['ID が空', JSON.stringify(raw({ groups: [{ id: '', name: 'A', members: [] }] }))],
  ])('不正な入力は null: %s', (_label, text) => {
    expect(importStore(text)).toBeNull();
  });
});

describe('parseStore', () => {
  it('未知のプロパティを捨てる', () => {
    const parsed = parseStore({
      ...raw(),
      extra: 1,
      groups: [
        {
          id: 'g1',
          name: 'A',
          extra: 2,
          members: [{ id: 'm1', name: '佐藤', active: true, extra: 3 }],
        },
      ],
    });
    expect(parsed).toEqual(raw());
  });
  it('lastGroupId が存在しないグループ・null なら先頭に直す', () => {
    expect(parseStore(raw({ lastGroupId: 'ない' }))?.lastGroupId).toBe('g1');
    expect(parseStore(raw({ lastGroupId: null }))?.lastGroupId).toBe('g1');
  });
  it('オブジェクトでなければ null', () => {
    expect(parseStore(null)).toBeNull();
    expect(parseStore('x')).toBeNull();
  });
});
