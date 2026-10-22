export const outputSizes = {
  "1920x1080": { width: 1920, height: 1080, bitrate: 5000000 },
  "1280x720": { width: 1280, height: 720, bitrate: 2500000 },
  "960x540": { width: 960, height: 540, bitrate: 1500000 },
  "1080x1920": { width: 1080, height: 1920, bitrate: 5000000 },
  "720x1280": { width: 720, height: 1280, bitrate: 2500000 },
  "540x960": { width: 540, height: 960, bitrate: 1500000 },
} as const;
export type OutputSize = keyof typeof outputSizes;
export type OutputOrientation = "landscape" | "portrait";
export const defaultOutputSize: OutputSize = "1280x720";
export const defaultPortraitSize: OutputSize = "720x1280";
export function sizesForOrientation(orientation: OutputOrientation): OutputSize[] {
  return (Object.keys(outputSizes) as OutputSize[]).filter((key) => {
    const { width, height } = outputSizes[key];
    return orientation === "portrait" ? height > width : width > height;
  });
}
