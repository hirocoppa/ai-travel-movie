import { describe, it, expect } from "vitest";
import { outputSizes } from "./output-settings";
import { photoFrame, animationProgress, cameraMove } from "./photo-motion";

describe("automatic photo camera moves", () => {
  it("preserves image proportions while covering each output size", () => {
    for (const [w, h] of [[480, 640], [1920, 1080], [3000, 500], [500, 3000], [512, 512]]) {
      for (const { width, height } of Object.values(outputSizes)) {
        const frame = photoFrame(w, h, width, height);
        expect(frame.width / frame.height).toBeCloseTo(w / h, 10);
        expect(frame.x).toBeLessThanOrEqual(0);
        expect(frame.y).toBeLessThanOrEqual(0);
        expect(frame.x + frame.width).toBeGreaterThanOrEqual(width - 1e-8);
        expect(frame.y + frame.height).toBeGreaterThanOrEqual(height - 1e-8);
      }
    }
  });
  it("varies direction and zoom between photos but stays deterministic", () => {
    const moves = Array.from({ length: 30 }, (_, i) => cameraMove(i));
    expect(new Set(moves.map(m => m.kind))).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(moves.map(m => m.toZoom - m.fromZoom > 0)).size).toBe(2);
    expect(moves[7]).toEqual(cameraMove(7));
    for (const m of moves) {
      expect(m.fromZoom).toBeGreaterThanOrEqual(1.1);
      expect(m.toZoom).toBeGreaterThanOrEqual(1.1);
      expect(Math.abs(m.fromX)).toBeLessThan(0.05);
      expect(Math.abs(m.toX)).toBeLessThan(0.05);
    }
  });
  it("animates through the full cut including the three-second opener", () => {
    for (const duration of [1, 1.5, 2, 3]) {
      expect(animationProgress(0, duration)).toBe(0);
      expect(animationProgress(duration - 1 / 30, duration)).toBe(1);
    }
  });
});
