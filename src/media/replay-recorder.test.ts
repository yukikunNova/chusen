import { describe, expect, it } from 'vitest';
import {
  createFramePacer,
  recordStream,
  supportedMimeTypes,
  type RecorderLike,
} from './replay-recorder';

function fakeRecorder() {
  const calls: string[] = [];
  const recorder: RecorderLike = {
    state: 'inactive',
    ondataavailable: null,
    onstop: null,
    onerror: null,
    start() {
      calls.push('start');
      recorder.state = 'recording';
    },
    stop() {
      calls.push('stop');
      recorder.state = 'inactive';
    },
  };
  return { recorder, calls };
}

describe('supportedMimeTypes', () => {
  it('使える形式を優先順に並べる。MP4（X に投稿できる形式）が先', () => {
    const all = supportedMimeTypes(() => true);
    expect(all[0]).toMatch(/^video\/mp4/);
    expect(all.at(-1)).toMatch(/^video\/webm/);
  });
  it('MP4 が使えなければ WebM だけ', () => {
    const types = supportedMimeTypes((type) => type.startsWith('video/webm'));
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((type) => type.startsWith('video/webm'))).toBe(true);
  });
  it('どれも使えなければ空', () => {
    expect(supportedMimeTypes(() => false)).toEqual([]);
  });
});

describe('createFramePacer', () => {
  /** 画面の更新が hz のとき、1 秒間に何コマ写すか。 */
  const drawsPerSecond = (hz: number) => {
    const due = createFramePacer(30);
    let draws = 0;
    for (let i = 0; i < hz; i++) if (due((i * 1000) / hz)) draws++;
    return draws;
  };
  it('画面の更新が速くても、写すのは毎秒 30 コマまで', () => {
    expect(drawsPerSecond(60)).toBe(30);
    expect(drawsPerSecond(120)).toBe(30);
    expect(drawsPerSecond(144)).toBeLessThanOrEqual(31);
  });
  it('30 の倍数でない更新間隔でも、余りを持ち越して 30 コマ近くを保つ', () => {
    expect(drawsPerSecond(75)).toBeGreaterThanOrEqual(29);
    expect(drawsPerSecond(100)).toBeGreaterThanOrEqual(29);
    expect(drawsPerSecond(75)).toBeLessThanOrEqual(31);
  });
  it('更新が遅い環境では毎回写す', () => {
    expect(drawsPerSecond(24)).toBe(24);
  });
  it('長く止まったあとに、遅れを取り戻そうと連続で写さない', () => {
    const due = createFramePacer(30);
    expect(due(0)).toBe(true);
    expect(due(5000)).toBe(true);
    expect(due(5008)).toBe(false);
    expect(due(5016)).toBe(false);
    expect(due(5034)).toBe(true);
  });
});

describe('recordStream', () => {
  it('すぐ録り始め、止めると集めたデータを 1 つの動画にして返す', async () => {
    const { recorder, calls } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4;codecs=avc1.64001F,mp4a.40.2')!;
    expect(calls).toEqual(['start']);
    recorder.ondataavailable!({ data: new Blob(['ab']) });
    const result = recording.stop();
    expect(calls).toEqual(['start', 'stop']);
    recorder.ondataavailable!({ data: new Blob(['cd']) });
    recorder.onstop!();
    const video = await result;
    expect(video!.format).toBe('mp4');
    expect(video!.blob.type).toBe('video/mp4');
    expect(await video!.blob.text()).toBe('abcd');
  });
  it('WebM で録ったら形式は webm', async () => {
    const { recorder } = fakeRecorder();
    const recording = recordStream(recorder, 'video/webm;codecs=vp9,opus')!;
    recorder.ondataavailable!({ data: new Blob(['x']) });
    const result = recording.stop();
    recorder.onstop!();
    expect((await result)!.format).toBe('webm');
  });
  it('データが 1 つも無ければ null', async () => {
    const { recorder } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4')!;
    const result = recording.stop();
    recorder.onstop!();
    expect(await result).toBeNull();
  });
  it('取り消したら録画を止め、あとで stop しても null', async () => {
    const { recorder, calls } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4')!;
    recorder.ondataavailable!({ data: new Blob(['ab']) });
    recording.cancel();
    expect(calls).toEqual(['start', 'stop']);
    recorder.onstop!();
    expect(await recording.stop()).toBeNull();
    expect(calls).toEqual(['start', 'stop']);
  });
  it('録画中にエラーが出たら null', async () => {
    const { recorder } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4')!;
    recorder.ondataavailable!({ data: new Blob(['ab']) });
    recorder.onerror!();
    const result = recording.stop();
    recorder.onstop?.();
    expect(await result).toBeNull();
  });
  it('録り始められなければ null を返す（呼び出し側が次の形式を試せる）', () => {
    const { recorder } = fakeRecorder();
    recorder.start = () => {
      throw new Error('unsupported');
    };
    expect(recordStream(recorder, 'video/mp4')).toBeNull();
  });
});
