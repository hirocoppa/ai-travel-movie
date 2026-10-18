import { describe, it, expect } from "vitest";
import { mixBgm, moodFromPixels, chooseMusicMood, musicTempo, type MusicMood, type AudioRegion } from "./music";
function render(start: number, duration: number, regions: AudioRegion[] = [], original = 0, mood: MusicMood = "calm") {
  const data = new Float32Array(Math.round(duration * 48000)).fill(original);
  mixBgm({ length: data.length, duration, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer, start, 6, regions, mood);
  return data;
}
const rms = (data: Float32Array) => Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length);
describe("automatic local BGM", () => {
  it("defaults to bright music with no photos and keeps all tempos upbeat", async () => {
    expect(await chooseMusicMood([], new AbortController().signal)).toBe("bright");
    for (const mood of ["bright", "calm", "warm"] as const) expect(musicTempo(mood)).toBeGreaterThanOrEqual(100);
  });
  it("selects a mood from warm, cool, bright and dark image colors", () => {
    expect(moodFromPixels(new Uint8ClampedArray([240, 140, 100, 255]))).toBe("warm");
    expect(moodFromPixels(new Uint8ClampedArray([40, 140, 220, 255]))).toBe("calm");
    expect(moodFromPixels(new Uint8ClampedArray([230, 230, 230, 255]))).toBe("bright");
    expect(moodFromPixels(new Uint8ClampedArray([30, 30, 30, 255]))).toBe("calm");
  });
  it("keeps the music continuous when rendered across separate photo cuts", () => {
    const whole = render(0, 3);
    expect(render(0, 1.5)).toEqual(whole.slice(0, 72000));
    const second = render(1.5, 1.5);
    const maxError = second.reduce((max, v, i) => Math.max(max, Math.abs(v - whole[72000 + i])), 0);
    expect(maxError).toBeLessThan(1e-7);
  });
  it("ducks BGM around original video audio and keeps original sound", () => {
    const plain = render(1, 1);
    const ducked = render(1, 1, [{ start: 0, end: 3 }]);
    expect(rms(ducked) / rms(plain)).toBeCloseTo(0.3, 5);
    expect(rms(render(1, 1, [{ start: 0, end: 3 }], 0.5))).toBeGreaterThan(0.35);
  });
  it("fades the ends and limits peaks without clipping", () => {
    expect(render(0, 0.01)[0]).toBe(0);
    const end = render(5.99, 0.01);
    expect(Math.abs(end.at(-1)!)).toBeLessThan(0.00001);
    expect(render(1, 1, [], 1.2).every((v) => v <= 1 && v >= -1)).toBe(true);
  });
});
