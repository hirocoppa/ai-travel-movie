import { useEffect, useRef, useState } from "react";
import { preparePhoto, drawPhoto, releasePhoto, type PhotoLayers } from "./photo-motion";
import { drawPhotoTitle, type PhotoTitle } from "./title";
import { outputSizes, type OutputSize } from "./output-settings";

// Decode the photo only when the file or output aspect ratio changes.
// Typing a title must never allocate another decoded image or large canvas.
export function TitlePreview({ file, title, size }: { file: File; title: PhotoTitle; size: OutputSize }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<PhotoLayers | null>(null);
  const { width, height } = outputSizes[size];
  // A small preview is sufficient on phones; full-resolution work happens only during export.
  const previewWidth = Math.min(width, 640);
  const previewHeight = Math.round(height * previewWidth / width);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    const url = URL.createObjectURL(file);
    setLayers(null);
    image.src = url;
    image.decode().then(async () => {
      if (cancelled) return;
      const prepared = await preparePhoto(image, previewWidth, previewHeight, { index: 0 });
      if (cancelled) releasePhoto(prepared);
      else setLayers(prepared);
    }).catch(() => {
      // An unsupported image format must not crash the entire editor.
    }).finally(() => URL.revokeObjectURL(url));
    return () => {
      cancelled = true;
      image.src = "";
      URL.revokeObjectURL(url);
    };
  }, [file, previewWidth, previewHeight]);

  useEffect(() => {
    return () => { if (layers) releasePhoto(layers); };
  }, [layers]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, previewWidth, previewHeight);
    if (!layers || layers.image.width === 0) return;
    drawPhoto(ctx, layers, 0);
    drawPhotoTitle(ctx, title);
  }, [layers, title.date, title.place, previewWidth, previewHeight]);

  return <canvas ref={canvas} width={previewWidth} height={previewHeight}
    className="title-preview" role="img" aria-label={`最初の写真の文字プレビュー：${title.date} ${title.place}`} />;
}
