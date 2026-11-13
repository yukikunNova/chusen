/** リプレイ動画の録画。ブラウザの MediaRecorder を包み、形式の選択と開始・停止・取り消しだけを受け持つ。 */

export type ReplayVideo = { blob: Blob; format: 'mp4' | 'webm' };

/** 優先順。X に投稿できるのは MP4（H.264 + AAC）だけなので、使えるなら MP4 にする。 */
export const REPLAY_MIME_TYPES = [
  'video/mp4;codecs=avc1.64001F,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
] as const;

export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return REPLAY_MIME_TYPES.find((type) => isSupported(type)) ?? null;
}

/** MediaRecorder のうち、ここで使う部分。 */
export type RecorderLike = {
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

export type Recording = {
  /** 録画を終えて動画を返す。録れなかった・取り消した場合は null。 */
  stop(): Promise<ReplayVideo | null>;
  /** 録画を捨てる。 */
  cancel(): void;
};

/** すぐ録り始める。 */
export function recordStream(recorder: RecorderLike, mimeType: string): Recording {
  const format = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const chunks: Blob[] = [];
  let failed = false;
  let stopped = false;
  let settle: (video: ReplayVideo | null) => void = () => undefined;
  const result = new Promise<ReplayVideo | null>((resolve) => (settle = resolve));

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    failed = true;
    settle(null);
  };
  recorder.onstop = () => {
    settle(
      failed || chunks.length === 0
        ? null
        : { blob: new Blob(chunks, { type: `video/${format}` }), format },
    );
  };
  try {
    recorder.start();
  } catch {
    failed = true;
    stopped = true;
    settle(null);
  }

  function halt() {
    if (stopped) return;
    stopped = true;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      else settle(null);
    } catch {
      settle(null);
    }
  }

  return {
    stop() {
      halt();
      return result;
    },
    cancel() {
      failed = true;
      chunks.length = 0;
      halt();
    },
  };
}
