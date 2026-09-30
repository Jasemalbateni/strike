/* Tactics board document model.
 * World units: 10 units = 1 metre (a full pitch is 1050 × 680 inside a 4 m margin).
 * Everything is plain JSON so a board can be stored in drills.board (jsonb). */

export type P = { x: number; y: number };

export type PitchKind = "full" | "half" | "box" | "small" | "plain";
export type PitchStyle = "grass" | "dark" | "navy" | "white" | "custom";

export type Pitch = {
  kind: PitchKind;
  /** rotated 90° (goals top/bottom on a full pitch) */
  vertical: boolean;
  style: PitchStyle;
  stripes: boolean;
  /** custom colours (style = "custom") */
  bg?: string;
  line?: string;
};

export type Dash = "solid" | "dashed" | "dotted";
export type Pattern = "plain" | "zigzag" | "wave";
export type Heads = "none" | "end" | "both";
export type ShapeKind = "rect" | "ellipse" | "tri";
export type Team = "a" | "b" | "gk" | "n";

type Base = { id: string; lock?: boolean; /** opacity 0–1 */ o?: number };

/** numbered player token */
export type TokenEl = Base & { t: "token"; x: number; y: number; s: number; team: Team; fill: string; stroke: string; text: string; tc?: string };
/** equipment / art (from the STRIKE Illustrator elements + built-ins) */
export type ArtEl = Base & { t: "art"; x: number; y: number; r: number; s: number; art: string; c1?: string; c2?: string };
/** straight / curved line; c = the point the curve passes through at its middle */
export type LineEl = Base & { t: "line"; a: P; b: P; c?: P; color: string; w: number; dash: Dash; pattern: Pattern; heads: Heads };
export type ShapeEl = Base & { t: "shape"; shape: ShapeKind; x: number; y: number; w: number; h: number; r: number; stroke: string; sw: number; dash: Dash; fill: string | null; fo: number };
export type TextEl = Base & { t: "text"; x: number; y: number; r: number; text: string; size: number; color: string; bg: string | null };
export type PenEl = Base & { t: "pen"; pts: P[]; color: string; w: number; dash: Dash; heads: Heads };

export type El = TokenEl | ArtEl | LineEl | ShapeEl | TextEl | PenEl;
export type ElType = El["t"];

export type Frame = { id: string; els: El[] };

export type Board = {
  v: 1;
  pitch: Pitch;
  /** base token diameter in world units (element size scale) */
  u: number;
  frames: Frame[];
};

export type LineStyle = Pick<LineEl, "color" | "w" | "dash" | "pattern" | "heads">;
export type ShapeStyle = Pick<ShapeEl, "stroke" | "sw" | "dash" | "fill" | "fo">;
