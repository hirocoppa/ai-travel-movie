import { describe, it, expect } from "vitest";
import { makePlan, totalDuration, parseCaptureDate, type Asset } from "./model";
function a(id: number, kind: "photo" | "video" = "photo", duration = 1): Asset {
  return {
    id: String(id),
    file: {} as File,
    kind,
    duration,
    date: id * 1000,
    confirmed: true,
    dateSource: "test",
  };
}
describe("capture timestamps", () => {
  it("uses offsets, not filename or machine timezone", () => {
    expect(parseCaptureDate("2025:01:02 09:00:00", "+09:00").date).toBe(
      Date.parse("2025-01-02T00:00:00Z"),
    );
    expect(parseCaptureDate("2025-01-01T23:00:00-01:00").date).toBe(
      Date.parse("2025-01-02T00:00:00Z"),
    );
  });
  it("requires confirmation of an unspecified timezone", () => {
    expect(parseCaptureDate("2025:01:02 09:00:00")).toEqual({
      date: null,
      localDate: "2025-01-02T09:00:00",
    });
  });
  it("does not invent dates for invalid metadata", () =>
    expect(parseCaptureDate("nonsense").date).toBeNull());
});
describe("timeline", () => {
  it.each([1, 1.5, 2] as const)("applies %s seconds to every photo without changing video cuts", (duration) => {
    const plan = makePlan([a(1), a(2, "video", 20), a(3)], duration);
    expect(plan.map((cut) => cut.duration)).toEqual([duration, 4, duration]);
    expect(totalDuration(plan)).toBe(duration * 2 + 4);
    expect(totalDuration(makePlan(Array.from({ length: 200 }, (_, i) => a(i)), duration))).toBe(180);
  });
  it("sorts mixed media chronologically and retains short source duration", () => {
    const plan = makePlan([a(3), a(1, "video", 2.5), a(2)]);
    expect(plan.map((c) => c.asset.id)).toEqual(["1", "2", "3"]);
    expect(totalDuration(plan)).toBe(4.5);
  });
  it("does not repeat insufficient material", () =>
    expect(totalDuration(makePlan([a(1), a(2, "video", 20)]))).toBe(5));
  it("produces exactly 180 seconds for excess media and keeps chronology", () => {
    const plan = makePlan(
      Array.from({ length: 200 }, (_, i) =>
        a(i, i % 2 ? "photo" : "video", 20),
      ).reverse(),
    );
    expect(totalDuration(plan)).toBe(180);
    expect(new Set(plan.map((c) => c.asset.id)).size).toBe(plan.length);
    expect(
      plan.every((c, i) => i === 0 || c.capturedAt >= plan[i - 1].capturedAt),
    ).toBe(true);
  });
  it("covers beginning, middle and end even with excess video", () => {
    const plan = makePlan(
      Array.from({ length: 1000 }, (_, i) => a(i, "video", 20)),
    );
    expect(plan[0].asset.id).toBe("0");
    expect(plan.at(-1)?.asset.id).toBe("999");
    expect(
      plan.some((c) => Number(c.asset.id) > 400 && Number(c.asset.id) < 600),
    ).toBe(true);
  });
  it("quantizes short video to full frames", () => {
    const plan = makePlan([a(1, "video", 2.51)]);
    expect(totalDuration(plan)).toBe(2.5);
  });
  it("blocks unknown dates instead of assuming import order", () =>
    expect(() => makePlan([{ ...a(1), date: null }])).toThrow());
  it("blocks unconfirmed video dates", () =>
    expect(() => makePlan([{ ...a(1), confirmed: false }])).toThrow());
  it("excludes unsupported files", () =>
    expect(
      makePlan([{ ...a(1), error: "unsupported" }, a(2)]).map(
        (c) => c.asset.id,
      ),
    ).toEqual(["2"]));
});
