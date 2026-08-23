import type { StrokeKind } from "@/lib/kanji/types";
import {
  classifyStroke,
  clamp,
  cornerIndices,
  endsLeftward,
  inferBone,
  isLeftwardSweep,
  isRightwardSweep,
  isRisingDiagonal,
  isShortLeftFlick,
  lerp,
  vertexPathT,
} from "./geometry";

export type PinKind =
  | "pressure"
  | "stop"
  | "lift"
  | "ore"
  | "sweep"
  | "ryaku"
  | "vertical"
  | "horizontal"
  | "soku"
  | "hane"
  | "saku"
  | "peck";

export type PathPin = {
  id: string;
  t: number;
  kind: PinKind;
  /** Pressure pins: multiplier (1 = default). */
  pressure?: number;
};

export type StrokeMode =
  | "auto"
  | "horizontal"
  | "vertical"
  | "ryaku"
  | "sweep"
  | "lift"
  | "stop"
  | "pressure"
  | "soku"
  | "hane"
  | "saku"
  | "peck";

export type StrokeEdit = {
  points: number[][];
  pins: PathPin[];
};

export type GlyphEdit = {
  char: string;
  strokes: StrokeEdit[];
  /** True after Clear — never fall back to hanzi-writer medians. */
  custom?: boolean;
};

export type EditBook = Record<string, GlyphEdit>;

export type PathTool = "move" | "delete" | "draw" | PinKind;

export type SettleStyle = "auto" | "tome" | "harai" | "hane" | "taku";

const STORAGE_KEY = "sumi:edits:v2";

export const PIN_META: Record<PinKind, { label: string; ja: string; hint: string }> = {
  pressure: { label: "Pressure", ja: "圧", hint: "Multiplier on the stroke type — blends between two pins" },
  soku: { label: "Dot", ja: "側", hint: "側 — 点, ~30% → 80%" },
  horizontal: { label: "Horizontal", ja: "勒", hint: "勒 — even horizontal body" },
  vertical: { label: "Vertical", ja: "努", hint: "努 — 50% → 45% → hold 45% → 50%; 着筆 at the start" },
  hane: { label: "Hook", ja: "趯", hint: "趯 — upward hook / はね" },
  saku: { label: "Rise", ja: "策", hint: "策 — rising diagonal 払い" },
  ryaku: { label: "Sweep left", ja: "掠", hint: "掠 — long left 払い, tapers the whole way" },
  peck: { label: "Short left", ja: "啄", hint: "啄 — max at the start, then a steep taper" },
  sweep: { label: "Splay right", ja: "磔", hint: "磔 — build to full over 75%, then taper on the path" },
  ore: { label: "Fold", ja: "折", hint: "折れ — press and fold a square corner" },
  stop: { label: "Stop", ja: "止", hint: "止め — halt, pool of ink" },
  lift: { label: "Lift", ja: "払", hint: "払い — sweep or lift off" },
};

/** Default body weight. Pressure pins multiply this. 2× reaches the reserved max. */
export const BODY_PRESSURE = 0.5;
/** 掠 starts ~33% heavier than the pressure it would otherwise inherit. */
const RYAKU_START_BOOST = 4 / 3;
export const DEFAULT_PRESSURE_MULT = 1;
export const PRESSURE_MULT_MIN = 0.2;
export const PRESSURE_MULT_MAX = 2;

/** Muted path colors — the stroke after a type pin uses that pin's color. */
export const MODE_COLOR: Record<StrokeMode, string> = {
  auto: "#6f6860",
  soku: "#8a6e6e",
  horizontal: "#6a7d8a",
  vertical: "#7a7d5e",
  hane: "#5a7d7a",
  saku: "#8a7e58",
  ryaku: "#8a6d58",
  peck: "#8a6250",
  sweep: "#7a6a84",
  lift: "#5f806c",
  stop: "#8a6a64",
  pressure: "#6f6860",
};

export const PIN_COLOR: Record<PinKind, string> = {
  pressure: "#8a7a58",
  soku: MODE_COLOR.soku,
  horizontal: MODE_COLOR.horizontal,
  vertical: MODE_COLOR.vertical,
  hane: MODE_COLOR.hane,
  saku: MODE_COLOR.saku,
  ryaku: MODE_COLOR.ryaku,
  peck: MODE_COLOR.peck,
  sweep: MODE_COLOR.sweep,
  lift: MODE_COLOR.lift,
  stop: MODE_COLOR.stop,
  ore: "#8a5e52",
};

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
  let pressure = typeof raw.pressure === "number" ? raw.pressure : undefined;
  if (kind === "heavy") {
    kind = "pressure";
    pressure = pressure ?? 1;
  } else if (kind === "light") {
    kind = "pressure";
    pressure = pressure ?? 0.65;
  }
  if (
    kind !== "pressure" &&
    kind !== "stop" &&
    kind !== "lift" &&
    kind !== "ore" &&
    kind !== "sweep" &&
    kind !== "ryaku" &&
    kind !== "vertical" &&
    kind !== "horizontal" &&
    kind !== "soku" &&
    kind !== "hane" &&
    kind !== "saku" &&
    kind !== "peck"
  )
    return null;
  if (typeof raw.t !== "number") return null;
  if (kind === "pressure") pressure = clamp(pressure ?? DEFAULT_PRESSURE_MULT, PRESSURE_MULT_MIN, PRESSURE_MULT_MAX);
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
    custom: false,
    strokes: medians.map((median, i) => ({
      points: median.map((p) => [p[0], p[1]]),
      pins: suggestPins(median, char, i),
    })),
  };
}

export function mergeEdit(base: GlyphEdit, stored?: GlyphEdit | null): GlyphEdit {
  if (!stored || stored.char !== base.char) return base;
  if (stored.custom) {
    return {
      char: base.char,
      custom: true,
      strokes: (stored.strokes ?? []).map((s) => ({
        points: (s.points ?? []).map((p) => [p[0], p[1]]),
        pins: Array.isArray(s.pins)
          ? s.pins.map((p) => normalizePin(p)).filter((p): p is PathPin => p !== null)
          : [],
      })),
    };
  }
  return {
    char: base.char,
    custom: false,
    strokes: base.strokes.map((stroke, i) => {
      const s = stored.strokes[i];
      if (!s) return stroke;
      const points = s.points?.length >= 2 ? s.points.map((p) => [p[0], p[1]]) : stroke.points;
      const pins = Array.isArray(s.pins)
        ? s.pins.map((p) => normalizePin(p)).filter((p): p is PathPin => p !== null)
        : [];
      const withType = pins.some((p) => isTypePin(p.kind)) ? pins : [...suggestPins(points, base.char, i), ...pins];
      const migrated = migrateLegacyPins(points, withType);
      return { points, pins: migrated };
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
      return clamp(pin.pressure ?? DEFAULT_PRESSURE_MULT, PRESSURE_MULT_MIN, PRESSURE_MULT_MAX);
    case "stop":
      return 0.95;
    case "lift":
      return 0.22;
    case "ore":
      return 1;
    case "sweep":
      return 1;
    case "ryaku":
      return 0.22;
    case "vertical":
    case "horizontal":
    case "soku":
    case "hane":
    case "saku":
      return BODY_PRESSURE;
    case "peck":
      return 1;
  }
}

export function pressureFromPins(t: number, pins: PathPin[]): number | null {
  const body = pins.filter(
    (p) =>
      p.kind !== "ore" &&
      p.kind !== "sweep" &&
      p.kind !== "ryaku" &&
      p.kind !== "vertical" &&
      p.kind !== "horizontal",
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

export type StartHint = {
  kind: StrokeKind;
  inferred: StrokeMode;
};

export function inferMode(_median: number[][], _kind: StrokeKind): StrokeMode {
  return "auto";
}

export function isTypePin(kind: PinKind): boolean {
  return (
    kind === "soku" ||
    kind === "horizontal" ||
    kind === "vertical" ||
    kind === "hane" ||
    kind === "saku" ||
    kind === "ryaku" ||
    kind === "peck" ||
    kind === "sweep"
  );
}

function isSwitchPin(kind: PinKind): boolean {
  return kind !== "ore" && kind !== "pressure";
}

function evalMode(
  mode: StrokeMode,
  local: number,
  startP: number,
  bodyLevel: number,
  _globalT: number,
  _kind: StrokeKind,
  complete = true,
): number {
  const u = clamp(local, 0, 1);
  switch (mode) {
    case "horizontal":
    case "pressure":
    case "auto":
      return bodyLevel;
    case "vertical": {
      const hi = bodyLevel;
      const lo = bodyLevel * 0.9;
      if (u < 1 / 3) return lerp(hi, lo, u / (1 / 3));
      if (u < 2 / 3) return lo;
      return lerp(lo, hi, (u - 2 / 3) / (1 / 3));
    }
    case "soku":
      return lerp(0.3, 0.8, u);
    case "ryaku":
      return Math.max(0, startP * Math.pow(1 - u, 0.88));
    case "peck":
      return Math.max(0, startP * Math.pow(1 - u, 1.35));
    case "saku": {
      if (!complete) return Math.max(0, startP * lerp(0.22, 1, u));
      const peak = u < 0.45 ? lerp(0.22, 1, u / 0.45) : Math.pow(1 - (u - 0.45) / 0.55, 1.4);
      return Math.max(0, startP * peak);
    }
    case "sweep": {
      const a = Math.min(Math.max(startP, 0.08), 0.14);
      if (!complete) {
        const s = u;
        return lerp(a, 1, s * s);
      }
      if (u <= 0.75) {
        const s = u / 0.75;
        return lerp(a, 1, s * s);
      }
      const s = (u - 0.75) / 0.25;
      return Math.max(0, Math.pow(1 - s, 1.65));
    }
    case "hane":
      return u < 0.4 ? startP : Math.max(0, startP * Math.pow(1 - (u - 0.4) / 0.6, 1.25));
    case "lift": {
      const floor = 0.1;
      if (u < 0.93) return startP * lerp(1, floor, u / 0.93);
      return Math.max(0, startP * floor * Math.pow(1 - (u - 0.93) / 0.07, 1.6));
    }
    case "stop":
      return Math.max(startP, 0.92);
    default:
      return bodyLevel;
  }
}

function startPressure(mode: StrokeMode): number {
  if (mode === "sweep") return 0.1;
  if (mode === "peck") return 1;
  if (mode === "ryaku") return clamp(BODY_PRESSURE * RYAKU_START_BOOST, 0, 1);
  if (mode === "saku") return BODY_PRESSURE;
  return BODY_PRESSURE;
}

/**
 * First type pin names the whole stroke from t=0.
 * Later type / finish pins switch at their t.
 * Pressure pins never split the envelope — they only multiply afterwards.
 */
export function pressureAlongStroke(t: number, pins: PathPin[], _hint: StartHint): number {
  const types = [...pins].filter((p) => isSwitchPin(p.kind)).sort((a, b) => a.t - b.t);
  let mode: StrokeMode = "auto";
  let bodyLevel = BODY_PRESSURE;
  let startP = BODY_PRESSURE;
  let t0 = 0;
  let named = false;

  for (const pin of types) {
    if (!named && isTypePin(pin.kind)) {
      mode = pin.kind as StrokeMode;
      startP = startPressure(mode);
      named = true;
      continue;
    }
    if (t < pin.t) {
      const local = (t - t0) / Math.max(1e-4, pin.t - t0);
      return evalMode(mode, local, startP, bodyLevel, t, _hint.kind, false);
    }
    startP = evalMode(mode, 1, startP, bodyLevel, pin.t, _hint.kind, false);
    t0 = pin.t;
    mode = pin.kind as StrokeMode;
    if (pin.kind === "horizontal" || pin.kind === "vertical" || pin.kind === "soku") {
      startP = BODY_PRESSURE;
    } else if (pin.kind === "peck") {
      startP = 1;
    } else if (pin.kind === "ryaku") {
      startP = clamp(Math.max(startP, BODY_PRESSURE) * RYAKU_START_BOOST, 0, 1);
    } else if (pin.kind === "saku") {
      startP = Math.max(startP, BODY_PRESSURE);
    } else if (pin.kind === "stop") {
      startP = Math.max(startP, 0.92);
    }
  }
  const local = (t - t0) / Math.max(1e-4, 1 - t0);
  return evalMode(mode, local, startP, bodyLevel, t, _hint.kind, true);
}

/** 1 = default body. First pin applies from the start; two pins blend between them. */
export function pressureMultiplier(t: number, pins: PathPin[]): number {
  const ps = pins
    .filter((p) => p.kind === "pressure")
    .sort((a, b) => a.t - b.t);
  if (!ps.length) return DEFAULT_PRESSURE_MULT;
  const val = (p: PathPin) =>
    clamp(p.pressure ?? DEFAULT_PRESSURE_MULT, PRESSURE_MULT_MIN, PRESSURE_MULT_MAX);
  if (t <= ps[0].t) return val(ps[0]);
  for (let i = 1; i < ps.length; i++) {
    if (t <= ps[i].t) {
      const a = ps[i - 1];
      const b = ps[i];
      const u = (t - a.t) / Math.max(1e-4, b.t - a.t);
      return lerp(val(a), val(b), u);
    }
  }
  return val(ps[ps.length - 1]);
}

export function modeAlongStroke(t: number, pins: PathPin[], _inferred: StrokeMode): StrokeMode {
  const types = [...pins].filter((p) => isSwitchPin(p.kind)).sort((a, b) => a.t - b.t);
  let mode: StrokeMode = "auto";
  let named = false;
  for (const pin of types) {
    if (!named && isTypePin(pin.kind)) {
      mode = pin.kind as StrokeMode;
      named = true;
      continue;
    }
    if (t < pin.t) return mode;
    mode = pin.kind as StrokeMode;
  }
  return mode;
}

/** Even body for 90% of the stroke; tail follows 止め / 払い / はね. */
export function bonePressure(t: number, ending: SettleStyle, bodyLevel = BODY_PRESSURE): number {
  const body = clamp(bodyLevel, 0, 1);
  const u = clamp(t, 0, 1);
  if (u <= 0.9) return body;
  const s = (u - 0.9) / 0.1;
  if (ending === "harai" || ending === "hane") {
    return Math.max(0, body * Math.pow(1 - s, 1.6));
  }
  return body;
}

export function ryakuPinT(pins: PathPin[]): number | null {
  const hits = pins.filter((p) => p.kind === "ryaku").sort((a, b) => a.t - b.t);
  return hits.length ? hits[hits.length - 1].t : null;
}

/** 掠: taper for the whole stroke, not only the tip. */
export function ryakuPressure(t: number, start = BODY_PRESSURE * RYAKU_START_BOOST): number {
  const u = clamp(t, 0, 1);
  return Math.max(0, start * Math.pow(1 - u, 0.88));
}

export function sweepPinT(pins: PathPin[]): number | null {
  const sweeps = pins.filter((p) => p.kind === "sweep").sort((a, b) => a.t - b.t);
  return sweeps.length ? sweeps[sweeps.length - 1].t : null;
}

/** Slow build to full pressure over 75% of the stroke, then taper to 0 on the path. */
export function takuPressure(t: number): number {
  const u = clamp(t, 0, 1);
  if (u <= 0.75) {
    const s = u / 0.75;
    return lerp(0.1, 1, s * s);
  }
  const s = (u - 0.75) / 0.25;
  return Math.max(0, Math.pow(1 - s, 1.65));
}

export function settleFromPins(pins: PathPin[], kind: StrokeKind): SettleStyle {
  const ending = [...pins]
    .filter((p) => p.kind !== "ore" && p.kind !== "pressure")
    .sort((a, b) => a.t - b.t);
  if (!ending.length) return "auto";
  const last = ending[ending.length - 1];
  if (last.kind === "sweep") return "harai";
  if (last.kind === "ryaku" || last.kind === "peck" || last.kind === "saku" || last.kind === "soku")
    return "harai";
  if (last.kind === "hane") return "hane";
  if (last.kind === "lift") return kind === "hook" ? "hane" : "harai";
  if (last.kind === "stop") return "tome";
  if (last.kind === "vertical" || last.kind === "horizontal") return "tome";
  return "auto";
}

export function suggestPins(points: number[][], char?: string, index?: number): PathPin[] {
  if (char === "永" && index != null) return suggestYongPins(points, index);
  const kind = classifyStroke(points);
  const pin = (t: number, kind: PinKind, pressure?: number): PathPin => ({
    id: newPinId(),
    t,
    kind,
    pressure,
  });
  if (kind === "dot") return [pin(0.25, "soku")];
  if (isRisingDiagonal(points)) return [pin(0.3, "saku")];
  if (isShortLeftFlick(points)) return [pin(0.3, "peck")];
  if (isLeftwardSweep(points)) return [pin(0.3, "ryaku")];
  if (isRightwardSweep(points)) return [pin(0.35, "sweep")];
  if (kind === "hook") {
    const bone = inferBone(points);
    const pts = points.map(([x, y]) => ({ x, y }));
    const corners = cornerIndices(pts);
    const foldT = corners.length ? vertexPathT(pts, corners[0]) : 0.55;
    if (bone === "vertical") {
      return endsLeftward(points)
        ? [pin(0.28, "vertical"), pin(0.72, "ryaku")]
        : [pin(0.28, "vertical"), pin(0.86, "hane")];
    }
    if (bone === "horizontal") return [pin(0.28, "horizontal"), pin(foldT, "ore"), pin(0.88, "hane")];
    return [pin(foldT, "ore"), pin(0.88, "hane")];
  }
  const bone = inferBone(points);
  if (bone === "vertical") {
    return endsLeftward(points)
      ? [pin(0.3, "vertical"), pin(0.72, "ryaku")]
      : [pin(0.3, "vertical"), pin(0.9, "stop")];
  }
  if (bone === "horizontal") return [pin(0.3, "horizontal"), pin(0.9, "stop")];
  return [pin(0.9, "stop")];
}

function tAfterNode(points: number[][], index: number): number {
  const pts = points.map(([x, y]) => ({ x, y }));
  if (pts.length < 2) return 0.5;
  const i = Math.min(Math.max(index, 0), pts.length - 1);
  const t = vertexPathT(pts, i);
  if (i >= pts.length - 1) return Math.min(0.9, Math.max(0.82, t - 0.08));
  return clamp(t + 0.012, 0, 0.98);
}

/** 永 is the template character — pins match 永字八法 on the real medians. */
function suggestYongPins(points: number[][], si: number): PathPin[] {
  const pin = (t: number, kind: PinKind): PathPin => ({ id: newPinId(), t: clamp(t, 0, 1), kind });
  switch (si) {
    case 0:
      return [pin(0.25, "soku")];
    case 1:
      return [pin(0.07, "horizontal"), pin(tAfterNode(points, 4), "vertical"), pin(tAfterNode(points, 8), "hane")];
    case 2:
      return [pin(0.08, "saku"), pin(tAfterNode(points, 6), "ryaku")];
    case 3:
      return [pin(0.28, "peck")];
    case 4:
      return [pin(0.32, "sweep")];
    default:
      return [];
  }
}

/** Old 努+止 on a left-ending 縦 → 努+掠 (永's third stroke). */
export function migrateLegacyPins(points: number[][], pins: PathPin[]): PathPin[] {
  if (!endsLeftward(points)) return pins;
  const types = pins.filter((p) => p.kind !== "pressure");
  const last = [...types].sort((a, b) => a.t - b.t).at(-1);
  const hasVert = pins.some((p) => p.kind === "vertical");
  if (hasVert && last?.kind === "stop") {
    return pins.map((p) => (p.id === last.id ? { ...p, kind: "ryaku" as const } : p));
  }
  return pins;
}

export function bookForGlyphs(chars: { char: string; medians: number[][][] }[]): EditBook {
  const stored = loadEditBook();
  const book: EditBook = {};
  for (const g of chars) {
    book[g.char] = mergeEdit(editsFromMedians(g.char, g.medians), stored[g.char]);
  }
  return book;
}
