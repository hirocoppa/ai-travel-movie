import { mkdir, copyFile, readdir } from "node:fs/promises";
const destination = new URL("../public/vision/", import.meta.url);
const source = new URL("../node_modules/@mediapipe/selfie_segmentation/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of await readdir(source))
  if (/\.(js|wasm|tflite|binarypb|data)$/.test(file))
    await copyFile(new URL(file, source), new URL(file, destination));
