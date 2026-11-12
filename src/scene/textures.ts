import * as THREE from 'three';

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas が使えない');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 中心が明るく外へ消える丸。粒子・星雲に使う。 */
export function glowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(canvas);
}

/** コース床のネオン格子。 */
export function gridTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(256, 256);
  ctx.fillStyle = 'rgba(14,6,44,0.78)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(120,90,255,0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    const v = i * 32;
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, 256);
    ctx.moveTo(0, v);
    ctx.lineTo(256, v);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(41,224,255,0.95)';
  ctx.fillRect(0, 120, 256, 16);
  const texture = toTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** 市松模様（スタート線・ゴール幕）。 */
export function checkerTexture(columns: number, rows: number): THREE.CanvasTexture {
  const cell = 32;
  const { canvas, ctx } = canvas2d(columns * cell, rows * cell);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return toTexture(canvas);
}

/** 太字・縁取りの文字板。戻り値の aspect は 幅 / 高さ。 */
export function labelTexture(
  text: string,
  options: { color: string; background: string; border: string },
): { texture: THREE.CanvasTexture; aspect: number } {
  const fontSize = 72;
  const font = `900 ${fontSize}px 'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif`;
  const probe = canvas2d(8, 8).ctx;
  probe.font = font;
  const padX = 34;
  const height = 112;
  const width = Math.ceil(probe.measureText(text).width) + padX * 2;
  const { canvas, ctx } = canvas2d(width, height);

  const radius = 28;
  ctx.beginPath();
  ctx.roundRect(5, 5, width - 10, height - 10, radius);
  ctx.fillStyle = options.background;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = options.border;
  ctx.stroke();

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.strokeText(text, width / 2, height / 2 + 4);
  ctx.fillStyle = options.color;
  ctx.fillText(text, width / 2, height / 2 + 4);

  return { texture: toTexture(canvas), aspect: width / height };
}

/** 絵文字 1 文字の板（攻撃アイテムの目印）。 */
export function emojiTexture(emoji: string): THREE.CanvasTexture {
  const { canvas, ctx } = canvas2d(128, 128);
  ctx.font = "96px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  return toTexture(canvas);
}
