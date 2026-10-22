"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Rows3, GalleryHorizontal, Download, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { pdfjs } from "./pdf";

/** renders one page to a canvas at the element's width × devicePixelRatio */
function PageCanvas({ doc, n, lazy = false }: { doc: PDFDocumentProxy; n: number; lazy?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [ratio, setRatio] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    let io: IntersectionObserver | null = null;
    if (lazy) {
      io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
      io.observe(el);
    }
    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, [lazy]);

  useEffect(() => {
    if (!visible || !width || !canvas.current) return;
    let task: RenderTask | null = null;
    let dead = false;
    doc.getPage(n).then((page) => {
      if (dead || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = page.getViewport({ scale: (width * dpr) / base.width });
      const c = canvas.current;
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      task = page.render({ canvas: c, viewport: vp });
      task.promise.catch(() => {});
    });
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [doc, n, visible, width]);

  return (
    <div ref={wrap} className="w-full bg-white rounded-xl overflow-hidden shadow-sm border border-silver-200" style={{ aspectRatio: ratio ? `1 / ${ratio}` : "16 / 9" }}>
      <canvas ref={canvas} className="w-full h-full block" aria-label={`صفحة ${n}`} />
    </div>
  );
}

export default function PdfViewer({ url, title }: { url: string; title: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState(false);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"slides" | "scroll">("slides");
  const [big, setBig] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    let task: { destroy: () => Promise<void> } | null = null;
    let dead = false;
    pdfjs()
      .then((m) => {
        const t = m.getDocument({ url });
        task = t;
        return t.promise;
      })
      .then((loaded) => {
        if (!dead) setDoc(loaded);
      })
      .catch(() => !dead && setErr(true));
    return () => {
      dead = true;
      task?.destroy();
    };
  }, [url]);

  const total = doc?.numPages ?? 0;
  // RTL page: "next" sits on the left
  const go = useCallback((delta: number) => setPage((p) => Math.min(Math.max(1, p + delta), total || 1)), [total]);

  useEffect(() => {
    if (mode !== "slides") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") go(1);
      if (e.key === "ArrowRight" || e.key === "PageUp") go(-1);
      if (e.key === "Escape") setBig(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, mode]);

  useEffect(() => {
    document.body.style.overflow = big ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [big]);

  if (err)
    return (
      <div className="card p-6 text-center text-ink-2">
        تعذر عرض الملف هنا.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-ice-600 font-bold underline">
          افتحه في صفحة جديدة
        </a>
      </div>
    );

  const toolbar = (
    <div className={clsx("flex items-center gap-1.5 flex-wrap", big && "text-white")}>
      <div className="flex rounded-xl p-0.5 bg-silver-100/80">
        <button onClick={() => setMode("slides")} className={clsx("h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-[13px] font-bold", mode === "slides" ? "bg-white text-navy shadow-sm" : "text-ink-2")} aria-pressed={mode === "slides"}>
          <GalleryHorizontal size={16} /> شرائح
        </button>
        <button onClick={() => setMode("scroll")} className={clsx("h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-[13px] font-bold", mode === "scroll" ? "bg-white text-navy shadow-sm" : "text-ink-2")} aria-pressed={mode === "scroll"}>
          <Rows3 size={16} /> كل الصفحات
        </button>
      </div>
      <span className="num text-[13px] font-bold ms-auto px-1">{total ? (mode === "slides" ? `${page} / ${total}` : `${total} صفحة`) : ""}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" download={`${title}.pdf`} className={clsx("h-9 w-9 grid place-items-center rounded-lg", big ? "hover:bg-white/10" : "text-ink-2 hover:bg-silver-100 hover:text-navy")} aria-label="تحميل PDF" title="تحميل PDF">
        <Download size={17} />
      </a>
      <button onClick={() => setBig((b) => !b)} className={clsx("h-9 w-9 grid place-items-center rounded-lg", big ? "hover:bg-white/10" : "text-ink-2 hover:bg-silver-100 hover:text-navy")} aria-label={big ? "تصغير" : "ملء الشاشة"} title={big ? "تصغير" : "ملء الشاشة"}>
        {big ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
    </div>
  );

  return (
    <div className={clsx(big ? "fixed inset-0 z-[70] bg-navy-900 p-3 sm:p-5 flex flex-col gap-3 pt-[max(env(safe-area-inset-top),12px)]" : "flex flex-col gap-3")}>
      {toolbar}
      {!doc ? (
        <div className="aspect-video rounded-xl bg-silver-100 grid place-items-center text-ink-2">
          <Loader2 className="animate-spin" />
        </div>
      ) : mode === "slides" ? (
        <div className={clsx("relative select-none", big && "flex-1 min-h-0 flex items-center justify-center")}>
          <div
            className={clsx(big ? "h-full max-h-full aspect-auto w-full max-w-[min(100%,calc((100dvh-120px)*1.78))]" : "w-full")}
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touch.current === null) return;
              const dx = e.changedTouches[0].clientX - touch.current;
              touch.current = null;
              if (Math.abs(dx) > 45) go(dx > 0 ? 1 : -1); // swipe right → next (RTL)
            }}
          >
            <PageCanvas key={page} doc={doc} n={page} />
          </div>
          <button onClick={() => go(-1)} disabled={page <= 1} className="absolute top-1/2 -translate-y-1/2 right-1 sm:-right-3 h-11 w-11 rounded-full bg-white/95 shadow-md border border-silver-200 text-navy grid place-items-center disabled:opacity-0 transition" aria-label="الصفحة السابقة">
            <ChevronRight size={22} />
          </button>
          <button onClick={() => go(1)} disabled={page >= total} className="absolute top-1/2 -translate-y-1/2 left-1 sm:-left-3 h-11 w-11 rounded-full bg-white/95 shadow-md border border-silver-200 text-navy grid place-items-center disabled:opacity-0 transition" aria-label="الصفحة التالية">
            <ChevronLeft size={22} />
          </button>
        </div>
      ) : (
        <div className={clsx("flex flex-col gap-3", big && "flex-1 min-h-0 overflow-y-auto")}>
          {Array.from({ length: total }, (_, i) => (
            <PageCanvas key={i} doc={doc} n={i + 1} lazy />
          ))}
        </div>
      )}
      {doc && mode === "slides" && total > 1 && (
        <div className="flex gap-1 justify-center flex-wrap">
          {Array.from({ length: Math.min(total, 40) }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={clsx("h-1.5 rounded-full transition-all", i + 1 === page ? "w-6 bg-ice" : "w-1.5 bg-silver-200 hover:bg-silver")} aria-label={`صفحة ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}
