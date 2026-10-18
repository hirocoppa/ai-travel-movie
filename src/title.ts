export type PhotoTitle = { date: string; place: string };
export function drawPhotoTitle(ctx: CanvasRenderingContext2D, title: PhotoTitle) {
  const { width, height } = ctx.canvas;
  const margin = height * 0.055;
  const maxWidth = width - margin * 2;
  const fontSize = height * 0.055;
  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const lines: string[] = [];
  if (title.date.trim()) lines.push(title.date.trim().slice(0, 80));
  const place = title.place.trim().slice(0, 120);
  if (place) {
    let line = "";
    for (const character of place) {
      if (ctx.measureText(line + character).width > maxWidth - fontSize && line) {
        lines.push(line); line = "";
      }
      line += character;
    }
    if (line) lines.push(line);
  }
  if (!lines.length) { ctx.restore(); return; }
  const shown = lines.slice(0, 4);
  const lineHeight = fontSize * 1.4;
  const top = height - margin - lineHeight * shown.length;
  const boxWidth = Math.min(maxWidth, Math.max(...shown.map((line) => ctx.measureText(line).width)) + fontSize);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(margin - fontSize * 0.3, top - fontSize * 0.15, boxWidth, lineHeight * shown.length + fontSize * 0.3);
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";
  shown.forEach((line, i) => ctx.fillText(line, margin, top + lineHeight * i, maxWidth - fontSize));
  ctx.restore();
}
