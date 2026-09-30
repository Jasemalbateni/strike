/* PNG export of the board, framed in a STRIKE header/footer. */
import { bidiSafe } from "@/lib/drills/text";

const SVGNS = "http://www.w3.org/2000/svg";

let fontCssPromise: Promise<string> | null = null;

async function toDataUrl(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** fonts embedded into the exported SVG (an SVG rendered as an image cannot see the page's fonts) */
function fontCss() {
  if (!fontCssPromise) {
    fontCssPromise = Promise.all([toDataUrl("/fonts/Tajawal-Bold.ttf"), toDataUrl("/fonts/BarlowCondensed-Bold.ttf")])
      .then(
        ([taj, bar]) =>
          `@font-face{font-family:'StrikeTajawal';src:url(${taj}) format('truetype');font-weight:700}` +
          `@font-face{font-family:'StrikeBarlow';src:url(${bar}) format('truetype');font-weight:700}` +
          `.t-ar{font-family:'StrikeTajawal',sans-serif;font-weight:700}.t-num{font-family:'StrikeBarlow','StrikeTajawal',sans-serif;font-weight:700}`,
      )
      .catch(() => "");
  }
  return fontCssPromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** rasterise the board part of the live editor SVG */
async function boardImage(svg: SVGSVGElement, W: number, H: number, scale: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui],[data-hit]").forEach((n) => n.remove());
  clone.querySelectorAll("[style]").forEach((n) => n.removeAttribute("style"));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", SVGNS);
  clone.setAttribute("viewBox", `0 0 ${W} ${H}`);
  clone.setAttribute("width", String(Math.round(W * scale)));
  clone.setAttribute("height", String(Math.round(H * scale)));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const style = document.createElementNS(SVGNS, "style");
  style.textContent = await fontCss();
  clone.insertBefore(style, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  return loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml));
}

function cssFont(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type ExportMeta = { title: string; subtitle?: string; frameLabel?: string };

export async function exportBoardPng(svg: SVGSVGElement, W: number, H: number, meta: ExportMeta): Promise<Blob | null> {
  const scale = Math.min(2.4, 2100 / Math.max(W, H));
  const bw = Math.round(W * scale), bh = Math.round(H * scale);
  const pad = Math.round(bw * 0.028) + 16;
  const header = Math.round(Math.max(120, bw * 0.085));
  const footer = Math.round(header * 0.55);
  const cw = bw + pad * 2, ch = header + bh + footer + pad;

  const [boardImg, logo] = await Promise.all([boardImage(svg, W, H, scale), loadImage("/brand/strike-logo-light.svg").catch(() => null)]);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // background
  ctx.fillStyle = "#1c2d5a";
  ctx.fillRect(0, 0, cw, ch);
  // ice accent line
  ctx.fillStyle = "#4da8ff";
  ctx.fillRect(0, 0, cw, Math.max(4, Math.round(header * 0.05)));

  const taj = cssFont("--font-tajawal", "Tajawal, sans-serif");
  const bar = cssFont("--font-barlow", "sans-serif");
  const titleSize = Math.round(header * 0.3);
  const subSize = Math.round(header * 0.17);
  await Promise.all([document.fonts.load(`700 ${titleSize}px ${taj}`), document.fonts.load(`500 ${subSize}px ${taj}`), document.fonts.load(`700 ${subSize}px ${bar}`)]).catch(() => undefined);

  // logo (right, RTL)
  let textRight = cw - pad;
  if (logo) {
    const lh = Math.round(header * 0.58);
    const lw = (logo.width / logo.height) * lh || lh;
    ctx.drawImage(logo, cw - pad - lw, Math.round((header - lh) / 2) + 4, lw, lh);
    textRight = cw - pad - lw - Math.round(pad * 0.6);
  }
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${titleSize}px ${taj}`;
  const titleY = meta.subtitle ? Math.round(header * 0.5) : Math.round(header * 0.6);
  ctx.fillText(bidiSafe(meta.title || "تمرين"), textRight, titleY, textRight - pad - header * 1.4);
  if (meta.subtitle) {
    ctx.fillStyle = "#c7ced9";
    ctx.font = `500 ${subSize}px ${taj}`;
    ctx.fillText(bidiSafe(meta.subtitle), textRight, Math.round(header * 0.78), textRight - pad - header * 1.4);
  }
  if (meta.frameLabel) {
    ctx.font = `700 ${subSize}px ${taj}`;
    const tw = ctx.measureText(meta.frameLabel).width + subSize * 1.4;
    const th = subSize * 1.8;
    const x = pad, y = Math.round((header - th) / 2) + 4;
    ctx.fillStyle = "#e7b53c";
    roundRect(ctx, x, y, tw, th, th / 2);
    ctx.fill();
    ctx.fillStyle = "#14213f";
    ctx.textAlign = "center";
    ctx.fillText(bidiSafe(meta.frameLabel), x + tw / 2, y + th * 0.68);
    ctx.textAlign = "right";
  }

  // board with rounded corners
  ctx.save();
  roundRect(ctx, pad, header, bw, bh, Math.round(pad * 0.45));
  ctx.clip();
  ctx.drawImage(boardImg, pad, header, bw, bh);
  ctx.restore();

  // footer: philosophy line
  ctx.fillStyle = "#c7ced9";
  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(footer * 0.34)}px ${taj}`;
  ctx.fillText("لا طوابير · لا لفات · لا محاضرات", cw / 2, header + bh + Math.round(footer * 0.62));

  return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function canShareFiles() {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
    return !!nav.canShare && nav.canShare({ files: [probe] }) && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** must be called from a fresh tap (share needs a user gesture) */
export async function shareFile(blob: Blob, name: string, title: string) {
  const file = new File([blob], name, { type: "image/png" });
  try {
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
    downloadBlob(blob, name);
    return "downloaded";
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
