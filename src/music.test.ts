import { describe, it, expect } from "vitest";
import { mixRecordedBgm, moodLabels, type AudioRegion } from "./music";
const recording = {
  duration: 2, sampleRate: 48000, numberOfChannels: 1,
  getChannelData: () => new Float32Array(96000).fill(0.2),
} as unknown as AudioBuffer;
function render(start: number, duration: number, regions: AudioRegion[] = [], original = 0) {
  const data = new Float32Array(Math.round(duration * 48000)).fill(original);
  mixRecordedBgm({ length: data.length, duration, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer, start, 6, regions, recording);
  return data;
}
describe("recorded CC0 BGM", () => {
  it("provides three music categories", () => {
    expect(Object.keys(moodLabels)).toEqual(["calm", "bright", "warm"]);
  });
  it("keeps audio continuous across cut boundaries", () => {
    const whole = render(0, 3);
    expect(render(0, 1.5)).toEqual(whole.slice(0, 72000));
    expect(render(1.5, 1.5)).toEqual(whole.slice(72000));
  });
  it("ducks around original video sound", () => {
    const plain = render(1, 1);
    const ducked = render(1, 1, [{ start: 0, end: 3 }]);
    expect(ducked[1000]).toBeLessThan(plain[1000]);
    expect(render(1, 1, [{ start: 0, end: 3 }], 0.5)[1000]).toBeGreaterThan(0.35);
  });
  it("fades ends and prevents clipping", () => {
    expect(render(0, 0.01)[0]).toBe(0);
    expect(Math.abs(render(5.99, 0.01).at(-1)!)).toBeLessThan(0.001);
    expect(render(1, 1, [], 1.2).every((v) => v <= 1 && v >= -1)).toBe(true);
  });
});
