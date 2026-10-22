import { Fragment } from "react";
import { Lightbulb, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { splitBold, youtubeEmbed, type Block } from "@/lib/resources";

function Inline({ line }: { line: string }) {
  return (
    <>
      {splitBold(line).map((p, i) => (p.bold ? <strong key={i} className="font-extrabold text-navy">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

/** text block: paragraphs, "- " bullets and "1. " numbered lines */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*[-•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•]\s+/, ""));
      out.push(
        <ul key={i} className="list-disc ps-6 flex flex-col gap-1 marker:text-ice">
          {items.map((t, j) => (
            <li key={j}><Inline line={t} /></li>
          ))}
        </ul>,
      );
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(
        <ol key={i} className="list-decimal ps-6 flex flex-col gap-1 marker:text-ice-600 marker:font-bold">
          {items.map((t, j) => (
            <li key={j}><Inline line={t} /></li>
          ))}
        </ol>,
      );
    } else if (!l.trim()) {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*([-•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
      out.push(
        <p key={i}>
          {para.map((t, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Inline line={t} />
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="flex flex-col gap-3">{out}</div>;
}

export function BlockView({ block, urls }: { block: Block; urls: Record<string, string> }) {
  switch (block.type) {
    case "heading":
      return <h2 className="text-navy font-extrabold text-[21px] sm:text-[23px] leading-snug pt-2">{block.text}</h2>;
    case "text":
      return <div className="text-[16px] sm:text-[17px] leading-[1.95] text-ink"><RichText text={block.text} /></div>;
    case "image":
      return (
        <figure className="flex flex-col gap-2">
          {urls[block.path] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[block.path]} alt={block.caption || ""} loading="lazy" className="w-full rounded-2xl border border-silver-200 bg-silver-100" />
          ) : (
            <div className="aspect-video rounded-2xl bg-silver-100" />
          )}
          {block.caption && <figcaption className="text-center text-ink-2 text-[13.5px]">{block.caption}</figcaption>}
        </figure>
      );
    case "tip":
      return (
        <div className={clsx("rounded-2xl p-4 flex gap-3 text-[15.5px] leading-[1.85]", block.tone === "warning" ? "bg-error-100/70 text-navy" : "bg-ice-50 text-navy")}>
          {block.tone === "warning" ? <AlertTriangle size={20} className="text-error shrink-0 mt-1" /> : <Lightbulb size={20} className="text-ice-600 shrink-0 mt-1" />}
          <div className="flex-1 min-w-0"><RichText text={block.text} /></div>
        </div>
      );
    case "divider":
      return <hr className="border-silver-200 my-2" />;
    case "youtube": {
      const src = youtubeEmbed(block.url);
      return src ? (
        <div className="aspect-video rounded-2xl overflow-hidden bg-navy-900">
          <iframe src={src} className="w-full h-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="فيديو" />
        </div>
      ) : null;
    }
  }
}

export function BlocksView({ blocks, urls }: { blocks: Block[]; urls: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} urls={urls} />
      ))}
    </div>
  );
}
