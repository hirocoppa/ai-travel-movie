import { useEffect, useRef } from "react";
import { preparePhoto, drawPhoto, releasePhoto } from "./photo-motion";
import { drawPhotoTitle, type PhotoTitle } from "./title";
import { outputSizes, type OutputSize } from "./output-settings";
export function TitlePreview({ file, title, size }: { file: File; title: PhotoTitle; size: OutputSize }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.src = url;
    const { width, height } = outputSizes[size];
    image.decode().then(async () => {
      if (disposed) return;
      const photo = await preparePhoto(image, width, height, { index: 0 });
      if (!disposed && canvas.current) {
        const ctx = canvas.current.getContext("2d")!;
        drawPhoto(ctx, photo, 0);
        drawPhotoTitle(ctx, title);
      }
      releasePhoto(photo);
    }).catch(() => {}).finally(() => URL.revokeObjectURL(url));
    return () => { disposed = true; image.src = ""; URL.revokeObjectURL(url); };
  }, [file, title.date, title.place, size]);
  return <canvas ref={canvas} width={outputSizes[size].width} height={outputSizes[size].height}
    className="title-preview" role="img" aria-label={`最初の写真の文字プレビュー：${title.date} ${title.place}`} />;
}
