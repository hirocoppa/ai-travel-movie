import { personMask } from "./person-segmentation";
export const motionStrengths = {
  small: { label: "小", multiplier: 2 },
  medium: { label: "中", multiplier: 3 },
  large: { label: "大", multiplier: 4 },
} as const;
export type MotionStrength = keyof typeof motionStrengths;
export function motionSettings(strength: MotionStrength, width: number, height: number) {
  const multiplier = motionStrengths[strength].multiplier;
  const unit = height / 720;
  const backgroundX = 5 * unit * multiplier, backgroundY = 2.5 * unit * multiplier;
  const foregroundX = unit * multiplier;
  return { backgroundX, backgroundY, foregroundX,
    borderX: Math.ceil(backgroundX + 2 * unit), borderY: Math.ceil(backgroundY + 2 * unit),
    margin: Math.ceil(backgroundX + foregroundX + 8 * unit), feather: 10 * unit,
    lightAlpha: 0.02 * multiplier };
}
export type PhotoEffect = "parallax" | "light" | "still";
export type PhotoLayers = {
  image: HTMLCanvasElement;
  effect: PhotoEffect;
  strength: MotionStrength;
  insetX: number;
  insetY: number;
  light?: HTMLCanvasElement;
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
  if (coverage < 0.035 || coverage > 0.72 || uncertain / values.length > 0.12) return false;
  // Scattered confident islands are not a trustworthy subject silhouette.
  const visited = new Uint8Array(values.length), queue = new Int32Array(values.length);
  let largest = 0;
  for (let i = 0; i < values.length; i++) {
    if (visited[i] || values[i] < 0.9) continue;
    let head = 0, tail = 1; queue[0] = i; visited[i] = 1;
    while (head < tail) {
      const at = queue[head++], x = at % 256;
      for (const next of [x > 0 ? at - 1 : -1, x < 255 ? at + 1 : -1, at - 256, at + 256])
        if (next >= 0 && next < values.length && !visited[next] && values[next] >= 0.9) {
          visited[next] = 1; queue[tail++] = next;
        }
    }
    largest = Math.max(largest, tail);
  }
  return largest >= confident * 0.65;
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
// Distance-based dilation protects the entire silhouette continuously, rather
// than stamping nine offset copies of the mask. Values are in output pixels.
export function protectedAlpha(values: Float32Array, width: number, height: number, margin: number, feather: number): Uint8ClampedArray {
  const n = 256, distance = new Float32Array(n * n);
  const dx = width / n, dy = height / n, diagonal = Math.hypot(dx, dy);
  for (let i = 0; i < distance.length; i++) distance[i] = values[i] > 0.12 ? 0 : 1e9;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + dx);
    if (y) distance[i] = Math.min(distance[i], distance[i - n] + dy);
    if (x && y) distance[i] = Math.min(distance[i], distance[i - n - 1] + diagonal);
    if (x + 1 < n && y) distance[i] = Math.min(distance[i], distance[i - n + 1] + diagonal);
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x;
    if (x + 1 < n) distance[i] = Math.min(distance[i], distance[i + 1] + dx);
    if (y + 1 < n) distance[i] = Math.min(distance[i], distance[i + n] + dy);
    if (x + 1 < n && y + 1 < n) distance[i] = Math.min(distance[i], distance[i + n + 1] + diagonal);
    if (x && y + 1 < n) distance[i] = Math.min(distance[i], distance[i + n - 1] + diagonal);
  }
  return Uint8ClampedArray.from(distance, (d) => {
    const t = Math.max(0, Math.min(1, (d - margin) / Math.max(1, feather)));
    return 255 * (1 - t * t * (3 - 2 * t));
  });
}
function makeForeground(image: HTMLCanvasElement, values: Float32Array, margin: number, feather: number) {
  const mask = document.createElement("canvas"); mask.width = mask.height = 256;
  const ctx = mask.getContext("2d")!, pixels = ctx.createImageData(256, 256);
  const alpha = protectedAlpha(values, image.width, image.height, margin, feather);
  for (let i = 0; i < alpha.length; i++) {
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
    pixels.data[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(pixels, 0, 0);
  const foreground = document.createElement("canvas");
  foreground.width = image.width; foreground.height = image.height;
  const f = foreground.getContext("2d")!;
  f.drawImage(image, 0, 0); f.globalCompositeOperation = "destination-in";
  f.drawImage(mask, 0, 0, image.width, image.height);
  f.globalCompositeOperation = "source-over"; mask.width = 0;
  return foreground;
}
function makeAmbientLight(image: HTMLCanvasElement) {
  const light = document.createElement("canvas"); light.width = 64; light.height = 36;
  const ctx = light.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, 64, 36);
  const pixels = ctx.getImageData(0, 0, 64, 36);
  const luminance = new Float32Array(64 * 36);
  for (let i = 0; i < luminance.length; i++)
    luminance[i] = (pixels.data[i * 4] * 0.2126 + pixels.data[i * 4 + 1] * 0.7152 + pixels.data[i * 4 + 2] * 0.0722) / 255;
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
    const i = y * 64 + x, l = luminance[i];
    const contrast = Math.max(Math.abs(l - luminance[y * 64 + Math.max(0, x - 1)]),
      Math.abs(l - luminance[Math.max(0, y - 1) * 64 + x]));
    // Favor smooth, bright parts without claiming they are water, sky or clouds.
    const weight = Math.max(0, Math.min(1, (l - 0.15) / 0.55)) * Math.max(0, 1 - contrast / 0.2);
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
    pixels.data[i * 4 + 3] = Math.round(weight * 255);
  }
  ctx.putImageData(pixels, 0, 0); return light;
}
export async function preparePhoto(image: HTMLImageElement, outputWidth = 1280, outputHeight = 720,
  options: { animate?: boolean; signal?: AbortSignal; strength?: MotionStrength } = {}): Promise<PhotoLayers> {
  if (options.signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
  const base = document.createElement("canvas");
  const strength = options.strength ?? "small";
  const settings = motionSettings(strength, outputWidth, outputHeight);
  // Reserve enough pixels for visible movement even when no person is detected.
  const fallbackTravel = Math.round(outputWidth * (strength === "large" ? 0.065 : strength === "medium" ? 0.045 : 0.03));
  const insetX = options.animate === false ? 0 : Math.max(settings.borderX, Math.ceil(fallbackTravel / 2) + 2);
  const insetY = options.animate === false ? 0 : Math.max(settings.borderY, Math.ceil(fallbackTravel * 0.2) + 2);
  base.width = outputWidth + insetX * 2; base.height = outputHeight + insetY * 2;
  const frame = photoFrame(image.naturalWidth, image.naturalHeight, base.width, base.height);
  base.getContext("2d")!.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  const layers: PhotoLayers = { image: base, strength, insetX, insetY, effect: options.animate === false ? "still" : "light" };
  try {
    if (options.animate !== false && hasTexture(base)) {
      const values = await personMask(base, options.signal);
      if (values && reliablePersonMask(values)) {
        layers.foreground = makeForeground(base, values, settings.margin, settings.feather);
        layers.effect = "parallax";
      }
    }
    if (options.signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
    if (layers.effect === "light") layers.light = makeAmbientLight(base);
    return layers;
  } catch (error) { releasePhoto(layers); throw error; }
}
export function animationProgress(seconds: number, duration = 2) {
  return Math.max(0, Math.min(1, seconds / Math.max(1 / 30, Math.min(2, duration - 1 / 30))));
}
export function drawPhoto(ctx: CanvasRenderingContext2D, layers: PhotoLayers, progress: number) {
  const { width, height } = ctx.canvas;
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  const settings = motionSettings(layers.strength, width, height);
  ctx.save();
  if (layers.effect === "parallax" && layers.foreground) {
    const phase = eased * 2 - 1;
    const { backgroundX, backgroundY, foregroundX } = settings;
    ctx.drawImage(layers.image, -layers.insetX + phase * backgroundX, -layers.insetY + phase * backgroundY);
    ctx.drawImage(layers.foreground, -layers.insetX - phase * foregroundX, -layers.insetY);
  } else {
    // Always animate non-person photos visibly; the previous exposure-only
    // fallback was effectively imperceptible in one-second cuts.
    const travel = width * (layers.strength === "large" ? 0.065 : layers.strength === "medium" ? 0.045 : 0.03);
    const phase = eased - 0.5;
    const offsetX = layers.effect === "light" ? phase * travel : 0;
    const offsetY = layers.effect === "light" ? Math.sin(p * Math.PI) * travel * 0.08 : 0;
    ctx.drawImage(layers.image, -layers.insetX + offsetX, -layers.insetY + offsetY);
    if (layers.effect === "light" && layers.light) {
      // A soft exposure change anchored to the image. No moving light stripe,
      // local deformation, or semantic water/cloud recognition.
      ctx.globalAlpha *= settings.lightAlpha * Math.sin(p * Math.PI) ** 2;
      ctx.drawImage(layers.light, -layers.insetX + offsetX, -layers.insetY + offsetY, layers.image.width, layers.image.height);
    }
  }
  ctx.restore();
}
export function releasePhoto(layers: PhotoLayers) {
  layers.image.width = 0;
  if (layers.foreground) layers.foreground.width = 0;
  if (layers.light) layers.light.width = 0;
}
