import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps, type RaceRunner } from './app';
import { addMembers, createInitialStore, setMemberActive, type Store } from './domain/roster';
import { shuffle } from './domain/shuffle';
import { STORAGE_KEY, exportStore, type LoadNotice, type StorageLike } from './storage/store';

function ids(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function storeWith(names: string[]): Store {
  const newId = ids();
  const s = createInitialStore(newId);
  return addMembers(s, 'id1', names.join('\n'), newId).store;
}

function setup(
  store: Store,
  over: Partial<AppDeps> & { notice?: LoadNotice; noStorage?: boolean } = {},
) {
  const root = document.createElement('div');
  document.body.append(root);
  const map = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
  const dones: Array<() => void> = [];
  const raceSkip = vi.fn();
  const runRace = vi.fn<RaceRunner>((_order, onDone) => {
    dones.push(onDone);
    return { skip: raceSkip };
  });
  const deps: AppDeps = {
    root,
    storage: over.noStorage ? null : storage,
    initial: { store, notice: over.notice ?? 'none' },
    randomInt: () => 0,
    newId: ids('new'),
    runRace,
    copyText: vi.fn(async () => true),
    download: vi.fn(),
    confirm: vi.fn(() => true),
    extraNotice: null,
    onScreenChange: vi.fn(),
    onMutedChange: vi.fn(),
    ...over,
  };
  const app = createApp(deps);
  const saved = () => JSON.parse(map.get(STORAGE_KEY)!) as Store;
  return { root, app, deps, dones, raceSkip, runRace: deps.runRace as typeof runRace, saved, map };
}

const all = (root: HTMLElement, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const one = (root: HTMLElement, id: string) => all(root, id)[0]!;
const resultNames = (root: HTMLElement) =>
  all(root, 'result-item').map((el) => el.querySelector('.name')!.textContent);

describe('createApp', () => {
  it('抽選すると参加オンの全員だけが結果に並ぶ', () => {
    let s = storeWith(['a', 'b', 'c', 'd']);
    s = setMemberActive(s, 'id1', s.groups[0]!.members[1]!.id, false);
    const { root, app, dones, runRace } = setup(s);
    expect(app.screen).toBe('roster');
    app.start();
    expect(app.screen).toBe('race');
    expect(runRace).toHaveBeenCalledTimes(1);
    dones[0]!();
    expect(app.screen).toBe('result');
    expect([...resultNames(root)].sort()).toEqual(['a', 'c', 'd']);
  });
  it('結果はシャッフルだけで決まり、レースに渡す順と同じ', () => {
    const { root, app, dones, runRace } = setup(storeWith(['a', 'b', 'c', 'd']));
    app.start();
    dones[0]!();
    const expected = shuffle(['a', 'b', 'c', 'd'], () => 0);
    expect(resultNames(root)).toEqual(expected);
    expect(runRace.mock.calls[0]![0].map((m) => m.name)).toEqual(expected);
  });
  it('スタート連打でもレースは 1 本、onDone が複数回でも結果画面は 1 つ', () => {
    const { root, app, dones, runRace } = setup(storeWith(['a', 'b', 'c']));
    app.start();
    app.start();
    expect(runRace).toHaveBeenCalledTimes(1);
    dones[0]!();
    dones[0]!();
    expect(all(root, 'copy')).toHaveLength(1);
    expect(all(root, 'result-item')).toHaveLength(3);
  });
  it('参加 1 人では start しても何も起きない', () => {
    const { app, runRace } = setup(storeWith(['a']));
    app.start();
    expect(app.screen).toBe('roster');
    expect(runRace).not.toHaveBeenCalled();
  });
  it('レースが同期的に終わる runRace でも結果画面になる', () => {
    const { root, app } = setup(storeWith(['a', 'b']), {
      runRace: (_o, onDone) => {
        onDone();
        return { skip: () => undefined };
      },
    });
    app.start();
    expect(app.screen).toBe('result');
    expect(all(root, 'result-item')).toHaveLength(2);
  });
  it('skip はレース中だけレースに伝わる', () => {
    const { app, raceSkip, dones } = setup(storeWith(['a', 'b']));
    app.skip();
    expect(raceSkip).not.toHaveBeenCalled();
    app.start();
    app.skip();
    expect(raceSkip).toHaveBeenCalledTimes(1);
    dones[0]!();
    app.skip();
    expect(raceSkip).toHaveBeenCalledTimes(1);
  });
  it('redraw は結果画面でだけ新しいレースを始め、back で名簿に戻る', () => {
    const { root, app, dones, runRace } = setup(storeWith(['a', 'b', 'c']));
    app.redraw();
    expect(runRace).not.toHaveBeenCalled();
    app.start();
    dones[0]!();
    app.redraw();
    app.redraw();
    expect(runRace).toHaveBeenCalledTimes(2);
    expect(app.screen).toBe('race');
    expect(all(root, 'result-item')).toHaveLength(0);
    dones[1]!();
    app.back();
    expect(app.screen).toBe('roster');
    expect(all(root, 'member-row')).toHaveLength(3);
    expect(all(root, 'result-item')).toHaveLength(0);
  });
  it('前のレースの onDone が遅れて来ても無視する', () => {
    const { root, app, dones } = setup(storeWith(['a', 'b', 'c']));
    app.start();
    dones[0]!();
    app.redraw();
    dones[0]!();
    expect(app.screen).toBe('race');
    expect(all(root, 'result-item')).toHaveLength(0);
  });
  it('画面が変わるたび onScreenChange を 1 回呼ぶ', () => {
    const { app, dones, deps } = setup(storeWith(['a', 'b']));
    app.start();
    dones[0]!();
    app.back();
    expect(vi.mocked(deps.onScreenChange).mock.calls.map((c) => c[0])).toEqual([
      'race',
      'result',
      'roster',
    ]);
  });
  it('名簿の変更は保存される', () => {
    const { root, saved } = setup(storeWith(['a', 'b']));
    all(root, 'member-toggle')[0]!.click();
    expect(saved().groups[0]!.members.map((m) => m.active)).toEqual([false, true]);
    expect(one(root, 'active-count').textContent).toBe('参加 1 / 2人');
  });
  it('setMuted は保存し onMutedChange を呼ぶ。起動時にも 1 回呼ぶ', () => {
    const { app, deps, saved } = setup(storeWith(['a']));
    expect(vi.mocked(deps.onMutedChange).mock.calls).toEqual([[false]]);
    app.setMuted(true);
    expect(saved().muted).toBe(true);
    expect(vi.mocked(deps.onMutedChange).mock.calls).toEqual([[false], [true]]);
    app.setMuted(true);
    expect(vi.mocked(deps.onMutedChange)).toHaveBeenCalledTimes(2);
  });
  it('importText: 不正なら不変でエラー、確認を断れば不変、承諾で置き換え', () => {
    const { root, app, deps, saved, map } = setup(storeWith(['a', 'b']));
    app.importText('壊れ');
    expect(map.has(STORAGE_KEY)).toBe(false);
    expect(one(root, 'message').textContent).toBe(
      '読み込めないファイルです。名簿は変更していません',
    );
    expect(all(root, 'member-row')).toHaveLength(2);

    const incoming = exportStore(storeWith(['x', 'y', 'z']));
    vi.mocked(deps.confirm).mockReturnValueOnce(false);
    app.importText(incoming);
    expect(deps.confirm).toHaveBeenCalledWith('現在の名簿をすべて置き換えます。よろしいですか？');
    expect(all(root, 'member-row')).toHaveLength(2);

    app.importText(incoming);
    expect(all(root, 'member-row')).toHaveLength(3);
    expect(saved().groups[0]!.members.map((m) => m.name)).toEqual(['x', 'y', 'z']);
  });
  it('書き出しは chusen-roster.json をダウンロードする', () => {
    const s = storeWith(['a']);
    const { root, deps } = setup(s);
    one(root, 'export').click();
    expect(deps.download).toHaveBeenCalledWith('chusen-roster.json', exportStore(s));
  });
  it('コピー成功で結果テキストを渡す', async () => {
    const { root, app, dones, deps } = setup(storeWith(['a', 'b']));
    app.start();
    dones[0]!();
    one(root, 'copy').click();
    expect(deps.copyText).toHaveBeenCalledWith('1. b\n2. a');
    await vi.waitFor(() => expect(one(root, 'copy').textContent).toContain('コピーしました'));
    expect(one(root, 'copy-fallback').hidden).toBe(true);
  });
  it('コピー失敗なら結果テキストを表示する', async () => {
    const { root, app, dones } = setup(storeWith(['a', 'b']), { copyText: async () => false });
    app.start();
    dones[0]!();
    one(root, 'copy').click();
    await vi.waitFor(() => expect(one(root, 'copy-fallback').hidden).toBe(false));
    expect((one(root, 'copy-fallback') as HTMLTextAreaElement).value).toBe('1. b\n2. a');
  });
  it('保存できない環境では通知する', () => {
    const { root } = setup(storeWith(['a']), { noStorage: true, notice: 'unavailable' });
    expect(one(root, 'message').textContent).toContain(
      'このブラウザでは名簿を保存できません（閉じると消えます）',
    );
  });
  it('壊れた保存データを初期化したら通知する', () => {
    const { root } = setup(storeWith([]), { notice: 'broken' });
    expect(one(root, 'message').textContent).toContain('保存データが壊れていたため初期化しました');
  });
  it('extraNotice を名簿画面に出す', () => {
    const { root } = setup(storeWith(['a']), { extraNotice: 'X' });
    expect(one(root, 'message').textContent).toContain('X');
  });
});
