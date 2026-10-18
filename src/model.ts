export type Asset = {
  id: string;
  file: File;
  kind: "photo" | "video";
  duration: number;
  date: number | null;
  localDate?: string;
  dateSource: string;
  confirmed: boolean;
  error?: string;
  thumbnail?: string;
  titleDate?: string;
  location?: string;
};
export type Cut = {
  asset: Asset;
  start: number;
  duration: number;
  capturedAt: number;
};
export function parseCaptureDate(
  value: unknown,
  offset?: string,
): { date: number | null; localDate?: string } {
  if (typeof value !== "string") return { date: null };
  const clean = value
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
    .replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(clean)) return { date: null };
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(clean)
    ? clean
    : offset && /^[+-]\d{2}:\d{2}$/.test(offset)
      ? clean + offset
      : null;
  if (!zoned) return { date: null, localDate: clean.slice(0, 19) };
  const date = Date.parse(zoned);
  return { date: Number.isFinite(date) ? date : null };
}
export type PhotoDuration = 1 | 1.5 | 2;
export function makePlan(assets: Asset[], photoDuration: PhotoDuration = 1): Cut[] {
  if (assets.some((a) => !a.error && (a.date === null || !a.confirmed)))
    throw new Error("撮影日時と順序を確認してください。");
  const sorted = assets
    .filter((a) => !a.error)
    .sort((a, b) => a.date! - b.date!);
  const firstPhoto = sorted.find((asset) => asset.kind === "photo");
  const candidates: Cut[] = sorted.map((asset) => ({
    asset,
    start: 0,
    duration:
      asset.kind === "photo"
        ? asset === firstPhoto ? 3 : photoDuration
        : Math.min(4, Math.floor(asset.duration * 30) / 30),
    capturedAt: asset.date!,
  }));
  const available = candidates.reduce((n, c) => n + c.duration, 0);
  if (available <= 180) return candidates;
  // Keep temporal coverage without inventing a quality score or repeating media.
  // Visit endpoints and then evenly subdivide the trip. This preserves temporal
  // coverage even when the input contains hundreds of long clips.
  const indices = [...new Set([0, sorted.findIndex((asset) => asset === firstPhoto), candidates.length - 1].filter((i) => i >= 0))];
  const ranges: [number, number][] = [[1, candidates.length - 2]];
  for (let i = 0; i < ranges.length; i++) {
    const [left, right] = ranges[i];
    if (left > right) continue;
    const mid = Math.floor((left + right) / 2);
    if (!indices.includes(mid)) indices.push(mid);
    ranges.push([left, mid - 1], [mid + 1, right]);
  }
  let remainingFrames = 5400;
  const selected: Cut[] = [];
  for (const i of indices) {
    if (remainingFrames <= 0) break;
    const c = candidates[i];
    const frames = Math.min(Math.round(c.duration * 30), remainingFrames);
    const duration = frames / 30;
    selected.push({ ...c, duration });
    remainingFrames -= frames;
  }
  return selected.sort((a, b) => a.capturedAt - b.capturedAt);
}
export const totalDuration = (cuts: Cut[]) =>
  Math.round(cuts.reduce((s, c) => s + c.duration * 30, 0)) / 30;
