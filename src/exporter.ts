import { outputSizes, defaultOutputSize, type OutputSize } from "./output-settings";
import { drawPhotoTitle, type PhotoTitle } from "./title";
import { mixRecordedBgm, loadMusic, type MusicMood, type AudioRegion } from "./music";
import {
  preparePhoto,
  drawPhoto,
  releasePhoto,
  type PhotoLayers,
  type PhotoEffect,
  animationProgress,
} from "./photo-motion";
import {
  Output,
  NullTarget,
  EncodedAudioPacketSource,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  AudioBufferSink,
  CanvasSink,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { openInput } from "./metadata";
import { totalDuration, type Cut } from "./model";
let aacReady: Promise<void> | undefined;
async function ensureAac() {
  aacReady ??= (async () => {
    if (
      !(await canEncodeAudio("aac", {
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 128000,
      }))
    ) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
  })();
  await aacReady;
}
export async function checkSupport(size: OutputSize = defaultOutputSize): Promise<string | null> {
  try {
    if (!("VideoEncoder" in globalThis))
      return "このブラウザにはMP4作成に必要なWebCodecsがありません。最新のiOS / Safariへ更新するか、Mac・PCの最新Chromeで開いてください。";
    if (
      !(await canEncodeVideo("avc", {
        ...outputSizes[size],
      }))
    )
      return "この端末では選択したサイズのH.264映像を書き出せません。サイズを下げるか、Mac・PCの最新Chromeをお試しください。";
    await ensureAac();
    if (
      !(await canEncodeAudio("aac", {
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 128000,
      }))
    )
      return "この端末ではAAC音声を書き出せません。最新Safari、またはAAC対応のChromeをお試しください。無音への置き換えは行いません。";
    return null;
  } catch {
    return "動画作成機能を確認できません。最新のSafari / Chromeで開き直してください。";
  }
}
export interface ExportOptions {
  size?: OutputSize;
  title?: PhotoTitle;
  bgm?: boolean;
  customMusic?: File;
  onMusicMood?: (mood: MusicMood) => void;
  signal: AbortSignal;
  onProgress: (fraction: number, message: string) => void;
  onPhotoMotion?: (effect: PhotoEffect) => void;
}
function cancelled(signal: AbortSignal) {
  if (signal.aborted)
    throw new DOMException("作成を中止しました。", "AbortError");
}
export async function exportMovie(
  cuts: Cut[],
  { signal, onProgress, onPhotoMotion, onMusicMood, bgm = true, customMusic, size = defaultOutputSize, title }: ExportOptions,
): Promise<Blob> {
  if (!cuts.length) throw new Error("使用できる素材がありません。");
  const unsupported = await checkSupport(size);
  if (unsupported) throw new Error(unsupported);
  let musicMood: MusicMood = "bright";
  let recording: AudioBuffer | undefined;
  if (bgm) {
    onProgress(0, "ライセンス確認済みのBGMを読み込んでいます");
    if (customMusic) {
      onProgress(0, "選択した音楽ファイルを読み込んでいます");
      const bytes = await customMusic.arrayBuffer();
      cancelled(signal);
      const context = new AudioContext();
      try {
        recording = await context.decodeAudioData(bytes);
      } catch {
        throw new Error("選択した音楽を再生できません。MP3・M4A・WAVなど対応形式のファイルを選んでください。");
      } finally {
        await context.close();
      }
      cancelled(signal);
      if (!recording.duration) throw new Error("音楽ファイルに音声がありません。");
    } else {
    const moods: MusicMood[] = ["calm", "bright", "warm"];
    const choice = new Uint32Array(1);
    crypto.getRandomValues(choice);
    musicMood = moods[choice[0] % moods.length];
    recording = (await loadMusic(musicMood, signal)).audio;
    onMusicMood?.(musicMood);
    }
  }
  const canvas = document.createElement("canvas");
  const { width, height, bitrate } = outputSizes[size];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target,
  });
  const video = new CanvasSource(canvas, {
    codec: "avc",
    bitrate,
    bitrateMode: "variable",
    keyFrameInterval: 2,
  });
  const total = totalDuration(cuts);
  const firstPhoto = cuts.find((cut) => cut.asset.kind === "photo");
  let elapsed = 0;
  const originalAudio: AudioRegion[] = [];
  if (bgm) {
    let at = 0;
    for (const cut of cuts) {
      cancelled(signal);
      if (cut.asset.kind === "video") {
        const input = openInput(cut.asset.file);
        try {
          if (await input.getPrimaryAudioTrack())
            originalAudio.push({ start: at, end: at + cut.duration });
        } finally { input.dispose(); }
      }
      at += cut.duration;
    }
  }
  const audioPackets = new EncodedAudioPacketSource("aac");
  let audioDrain = Promise.resolve();
  let audioError: unknown;
  const audio = new AudioBufferSource({
    codec: "aac",
    bitrate: 128000,
    onEncodedPacket: (packet, meta) => {
      if (packet.timestamp >= total) return;
      const trimmed = packet.clone({
        duration: Math.min(packet.duration, total - packet.timestamp),
      });
      audioDrain = audioDrain
        .then(() => audioPackets.add(trimmed, meta))
        .catch((e) => {
          audioError = e;
        });
    },
  });
  // A discard muxer drives the audio encoder. Compressed packets are forwarded with
  // their final duration trimmed, so AAC padding cannot extend a 180-second movie.
  const audioOutput = new Output({
    format: new Mp4OutputFormat(),
    target: new NullTarget(),
  });
  audioOutput.addAudioTrack(audio);
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(audioPackets);
  await output.start();
  await audioOutput.start();
  try {
    for (let index = 0; index < cuts.length; index++) {
      cancelled(signal);
      const cut = cuts[index];
      const frames = Math.round(cut.duration * 30);
      const duration = frames / 30;
      onProgress(elapsed / total, `${index + 1} / ${cuts.length} 素材を編集中`);
      const input =
        cut.asset.kind === "video" ? openInput(cut.asset.file) : null;
      let image: HTMLImageElement | null = null;
      let photo: PhotoLayers | undefined;
      let url: string | undefined;
      try {
        if (!input) {
          url = URL.createObjectURL(cut.asset.file);
          image = new Image();
          image.src = url;
          await image.decode();
          onProgress(
            elapsed / total,
            `${index + 1} / ${cuts.length} 写真の動きを準備中`,
          );
          photo = await preparePhoto(image, width, height, { signal, index });
          onPhotoMotion?.(photo.effect);
        }
        const track = input ? await input.getPrimaryVideoTrack() : null;
        const base = track ? await track.getFirstTimestamp() : 0;
        const sink = track
          ? new CanvasSink(track, {
              width,
              height,
              fit: "contain",
              poolSize: 2,
            })
          : null;
        const times = Array.from(
          { length: frames },
          (_, i) => base + cut.start + i / 30,
        );
        const iterator = sink
          ?.canvasesAtTimestamps(times)
          [Symbol.asyncIterator]();
        try {
          for (let f = 0; f < frames; f++) {
            cancelled(signal);
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);
            if (iterator) {
              const next = await iterator.next();
              if (!next.value)
                throw new Error(
                  `${cut.asset.file.name}: 映像フレームを取得できません。`,
                );
              ctx.drawImage(next.value.canvas, 0, 0, width, height);
            } else if (photo) {
              drawPhoto(ctx, photo, animationProgress(f / 30, duration));
            }
            if (index === 0 && cut === firstPhoto && title) drawPhotoTitle(ctx, title);
            // Fade only at the beginning and end of the complete movie.
            const now = elapsed + f / 30;
            const fade = Math.min(1, now / 0.3, (total - now - 1 / 30) / 0.4);
            if (fade < 1) {
              ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, fade)})`;
              ctx.fillRect(0, 0, width, height);
            }
            await video.add(now, 1 / 30);
            if (f % 15 === 0) {
              onProgress(
                Math.min(0.99, now / total),
                `${index + 1} / ${cuts.length} 素材を編集中`,
              );
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        } finally {
          await iterator?.return?.();
        }
        // Render one cut at a time; the music uses absolute time to stay continuous.
        const offline = new OfflineAudioContext(
          2,
          Math.max(1, Math.round(duration * 48000)),
          48000,
        );
        const gain = offline.createGain();
        gain.connect(offline.destination);
        gain.gain.setValueAtTime(1, 0);
        if (elapsed === 0) {
          gain.gain.setValueAtTime(0, 0);
          gain.gain.linearRampToValueAtTime(1, Math.min(0.3, duration));
        }
        if (index === cuts.length - 1) {
          gain.gain.setValueAtTime(1, Math.max(0, duration - 0.4));
          gain.gain.linearRampToValueAtTime(0, duration);
        }
        const audioTrack = input ? await input.getPrimaryAudioTrack() : null;
        if (audioTrack) {
          const start = base + cut.start;
          for await (const part of new AudioBufferSink(audioTrack).buffers(
            start,
            start + duration,
          )) {
            cancelled(signal);
            const offset = Math.max(0, start - part.timestamp);
            const at = Math.max(0, part.timestamp - start);
            const length = Math.min(
              part.buffer.duration - offset,
              duration - at,
            );
            if (length > 0) {
              const source = offline.createBufferSource();
              source.buffer = part.buffer;
              source.connect(gain);
              source.start(at, offset, length);
            }
          }
        }
        cancelled(signal);
        const rendered = await offline.startRendering();
        cancelled(signal);
        if (bgm && recording) mixRecordedBgm(rendered, elapsed, total, originalAudio, recording);
        await audio.add(rendered);
        await audioDrain;
        if (audioError) throw audioError;
      } finally {
        input?.dispose();
        if (url) URL.revokeObjectURL(url);
        if (image) image.src = "";
        if (photo) releasePhoto(photo);
      }
      elapsed += duration;
    }
    cancelled(signal);
    onProgress(0.99, "MP4ファイルにまとめています");
    await audioOutput.finalize();
    await audioDrain;
    if (audioError) throw audioError;
    await output.finalize();
    if (!target.buffer) throw new Error("MP4ファイルを作成できませんでした。");
    onProgress(1, "完成しました");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (e) {
    await audioOutput.cancel().catch(() => {});
    await audioDrain;
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
