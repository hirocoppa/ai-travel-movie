import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("180-second export has exact audiovisual duration", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "travel-long-"));
  const photo = join(dir, "photo.jpg");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=salmon:s=480x640",
    "-frames:v",
    "1",
    photo,
  ]);
  await page.goto("/");
  const url = await page.evaluate(async (base64) => {
    // Load the production export module through Vite. Test-only generated files
    // exercise the full encoder without requiring 180 private travel photos.
    const { exportMovie } = await import("/src/exporter.ts");
    const { makePlan } = await import("/src/model.ts");
    const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const assets = Array.from({ length: 180 }, (_, i) => ({
      id: String(i),
      file: new File([raw], `photo${i}.jpg`, { type: "image/jpeg" }),
      kind: "photo" as const,
      date: i * 1000,
      confirmed: true,
      dateSource: "test",
      duration: 1,
    }));
    const blob = await exportMovie(makePlan(assets), {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    return URL.createObjectURL(blob);
  }, readFileSync(photo).toString("base64"));
  const output = join(dir, "180.mp4");
  // Stream the actual download. Serializing a long MP4 as a JSON number array
  // can exhaust the test runner's heap even though the browser export succeeds.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate((href) => {
      const link = document.createElement("a"); link.href = href; link.download = "180.mp4"; link.click();
    }, url),
  ]);
  await download.saveAs(output);
  await page.evaluate((href) => URL.revokeObjectURL(href), url);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=duration",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(Number(probe.format.duration)).toBe(180);
  expect(
    probe.streams.map((s: { duration: string }) => Number(s.duration)),
  ).toEqual([180, 180]);
});
