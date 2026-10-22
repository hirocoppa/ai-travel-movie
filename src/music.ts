// CC0 recorded music from https://github.com/uncle-sheepsky/duru-ai-cc0-bgm
// Original creator: DURU-AI. License: CC0 1.0 Universal.
// Unlike the previous synthesized melody, these are finished audio recordings.
export type MusicMood = "calm" | "bright" | "warm";
export const moodLabels: Record<MusicMood, string> = {
  calm: "Lo-fi / Chill", bright: "Electronic / Pop", warm: "Groove / Warm",
};
export type AudioRegion = { start: number; end: number };
const source = "https://cdn.jsdelivr.net/gh/uncle-sheepsky/duru-ai-cc0-bgm@main/mp3/";
// All 17 CC0 tracks published in the unified DURU-AI pack.
// Every track appears in at least one mood pool, so auto-selection can reach all 17.
const tracks: Record<MusicMood, string[]> = {
  calm: [
    "duru-roomscene-lofi", "duru-rondo", "duru-ai-ep2-music",
    "hyak-ep6-galaxy", "hyak-ep4-blackhole",
  ],
  bright: [
    "duru-rondo", "duru-arcade-vibe", "duru-rhythm-fever",
    "duru-denparcade", "duru-winter-arcade", "hyak-ep1-rhythm",
    "hyak-ep3-suika", "hyak-ep7-danmaku",
    "korobeiniki-arcade-fullver",
  ],
  warm: [
    "duru-roomscene-lofi", "duru-ai-ep2-music",
    "hyak-ep5-2048", "hyak-ep2-korobeiniki-tetris",
    "korobeiniki-boombap-loop", "mountainking-arcade-loop",
  ],
};
let previousTrack = "";
export async function loadMusic(mood: MusicMood, signal: AbortSignal): Promise<{ audio: AudioBuffer; title: string }> {
  const pool = tracks[mood];
  const candidates = pool.filter((name) => name !== previousTrack);
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const title = candidates[random[0] % candidates.length];
  const url = source + title + ".mp3";
  let response: Response;
  try {
    response = await fetch(url, { signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const bytes = await response.arrayBuffer();
    if (signal.aborted) throw new DOMException("作成を中止しました。", "AbortError");
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(bytes);
      if (!audio.duration || !audio.numberOfChannels) throw new Error("Empty audio");
      previousTrack = title;
      return { audio, title };
    } finally {
      await context.close();
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("BGMを取得できませんでした。通信環境を確認して再度お試しください。");
  }
}
export function mixRecordedBgm(
  buffer: AudioBuffer,
  start: number,
  total: number,
  originalAudio: AudioRegion[],
  recording: AudioBuffer,
) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const musicChannels = Array.from({ length: recording.numberOfChannels }, (_, i) => recording.getChannelData(i));
  const nearby = originalAudio.filter((r) => r.end + 0.2 >= start && r.start - 0.2 <= start + buffer.duration);
  const loopLength = recording.duration;
  const crossfade = Math.min(0.25, loopLength / 10);
  for (let i = 0; i < buffer.length; i++) {
    const t = start + i / buffer.sampleRate;
    const fade = Math.max(0, Math.min(1, t / 0.5, (total - t) / Math.min(1.5, total / 2)));
    let duck = 0;
    for (const region of nearby)
      duck = Math.max(duck, Math.max(0, Math.min(1, (t - region.start + 0.2) / 0.2, (region.end + 0.2 - t) / 0.2)));
    const pos = t % loopLength;
    for (let ch = 0; ch < channels.length; ch++) {
      const samples = musicChannels[Math.min(ch, musicChannels.length - 1)];
      const index = Math.min(samples.length - 1, Math.floor(pos * recording.sampleRate));
      let sample = samples[index];
      if (pos >= loopLength - crossfade) {
        const blend = (pos - (loopLength - crossfade)) / crossfade;
        const beginning = Math.min(samples.length - 1, Math.floor((pos - (loopLength - crossfade)) * recording.sampleRate));
        sample = sample * (1 - blend) + samples[beginning] * blend;
      }
      const mixed = channels[ch][i] * 0.8 + sample * 0.65 * (1 - 0.7 * duck) * fade;
      channels[ch][i] = Math.abs(mixed) <= 0.9 ? mixed : Math.sign(mixed) * (0.9 + 0.1 * Math.tanh((Math.abs(mixed) - 0.9) / 0.1));
    }
  }
}
