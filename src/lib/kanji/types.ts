export type StrokeKind = "stop" | "sweep" | "hook" | "dot";

export type GlyphData = {
  char: string;
  ok: true;
  strokes: string[];
  medians: number[][][];
};

export type MissingGlyph = {
  char: string;
  ok: false;
};

export type GlyphResult = GlyphData | MissingGlyph;

export type Vec = { x: number; y: number };

export type StrokeSample = {
  x: number;
  y: number;
  angle: number;
  t: number;
  pressure: number;
  kind: StrokeKind;
  /** Ferrule is parked — bristles catch up instead of tracking a path. */
  hold: boolean;
  /** Round the tuft and blot — 止め pool, not a flat cutoff. */
  blot: boolean;
  /** Extra tuft scale during 着筆. 1 = normal. */
  spread?: number;
};

export type BrushSettings = {
  size: number;
  bristles: number;
  stiffness: number;
  splay: number;
  wetness: number;
  softness: number;
};
