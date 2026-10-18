import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("person remains fixed while the background moves, without external requests", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5173")
    )
      external.push(r.url());
  });
  await page.goto("/");
  const result = await page.evaluate(async (data) => {
    const { preparePhoto, drawPhoto, releasePhoto } =
      await import("/src/photo-motion.ts");
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const layers = await preparePhoto(image);
    if (!layers.foreground) throw new Error("Test person was not segmented");
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    drawPhoto(ctx, layers, 0);
    const before = ctx.getImageData(0, 0, 1280, 720).data;
    drawPhoto(ctx, layers, 1);
    const after = ctx.getImageData(0, 0, 1280, 720).data;
    const foreground = layers.foreground
      .getContext("2d")!
      .getImageData(0, 0, layers.image.width, layers.image.height).data;
    let fixedPixels = 0,
      fixedChanges = 0,
      backgroundChanges = 0;
    const offsetX = (1280 - layers.image.width) / 2,
      offsetY = (720 - layers.image.height) / 2;
    for (let y = 0; y < layers.image.height; y++)
      for (let x = 0; x < layers.image.width; x++) {
        const i = (y * layers.image.width + x) * 4;
        const j = ((y + offsetY) * 1280 + x + offsetX) * 4;
        const changed =
          before[j] !== after[j] ||
          before[j + 1] !== after[j + 1] ||
          before[j + 2] !== after[j + 2];
        if (foreground[i + 3] === 255) {
          fixedPixels++;
          if (changed) fixedChanges++;
        } else if (foreground[i + 3] === 0 && changed) backgroundChanges++;
      }
    releasePhoto(layers);
    return { fixedPixels, fixedChanges, backgroundChanges };
  }, readFileSync("tests/fixtures/astronaut.png").toString("base64"));
  expect(result.fixedPixels).toBeGreaterThan(10000);
  expect(result.fixedChanges).toBe(0);
  expect(result.backgroundChanges).toBeGreaterThan(1000);
  expect(external).toEqual([]);
});
