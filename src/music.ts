// Original procedural instrumental, synthesized locally. No recordings or model downloads.
export type MusicMood = "calm" | "bright" | "warm";
export const moodLabels: Record<MusicMood, string> = { calm: "明るく爽やか", bright: "明るく軽快", warm: "明るくあたたか" };
export function moodFromPixels(pixels: Uint8ClampedArray): MusicMood {
  let light = 0, blueGreen = 0, warmth = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    light += (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    blueGreen += Math.max(g, b) - r;
    warmth += r - b;
    count++;
  }
  if (!count) return "bright";
  if (warmth / count > 25) return "warm";
  if (blueGreen / count > 15 || light / count < 0.42) return "calm";
  return "bright";
}
export async function chooseMusicMood(files: File[], signal: AbortSignal): Promise<MusicMood> {
  const votes: Record<MusicMood, number> = { bright: 0, calm: 0, warm: 0 };
  for (const file of files) {
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      signal.throwIfAborted();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, 32, 32);
      votes[moodFromPixels(ctx.getImageData(0, 0, 32, 32).data)]++;
      canvas.width = 0;
    } finally { image.src = ""; URL.revokeObjectURL(url); }
  }
  return (Object.keys(votes) as MusicMood[]).sort((a, b) => votes[b] - votes[a])[0];
}
const chords = [
  [48, 52, 55, 60], // C major
  [43, 47, 50, 55], // G
  [41, 45, 48, 53], // F major
  [48, 52, 55, 57], // C6
];
const melody = [72, 76, 79, 76, 74, 71, 67, 71, 72, 76, 81, 79, 77, 76, 72, 69];
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
const tone = (note: number, t: number) => Math.sin(2 * Math.PI * frequency(note) * t);
export const musicTempo = (mood: MusicMood) => mood === "bright" ? 112 : mood === "warm" ? 104 : 108;
function chordAt(t: number, beat: number) {
  return chords[Math.floor(Math.max(0, t) / (beat * 4)) % chords.length];
}
export function musicSample(t: number, mood: MusicMood = "bright"): number {
  // Major harmony and a lively rhythm in every mood; tempo never changes pitch.
  const beat = 60 / musicTempo(mood);
  const bar = beat * 4;
  const local = t % bar;
  const current = chordAt(t, beat);
  const previous = chordAt(Math.max(0, t - bar), beat);
  const blend = Math.min(1, local / 0.18);
  let pad = 0;
  for (let i = 0; i < 4; i++)
    pad += ((1 - blend) * tone(previous[i], t) + blend * tone(current[i], t)) * 0.045;
  const step = Math.floor(t / beat);
  const noteTime = t % beat;
  // Soft bell/pluck, with an attack to avoid clicks at note boundaries.
  const envelope = Math.min(1, noteTime / 0.012) * Math.exp(-noteTime * 5);
  const note = melody[step % melody.length];
  const pluck = (tone(note, noteTime) + 0.18 * tone(note + 12, noteTime)) * envelope * 0.24;
  const eighth = beat / 2;
  const arpeggioTime = t % eighth;
  const arpeggioNote = current[Math.floor(t / eighth) % current.length] + 12;
  const arpeggio = tone(arpeggioNote, arpeggioTime) * Math.min(1, arpeggioTime / 0.008) * Math.exp(-arpeggioTime * 12) * 0.13;
  const pulse = tone(current[0], noteTime) * Math.min(1, noteTime / 0.01) * Math.exp(-noteTime * 9) * 0.1;
  return pad + pluck + arpeggio + pulse;
}
export type AudioRegion = { start: number; end: number };
export function mixBgm(
  buffer: AudioBuffer,
  start: number,
  total: number,
  originalAudio: AudioRegion[],
  mood: MusicMood = "bright",
) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const nearby = originalAudio.filter((r) => r.end + 0.2 >= start && r.start - 0.2 <= start + buffer.duration);
  for (let i = 0; i < buffer.length; i++) {
    const t = start + i / buffer.sampleRate;
    const fade = Math.max(0, Math.min(1, t / 0.5, (total - t) / Math.min(1.5, total / 2)));
    // Lower music around video sound, with smooth transitions across cut boundaries.
    let duck = 0;
    for (const region of nearby)
      duck = Math.max(duck, Math.max(0, Math.min(1, (t - region.start + 0.2) / 0.2, (region.end + 0.2 - t) / 0.2)));
    const music = musicSample(t, mood) * 0.9 * (1 - 0.7 * duck) * fade;
    for (const channel of channels) {
      const mixed = channel[i] * 0.8 + music;
      // Smoothly limit only peaks; normal-level original sound remains linear.
      channel[i] = Math.abs(mixed) <= 0.9 ? mixed : Math.sign(mixed) * (0.9 + 0.1 * Math.tanh((Math.abs(mixed) - 0.9) / 0.1));
    }
  }
}
