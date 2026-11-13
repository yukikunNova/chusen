import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps, type RaceRunner } from './app';
import type { ShareModel } from './domain/share';
import type { RaceSummary } from './domain/summary';
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
  const dones: Array<(summary?: RaceSummary) => void> = [];
  /** 画像にした中身の記録。 */
  const cards: ShareModel[] = [];
  const share = {
    renderCard: vi.fn(async (model: ShareModel) => {
      cards.push(model);
      return { blob: new Blob([`card${cards.length}`]), dataUrl: `data:card${cards.length}` };
    }),
    saveImage: vi.fn((_blob: Blob, _filename: string) => undefined),
    copyImage: vi.fn(async (_blob: Blob) => true),
    openPost: vi.fn((_url: string) => undefined),
  };
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
    share,
    ...over,
  };
  const app = createApp(deps);
  const saved = () => JSON.parse(map.get(STORAGE_KEY)!) as Store;
  return {
    root,
    app,
    deps,
    dones,
    raceSkip,
    runRace: deps.runRace as typeof runRace,
    saved,
    map,
    cards,
    share,
  };
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
  it('結果画面の音ボタンでミュートを切り替え、保存して表示も変える', () => {
    const { root, app, dones, deps, saved } = setup(storeWith(['a', 'b']));
    app.start();
    dones[0]!();
    const mute = one(root, 'result-mute');
    expect(mute.textContent).toBe('🔊 音オン');
    mute.click();
    expect(saved().muted).toBe(true);
    expect(vi.mocked(deps.onMutedChange)).toHaveBeenLastCalledWith(true);
    expect(one(root, 'result-mute').textContent).toBe('🔇 音オフ');
    expect(app.screen).toBe('result');
  });
  it('読み込み失敗の通知を出し、名簿は変えない', () => {
    const { root, map } = setup(storeWith(['a']));
    const before = map.get(STORAGE_KEY);
    const input = one(root, 'import') as HTMLInputElement;
    const file = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 2_000_000 });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(one(root, 'message').textContent).toContain('読み込めないファイルです');
    expect(map.get(STORAGE_KEY)).toBe(before);
    expect(all(root, 'member-row')).toHaveLength(1);
  });
});

describe('結果の共有', () => {
  const summary: RaceSummary = {
    courseName: 'ネオン峠',
    score: 5000,
    titles: ['ドパ値MVP', '大トリ'],
    photoGap: 0.003,
  };
  const preview = (root: HTMLElement) => one(root, 'card-preview') as HTMLImageElement;
  async function toResult(over: Parameters<typeof setup>[1] = {}) {
    const ctx = setup(storeWith(['a', 'b']), over);
    ctx.app.start();
    ctx.dones[0]!(summary);
    await vi.waitFor(() => expect(preview(ctx.root).hidden).toBe(false));
    return ctx;
  }

  it('結果画面に称号とレースのまとめを出し、実名の画像を作る', async () => {
    const { root, cards } = await toResult();
    expect(all(root, 'title-badge').map((b) => b.textContent)).toEqual(['ドパ値MVP', '大トリ']);
    expect(one(root, 'result-info').textContent).toContain('ネオン峠');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.rows.map((r) => r.name)).toEqual(['b', 'a']);
    expect(cards[0]!.rows.map((r) => r.title)).toEqual(['ドパ値MVP', '大トリ']);
    expect(cards[0]!.photoGap).toBe(0.003);
    expect(preview(root).getAttribute('src')).toBe('data:card1');
  });
  it('レースのまとめが無くても結果画面と画像は出る', async () => {
    const { root, app, dones, cards } = setup(storeWith(['a', 'b']));
    app.start();
    dones[0]!();
    await vi.waitFor(() => expect(preview(root).hidden).toBe(false));
    expect(cards[0]!.rows.map((r) => r.name)).toEqual(['b', 'a']);
    expect(one(root, 'result-info').hidden).toBe(true);
  });
  it('名前を伏せると画像を作り直し、保存する画像にも投稿文にも実名が出ない', async () => {
    const { root, cards, share } = await toResult();
    one(root, 'hide-names').click();
    await vi.waitFor(() => expect(preview(root).getAttribute('src')).toBe('data:card2'));
    expect(cards[1]!.rows.map((r) => r.name)).toEqual(['Aさん', 'Bさん']);
    one(root, 'save-image').click();
    const [blob, filename] = share.saveImage.mock.calls[0]!;
    expect(await (blob as Blob).text()).toBe('card2');
    expect(filename).toBe('dopachu-result.png');
    one(root, 'post').click();
    await vi.waitFor(() => expect(share.openPost).toHaveBeenCalledTimes(1));
    const text = new URL(share.openPost.mock.calls[0]![0] as string).searchParams.get('text')!;
    expect(text).toContain('🥇 Aさん');
    expect(text).not.toMatch(/🥇 b|🥈 a/);
  });
  it('切り替えた直後の古い画像は使わない（作り直しが終わるまでボタンを止める）', async () => {
    const { root, share } = await toResult();
    one(root, 'hide-names').click();
    expect((one(root, 'save-image') as HTMLButtonElement).disabled).toBe(true);
    one(root, 'save-image').click();
    expect(share.saveImage).not.toHaveBeenCalled();
  });
  it('画像をコピーし、結果を案内する', async () => {
    const { root, share } = await toResult();
    one(root, 'copy-image').click();
    await vi.waitFor(() => expect(one(root, 'share-note').textContent).toContain('コピーしました'));
    expect(await (share.copyImage.mock.calls[0]![0] as Blob).text()).toBe('card1');
  });
  it('画像をコピーできなければ、保存して添付するよう案内する', async () => {
    const { root, share } = await toResult();
    share.copyImage.mockResolvedValue(false);
    one(root, 'copy-image').click();
    await vi.waitFor(() => expect(one(root, 'share-note').textContent).toContain('画像を保存'));
  });
  it('X に投稿: 画像をコピーしてから投稿画面を開き、貼り付けを案内する', async () => {
    const { root, share } = await toResult();
    one(root, 'post').click();
    await vi.waitFor(() => expect(share.openPost).toHaveBeenCalledTimes(1));
    expect(share.copyImage).toHaveBeenCalledTimes(1);
    const url = new URL(share.openPost.mock.calls[0]![0] as string);
    expect(url.origin).toBe('https://x.com');
    expect(url.searchParams.get('text')).toContain('🥇 b（ドパ値MVP）');
    expect(url.searchParams.get('text')).toContain('#ドパ抽');
    await vi.waitFor(() => expect(one(root, 'share-note').textContent).toContain('貼り付け'));
  });
  it('X に投稿: 画像をコピーできなくても投稿画面は開き、保存して添付するよう案内する', async () => {
    const { root, share } = await toResult();
    share.copyImage.mockResolvedValue(false);
    one(root, 'post').click();
    await vi.waitFor(() => expect(share.openPost).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(one(root, 'share-note').textContent).toContain('画像を保存'));
  });
  it('画像を作れない環境では、見本を出さずボタンも止めたまま案内する', async () => {
    const { root, app, dones } = setup(storeWith(['a', 'b']), {
      share: {
        renderCard: async () => null,
        saveImage: vi.fn(),
        copyImage: vi.fn(async () => false),
        openPost: vi.fn(),
      },
    });
    app.start();
    dones[0]!(summary);
    await vi.waitFor(() =>
      expect(one(root, 'share-note').textContent).toContain('画像を作れませんでした'),
    );
    expect(preview(root).hidden).toBe(true);
    expect((one(root, 'save-image') as HTMLButtonElement).disabled).toBe(true);
  });
  it('もう一度抽選したあと、前の結果の画像が遅れてできても使わない', async () => {
    let release: (() => void) | null = null;
    const { root, app, dones, share } = setup(storeWith(['a', 'b']));
    share.renderCard.mockImplementationOnce(
      (model: ShareModel) =>
        new Promise((resolve) => {
          void model;
          release = () => resolve({ blob: new Blob(['old']), dataUrl: 'data:old' });
        }),
    );
    app.start();
    dones[0]!(summary);
    app.redraw();
    dones[1]!(summary);
    await vi.waitFor(() => expect(preview(root).hidden).toBe(false));
    release!();
    await Promise.resolve();
    await Promise.resolve();
    expect(preview(root).getAttribute('src')).not.toBe('data:old');
  });
});
