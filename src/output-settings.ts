export const outputSizes = {
  "1920x1080": { width: 1920, height: 1080, bitrate: 5000000 },
  "1280x720": { width: 1280, height: 720, bitrate: 2500000 },
  "960x540": { width: 960, height: 540, bitrate: 1500000 },
} as const;
export type OutputSize = keyof typeof outputSizes;
export const defaultOutputSize: OutputSize = "1280x720";
