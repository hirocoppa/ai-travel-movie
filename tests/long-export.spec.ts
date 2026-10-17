import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  const bytes = await page.evaluate(async (base64) => {
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
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, readFileSync(photo).toString("base64"));
  const output = join(dir, "180.mp4");
  writeFileSync(output, new Uint8Array(bytes));
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
