import exifr from "exifr";
import { Input, BlobSource, ALL_FORMATS } from "mediabunny";
import { parseCaptureDate, type Asset } from "./model";
export const openInput = (file: File) =>
  new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
// Read only atom headers and a bounded metadata atom, not multi-GB media payloads.
export async function quickTimeDate(file: File): Promise<number | null> {
  let pos = 0;
  while (pos + 8 <= file.size) {
    const h = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let size = h.getUint32(0);
    const type = String.fromCharCode(...new Uint8Array(h.buffer, 4, 4));
    let header = 8;
    if (size === 1) {
      if (h.byteLength < 16) return null;
      size = Number(h.getBigUint64(8));
      header = 16;
    }
    if (size === 0) size = file.size - pos;
    if (size < header || !Number.isSafeInteger(size) || pos + size > file.size)
      return null;
    if (type === "moov") {
      if (size > 16 * 1024 * 1024) return null;
      const data = new Uint8Array(
        await file.slice(pos + header, pos + size).arrayBuffer(),
      );
      // Prefer Apple recording-date string, which contains the original UTC offset.
      const text = new TextDecoder().decode(data);
      if (text.includes("com.apple.quicktime.creationdate")) {
        const matches = text.match(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g,
        );
        if (matches?.length === 1) {
          const t = Date.parse(matches[0]);
          if (Number.isFinite(t)) return t;
        }
      }
      for (let p = 0; p + 12 <= data.length;) {
        const view = new DataView(data.buffer, data.byteOffset + p);
        const n = view.getUint32(0);
        if (n < 8 || p + n > data.length) break;
        if (String.fromCharCode(...data.slice(p + 4, p + 8)) === "mvhd") {
          const version = data[p + 8];
          if ((version === 1 && n < 20) || (version === 0 && n < 16))
            return null;
          const seconds =
            version === 1 ? Number(view.getBigUint64(12)) : view.getUint32(12);
          if (!seconds) return null;
          const t = (seconds - 2082844800) * 1000;
          return t >= 0 && t < Date.now() + 86400000 ? t : null;
        }
        p += n;
      }
      return null;
    }
    pos += size;
  }
  return null;
}
export async function inspectFile(file: File): Promise<Asset> {
  const asset: Asset = {
    id: crypto.randomUUID(),
    file,
    kind:
      /\.(mov|mp4)$/i.test(file.name) || file.type.startsWith("video/")
        ? "video"
        : "photo",
    duration: 1,
    date: null,
    dateSource: "撮影日時なし",
    confirmed: false,
  };
  try {
    if (!/\.(jpe?g|png|heic|heif|mov|mp4)$/i.test(file.name))
      throw new Error(
        "未対応形式です。JPEG / PNG / HEIC / MOV / MP4を選んでください。",
      );
    if (asset.kind === "photo") {
      const tags = await exifr
        .parse(file, {
          pick: [
            "DateTimeOriginal",
            "CreateDate",
            "OffsetTimeOriginal",
            "OffsetTimeDigitized",
          ],
          reviveValues: false,
        })
        .catch(() => null);
      if (tags) {
        const parsed = parseCaptureDate(
          tags.DateTimeOriginal ?? tags.CreateDate,
          tags.OffsetTimeOriginal ?? tags.OffsetTimeDigitized,
        );
        Object.assign(asset, parsed);
        asset.dateSource =
          parsed.date !== null ? "EXIF 撮影日時" : "EXIF・時差の確認が必要";
      }
      const url = URL.createObjectURL(file);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 100;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#e8ebf2";
        ctx.fillRect(0, 0, 160, 100);
        const s = Math.min(160 / image.width, 100 / image.height);
        ctx.drawImage(
          image,
          (160 - image.width * s) / 2,
          (100 - image.height * s) / 2,
          image.width * s,
          image.height * s,
        );
        asset.thumbnail = c.toDataURL("image/jpeg", 0.65);
      } catch {
        throw new Error(
          "このブラウザでは画像を開けません。HEICは写真アプリからJPEGに変換して再選択してください。",
        );
      } finally {
        URL.revokeObjectURL(url);
        image.src = "";
      }
    } else {
      const input = openInput(file);
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode()))
          throw new Error(
            "この動画の映像形式を端末で処理できません。H.264のMP4へ変換してください。",
          );
        const audio = await input.getPrimaryAudioTrack();
        if (audio && !(await audio.canDecode()))
          throw new Error(
            "この動画の音声形式を処理できません。AAC音声のMP4へ変換してください。",
          );
        asset.duration = await input.computeDuration();
        if (!Number.isFinite(asset.duration) || asset.duration < 1 / 30)
          throw new Error("動画の長さを取得できません。");
        asset.date = await quickTimeDate(file);
        asset.dateSource =
          asset.date === null ? "撮影日時なし" : "QuickTime 撮影日時（要確認）";
      } finally {
        input.dispose();
      }
    }
    asset.confirmed = asset.date !== null && asset.kind === "photo";
  } catch (e) {
    asset.error = e instanceof Error ? e.message : "読み込みに失敗しました。";
  }
  return asset;
}
