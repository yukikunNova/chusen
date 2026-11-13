import { SHARE_TAG, formatGap } from '../domain/share';
import type { ReplayTelop } from '../scene/replay';

/** リプレイ動画の 1 コマ。3D の画面を写し、動画用の文字（タグ・1 着・写真判定・上位）を焼き込む。 */

export const REPLAY_WIDTH = 1280;
export const REPLAY_HEIGHT = 720;
const FONT =
  "'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
const GOLD = '#ffd60a';
const INK = '#0b0620';
const MEDALS = ['🥇', '🥈', '🥉'] as const;
const NAME_MAX_WIDTH = 900;

/** 元の絵（sw × sh）から、出力（dw × dh）と同じ縦横比で中央を切り出す範囲。 */
export function coverRect(sw: number, sh: number, dw: number, dh: number) {
  const ratio = dw / dh;
  if (sw / sh > ratio) {
    const width = sh * ratio;
    return { x: (sw - width) / 2, y: 0, width, height: sh };
  }
  const height = sw / ratio;
  return { x: 0, y: (sh - height) / 2, width: sw, height };
}

/** 幅に収まるよう、末尾を「…」で省く。 */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

/** 背景が明るくても読めるよう、縁取りしてから塗る。 */
function outlined(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  x: number,
  y: number,
  fill: string,
  maxWidth = NAME_MAX_WIDTH,
) {
  ctx.font = `900 ${size}px ${FONT}`;
  const shown = fit(ctx, text, maxWidth);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(5, size / 6);
  ctx.strokeStyle = INK;
  ctx.strokeText(shown, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(shown, x, y);
}

export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  telop: ReplayTelop,
  courseName: string | null,
  /** 激レア回の呼び名。通常回は null。 */
  rare: string | null = null,
) {
  const crop = coverRect(source.width, source.height, REPLAY_WIDTH, REPLAY_HEIGHT);
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, REPLAY_WIDTH, REPLAY_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  // 左下: タグとコース名
  ctx.textAlign = 'left';
  outlined(ctx, 40, SHARE_TAG, 32, REPLAY_HEIGHT - 32, '#fff');
  if (courseName) {
    const tagWidth = ctx.measureText(SHARE_TAG).width;
    outlined(ctx, 24, courseName, 32 + tagWidth + 20, REPLAY_HEIGHT - 34, '#d8d4ff', 600);
  }

  // 左上: 激レア回の刻印
  if (rare) outlined(ctx, 34, `🌈 激レア回 ${rare}`, 32, 56, GOLD, 700);

  ctx.textAlign = 'center';
  const centerX = REPLAY_WIDTH / 2;

  // 上: 写真判定
  if (telop.photo) {
    outlined(ctx, 44, '📸 写真判定', centerX, 92, '#fff');
    if (telop.photo.gap !== null) {
      outlined(ctx, 72, `${formatGap(telop.photo.gap)}!!`, centerX, 172, GOLD);
    }
  }

  if (telop.podium) {
    // 最後: 上位を中央にまとめて出す
    const rowHeight = 84;
    const height = telop.podium.length * rowHeight + 48;
    const top = (REPLAY_HEIGHT - height) / 2 + 30;
    ctx.fillStyle = 'rgb(11 6 32 / 72%)';
    ctx.fillRect(centerX - 500, top, 1000, height);
    telop.podium.forEach((name, i) => {
      const text = `${MEDALS[i] ?? ''} ${name}`;
      const y = top + 24 + rowHeight * (i + 1) - 22;
      outlined(ctx, i === 0 ? 64 : 52, text, centerX, y, i === 0 ? GOLD : '#fff');
    });
  } else if (telop.winner !== null) {
    outlined(ctx, 84, `🥇 ${telop.winner}`, centerX, REPLAY_HEIGHT - 120, GOLD);
  }
}
