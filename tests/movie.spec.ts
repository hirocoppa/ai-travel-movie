import { withPhotoMetadata } from "./fixtures/photo-metadata";
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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
for (const [photoDuration, width, height] of [[1, 1920, 1080], [1.5, 1280, 720], [2, 960, 540]]) {
test(`mobile: ${photoDuration}s photos, chronological editing, original audio and exact MP4 duration`, async ({
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
  await page.getByLabel("出力サイズ").selectOption(`${width}x${height}`);
  await page.getByLabel("写真の表示時間（全体共通）").selectOption(String(photoDuration));

  await page.locator("input[type=file]").setInputFiles([photo, video]);
  await page.getByLabel("photo.jpgの撮影日時").fill("2025-01-01T00:00");
  await page
    .getByRole("button", { name: "この日時を確認", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "3分動画を作成" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "表示された撮影順で編集する" }).check();
  await expect(page.getByLabel("表示する日付", { exact: true })).toHaveValue("2025-01-01");
  await page.getByLabel("表示する日付", { exact: true }).fill("2025年1月1日");
  await page.getByLabel("表示する場所").fill("東京・浅草");
  await expect(page.getByRole("button", { name: "3分動画を作成" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "表示する日付と場所を確認しました" }).check();
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
  expect(Number(probe.format.duration)).toBe(7);
  expect(probe.streams[0]).toMatchObject({
    codec_name: "h264",
    width,
    height,
    r_frame_rate: "30/1",
  });
  expect(probe.streams[1].codec_name).toBe("aac");
  // A uniform photo makes text pixels distinguishable from the background.
  // The lower-left title must be present at 1s and absent after 2s.
  const countTitlePixels = (time: string) => {
    const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", time, "-i", output, "-frames:v", "1", "-vf",
      `crop=${width}:${height / 2}:0:${height / 2},format=rgb24`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
    let bright = 0;
    for (let i = 0; i < raw.length; i += 3) if (raw[i] > 210 && raw[i + 1] > 210 && raw[i + 2] > 210) bright++;
    return bright;
  };
  expect(countTitlePixels("1")).toBeGreaterThan(100);
  expect(countTitlePixels("2.4")).toBe(0);
  // Cover-fitted photos fill the output horizontally without black side bars.
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
      `crop=${width}:2:0:${height / 2},format=rgb24`,
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    let filledPixels = 0;
    for (let i = 0; i < width * 3; i += 3)
      if (row[i] > 120 && row[i + 1] > 20) filledPixels++;
    return filledPixels;
  };
  expect(photoWidthAt("0.6")).toBe(width);
  expect(photoWidthAt("0.4")).toBe(width);

  // Decode the MP4: automatic BGM is audible and original video sound survives mixing.
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
  ], { maxBuffer: 4 * 1024 * 1024 });
  const samples = new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
  const rms = (from: number, to: number) =>
    Math.sqrt(
      samples.slice(from * 48000, to * 48000).reduce((s, x) => s + x * x, 0) /
        ((to - from) * 48000),
    );
  expect(rms(0.2, 0.7)).toBeGreaterThan(0.03);
  await expect(page.locator(".result")).toContainText("BGM：明るくあたたか");
  expect(rms(4, 5)).toBeGreaterThan(0.01);
  // The source clip contains a 440 Hz tone; BGM alone must not satisfy this check.
  let real = 0, imaginary = 0;
  const offset = 4 * 48000;
  for (let i = 0; i < 48000; i++) {
    real += samples[offset + i] * Math.cos(2 * Math.PI * 440 * i / 48000);
    imaginary += samples[offset + i] * Math.sin(2 * Math.PI * 440 * i / 48000);
  }
  expect(2 * Math.hypot(real, imaginary) / 48000).toBeGreaterThan(0.05);
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
}
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

test("metadata fills the first-photo title and edits or photo-order changes require reconfirmation", async ({ page }) => {
  await page.goto("/");
  const tagged = withPhotoMetadata(new Uint8Array(readFileSync(photo)));
  await page.locator("input[type=file]").setInputFiles({ name: "tagged.jpg", mimeType: "image/jpeg", buffer: Buffer.from(tagged) });
  await expect(page.getByLabel("表示する日付", { exact: true })).toHaveValue("2025-01-02");
  await expect(page.getByLabel("表示する場所")).toHaveValue("Asakusa · Tokyo · Japan");
  await page.getByRole("checkbox", { name: "表示された撮影順で編集する" }).check();
  await page.getByRole("checkbox", { name: "表示する日付と場所を確認しました" }).check();
  await expect(page.getByRole("button", { name: "3分動画を作成" })).toBeEnabled();
  await page.getByLabel("表示する場所").fill("浅草寺");
  await expect(page.getByRole("checkbox", { name: "表示する日付と場所を確認しました" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "3分動画を作成" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "表示する日付と場所を確認しました" }).check();
  await page.locator("input[type=file]").setInputFiles(photo);
  await page.getByLabel("photo.jpgの撮影日時").fill("2025-01-01T00:00");
  await page.getByRole("checkbox", { name: "表示された撮影順で編集する" }).check();
  await expect(page.getByLabel("表示する日付", { exact: true })).toHaveValue("2025-01-01");
  await expect(page.getByLabel("表示する場所")).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "表示する日付と場所を確認しました" })).not.toBeChecked();
  await page.getByLabel("photo.jpgを削除").click();
  await expect(page.getByLabel("表示する場所")).toHaveValue("浅草寺");
});
