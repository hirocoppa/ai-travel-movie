export type PhotoMotion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
export const photoMotions: PhotoMotion[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"];
export type PhotoLayers = { image: HTMLCanvasElement; motion: PhotoMotion };

export function photoFrame(width: number, height: number, motion: PhotoMotion, progress: number, outputWidth = 1280, outputHeight = 720) {
  const p = Math.max(0, Math.min(1, progress));
  // Cover preserves the source aspect ratio. A small overscan leaves room to pan.
  const zoom = motion === "zoom-in" ? 1 + 0.04 * p : motion === "zoom-out" ? 1.04 - 0.04 * p : 1.04;
  const scale = Math.max(outputWidth / width, outputHeight / height) * zoom;
  const w = width * scale, h = height * scale;
  let x = (outputWidth - w) / 2, y = (outputHeight - h) / 2;
  const direction = p * 2 - 1;
  const dx = Math.min((w - outputWidth) / 2, outputWidth * 0.02);
  const dy = Math.min((h - outputHeight) / 2, outputHeight * 0.02);
  if (motion === "pan-left") x -= dx * direction;
  if (motion === "pan-right") x += dx * direction;
  if (motion === "pan-up") y -= dy * direction;
  if (motion === "pan-down") y += dy * direction;
  return { x, y, width: w, height: h };
}
export async function preparePhoto(image: HTMLImageElement, outputWidth = 1280, outputHeight = 720): Promise<PhotoLayers> {
  // Keep enough resolution for the cover crop and 4% movement without retaining
  // the full camera image in an extra canvas. Do not round the aspect ratio twice.
  const scale = Math.min(1, Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * 1.04);
  const base = document.createElement("canvas");
  base.width = Math.max(1, Math.round(image.naturalWidth * scale));
  base.height = Math.max(1, Math.round(image.naturalHeight * scale));
  base.getContext("2d")!.drawImage(image, 0, 0, base.width, base.height);
  return { image: base, motion: photoMotions[Math.floor(Math.random() * photoMotions.length)] };
}
export function drawPhoto(ctx: CanvasRenderingContext2D, layers: PhotoLayers, progress: number) {
  const frame = photoFrame(layers.image.width, layers.image.height, layers.motion, progress, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(layers.image, frame.x, frame.y, frame.width, frame.height);
}
export function releasePhoto(layers: PhotoLayers) {
  layers.image.width = 0;
}
