/* SVG rendering for the tactics board — shared by the editor, thumbnails and the viewer. */
import { memo } from "react";
import { ASSETS, artDims, boardDims, slotColor, textDims, tokenRadius, tokenTextColor } from "@/lib/drills/board";
import { dashArray, lineGeometry, penGeometry } from "@/lib/drills/geometry";
import { canon, markings, pitchColors, stripes } from "@/lib/drills/pitch";
import type { ArtEl, Board, El, LineEl, PenEl, Pitch, ShapeEl, TextEl, TokenEl } from "@/lib/drills/types";
import { bidiSafe } from "@/lib/drills/text";

/* ---------- pitch ---------- */

export const PitchLayer = memo(function PitchLayer({ pitch }: { pitch: Pitch }) {
  const { W, H } = boardDims({ pitch } as Board);
  const c = canon(pitch.kind);
  const col = pitchColors(pitch);
  const marks = markings(pitch.kind);
  const rot = pitch.vertical ? `translate(${c.ch} 0) rotate(90)` : undefined;
  return (
    <g data-pitch="">
      <rect x={0} y={0} width={W} height={H} fill={col.bg} />
      {pitch.stripes && (
        <g transform={rot}>
          <path d={stripes(pitch.kind)} fill={col.stripe} />
        </g>
      )}
      {marks && (
        <g transform={rot} fill="none" stroke={col.line} strokeWidth={2.3} strokeOpacity={0.92} strokeLinejoin="round" strokeLinecap="round">
          <path d={marks.goals} strokeWidth={1.8} fill={col.line} fillOpacity={0.14} />
          <path d={marks.lines} />
          <path d={marks.spots} fill={col.line} stroke="none" />
        </g>
      )}
    </g>
  );
});

/* ---------- art ---------- */

export function ArtGlyph({ el }: { el: Pick<ArtEl, "art" | "c1" | "c2"> }) {
  const a = ASSETS[el.art];
  if (!a) return null;
  return (
    <>
      {a.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={slotColor(p.fill, el)}
          stroke={p.stroke ? slotColor(p.stroke, el) : undefined}
          strokeWidth={p.stroke ? p.sw : undefined}
          strokeLinejoin={p.round ? "round" : undefined}
          strokeLinecap={p.round ? "round" : undefined}
        />
      ))}
    </>
  );
}

/* ---------- elements ---------- */

type ViewProps = {
  el: El;
  u: number;
  /** editor only: invisible hit-area size in world units */
  hit?: number;
  /** element is being dragged off the board */
  danger?: boolean;
};

export const ElementView = memo(function ElementView({ el, u, hit, danger }: ViewProps) {
  const opacity = (el.o ?? 1) * (danger ? 0.4 : 1);
  const common = { "data-id": el.id, opacity: opacity < 1 ? opacity : undefined, style: danger ? { filter: "drop-shadow(0 0 6px #d64545)" } : undefined };
  switch (el.t) {
    case "token":
      return <Token el={el} u={u} hit={hit} common={common} />;
    case "art":
      return <Art el={el} u={u} hit={hit} common={common} />;
    case "line":
      return <Line el={el} hit={hit} common={common} />;
    case "pen":
      return <Pen el={el} hit={hit} common={common} />;
    case "shape":
      return <Shape el={el} hit={hit} common={common} />;
    case "text":
      return <Text el={el} common={common} />;
  }
});

type Common = { "data-id": string; opacity?: number; style?: React.CSSProperties };

function Token({ el, u, hit, common }: { el: TokenEl; u: number; hit?: number; common: Common }) {
  const R = tokenRadius(el, u);
  const txt = el.text.trim();
  const numeric = /^[0-9A-Za-z]+$/.test(txt);
  const fs = R * (txt.length <= 1 ? 1.22 : txt.length === 2 ? 1.05 : txt.length === 3 ? 0.8 : 0.62);
  return (
    <g {...common} transform={`translate(${r2(el.x)} ${r2(el.y)})`}>
      {hit ? <circle r={Math.max(R, hit)} fill="#000" fillOpacity={0} data-hit="" /> : null}
      <circle cx={R * 0.06} cy={R * 0.12} r={R} fill="#000" fillOpacity={0.2} />
      <circle r={R} fill={el.fill} stroke={el.stroke} strokeWidth={Math.max(0.8, R * 0.085)} />
      {txt && (
        <text
          className={numeric ? "t-num" : "t-ar"}
          textAnchor="middle"
          direction={numeric ? "ltr" : "rtl"}
          y={fs * 0.36}
          fontSize={fs}
          fontWeight={700}
          fill={tokenTextColor(el)}
          style={{ pointerEvents: "none" }}
        >
          {txt}
        </text>
      )}
    </g>
  );
}

function Art({ el, u, hit, common }: { el: ArtEl; u: number; hit?: number; common: Common }) {
  const { w, h, k } = artDims(el, u);
  return (
    <g {...common} transform={`translate(${r2(el.x)} ${r2(el.y)})${el.r ? ` rotate(${el.r})` : ""}`}>
      {hit ? <rect x={-Math.max(w / 2, hit)} y={-Math.max(h / 2, hit)} width={Math.max(w, hit * 2)} height={Math.max(h, hit * 2)} fill="#000" fillOpacity={0} data-hit="" /> : null}
      <g transform={`translate(${r2(-w / 2)} ${r2(-h / 2)}) scale(${k})`}>
        <ArtGlyph el={el} />
      </g>
    </g>
  );
}

function Line({ el, hit, common }: { el: LineEl; hit?: number; common: Common }) {
  const g = lineGeometry(el);
  return <Stroke d={g.d} heads={g.heads} hitD={g.hit} color={el.color} w={el.w} dash={dashArray(el.dash, el.w)} hit={hit} common={common} />;
}

function Pen({ el, hit, common }: { el: PenEl; hit?: number; common: Common }) {
  if (el.pts.length < 2) return null;
  const g = penGeometry(el);
  return <Stroke d={g.d} heads={g.heads} hitD={g.hit} color={el.color} w={el.w} dash={dashArray(el.dash, el.w)} hit={hit} common={common} />;
}

function Stroke({ d, heads, hitD, color, w, dash, hit, common }: { d: string; heads: string[]; hitD: string; color: string; w: number; dash?: string; hit?: number; common: Common }) {
  const shadow = 0.5 + w * 0.12;
  return (
    <g {...common}>
      {hit ? <path d={hitD} fill="none" stroke="#000" strokeOpacity={0} strokeWidth={Math.max(hit * 1.6, w + 8)} strokeLinecap="round" data-hit="" /> : null}
      <g transform={`translate(${shadow * 0.5} ${shadow})`} opacity={0.22}>
        <path d={d} fill="none" stroke="#000" strokeWidth={w + 0.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
        {heads.map((h, i) => (
          <path key={i} d={h} fill="#000" />
        ))}
      </g>
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      {heads.map((h, i) => (
        <path key={i} d={h} fill={color} stroke={color} strokeWidth={w * 0.35} strokeLinejoin="round" />
      ))}
    </g>
  );
}

export function shapePath(el: Pick<ShapeEl, "shape" | "w" | "h">) {
  const w = el.w / 2, h = el.h / 2;
  if (el.shape === "tri") return `M0 ${r2(-h)}L${r2(w)} ${r2(h)}L${r2(-w)} ${r2(h)}Z`;
  if (el.shape === "ellipse") return `M${r2(-w)} 0A${r2(w)} ${r2(h)} 0 1 0 ${r2(w)} 0A${r2(w)} ${r2(h)} 0 1 0 ${r2(-w)} 0Z`;
  const rr = Math.min(6, el.w / 8, el.h / 8);
  return `M${r2(-w + rr)} ${r2(-h)}H${r2(w - rr)}Q${r2(w)} ${r2(-h)} ${r2(w)} ${r2(-h + rr)}V${r2(h - rr)}Q${r2(w)} ${r2(h)} ${r2(w - rr)} ${r2(h)}H${r2(-w + rr)}Q${r2(-w)} ${r2(h)} ${r2(-w)} ${r2(h - rr)}V${r2(-h + rr)}Q${r2(-w)} ${r2(-h)} ${r2(-w + rr)} ${r2(-h)}Z`;
}

function Shape({ el, hit, common }: { el: ShapeEl; hit?: number; common: Common }) {
  const d = shapePath(el);
  return (
    <g {...common} transform={`translate(${r2(el.x)} ${r2(el.y)})${el.r ? ` rotate(${el.r})` : ""}`}>
      <path
        d={d}
        fill={el.fill ?? "none"}
        fillOpacity={el.fill ? el.fo : undefined}
        stroke={el.sw > 0 ? el.stroke : "none"}
        strokeWidth={el.sw}
        strokeDasharray={dashArray(el.dash, el.sw)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {hit ? <path d={d} fill="none" stroke="#000" strokeOpacity={0} strokeWidth={Math.max(hit * 1.4, el.sw + 8)} data-hit="" /> : null}
    </g>
  );
}

function Text({ el, common }: { el: TextEl; common: Common }) {
  const lines = el.text.split("\n");
  const { w, h } = textDims(el);
  const lh = el.size * 1.25;
  const padX = el.size * 0.35;
  return (
    <g {...common} transform={`translate(${r2(el.x)} ${r2(el.y)})${el.r ? ` rotate(${el.r})` : ""}`}>
      <rect x={-w / 2 - padX} y={-h / 2 - el.size * 0.08} width={w + padX * 2} height={h + el.size * 0.16} rx={el.size * 0.32} fill={el.bg ?? "#000"} fillOpacity={el.bg ? 1 : 0} />
      <text className="t-ar" textAnchor="middle" direction="rtl" fontSize={el.size} fontWeight={700} fill={el.color}>
        {lines.map((l, i) => (
          <tspan key={i} x={0} y={(i - (lines.length - 1) / 2) * lh + el.size * 0.36}>
            {bidiSafe(l) || " "}
          </tspan>
        ))}
      </text>
    </g>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;



/* ---------- static board (thumbnails / viewer) ---------- */

export function BoardStatic({ board, frame = 0, className, els, title }: { board: Board; frame?: number; className?: string; els?: El[]; title?: string }) {
  const { W, H } = boardDims(board);
  const list = els ?? board.frames[frame]?.els ?? board.frames[0]?.els ?? [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={title ?? "مخطط التمرين"} preserveAspectRatio="xMidYMid meet">
      <PitchLayer pitch={board.pitch} />
      {list.map((el) => (
        <ElementView key={el.id} el={el} u={board.u} />
      ))}
    </svg>
  );
}

/** small preview of a palette item */
export function ArtPreview({ art, c1, c2, size = 36 }: { art: string; c1?: string; c2?: string; size?: number }) {
  const a = ASSETS[art];
  if (!a) return null;
  return (
    <svg width={size} height={size} viewBox={`${(a.w - 100) / 2 - 6} -6 112 112`} aria-hidden>
      <g transform={`translate(0 ${(100 - a.h) / 2})`}>
        <ArtGlyph el={{ art, c1, c2 }} />
      </g>
    </svg>
  );
}

export function TokenPreview({ fill, stroke, text, size = 36 }: { fill: string; stroke: string; text: string; size?: number }) {
  const el: TokenEl = { id: "p", t: "token", x: 0, y: 0, s: 1, team: "a", fill, stroke, text };
  return (
    <svg width={size} height={size} viewBox="-18 -18 36 36" aria-hidden>
      <Token el={el} u={30} common={{ "data-id": "preview" }} />
    </svg>
  );
}
