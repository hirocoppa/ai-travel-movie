import { it, expect } from "vitest";
import { quickTimeDate } from "./metadata";
function atom(type: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  bytes.set(payload, 8);
  return bytes;
}
it("reads QuickTime UTC creation time, not filesystem timestamps", async () => {
  const body = new Uint8Array(20);
  new DataView(body.buffer).setUint32(4, 2082844800 + 1735776000);
  const moov = atom("moov", atom("mvhd", body));
  expect(await quickTimeDate(new File([moov], "v.mov"))).toBe(
    Date.parse("2025-01-02T00:00:00Z"),
  );
});
it("does not treat zero QuickTime epoch as a shooting date", async () =>
  expect(
    await quickTimeDate(
      new File([atom("moov", atom("mvhd", new Uint8Array(20)))], "v.mov"),
    ),
  ).toBeNull());
it("prefers Apple capture metadata with explicit offset", async () => {
  const data = new TextEncoder().encode(
    "com.apple.quicktime.creationdate\0data2025-01-02T09:00:00+09:00",
  );
  expect(await quickTimeDate(new File([atom("moov", data)], "v.mov"))).toBe(
    Date.parse("2025-01-02T00:00:00Z"),
  );
});
it("rejects invalid atom sizes", async () =>
  expect(
    await quickTimeDate(new File([new Uint8Array(16)], "v.mov")),
  ).toBeNull());

import { readPhotoTags, photoTitleMetadata } from "./metadata";
import { withPhotoMetadata } from "../tests/fixtures/photo-metadata";
it("reads the original local calendar date and place names from actual JPEG metadata", async () => {
  const bytes = withPhotoMetadata(new Uint8Array([255, 216, 255, 217]));
  const tags = await readPhotoTags(bytes);
  expect(photoTitleMetadata(tags!)).toEqual({ titleDate: "2025-01-02", location: "Asakusa · Tokyo · Japan" });
});
it("uses valid GPS coordinates when metadata has no place name", async () => {
  const bytes = withPhotoMetadata(new Uint8Array([255, 216, 255, 217]), false);
  const tags = await readPhotoTags(bytes);
  expect(photoTitleMetadata(tags!).location).toBe("35.68333, 139.70000");
});
it("leaves absent or invalid date and location information blank", () => {
  expect(photoTitleMetadata({})).toEqual({ titleDate: "", location: "" });
  expect(photoTitleMetadata({ latitude: NaN, longitude: 500 }).location).toBe("");
});
