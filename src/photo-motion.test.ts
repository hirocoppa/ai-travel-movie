import { describe, it, expect } from "vitest";
import { outputSizes } from "./output-settings";
import { photoFrame, reliablePersonMask, animationProgress, motionSettings, motionStrengths, protectedAlpha } from "./photo-motion";
describe("safe photo animation", () => {
  for (const [width, height] of [[480, 640], [1920, 1080], [3000, 500], [500, 3000], [512, 512]]) {
    it(`covers output sizes without stretching a ${width}×${height} photo`, () => {
      for (const { width: outW, height: outH } of Object.values(outputSizes)) {
        const frame = photoFrame(width, height, outW, outH);
        expect(frame.width / frame.height).toBeCloseTo(width / height, 10);
        expect(frame.x).toBeLessThanOrEqual(1e-8);
        expect(frame.y).toBeLessThanOrEqual(1e-8);
        expect(frame.x + frame.width).toBeGreaterThanOrEqual(outW - 1e-8);
        expect(frame.y + frame.height).toBeGreaterThanOrEqual(outH - 1e-8);
      }
    });
  }
  it("rejects empty, nearly full, uncertain and malformed person masks", () => {
    expect(reliablePersonMask(new Float32Array(256 * 256))).toBe(false);
    expect(reliablePersonMask(new Float32Array(256 * 256).fill(1))).toBe(false);
    expect(reliablePersonMask(new Float32Array(256 * 256).fill(0.5))).toBe(false);
    expect(reliablePersonMask(new Float32Array(10))).toBe(false);
    expect(reliablePersonMask(new Float32Array(256 * 256).fill(NaN))).toBe(false);
    const confident = new Float32Array(256 * 256);
    confident.fill(1, 10000, 26000);
    expect(reliablePersonMask(confident)).toBe(true);
  });
  it("finishes within each short cut and holds after 2 seconds on the 3-second opener", () => {
    for (const duration of [1, 1.5, 2]) {
      expect(animationProgress(0, duration)).toBe(0);
      expect(animationProgress(duration - 1 / 30, duration)).toBe(1);
    }
    expect(animationProgress(2, 3)).toBe(1);
    expect(animationProgress(3, 3)).toBe(1);
  });
});


describe("three motion strengths", () => {
  it("starts at twice the previous movement and increases monotonically", () => {
    const stages = ["small", "medium", "large"] as const;
    expect(stages.map((stage) => motionStrengths[stage].multiplier)).toEqual([2, 3, 4]);
    expect(stages.map((stage) => motionSettings(stage, 1280, 720).backgroundX * 2)).toEqual([20, 30, 40]);
    expect(stages.map((stage) => motionSettings(stage, 1280, 720).foregroundX * 2)).toEqual([4, 6, 8]);
  });
  it("keeps background coverage and person protection for every size and strength", () => {
    for (const stage of ["small", "medium", "large"] as const) {
      for (const { width, height } of Object.values(outputSizes)) {
        const s = motionSettings(stage, width, height);
        expect(s.borderX).toBeGreaterThan(s.backgroundX);
        expect(s.borderY).toBeGreaterThan(s.backgroundY);
        expect(s.margin).toBeGreaterThan(s.backgroundX + s.foregroundX);
      }
    }
  });
});


it("protects continuously around the silhouette and feathers only outside its safety band", () => {
  const values = new Float32Array(256 * 256); values[128 * 256 + 128] = 1;
  const alpha = protectedAlpha(values, 256, 256, 4, 8);
  const row = (x: number) => alpha[128 * 256 + x];
  for (let x = 128; x <= 132; x++) expect(row(x)).toBe(255);
  for (let x = 133; x < 140; x++) { expect(row(x)).toBeLessThan(row(x - 1)); expect(row(x)).toBeGreaterThan(0); }
  expect(row(140)).toBe(0);
});
it("rejects fragmented masks instead of animating disconnected patches", () => {
  const values = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x += 3) values[y * 256 + x] = 1;
  expect(reliablePersonMask(values)).toBe(false);
});
