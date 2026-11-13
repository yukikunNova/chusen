import { describe, expect, it } from 'vitest';
import { pickMimeType, recordStream, type RecorderLike } from './replay-recorder';

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

describe('pickMimeType', () => {
  it('MP4 が使えれば MP4（X に投稿できる形式）を選ぶ', () => {
    expect(pickMimeType(() => true)).toMatch(/^video\/mp4/);
  });
  it('MP4 が使えなければ WebM を選ぶ', () => {
    expect(pickMimeType((type) => type.startsWith('video/webm'))).toMatch(/^video\/webm/);
  });
  it('どれも使えなければ null', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe('recordStream', () => {
  it('すぐ録り始め、止めると集めたデータを 1 つの動画にして返す', async () => {
    const { recorder, calls } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4;codecs=avc1.64001F,mp4a.40.2');
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
    const recording = recordStream(recorder, 'video/webm;codecs=vp9,opus');
    recorder.ondataavailable!({ data: new Blob(['x']) });
    const result = recording.stop();
    recorder.onstop!();
    expect((await result)!.format).toBe('webm');
  });
  it('データが 1 つも無ければ null', async () => {
    const { recorder } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4');
    const result = recording.stop();
    recorder.onstop!();
    expect(await result).toBeNull();
  });
  it('取り消したら録画を止め、あとで stop しても null', async () => {
    const { recorder, calls } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4');
    recorder.ondataavailable!({ data: new Blob(['ab']) });
    recording.cancel();
    expect(calls).toEqual(['start', 'stop']);
    recorder.onstop!();
    expect(await recording.stop()).toBeNull();
    expect(calls).toEqual(['start', 'stop']);
  });
  it('録画中にエラーが出たら null', async () => {
    const { recorder } = fakeRecorder();
    const recording = recordStream(recorder, 'video/mp4');
    recorder.ondataavailable!({ data: new Blob(['ab']) });
    recorder.onerror!();
    const result = recording.stop();
    recorder.onstop?.();
    expect(await result).toBeNull();
  });
  it('start が例外を出す環境でも落ちず、null を返す', async () => {
    const { recorder } = fakeRecorder();
    recorder.start = () => {
      throw new Error('unsupported');
    };
    const recording = recordStream(recorder, 'video/mp4');
    expect(await recording.stop()).toBeNull();
  });
});
