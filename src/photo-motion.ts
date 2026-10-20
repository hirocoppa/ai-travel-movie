// A lightweight Ken Burns camera: independent deterministic choices per photo.
// No AI segmentation, network calls, or external rendering services.
export type PhotoEffect = "parallax" | "light" | "still";
export type CameraMove = { fromX: number; fromY: number; toX: number; toY: number; fromZoom: number; toZoom: number; kind: number };
export type PhotoLayers = { image: HTMLCanvasElement; effect: PhotoEffect; move: CameraMove };
export function photoFrame(width: number, height: number, outputWidth = 1280, outputHeight = 720) {
  const scale = Math.max(outputWidth / width, outputHeight / height);
  return { x: (outputWidth - width * scale) / 2, y: (outputHeight - height * scale) / 2,
    width: width * scale, height: height * scale };
}
function random(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function cameraMove(index: number, seed = 0): CameraMove {
  // One simple, constant-speed move per cut: horizontal/vertical PAN or ZOOM.
  // Never combine pan and zoom, and never use diagonal or easing.
  const rnd = random((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
  const kind = (index + Math.floor(rnd() * 4)) % 4;
  const baseZoom = 1.12;
  const panDistance = 0.026; // Gentle, fixed travel for every pan.
  const zoomDistance = 0.024; // Gentle, fixed travel for every zoom.
  const direction = rnd() < 0.5 ? -1 : 1;
  if (kind === 0)
    return { kind, fromX: -direction * panDistance / 2, toX: direction * panDistance / 2,
      fromY: 0, toY: 0, fromZoom: baseZoom, toZoom: baseZoom };
  if (kind === 1)
    return { kind, fromX: 0, toX: 0, fromY: -direction * panDistance / 2,
      toY: direction * panDistance / 2, fromZoom: baseZoom, toZoom: baseZoom };
  const zoomIn = kind === 2;
  return { kind, fromX: 0, toX: 0, fromY: 0, toY: 0,
    fromZoom: zoomIn ? baseZoom : baseZoom + zoomDistance,
    toZoom: zoomIn ? baseZoom + zoomDistance : baseZoom };
}
export async function preparePhoto(image: HTMLImageElement, outputWidth = 1280, outputHeight = 720,
  options: { signal?: AbortSignal; index?: number; seed?: number } = {}): Promise<PhotoLayers> {
  if (options.signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
  const base = document.createElement("canvas");
  base.width = outputWidth; base.height = outputHeight;
  const frame = photoFrame(image.naturalWidth, image.naturalHeight, outputWidth, outputHeight);
  base.getContext("2d")!.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  return { image: base, effect: "light", move: cameraMove(options.index ?? 0, options.seed ?? 0) };
}
export function animationProgress(seconds: number, duration = 2) {
  return Math.max(0, Math.min(1, seconds / Math.max(1 / 30, duration - 1 / 30)));
}
export function drawPhoto(ctx: CanvasRenderingContext2D, layers: PhotoLayers, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  // Linear progress keeps PAN and ZOOM at a constant rate from start to finish.
  const m = layers.move;
  const zoom = m.fromZoom + (m.toZoom - m.fromZoom) * p;
  const x = m.fromX + (m.toX - m.fromX) * p;
  const y = m.fromY + (m.toY - m.fromY) * p;
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.translate(width / 2 + x * width, height / 2 + y * height);
  ctx.scale(zoom, zoom);
  ctx.drawImage(layers.image, -width / 2, -height / 2, width, height);
  ctx.restore();
}
export function releasePhoto(layers: PhotoLayers) { layers.image.width = 0; }
