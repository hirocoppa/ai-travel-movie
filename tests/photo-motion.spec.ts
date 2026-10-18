import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("whole-photo zoom and pan fill every frame without segmentation downloads", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  const result = await page.evaluate(async (data) => {
    const { preparePhoto, drawPhoto, releasePhoto, photoMotions } = await import("/src/photo-motion.ts");
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const layers = await preparePhoto(image);
    const canvas = document.createElement("canvas");
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let minimumChanges = Infinity, uncovered = 0;
    for (const motion of photoMotions) {
      layers.motion = motion;
      let before: Uint8ClampedArray | undefined;
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        // Bright magenta exposes uncovered canvas even where the photo is black.
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(0, 0, 1280, 720);
        drawPhoto(ctx, layers, progress);
        const pixels = ctx.getImageData(0, 0, 1280, 720).data;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 255) uncovered++;
        if (progress === 0) before = pixels;
        if (progress === 1) {
          let changed = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] !== before![i] || pixels[i + 1] !== before![i + 1] || pixels[i + 2] !== before![i + 2]) changed++;
          minimumChanges = Math.min(minimumChanges, changed);
        }
      }
    }
    releasePhoto(layers);
    return { minimumChanges, uncovered };
  }, readFileSync("tests/fixtures/astronaut.png").toString("base64"));
  expect(result.uncovered).toBe(0);
  expect(result.minimumChanges).toBeGreaterThan(10000);
  expect(requests.filter((url) => /\/vision\//.test(url))).toEqual([]);
  expect(requests.filter((url) => /^https?:/.test(url) && !url.startsWith("http://127.0.0.1:5173"))).toEqual([]);
});
