import type {
  SelfieSegmentation,
  Results,
} from "@mediapipe/selfie_segmentation";
let segmenterPromise: Promise<SelfieSegmentation> | undefined;
async function getSegmenter() {
  segmenterPromise ??= (async () => {
    const base = new URL("./vision/", document.baseURI).href;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = base + "selfie_segmentation.js";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("人物モデルを読み込めませんでした"));
      document.head.appendChild(script);
    });
    const Constructor = (
      window as unknown as {
        SelfieSegmentation: new (options: {
          locateFile: (name: string) => string;
        }) => SelfieSegmentation;
      }
    ).SelfieSegmentation;
    const segmenter = new Constructor({ locateFile: (name) => base + name });
    segmenter.setOptions({ modelSelection: 0, selfieMode: false });
    await segmenter.initialize();
    return segmenter;
  })();
  return segmenterPromise;
}
export type PhotoLayers = {
  image: HTMLCanvasElement;
  foreground?: HTMLCanvasElement;
};
export async function preparePhoto(
  image: HTMLImageElement,
): Promise<PhotoLayers> {
  const scale = Math.min(1280 / image.naturalWidth, 720 / image.naturalHeight);
  const base = document.createElement("canvas");
  base.width = Math.max(1, Math.round(image.naturalWidth * scale));
  base.height = Math.max(1, Math.round(image.naturalHeight * scale));
  base.getContext("2d")!.drawImage(image, 0, 0, base.width, base.height);
  if (Math.min(base.width, base.height) < 100) return { image: base };
  try {
    const segmenter = await getSegmenter();
    const small = document.createElement("canvas");
    small.width = 256;
    small.height = 256;
    let values: Float32Array | undefined;
    segmenter.onResults((result: Results) => {
      const context = small.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(result.segmentationMask, 0, 0, 256, 256);
      const pixels = context.getImageData(0, 0, 256, 256).data;
      values = Float32Array.from(
        { length: 256 * 256 },
        (_, i) => pixels[i * 4 + 3] / 255,
      );
    });
    await segmenter.send({ image: base });
    if (!values) return { image: base };
    let confident = 0,
      uncertain = 0;
    for (const value of values) {
      if (value > 0.85) confident++;
      if (value > 0.15 && value < 0.85) uncertain++;
    }
    const coverage = confident / values.length;
    // Selfie segmentation is not reliable for every travel photo. If there is no
    // confident subject or too much uncertainty, keep the original photo still.
    if (coverage < 0.02 || coverage > 0.8 || uncertain / values.length > 0.15)
      return { image: base };
    const pixels = new ImageData(256, 256);
    for (let i = 0; i < values.length; i++) {
      pixels.data[i * 4] = 255;
      pixels.data[i * 4 + 1] = 255;
      pixels.data[i * 4 + 2] = 255;
      pixels.data[i * 4 + 3] = values[i] > 0.25 ? 255 : 0;
    }
    small.getContext("2d")!.putImageData(pixels, 0, 0);
    const expanded = document.createElement("canvas");
    expanded.width = base.width;
    expanded.height = base.height;
    const m = expanded.getContext("2d")!;
    // A conservative fixed margin hides the subject in the moving background.
    // This avoids inpainting, invented pixels, and exposed silhouette gaps.
    for (let dy = -10; dy <= 10; dy += 2)
      for (let dx = -10; dx <= 10; dx += 2)
        m.drawImage(small, dx, dy, base.width, base.height);
    const foreground = document.createElement("canvas");
    foreground.width = base.width;
    foreground.height = base.height;
    const f = foreground.getContext("2d")!;
    f.drawImage(base, 0, 0);
    f.globalCompositeOperation = "destination-in";
    f.filter = "blur(1px)";
    f.drawImage(expanded, 0, 0);
    f.filter = "none";
    small.width = 0;
    expanded.width = 0;
    return { image: base, foreground };
  } catch {
    return { image: base };
  }
}
export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  layers: PhotoLayers,
  progress: number,
) {
  const { image, foreground } = layers;
  const x = (1280 - image.width) / 2,
    y = (720 - image.height) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, image.width, image.height);
  ctx.clip();
  if (foreground) {
    const shift = Math.sin((progress - 0.5) * Math.PI) * 2;
    const zoom = 1.015;
    ctx.drawImage(
      image,
      x - (image.width * (zoom - 1)) / 2 + shift,
      y - (image.height * (zoom - 1)) / 2 + shift * 0.4,
      image.width * zoom,
      image.height * zoom,
    );
    ctx.drawImage(foreground, x, y);
  } else ctx.drawImage(image, x, y);
  ctx.restore();
}
export function releasePhoto(layers: PhotoLayers) {
  layers.image.width = 0;
  if (layers.foreground) layers.foreground.width = 0;
}
