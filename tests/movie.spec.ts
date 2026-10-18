import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fixtures = mkdtempSync(join(tmpdir(), "travel-movie-"));
const photo = join(fixtures, "photo.jpg"),
  video = join(fixtures, "video.mp4");
test.beforeAll(() => {
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
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=30:duration=5",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=5",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-metadata",
    "creation_time=2025-01-02T00:00:00Z",
    "-shortest",
    video,
  ]);
});
test("mobile: import, chronological editing, original audio and exact MP4 duration", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5173")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles([photo, video]);
  await page.getByLabel("photo.jpgの撮影日時").fill("2025-01-01T00:00");
  await page
    .getByRole("button", { name: "この日時を確認", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "3分動画を作成" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "3分動画を作成" }).click();
  await page.locator(".download").waitFor({ timeout: 120000 });
  const bytes = await page.evaluate(async () =>
    Array.from(
      new Uint8Array(
        await (
          await fetch(
            (document.querySelector(".download") as HTMLAnchorElement).href,
          )
        ).arrayBuffer(),
      ),
    ),
  );
  const output = join(fixtures, "output.mp4");
  writeFileSync(output, new Uint8Array(bytes));
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_name,width,height,r_frame_rate",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(Number(probe.format.duration)).toBe(5);
  expect(probe.streams[0]).toMatchObject({
    codec_name: "h264",
    width: 1280,
    height: 720,
    r_frame_rate: "30/1",
  });
  expect(probe.streams[1].codec_name).toBe("aac");
  // A uniform photo has no detected person and must stay still.
  const photoWidthAt = (time: string) => {
    const row = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      time,
      "-i",
      output,
      "-frames:v",
      "1",
      "-vf",
      "crop=1280:2:0:360,format=rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    let width = 0;
    for (let i = 0; i < 1280 * 3; i += 3)
      if (row[i] > 120 && row[i + 1] > 20) width++;
    return width;
  };
  expect(photoWidthAt("0.6")).toBe(photoWidthAt("0.4"));

  // Decode real audio and check the photo section is quiet and the video has sound.
  const raw = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    output,
    "-f",
    "f32le",
    "-ac",
    "1",
    "-ar",
    "48000",
    "pipe:1",
  ]);
  const samples = new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
  const rms = (from: number, to: number) =>
    Math.sqrt(
      samples.slice(from * 48000, to * 48000).reduce((s, x) => s + x * x, 0) /
        ((to - from) * 48000),
    );
  expect(rms(0.2, 0.7)).toBeLessThan(0.001);
  expect(rms(2, 3)).toBeGreaterThan(0.01);
  await page
    .locator(".result video")
    .evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() =>
      page
        .locator(".result video")
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.getByRole("button", { name: "再編集する", exact: true }).click();
  await expect(page.locator(".result")).toHaveCount(0);
});
test("unsupported files are explained", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "not-a-photo.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("unsupported"),
  });
  await expect(page.getByRole("alert")).toContainText("未対応形式");
  await expect(
    page.getByRole("button", { name: "3分動画を作成" }),
  ).toBeDisabled();
});

test("missing video encoder is explained without silently exporting another format", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "VideoEncoder", { value: undefined });
    delete (globalThis as { VideoEncoder?: unknown }).VideoEncoder;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("WebCodecs");
  await expect(
    page.getByRole("button", { name: "3分動画を作成" }),
  ).toBeDisabled();
});
