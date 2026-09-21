/**
 * Client-side watermark SDK for photo stamping
 * Supports both MP (mini program) camera and H5 (browser) getUserMedia
 *
 * Usage (H5):
 *   import { watermarkCapture } from './watermark';
 *   const blob = await watermarkCapture(videoElement, { station: 'K12+350', lat: 27.7, lng: 106.9 });
 *
 * Usage (MP):
 *   const { tempFilePath } = await mpWatermarkCapture(canvas, ctx, tempFilePath, { station, lat, lng });
 */

export interface WatermarkOptions {
  station?: string;       // e.g. 'K12+350'
  station_m?: number;
  road_name?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp?: string;
  project?: string;
  extra?: string;         // additional line
}

export interface WatermarkResult {
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
}

/**
 * Draw watermark overlay on a canvas context
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D | any,
  width: number,
  height: number,
  opts: WatermarkOptions
): void {
  const lines: string[] = [];
  if (opts.station) lines.push('桩号: ' + opts.station);
  if (opts.road_name) lines.push('路线: ' + opts.road_name);
  if (opts.lat != null && opts.lng != null) {
    lines.push('坐标: ' + opts.lat.toFixed(5) + ', ' + opts.lng.toFixed(5));
  }
  if (opts.accuracy != null) lines.push('精度: ' + opts.accuracy + 'm');
  if (opts.project) lines.push('项目: ' + opts.project);
  if (opts.extra) lines.push(opts.extra);
  lines.push(opts.timestamp || new Date().toLocaleString('zh-CN'));

  if (lines.length === 0) return;

  // Background box
  const fontSize = Math.max(12, Math.floor(width / 40));
  const lineHeight = fontSize * 1.4;
  const padding = fontSize;
  const boxHeight = lines.length * lineHeight + padding * 2;
  const boxWidth = Math.min(width * 0.6, 300);

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  const x = width - boxWidth - 10;
  const y = height - boxHeight - 10;
  // Rounded rect
  const r = 6;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + boxWidth - r, y);
  ctx.arcTo(x + boxWidth, y, x + boxWidth, y + r, r);
  ctx.lineTo(x + boxWidth, y + boxHeight - r);
  ctx.arcTo(x + boxWidth, y + boxHeight, x + boxWidth - r, y + boxHeight, r);
  ctx.lineTo(x + r, y + boxHeight);
  ctx.arcTo(x, y + boxHeight, x, y + boxHeight - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.fill();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = fontSize + 'px sans-serif';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
  }
  ctx.restore();
}

/**
 * H5 capture: take a screenshot of a video element with watermark
 */
export function watermarkCapture(
  video: HTMLVideoElement,
  opts: WatermarkOptions
): Promise<WatermarkResult> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawWatermark(ctx, canvas.width, canvas.height, opts);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    canvas.toBlob((blob) => {
      resolve({ dataUrl, blob: blob || undefined, width: canvas.width, height: canvas.height });
    }, 'image/jpeg', 0.92);
  });
}

/**
 * H5 capture from existing image (for retroactive watermarking)
 */
export function watermarkImage(
  img: HTMLImageElement,
  opts: WatermarkOptions
): Promise<WatermarkResult> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawWatermark(ctx, canvas.width, canvas.height, opts);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    canvas.toBlob((blob) => {
      resolve({ dataUrl, blob: blob || undefined, width: canvas.width, height: canvas.height });
    }, 'image/jpeg', 0.92);
  });
}

/**
 * MP (WeChat mini program) watermark capture
 * Draws watermark on canvas after camera photo, returns compressed image
 */
export function mpWatermarkCapture(
  canvas: any,       // wx canvas object
  ctx: any,          // wx canvas 2d context
  tempFilePath: string,
  opts: WatermarkOptions
): Promise<{ tempFilePath: string }> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawWatermark(ctx, img.width, img.height, opts);
      wx.canvasToTempFilePath({
        canvas,
        quality: 0.92,
        fileType: 'jpg',
        success: (res: any) => resolve({ tempFilePath: res.tempFilePath }),
        fail: (err: any) => reject(err),
      });
    };
    img.onerror = reject;
    img.src = tempFilePath;
  });
}
