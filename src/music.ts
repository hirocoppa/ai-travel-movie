// CC0 recorded music from https://github.com/uncle-sheepsky/duru-ai-cc0-bgm
// Original creator: DURU-AI. License: CC0 1.0 Universal.
// Unlike the previous synthesized melody, these are finished audio recordings.
export type MusicMood = "calm" | "bright" | "warm";
export const moodLabels: Record<MusicMood, string> = {
  calm: "Lo-fi / Chill", bright: "Electronic / Pop", warm: "Groove / Warm",
};
export type AudioRegion = { start: number; end: number };
const source = "https://cdn.jsdelivr.net/gh/uncle-sheepsky/duru-ai-cc0-bgm@main/mp3/";
// Travel-friendly shortlist. Arcade/game-like tracks are deliberately excluded.
// Users can preview each track before selecting it for their movie.
export const musicLibrary = [
  { id: "duru-roomscene-lofi", label: "Roomscene Lo-fi", mood: "calm" },
  { id: "duru-rondo", label: "Rondo", mood: "calm" },
  { id: "duru-ai-ep2-music", label: "Gentle Journey", mood: "warm" },
  { id: "hyak-ep6-galaxy", label: "Galaxy", mood: "calm" },
  { id: "hyak-ep4-blackhole", label: "Blackhole", mood: "calm" },
  { id: "korobeiniki-boombap-loop", label: "Boombap Loop", mood: "warm" },
] as const satisfies ReadonlyArray<{ id: string; label: string; mood: MusicMood }>;
export type LibraryTrackId = (typeof musicLibrary)[number]["id"];
export function musicTrackUrl(id: LibraryTrackId): string {
  return source + id + ".mp3";
}
const tracks: Record<MusicMood, LibraryTrackId[]> = {
  calm: musicLibrary.filter(t => t.mood === "calm").map(t => t.id),
  bright: ["duru-rondo", "korobeiniki-boombap-loop"],
  warm: musicLibrary.filter(t => t.mood === "warm").map(t => t.id),
};
let previousTrack = "";
export async function loadMusic(mood: MusicMood, signal: AbortSignal, selectedTrack?: LibraryTrackId): Promise<{ audio: AudioBuffer; title: string }> {
  const pool = tracks[mood];
  const candidates = pool.filter((name) => name !== previousTrack);
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const title = selectedTrack ?? candidates[random[0] % candidates.length];
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
