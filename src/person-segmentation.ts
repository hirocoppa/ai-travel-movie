import type { SelfieSegmentation, Results } from "@mediapipe/selfie_segmentation";
let model: Promise<SelfieSegmentation> | undefined;
let disabled = false;
let instance: SelfieSegmentation | undefined;
let queue: Promise<unknown> = Promise.resolve();

function bounded<T>(promise: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error("人物推定が時間内に完了しませんでした"))), milliseconds);
    const abort = () => finish(() => reject(new DOMException("作成を中止しました。", "AbortError")));
    function finish(action: () => void) {
      clearTimeout(timer); signal?.removeEventListener("abort", abort); action();
    }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}
async function getModel() {
  model ??= (async () => {
    const base = new URL("./vision/", document.baseURI);
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("selfie_segmentation.js", base).href;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("同梱の人物モデルを読み込めませんでした"));
      document.head.appendChild(script);
    });
    if (disabled) throw new Error("人物推定を停止しました");
    const Constructor = (window as unknown as {
      SelfieSegmentation: new (options: { locateFile: (name: string) => string }) => SelfieSegmentation;
    }).SelfieSegmentation;
    const segmenter = new Constructor({ locateFile: (name) => new URL(name, base).href });
    instance = segmenter;
    segmenter.setOptions({ modelSelection: 0, selfieMode: false });
    await segmenter.initialize();
    // An abandoned load must not retain its WebGL resources indefinitely.
    if (disabled) { await segmenter.close(); throw new Error("人物推定を停止しました"); }
    return segmenter;
  })();
  return model;
}

// One inference at a time. On failures, use the safe fallback for the rest of this page.
export function personMask(image: HTMLCanvasElement, signal?: AbortSignal): Promise<Float32Array | null> {
  const operation = queue.then(async () => {
    if (signal?.aborted) throw new DOMException("作成を中止しました。", "AbortError");
    if (disabled) return null;
    try {
      const segmenter = await bounded(getModel(), 10000, signal);
      let values: Float32Array | null = null;
      segmenter.onResults((result: Results) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(result.segmentationMask, 0, 0, 256, 256);
        const rgba = ctx.getImageData(0, 0, 256, 256).data;
        values = Float32Array.from({ length: 256 * 256 }, (_, i) => rgba[i * 4 + 3] / 255);
        canvas.width = 0;
      });
      await bounded(segmenter.send({ image }), 5000, signal);
      return values;
    } catch (error) {
      disabled = true;
      // Do not block fallback on a broken or still-running GPU operation.
      void instance?.close().catch(() => {});
      if (signal?.aborted) throw error;
      return null;
    }
  });
  queue = operation.catch(() => {});
  return operation;
}
