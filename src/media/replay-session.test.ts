import { describe, expect, it, vi } from 'vitest';
import { createRand } from '../domain/prng';
import { buildRaceScript } from '../domain/race-script';
import type { ReplayVideo } from './replay-recorder';
import { createReplaySession, type ReplayCapture } from './replay-session';

const order = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `人${i}` }));
const script = buildRaceScript(order(4), createRand(5));
const video: ReplayVideo = { blob: new Blob(['v']), format: 'mp4' };

function setup(available = true) {
  const after = new Set<() => void>();
  const hidden = new Set<() => void>();
  const capture = {
    frame: vi.fn<ReplayCapture['frame']>(),
    stop: vi.fn(async () => video as ReplayVideo | null),
    cancel: vi.fn(),
  };
  const begin = vi.fn(() => (available ? capture : null));
  const session = createReplaySession({
    script,
    begin,
    onAfterRender: (cb) => {
      after.add(cb);
      return () => void after.delete(cb);
    },
    onHidden: (cb) => {
      hidden.add(cb);
      return () => void hidden.delete(cb);
    },
  });
  const render = () => after.forEach((cb) => cb());
  const hide = () => hidden.forEach((cb) => cb());
  return { session, begin, capture, render, hide, after, hidden };
}

describe('createReplaySession', () => {
  it('17 秒になるまでは録らない', () => {
    const { session, begin, render, capture } = setup();
    session.tick(10);
    session.tick(16.99);
    render();
    expect(begin).not.toHaveBeenCalled();
    expect(capture.frame).not.toHaveBeenCalled();
  });
  it('17 秒から録り始め、描画のたびにその時刻のテロップを渡す', () => {
    const { session, begin, render, capture } = setup();
    session.tick(16.99);
    session.tick(17.01);
    expect(begin).toHaveBeenCalledTimes(1);
    render();
    expect(capture.frame).toHaveBeenLastCalledWith({ winner: null, photo: null, podium: null });
    session.tick(26.5);
    render();
    expect(capture.frame.mock.lastCall![0].podium).toEqual(['人0', '人1', '人2']);
    session.tick(26.6);
    expect(begin).toHaveBeenCalledTimes(1);
  });
  it('最後まで再生したら動画を返し、描画の監視をやめる', async () => {
    const { session, render, capture, after, hidden } = setup();
    session.tick(17);
    session.tick(27);
    expect(await session.end(false)).toBe(video);
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(after.size).toBe(0);
    expect(hidden.size).toBe(0);
    render();
    expect(capture.frame).not.toHaveBeenCalled();
  });
  it('スキップした回は捨てる', async () => {
    const { session, capture } = setup();
    session.tick(17);
    session.tick(20);
    expect(await session.end(true)).toBeNull();
    expect(capture.cancel).toHaveBeenCalledTimes(1);
    expect(capture.stop).not.toHaveBeenCalled();
  });
  it('録画中にタブを隠した回は捨てる', async () => {
    const { session, capture, hide, render } = setup();
    session.tick(17);
    hide();
    expect(capture.cancel).toHaveBeenCalledTimes(1);
    session.tick(27);
    render();
    expect(capture.frame).not.toHaveBeenCalled();
    expect(await session.end(false)).toBeNull();
  });
  it('録り始める前にタブを隠しても、戻ってから 17 秒を迎えれば録る', async () => {
    const { session, hide, begin } = setup();
    session.tick(5);
    hide();
    session.tick(16.9);
    session.tick(17);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(await session.end(false)).toBe(video);
  });
  it('時刻が飛んで開始が大きく遅れた回は録らない', async () => {
    const { session, begin } = setup();
    session.tick(12);
    session.tick(19);
    session.tick(27);
    expect(begin).not.toHaveBeenCalled();
    expect(await session.end(false)).toBeNull();
  });
  it('17 秒より前に終わった回（すぐスキップ）は null', async () => {
    const { session, begin } = setup();
    session.tick(3);
    expect(await session.end(true)).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });
  it('録画できない環境では null', async () => {
    const { session, begin } = setup(false);
    session.tick(17);
    session.tick(18);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(await session.end(false)).toBeNull();
  });
  it('止めるのに失敗しても null', async () => {
    const { session, capture } = setup();
    capture.stop.mockRejectedValueOnce(new Error('x'));
    session.tick(17);
    expect(await session.end(false)).toBeNull();
  });
});
