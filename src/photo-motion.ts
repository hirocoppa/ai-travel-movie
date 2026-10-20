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
  const rnd = random((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
  // Mix left/right/up/down pans, zoom-in, zoom-out, and diagonals.
  // Offset the pattern by index so adjacent cuts rarely have the same motion.
  const kind = (Math.floor(rnd() * 7) + index * 3) % 7;
  const strength = 0.035 + rnd() * 0.045;
  const diagonal = 0.35 + rnd() * 0.4;
  const signs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1],
    [-diagonal, -diagonal], [diagonal, diagonal], [0, 0]];
  const [dx, dy] = signs[kind];
  const zoomBase = 1.10 + rnd() * 0.05;
  const zoomDelta = 0.045 + rnd() * 0.055;
  const zoomIn = kind === 6 || (kind < 4 && rnd() > 0.6);
  const zoomOut = !zoomIn && rnd() > 0.7;
  const fromZoom = zoomOut ? zoomBase + zoomDelta : zoomBase;
  const toZoom = zoomIn ? zoomBase + zoomDelta : zoomOut ? zoomBase : zoomBase + rnd() * 0.018;
  const jitterX = (rnd() - 0.5) * 0.012;
  const jitterY = (rnd() - 0.5) * 0.012;
  return { kind, fromX: jitterX - dx * strength / 2, toX: jitterX + dx * strength / 2,
    fromY: jitterY - dy * strength / 2, toY: jitterY + dy * strength / 2,
    fromZoom, toZoom };
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
  const eased = p * p * (3 - 2 * p);
  const m = layers.move;
  const zoom = m.fromZoom + (m.toZoom - m.fromZoom) * eased;
  const x = m.fromX + (m.toX - m.fromX) * eased;
  const y = m.fromY + (m.toY - m.fromY) * eased;
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.translate(width / 2 + x * width, height / 2 + y * height);
  ctx.scale(zoom, zoom);
  ctx.drawImage(layers.image, -width / 2, -height / 2, width, height);
  ctx.restore();
}
export function releasePhoto(layers: PhotoLayers) { layers.image.width = 0; }
