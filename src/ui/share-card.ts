import type { CardImage } from '../app';
import { SHARE_TAG, SHARE_URL, formatGap, formatScore, type ShareModel } from '../domain/share';

/** 共有用の結果画像（canvas に描いて PNG にする）。X の横長画像に合わせた 16:9。 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;
const FONT =
  "'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
const GOLD = '#ffd60a';
const PINK = '#ff2e93';
const CYAN = '#29e0ff';
const MARGIN = 60;
const ROWS_TOP = 190;
const ROWS_BOTTOM = 590;
/** 長い名前を収めるために、文字をどこまで小さくしてよいか（元の大きさに対する割合）。 */
const NAME_MIN_SCALE = 0.55;
/** この人数までは 1 列で大きく、超えたら 2 列。 */
const SINGLE_COLUMN_MAX = 5;

const font = (size: number, weight = 900) => `${weight} ${size}px ${FONT}`;

/** 幅に収まるよう、末尾を「…」で省く。 */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const base = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  base.addColorStop(0, '#1b0640');
  base.addColorStop(0.55, '#0a0420');
  base.addColorStop(1, '#2a0338');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  for (const [x, y, radius, color] of [
    [1080, 60, 420, 'rgb(41 224 255 / 28%)'],
    [80, 640, 460, 'rgb(255 46 147 / 30%)'],
  ] as const) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgb(0 0 0 / 0%)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
  // 星。毎回同じ並びにする
  ctx.fillStyle = 'rgb(255 255 255 / 70%)';
  for (let i = 0; i < 90; i++) {
    const x = (i * 397) % CARD_WIDTH;
    const y = (i * 263) % CARD_HEIGHT;
    ctx.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
  }
  ctx.strokeStyle = 'rgb(255 255 255 / 22%)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, CARD_WIDTH - 36, CARD_HEIGHT - 36);
}

function drawHeader(ctx: CanvasRenderingContext2D, model: ShareModel) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(76);
  ctx.shadowColor = 'rgb(255 159 28 / 90%)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = GOLD;
  ctx.fillText('ドパ抽', MARGIN, 112);
  const logoWidth = ctx.measureText('ドパ抽').width;
  ctx.shadowBlur = 0;
  ctx.font = font(38);
  ctx.fillStyle = '#fff';
  ctx.fillText('発表順 決定！', MARGIN + logoWidth + 24, 108);

  if (model.score > 0) {
    ctx.textAlign = 'right';
    ctx.font = font(24, 700);
    ctx.fillStyle = 'rgb(255 255 255 / 75%)';
    ctx.fillText('ドパ値', CARD_WIDTH - MARGIN, 58);
    ctx.font = font(54);
    ctx.fillStyle = CYAN;
    ctx.shadowColor = 'rgb(41 224 255 / 80%)';
    ctx.shadowBlur = 18;
    ctx.fillText(formatScore(model.score), CARD_WIDTH - MARGIN, 112);
    ctx.shadowBlur = 0;
  }

  ctx.font = font(26, 700);
  if (model.courseName) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(255 255 255 / 80%)';
    ctx.fillText(fit(ctx, `コース: ${model.courseName}`, 620), MARGIN, 158);
  }
  if (model.photoGap !== null) {
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.fillText(`📸 写真判定 ${formatGap(model.photoGap)}`, CARD_WIDTH - MARGIN, 158);
  }
}

function drawRows(ctx: CanvasRenderingContext2D, model: ShareModel) {
  const count = model.rows.length;
  if (count === 0) return;
  const columns = count > SINGLE_COLUMN_MAX ? 2 : 1;
  const perColumn = Math.ceil(count / columns);
  const gutter = 40;
  const columnWidth = (CARD_WIDTH - MARGIN * 2 - gutter * (columns - 1)) / columns;
  const rowHeight = Math.min(92, (ROWS_BOTTOM - ROWS_TOP) / perColumn);
  const size = Math.min(54, rowHeight * 0.62);
  const rankWidth = size * 1.5;

  model.rows.forEach((row, i) => {
    const left = MARGIN + Math.floor(i / perColumn) * (columnWidth + gutter);
    const baseline = ROWS_TOP + (i % perColumn) * rowHeight + rowHeight * 0.72;
    const first = row.rank === 1;

    ctx.textAlign = 'right';
    ctx.font = font(size);
    ctx.fillStyle = first ? GOLD : CYAN;
    ctx.fillText(String(row.rank), left + rankWidth - size * 0.3, baseline);

    // 称号の札の幅を先に決め、残りを名前に使う
    const badgeSize = size * 0.42;
    ctx.font = font(badgeSize, 700);
    const badgePad = badgeSize * 0.7;
    const badgeWidth = row.title ? ctx.measureText(row.title).width + badgePad * 2 : 0;
    const badgeGap = row.title ? size * 0.35 : 0;

    ctx.textAlign = 'left';
    // 長い名前は、まず文字を小さくして収める。それでも収まらなければ末尾を省く
    const nameWidth = columnWidth - rankWidth - badgeWidth - badgeGap;
    let nameSize = size;
    ctx.font = font(nameSize);
    while (nameSize > size * NAME_MIN_SCALE && ctx.measureText(row.name).width > nameWidth) {
      nameSize -= 2;
      ctx.font = font(nameSize);
    }
    const name = fit(ctx, row.name, nameWidth);
    ctx.fillStyle = first ? GOLD : '#fff';
    if (first) {
      ctx.shadowColor = 'rgb(255 159 28 / 90%)';
      ctx.shadowBlur = 20;
    }
    ctx.fillText(name, left + rankWidth, baseline);
    ctx.shadowBlur = 0;

    if (row.title) {
      const x = left + rankWidth + ctx.measureText(name).width + badgeGap;
      const height = badgeSize * 1.9;
      const y = baseline - size * 0.36 - height / 2;
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.roundRect(x, y, badgeWidth, height, height / 2);
      ctx.fill();
      ctx.font = font(badgeSize, 700);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.title, x + badgePad, y + height / 2 + badgeSize * 0.05);
      ctx.textBaseline = 'alphabetic';
    }
  });
}

function drawFooter(ctx: CanvasRenderingContext2D, model: ShareModel) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(30);
  ctx.fillStyle = PINK;
  ctx.fillText(SHARE_TAG, MARGIN, 636);
  if (model.more > 0) {
    ctx.font = font(24, 700);
    ctx.fillStyle = 'rgb(255 255 255 / 80%)';
    ctx.fillText(`ほか ${model.more} 人`, MARGIN + 150, 634);
  }
  ctx.textAlign = 'right';
  ctx.font = font(22, 700);
  ctx.fillStyle = 'rgb(255 255 255 / 65%)';
  ctx.fillText(SHARE_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), CARD_WIDTH - MARGIN, 634);
}

export function drawShareCard(ctx: CanvasRenderingContext2D, model: ShareModel) {
  drawBackground(ctx);
  drawHeader(ctx, model);
  drawRows(ctx, model);
  drawFooter(ctx, model);
}

/** 結果画像を作る。canvas が使えない環境では null。 */
export async function renderShareCard(model: ShareModel): Promise<CardImage | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawShareCard(ctx, model);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? { blob, dataUrl: canvas.toDataURL('image/png') } : null;
  } catch {
    return null;
  }
}
