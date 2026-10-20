import { describe, it, expect } from "vitest";
import { outputSizes } from "./output-settings";
import { photoFrame, reliablePersonMask, animationProgress } from "./photo-motion";
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
