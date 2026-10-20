import React, { useEffect, useRef, useState } from "react";
import { drawPhoto, preparePhoto, releasePhoto, type MotionStrength } from "./photo-motion";

export function MotionPreview({ file, strength }: { file: File; strength: MotionStrength }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState("写真の動きを準備中…");
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let layers: Awaited<ReturnType<typeof preparePhoto>> | undefined;
    const url = URL.createObjectURL(file);
    const image = new Image();
    const start = performance.now();
    image.src = url;
    (async () => {
      try {
        await image.decode();
        if (cancelled) return;
        layers = await preparePhoto(image, 640, 360, { strength, animate: true });
        if (cancelled) return;
        setMessage(layers.effect === "parallax" ? "人物と背景の立体演出" : "風景の動きと環境光");
        const ctx = canvas.current?.getContext("2d");
        if (!ctx) return;
        const paint = (now: number) => {
          if (cancelled || !layers) return;
          const progress = ((now - start) % 2400) / 2400;
          ctx.clearRect(0, 0, 640, 360);
          drawPhoto(ctx, layers, progress);
          frame = requestAnimationFrame(paint);
        };
        frame = requestAnimationFrame(paint);
      } catch {
        if (!cancelled) setMessage("プレビューを表示できません");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (layers) releasePhoto(layers);
      URL.revokeObjectURL(url);
    };
  }, [file, strength]);
  return <div style={{ margin: "12px 0", maxWidth: 640 }}>
    <canvas ref={canvas} width={640} height={360} aria-label="写真アニメーションのループプレビュー" style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, background: "#111" }} />
    <p role="status" style={{ fontSize: 13, marginTop: 4 }}>{message} · 2.4秒ループ</p>
  </div>;
}
