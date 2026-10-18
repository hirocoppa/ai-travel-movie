import { describe, it, expect } from "vitest";
import { photoFrame, photoMotions } from "./photo-motion";
describe("cover-fitted photo motion", () => {
  for (const [width, height] of [[480, 640], [1920, 1080], [3000, 500], [500, 3000], [512, 512]]) {
    it(`keeps ${width}×${height} photos proportional and covers the output during every motion`, () => {
      for (const motion of photoMotions) {
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const frame = photoFrame(width, height, motion, progress);
          expect(frame.width / frame.height).toBeCloseTo(width / height, 10);
          expect(frame.x).toBeLessThanOrEqual(1e-8);
          expect(frame.y).toBeLessThanOrEqual(1e-8);
          expect(frame.x + frame.width).toBeGreaterThanOrEqual(1280 - 1e-8);
          expect(frame.y + frame.height).toBeGreaterThanOrEqual(720 - 1e-8);
        }
      }
    });
  }
});
