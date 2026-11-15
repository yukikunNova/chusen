import type { ReplayTelop } from '../scene/replay';
import { REPLAY_HEIGHT, REPLAY_WIDTH, drawReplayFrame } from '../ui/replay-frame';
import {
  createFramePacer,
  recordStream,
  supportedMimeTypes,
  type RecorderLike,
  type Recording,
} from './replay-recorder';
import type { ReplayCapture } from './replay-session';

/** 動画のコマ数（毎秒）と画質。 */
const REPLAY_FPS = 30;
const REPLAY_BITRATE = 5_000_000;

/**
 * 3D の画面（source）と音（audio）を録画し始める。録画できない環境では null。
 * 3D の画面を録画用のキャンバスへ写してから録るので、動画の大きさは窓の大きさに関係なく一定。
 */
export function beginCapture(
  source: HTMLCanvasElement,
  audio: MediaStream | null,
  courseName: string | null,
  /** 激レア回の呼び名。通常回は null。 */
  rare: string | null,
): ReplayCapture | null {
  try {
    if (typeof MediaRecorder === 'undefined') return null;
    const mimeTypes = supportedMimeTypes((type) => MediaRecorder.isTypeSupported(type));
    if (mimeTypes.length === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = REPLAY_WIDTH;
    canvas.height = REPLAY_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const picture = canvas.captureStream(REPLAY_FPS);
    const tracks = [...picture.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    // 使えると答えた形式でも、実際には録り始められないことがある。だめなら次の形式を試す
    let recording: Recording | null = null;
    for (const mimeType of mimeTypes) {
      try {
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: REPLAY_BITRATE,
        });
        recording = recordStream(recorder as unknown as RecorderLike, mimeType);
      } catch {
        recording = null;
      }
      if (recording) break;
    }
    if (!recording) {
      picture.getTracks().forEach((track) => track.stop());
      return null;
    }
    const active = recording;
    // 録画用の映像だけ止める（音の出口は次の回も使う）
    const release = () => picture.getTracks().forEach((track) => track.stop());
    const due = createFramePacer(REPLAY_FPS);

    return {
      frame(telop: ReplayTelop) {
        // 画面の更新が速い環境でも、写すのは動画のコマ数まで
        if (!due(performance.now())) return;
        try {
          drawReplayFrame(ctx, source, telop, courseName, rare);
        } catch {
          // 1 コマ写せなくても録画は続ける
        }
      },
      stop: () => active.stop().finally(release),
      cancel() {
        active.cancel();
        release();
      },
    };
  } catch {
    return null;
  }
}
