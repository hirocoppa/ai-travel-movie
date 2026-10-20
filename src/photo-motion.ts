import { personMask } from "./person-segmentation";
export type PhotoEffect = "parallax" | "light" | "still";
export type PhotoLayers = {
  image: HTMLCanvasElement;
  effect: PhotoEffect;
  foreground?: HTMLCanvasElement;
};

// Geometry stays rigid. Cover is independent of the animation and preserves aspect ratio.
export function photoFrame(width: number, height: number, outputWidth = 1280, outputHeight = 720) {
  const scale = Math.max(outputWidth / width, outputHeight / height);
  const w = width * scale, h = height * scale;
  return { x: (outputWidth - w) / 2, y: (outputHeight - h) / 2, width: w, height: h };
}
export function reliablePersonMask(values: Float32Array): boolean {
  if (values.length !== 256 * 256) return false;
  let confident = 0, uncertain = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    if (value >= 0.9) confident++;
    if (value > 0.1 && value < 0.9) uncertain++;
  }
  const coverage = confident / values.length;
  return coverage >= 0.035 && coverage <= 0.72 && uncertain / values.length <= 0.12;
}
function hasTexture(image: HTMLCanvasElement) {
  const small = document.createElement("canvas");
  small.width = small.height = 32;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, 32, 32);
  const pixels = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0, squares = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += light; squares += light * light;
  }
  small.width = 0;
  return squares / 1024 - (sum / 1024) ** 2 > 100;
}
function makeForeground(image: HTMLCanvasElement, values: Float32Array) {
  const mask = document.createElement("canvas");
  mask.width = mask.height = 256;
  const ctx = mask.getContext("2d")!;
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < values.length; i++) {
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
    // Include uncertain edges in the protected region instead of cutting through hair/faces.
    pixels.data[i * 4 + 3] = values[i] > 0.12 ? 255 : 0;
  }
  ctx.putImageData(pixels, 0, 0);
  const expanded = document.createElement("canvas");
  expanded.width = image.width; expanded.height = image.height;
  const m = expanded.getContext("2d")!;
  const margin = 24 * image.height / 720;
  // Opaque safety band covers the original subject underneath the moving layer.
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      m.drawImage(mask, dx * margin, dy * margin, image.width, image.height);
  const foreground = document.createElement("canvas");
  foreground.width = image.width; foreground.height = image.height;
  const f = foreground.getContext("2d")!;
  f.drawImage(image, 0, 0);
  f.globalCompositeOperation = "destination-in";
  // Canvas filters are not consistently supported on Safari; native mask scaling
  // provides antialiasing without relying on ctx.filter or WebGL at render time.
  f.drawImage(expanded, 0, 0);
  f.globalCompositeOperation = "source-over";
  mask.width = expanded.width = 0;
  return foreground;
}
export async function preparePhoto(image: HTMLImageElement, outputWidth = 1280, outputHeight = 720,
  options: { animate?: boolean; signal?: AbortSignal } = {}): Promise<PhotoLayers> {
  if (options.signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
  const base = document.createElement("canvas");
  base.width = outputWidth; base.height = outputHeight;
  const frame = photoFrame(image.naturalWidth, image.naturalHeight, outputWidth, outputHeight);
  base.getContext("2d")!.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  const layers: PhotoLayers = { image: base, effect: options.animate === false ? "still" : "light" };
  try {
    if (options.animate !== false && hasTexture(base)) {
      const values = await personMask(base, options.signal);
      if (values && reliablePersonMask(values)) {
        layers.foreground = makeForeground(base, values);
        layers.effect = "parallax";
      }
    }
    if (options.signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
    return layers;
  } catch (error) { releasePhoto(layers); throw error; }
}
export function animationProgress(seconds: number, duration = 2) {
  return Math.max(0, Math.min(1, seconds / Math.max(1 / 30, Math.min(2, duration - 1 / 30))));
}
let lightField: HTMLCanvasElement | undefined;
function getLightField() {
  if (!lightField) {
    lightField = document.createElement("canvas");
    lightField.width = 512; lightField.height = 256;
    const ctx = lightField.getContext("2d")!;
    const light = ctx.createLinearGradient(0, 0, 512, 256);
    light.addColorStop(0, "rgba(255,250,235,0)");
    light.addColorStop(0.5, "rgba(255,250,235,0.08)");
    light.addColorStop(1, "rgba(255,250,235,0)");
    ctx.fillStyle = light; ctx.fillRect(0, 0, 512, 256);
  }
  return lightField;
}
export function drawPhoto(ctx: CanvasRenderingContext2D, layers: PhotoLayers, progress: number) {
  const { width, height } = ctx.canvas;
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  ctx.save();
  if (layers.effect === "parallax" && layers.foreground) {
    const phase = eased * 2 - 1;
    const unit = height / 720;
    const zoom = 1.018;
    ctx.drawImage(layers.image, -(width * (zoom - 1)) / 2 + phase * 5 * unit,
      -(height * (zoom - 1)) / 2 + phase * 2.5 * unit, width * zoom, height * zoom);
    ctx.drawImage(layers.foreground, -phase * unit, 0, width, height);
  } else {
    ctx.drawImage(layers.image, 0, 0, width, height);
    if (layers.effect === "light") {
      // A generic lighting effect, NOT water/cloud/sky recognition or deformation.
      // Cache a small light texture instead of rasterizing a full-size gradient
      // every frame. This keeps the per-frame work to two Canvas image draws.
      ctx.drawImage(getLightField(), width * (-0.85 + 0.7 * eased), 0, width * 2, height);
    }
  }
  ctx.restore();
}
export function releasePhoto(layers: PhotoLayers) {
  layers.image.width = 0;
  if (layers.foreground) layers.foreground.width = 0;
}
