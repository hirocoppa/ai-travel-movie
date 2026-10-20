import { test, expect } from "@playwright/test";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const person = readFileSync("tests/fixtures/astronaut.png").toString("base64");

for (const strength of ["small", "medium", "large"] as const) {
test(`real person ${strength}: visible layer movement preserves rigid person pixels, covers the frame and exports MP4 locally`, async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  const result = await page.evaluate(async ({ data, strength }) => {
    const { preparePhoto, drawPhoto, releasePhoto } = await import("/src/photo-motion.ts");
    const { exportMovie } = await import("/src/exporter.ts");
    const original = new Image(); original.src = "data:image/png;base64," + data; await original.decode();
    // Preserve the complete NASA subject in a 16:9 composition; the tight cover
    // crop of the original intentionally falls back when its mask is uncertain.
    const composition = document.createElement("canvas"); composition.width = 1280; composition.height = 720;
    const c = composition.getContext("2d")!; c.fillStyle = "#9ea8b4"; c.fillRect(0, 0, 1280, 720);
    c.drawImage(original, 280, 0, 720, 720);
    const blob = await new Promise<Blob>((resolve) => composition.toBlob((value) => resolve(value!)));
    const image = new Image(); image.src = URL.createObjectURL(blob); await image.decode();
    const layers = await preparePhoto(image, 1280, 720, { strength });
    const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const frames: Uint8ClampedArray[] = [];
    let uncovered = 0;
    for (const progress of [0, 0.5, 1]) {
      ctx.fillStyle = "#ff00ff"; ctx.fillRect(0, 0, 1280, 720);
      drawPhoto(ctx, layers, progress);
      const pixels = ctx.getImageData(0, 0, 1280, 720).data; frames.push(pixels);
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 255) uncovered++;
    }
    const shift = { small: 2, medium: 3, large: 4 }[strength];
    let changed = 0, protectedPixels = 0, protectedChanges = 0;
    const alpha = layers.foreground?.getContext("2d")!.getImageData(layers.insetX, layers.insetY, 1280, 720).data;
    for (let y = 2; y < 718; y++) for (let x = 8; x < 1272; x++) {
      const i = (y * 1280 + x) * 4;
      if (frames[0][i] !== frames[2][i] || frames[0][i + 1] !== frames[2][i + 1]) changed++;
      if (alpha && alpha[i + 3] === 255 && alpha[i - 4 + 3] === 255 && alpha[i + 4 + 3] === 255) {
        protectedPixels++;
        // At 720p foreground endpoints are whole-pixel translations. Its pixels
        // must match after registration: no face warping, bending or regeneration.
        if ([0, 1, 2].some((channel) => frames[0][i + shift * 4 + channel] !== frames[2][i - shift * 4 + channel])) protectedChanges++;
      }
    }
    const effect = layers.effect; releasePhoto(layers); URL.revokeObjectURL(image.src);
    const file = new File([blob], "person.png", { type: "image/png" });
    const effects: string[] = [];
    const movie = await exportMovie([{ asset: { id: "p", file, kind: "photo", duration: 2, date: 1, confirmed: true, dateSource: "test" }, start: 0, duration: 2, capturedAt: 1 }], {
      signal: new AbortController().signal, onProgress: () => {}, onPhotoMotion: (value) => effects.push(value), size: "960x540", motionStrength: strength,
    });
    return { effect, changed, protectedPixels, protectedChanges, uncovered, effects, bytes: Array.from(new Uint8Array(await movie.arrayBuffer())) };
  }, { data: person, strength });
  expect(result.effect).toBe("parallax");
  expect(result.changed).toBeGreaterThan(10000);
  expect(result.protectedPixels).toBeGreaterThan(10000);
  expect(result.protectedChanges).toBe(0);
  expect(result.uncovered).toBe(0);
  expect(result.effects).toEqual(["parallax"]);
  const path = join(mkdtempSync(join(tmpdir(), "travel-animation-")), "person.mp4");
  writeFileSync(path, new Uint8Array(result.bytes));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_name", "-of", "json", path], { encoding: "utf8" }));
  expect(Number(probe.format.duration)).toBe(2);
  expect(probe.streams[0]).toMatchObject({ width: 960, height: 540, codec_name: "h264" });
  expect(probe.streams[1].codec_name).toBe("aac");
  expect(requests.some((url) => /\/vision\/.*tflite/.test(url))).toBe(true);
  expect(requests.filter((url) => /^https?:/.test(url) && !url.startsWith("http://127.0.0.1:5173"))).toEqual([]);
});

}

for (const strength of ["small", "medium", "large"] as const) {
test(`landscape ${strength} uses visible gentle light, not a claim of moving water or clouds`, async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (strength) => {
    const { preparePhoto, drawPhoto, releasePhoto } = await import("/src/photo-motion.ts");
    const source = document.createElement("canvas"); source.width = 800; source.height = 450;
    const s = source.getContext("2d")!;
    const sky = s.createLinearGradient(0, 0, 0, 450); sky.addColorStop(0, "#5d99c9"); sky.addColorStop(1, "#cbdbe2");
    s.fillStyle = sky; s.fillRect(0, 0, 800, 450); s.fillStyle = "#355e45";
    s.beginPath(); s.moveTo(0, 450); s.lineTo(160, 160); s.lineTo(420, 380); s.lineTo(650, 180); s.lineTo(800, 450); s.fill();
    const image = new Image(); image.src = source.toDataURL(); await image.decode();
    const layers = await preparePhoto(image, 960, 540, { strength });
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    drawPhoto(ctx, layers, 0); const before = ctx.getImageData(0, 0, 960, 540).data;
    drawPhoto(ctx, layers, 0.5); const after = ctx.getImageData(0, 0, 960, 540).data;
    drawPhoto(ctx, layers, 1); const end = ctx.getImageData(0, 0, 960, 540).data;
    let changed = 0, maxChange = 0, endChanges = 0;
    for (let i = 0; i < before.length; i += 4) {
      const delta = Math.abs(before[i] - after[i]);
      if (delta > 2) changed++; maxChange = Math.max(maxChange, delta);
      if (before[i] !== end[i]) endChanges++;
    }
    const effect = layers.effect; releasePhoto(layers);
    return { effect, changed, maxChange, endChanges };
  }, strength);
  expect(result.effect).toBe("light");
  expect(result.changed).toBeGreaterThan(10000);
  expect(result.maxChange).toBeLessThanOrEqual(22);
  expect(result.endChanges).toBe(0);
});

}

for (const failure of ["network", "webgl", "timeout"] as const) {
  test(`person model ${failure} failure falls back to light and keeps exporting`, async ({ page }) => {
    if (failure === "webgl") await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type.startsWith("webgl") || type === "experimental-webgl") return null;
        return original.call(this, type, ...args);
      } as typeof original;
    });
    if (failure === "network") await page.route("**/vision/**", (route) => route.abort());
    if (failure === "timeout") await page.route("**/vision/selfie_segmentation.js", (route) => route.fulfill({ contentType: "application/javascript", body: "window.SelfieSegmentation=class { setOptions(){} initialize(){return new Promise(()=>{});} close(){return Promise.resolve();} };" }));
    await page.goto("/");
    const result = await page.evaluate(async (data) => {
      const { preparePhoto, drawPhoto, releasePhoto } = await import("/src/photo-motion.ts");
      const image = new Image(); image.src = "data:image/png;base64," + data; await image.decode();
      const began = performance.now(); const layers = await preparePhoto(image, 960, 540);
      const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540;
      drawPhoto(canvas.getContext("2d")!, layers, 0.5);
      const effect = layers.effect, pixel = canvas.getContext("2d")!.getImageData(480, 270, 1, 1).data[3]; releasePhoto(layers);
      const { exportMovie } = await import("/src/exporter.ts");
      const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], "fallback.png", { type: "image/png" });
      const effects: string[] = [];
      const movie = await exportMovie([{ asset: { id: "f", file, kind: "photo", duration: 1, date: 1, confirmed: true, dateSource: "test" }, start: 0, duration: 1, capturedAt: 1 }], {
        signal: new AbortController().signal, onProgress: () => {}, onPhotoMotion: (value) => effects.push(value), size: "960x540",
      });
      return { effect, elapsed: performance.now() - began, pixel, effects, bytes: movie.size };
    }, person);
    expect(result.effect).toBe("light");
    expect(result.pixel).toBe(255);
    expect(result.elapsed).toBeLessThan(18000);
    expect(result.effects).toEqual(["light"]);
    expect(result.bytes).toBeGreaterThan(1000);
  });
}

test("animation off skips the model and keeps frames static; cancellation stops preparation", async ({ page }) => {
  const vision: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/vision/")) vision.push(r.url()); });
  await page.goto("/");
  const result = await page.evaluate(async (data) => {
    const { preparePhoto, drawPhoto, releasePhoto } = await import("/src/photo-motion.ts");
    const image = new Image(); image.src = "data:image/png;base64," + data; await image.decode();
    const layers = await preparePhoto(image, 960, 540, { animate: false });
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540;
    drawPhoto(canvas.getContext("2d")!, layers, 0); const before = canvas.toDataURL();
    drawPhoto(canvas.getContext("2d")!, layers, 1); const after = canvas.toDataURL();
    const effect = layers.effect; releasePhoto(layers);
    const controller = new AbortController(); controller.abort();
    let aborted = false;
    try { await preparePhoto(image, 960, 540, { signal: controller.signal }); } catch (error) { aborted = (error as Error).name === "AbortError"; }
    return { effect, unchanged: before === after, aborted };
  }, person);
  expect(result).toEqual({ effect: "still", unchanged: true, aborted: true });
  expect(vision).toEqual([]);
});


test("cancelling a pending model load stops promptly", async ({ page }) => {
  await page.route("**/vision/selfie_segmentation.js", (route) => route.fulfill({ contentType: "application/javascript", body: "window.SelfieSegmentation=class { setOptions(){} initialize(){return new Promise(()=>{});} close(){return Promise.resolve();} };" }));
  await page.goto("/");
  const result = await page.evaluate(async (data) => {
    const { preparePhoto } = await import("/src/photo-motion.ts");
    const image = new Image(); image.src = "data:image/png;base64," + data; await image.decode();
    const controller = new AbortController();
    const began = performance.now(); setTimeout(() => controller.abort(), 100);
    try { await preparePhoto(image, 960, 540, { signal: controller.signal }); }
    catch (error) { return { name: (error as Error).name, elapsed: performance.now() - began }; }
    return { name: "not-aborted", elapsed: performance.now() - began };
  }, person);
  expect(result.name).toBe("AbortError");
  expect(result.elapsed).toBeLessThan(1500);
});
