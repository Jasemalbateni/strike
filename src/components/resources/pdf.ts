"use client";

import type * as PDFJS from "pdfjs-dist";

let lib: Promise<typeof PDFJS> | null = null;
/** pdf.js, loaded on demand (client only) with its worker served from /public */
export function pdfjs() {
  if (!lib)
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  return lib;
}

/** first page → JPEG blob, plus the page count (used for the cover when a PDF is uploaded) */
export async function pdfCover(file: File, width = 960): Promise<{ blob: Blob | null; pages: number }> {
  const m = await pdfjs();
  const task = m.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  const pages = doc.numPages;
  task.destroy();
  return { blob, pages };
}

/** downscale a photo before upload (max side, JPEG) — keeps PNG for graphics with transparency */
export async function shrinkImage(file: File, max = 1800): Promise<{ blob: Blob; type: string; ext: string }> {
  if (file.type === "image/gif") return { blob: file, type: file.type, ext: "gif" };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const png = file.type === "image/png";
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b ?? file), type, 0.86));
  return { blob: png && blob.size > file.size ? file : blob, type, ext: png ? "png" : "jpg" };
}
