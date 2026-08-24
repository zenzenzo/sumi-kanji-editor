import type { StrokeKind } from "@/lib/kanji/types";
import { classifyStroke, clamp, cornerIndices, isRightwardSweep, lerp, vertexPathT } from "./geometry";

export type PinKind = "pressure" | "stop" | "lift" | "ore" | "sweep";

export type PathPin = {
  id: string;
  t: number;
  kind: PinKind;
  /** 0–1, used by pressure pins. */
  pressure?: number;
};

export type StrokeEdit = {
  points: number[][];
  pins: PathPin[];
};

export type GlyphEdit = {
  char: string;
  strokes: StrokeEdit[];
};

export type EditBook = Record<string, GlyphEdit>;

export type PathTool = "move" | "delete" | PinKind;

export type SettleStyle = "auto" | "tome" | "harai" | "hane" | "taku";

const STORAGE_KEY = "sumi:edits:v1";

export const PIN_META: Record<PinKind, { label: string; ja: string; hint: string }> = {
  pressure: { label: "Pressure", ja: "圧", hint: "Click a pin to set how hard the brush presses" },
  horizontal: {
    label: "Horizontal",
    ja: "勒",
    hint: "勒 — even body at 75% for most of a horizontal stroke",
  },
  vertical: {
    label: "Vertical",
    ja: "努",
    hint: "努 — even body at 75% for most of a vertical stroke",
  },
  ore: { label: "Fold", ja: "折", hint: "折れ — press and fold a square corner" },
  sweep: { label: "Sweep", ja: "磔", hint: "磔 — thicken through 80%, then taper off" },
  stop: { label: "Stop", ja: "止", hint: "止め — halt, pool of ink" },
  lift: { label: "Lift", ja: "払", hint: "払い / はね — sweep or flick off" },
};

/** User-facing pressure (0–1) maps into this share of the real tuft. The rest is reserved for 折れ and 磔. */
export const BODY_PRESSURE = 0.75;

export const YONG_EIGHT: { ja: string; reading: string; name: string; note: string }[] = [
  { ja: "側", reading: "そく", name: "点", note: "Dot — press, then lift" },
  { ja: "勒", reading: "ろく", name: "横", note: "Horizontal — even, then 止め" },
  { ja: "努", reading: "ど", name: "縦", note: "Vertical — bone of the character" },
  { ja: "趯", reading: "てき", name: "はね", note: "Hook — 折れ then flick" },
  { ja: "策", reading: "さく", name: "右上", note: "Rising tick — light, lift" },
  { ja: "掠", reading: "りゃく", name: "左払い", note: "Long left sweep" },
  { ja: "啄", reading: "たく", name: "短左", note: "Short left flick" },
  { ja: "磔", reading: "たく", name: "右払い", note: "Long right sweep" },
];

export function newPinId(): string {
  return `p${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePin(raw: Partial<PathPin> & { kind?: string }): PathPin | null {
  let kind = raw.kind as string;
  let pressure = typeof raw.pressure === "number" ? clamp(raw.pressure, 0, 1) : undefined;
  if (kind === "heavy") {
    kind = "pressure";
    pressure = pressure ?? 1;
  } else if (kind === "light") {
    kind = "pressure";
    pressure = pressure ?? 0.22;
  }
  if (
    kind !== "pressure" &&
    kind !== "stop" &&
    kind !== "lift" &&
    kind !== "ore" &&
    kind !== "sweep" &&
    kind !== "horizontal" &&
    kind !== "vertical"
  )
    return null;
  if (typeof raw.t !== "number") return null;
  if (kind === "pressure" && pressure == null) pressure = 0.75;
  return {
    id: raw.id || newPinId(),
    t: clamp(raw.t, 0, 1),
    kind,
    pressure,
  };
}

export function editsFromMedians(char: string, medians: number[][][]): GlyphEdit {
  return {
    char,
    strokes: medians.map((median) => ({
      points: median.map((p) => [p[0], p[1]]),
      pins: [],
    })),
  };
}

export function mergeEdit(base: GlyphEdit, stored?: GlyphEdit | null): GlyphEdit {
  if (!stored || stored.char !== base.char) return base;
  return {
    char: base.char,
    strokes: base.strokes.map((stroke, i) => {
      const s = stored.strokes[i];
      if (!s) return stroke;
      const points = s.points?.length >= 2 ? s.points.map((p) => [p[0], p[1]]) : stroke.points;
      const pins = Array.isArray(s.pins)
        ? s.pins.map((p) => normalizePin(p)).filter((p): p is PathPin => p !== null)
        : [];
      return { points, pins };
    }),
  };
}

export function loadEditBook(): EditBook {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as EditBook;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGlyphEdit(edit: GlyphEdit) {
  if (typeof window === "undefined") return;
  const book = loadEditBook();
  book[edit.char] = edit;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function clearGlyphEdit(char: string) {
  if (typeof window === "undefined") return;
  const book = loadEditBook();
  delete book[char];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function pinPressure(pin: PathPin): number {
  switch (pin.kind) {
    case "pressure":
      return clamp(pin.pressure ?? 0.75, 0, 1);
    case "stop":
      return 0.95;
    case "lift":
      return 0.22;
    case "ore":
      return 1;
    case "sweep":
      return 1;
    case "horizontal":
    case "vertical":
      return BODY_PRESSURE;
  }
}

export function pressureFromPins(t: number, pins: PathPin[]): number | null {
  const body = pins.filter(
    (p) => p.kind !== "ore" && p.kind !== "sweep" && p.kind !== "horizontal" && p.kind !== "vertical",
  );
  if (!body.length) return null;
  const sorted = [...body].sort((a, b) => a.t - b.t);
  const keys = [
    {
      t: 0,
      p: sorted[0].t < 0.06 ? pinPressure(sorted[0]) : 0.52,
    },
    ...sorted.map((p) => ({ t: p.t, p: pinPressure(p) })),
  ];
  const last = sorted[sorted.length - 1];
  if (last.t < 0.97) {
    keys.push({
      t: 1,
      p: last.kind === "lift" ? 0.2 : last.kind === "stop" ? 0.92 : pinPressure(last),
    });
  }
  if (t <= keys[0].t) return keys[0].p;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const u = (t - a.t) / Math.max(1e-4, b.t - a.t);
      return lerp(a.p, b.p, u);
    }
  }
  return keys[keys.length - 1].p;
}

/** Sharp peak at each 折れ pin — fast attack, slightly slower release. */
export function oreStrength(t: number, oreTs: number[]): number {
  let best = 0;
  for (const ot of oreTs) {
    const d = t - ot;
    const w = d < 0 ? 0.04 : 0.065;
    const u = 1 - Math.abs(d) / w;
    if (u > 0) best = Math.max(best, u * u);
  }
  return best;
}

/** Last 磔 pin along the stroke, if any. */
export function sweepPinT(pins: PathPin[]): number | null {
  const sweeps = pins.filter((p) => p.kind === "sweep").sort((a, b) => a.t - b.t);
  return sweeps.length ? sweeps[sweeps.length - 1].t : null;
}

/** Slow build to full pressure over 80% of the stroke, then a sharp taper to 0. */
export function takuPressure(t: number): number {
  const u = clamp(t, 0, 1);
  if (u <= 0.8) {
    const s = u / 0.8;
    return lerp(0.1, 1, s * s * (3 - 2 * s));
  }
  const s = (u - 0.8) / 0.2;
  return Math.max(0, Math.pow(1 - s, 2.4));
}

/**
 * 勒 / 努 — even body at default power for the long shaft.
 * The last ~10% is left to 止め / 払い / はね settle so thickness stays uniform
 * until the ending.
 */
export function bonePressure(t: number): number {
  void t;
  return BODY_PRESSURE;
}

export function hasBonePin(pins: PathPin[]): boolean {
  return pins.some((p) => p.kind === "horizontal" || p.kind === "vertical");
}

function strokeAxis(points: number[][]): "horizontal" | "vertical" | "other" {
  if (points.length < 2) return "other";
  const a = points[0];
  const b = points[points.length - 1];
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  if (dx > dy * 2.2) return "horizontal";
  if (dy > dx * 2.2) return "vertical";
  return "other";
}

export function settleFromPins(pins: PathPin[], kind: StrokeKind): SettleStyle {
  if (!pins.length) return "auto";
  const last = [...pins].sort((a, b) => a.t - b.t)[pins.length - 1];
  if (last.kind === "sweep") return "taku";
  if (last.kind === "stop") return "tome";
  if (last.kind === "lift") return kind === "hook" ? "hane" : "harai";
  return "auto";
}

export function suggestPins(points: number[][]): PathPin[] {
  const kind = classifyStroke(points);
  const pin = (t: number, kind: PinKind, pressure?: number): PathPin => ({
    id: newPinId(),
    t,
    kind,
    pressure,
  });
  switch (kind) {
    case "dot":
      return [pin(0.28, "pressure", 0.92), pin(0.82, "lift")];
    case "sweep":
      return isRightwardSweep(points)
        ? [pin(0.92, "sweep")]
        : [pin(0.12, "pressure", 0.35), pin(0.8, "lift")];
    case "hook": {
      const pts = points.map(([x, y]) => ({ x, y }));
      const corners = cornerIndices(pts);
      const foldT = corners.length ? vertexPathT(pts, corners[0]) : 0.52;
      return [pin(0.12, "pressure", 0.85), pin(foldT, "ore"), pin(0.88, "lift")];
    }
    default: {
      const axis = strokeAxis(points);
      if (axis === "vertical") return [pin(0.08, "vertical"), pin(0.9, "stop")];
      if (axis === "horizontal") return [pin(0.08, "horizontal"), pin(0.9, "stop")];
      return [pin(0.12, "pressure", 0.85), pin(0.9, "stop")];
    }
  }
}

export function bookForGlyphs(chars: { char: string; medians: number[][][] }[]): EditBook {
  const stored = loadEditBook();
  const book: EditBook = {};
  for (const g of chars) {
    book[g.char] = mergeEdit(editsFromMedians(g.char, g.medians), stored[g.char]);
  }
  return book;
}
