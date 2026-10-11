import { YONG_TEMPLATE } from "./yong-template";
import type { StrokeKind } from "@/lib/kanji/types";
import {
  classifyStroke,
  clamp,
  cornerIndices,
  endsLeftward,
  inferBone,
  horizontalHookIndex,
  isLeftwardSweep,
  isRightwardSweep,
  isRisingDiagonal,
  isShortLeftFlick,
  lerp,
  simplifyStraightStroke,
  trimShortLeftEntry,
  vertexPathT,
  verticalHookIndex,
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
  /** One quadratic control point per segment; null means straight. */
  curves?: (number[] | null)[];
  /** Brush orientation at the start, in page-relative degrees. */
  entryAngle?: number;
  /** Starting pressure relative to the body, fading over the first 20%. */
  entryPressure?: number;
  pins: PathPin[];
};

export type GlyphEdit = {
  char: string;
  /** v3 preserves intentional removal of all type pins. */
  version?: 3;
  /** Distinguishes explicit stroke ordering from the older accidentally reordered 永. */
  strokeOrderVersion?: 1;
  strokes: StrokeEdit[];
  /** True after Clear — never fall back to hanzi-writer medians. */
  custom?: boolean;
};

export type EditBook = Record<string, GlyphEdit>;

export type PathTool = "move" | "delete" | "draw" | PinKind;

export type SettleStyle = "auto" | "tome" | "harai" | "hane" | "taku";

const STORAGE_KEY = "sumi:edits:v2";
export const DEFAULT_ENTRY_ANGLE = 160;
export const DEFAULT_ENTRY_PRESSURE = 1.9;
export const ENTRY_PRESSURE_MIN = 0.25;
export const ENTRY_PRESSURE_MAX = 3;
export function normalizeEntryPressure(value?: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(ENTRY_PRESSURE_MIN, Math.min(ENTRY_PRESSURE_MAX, value))
    : DEFAULT_ENTRY_PRESSURE;
}
export function normalizeEntryAngle(value?: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? ((value % 360) + 360) % 360
    : DEFAULT_ENTRY_ANGLE;
}

export const PIN_META: Record<PinKind, { label: string; ja: string; hint: string }> = {
  pressure: { label: "Pressure", ja: "圧", hint: "Multiplier on the stroke type — blends between two pins" },
  soku: { label: "Dot", ja: "側", hint: "側 — 0.75× → 1.35× at 75% → 1× rounded finish" },
  horizontal: { label: "Horizontal", ja: "勒", hint: "勒 — even horizontal body" },
  vertical: { label: "Vertical", ja: "努", hint: "努 — 50% → 45% → hold 45% → 50%; 着筆 at the start" },
  hane: { label: "Hook", ja: "趯", hint: "趯 — upward hook / はね" },
  saku: { label: "Rise", ja: "策", hint: "策 — horizontal start, taper to 0.25×; next type starts at its own pressure" },
  ryaku: { label: "Sweep left", ja: "掠", hint: "掠 — long left 払い, tapers the whole way" },
  peck: { label: "Short left", ja: "啄", hint: "啄 — max at the start, then a steep taper" },
  sweep: { label: "Splay right", ja: "磔", hint: "磔 — build to full over 75%, then taper on the path" },
  ore: { label: "Fold", ja: "折", hint: "折れ — press and fold a square corner" },
  stop: { label: "Stop", ja: "止", hint: "止め — angled horizontal finish or rounded vertical cap" },
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
  if (char === "永") return structuredClone(YONG_TEMPLATE);
  return {
    char,
    version: 3,
    custom: false,
    strokes: medians.map((median, i) => {
      // Clean only imported defaults; mergeEdit preserves saved user paths.
      const straight = verticalHookIndex(median) != null ? null : simplifyStraightStroke(median);
      let points = straight?.points ?? median.map((p) => [p[0], p[1]]);
      const pins = suggestPins(points, char, i);
      // Only a whole-stroke Short left qualifies, not a horizontal/hook with
      // a Short left transition later in the stroke.
      if (pins.length === 1 && pins[0].kind === "peck") points = trimShortLeftEntry(points);
      return { points, pins };
    }),
  };
}

export function mergeEdit(base: GlyphEdit, stored?: GlyphEdit | null): GlyphEdit {
  if (!stored || stored.char !== base.char) return base;
  if (stored.custom) {
    const strokes = [...(stored.strokes ?? [])];
    // Repair only the known captured 永's accidental last-two-stroke swap.
    // New explicit ordering carries a marker so it is never reversed on load.
    if (base.char === "永" && !stored.strokeOrderVersion && strokes.length === 5
        && strokes[3].pins?.some(p => p.id === "poiq4zjf")
        && strokes[4].pins?.some(p => p.id === "p006r6yk")) {
      [strokes[3], strokes[4]] = [strokes[4], strokes[3]];
    }
    return {
      char: base.char,
      version: 3,
      custom: true,
      strokeOrderVersion: 1,
      strokes: strokes.map((s) => ({
        points: (s.points ?? []).map((p) => [p[0], p[1]]),
        curves: s.curves?.map((c) => c ? [c[0], c[1]] : null),
        entryAngle: s.entryAngle == null ? undefined : normalizeEntryAngle(s.entryAngle),
        entryPressure: s.entryPressure == null ? undefined : normalizeEntryPressure(s.entryPressure),
        pins: Array.isArray(s.pins)
          ? s.pins.map((p) => normalizePin(p)).filter((p): p is PathPin => p !== null)
          : [],
      })),
    };
  }
  return {
    char: base.char,
    version: 3,
    custom: false,
    strokeOrderVersion: 1,
    strokes: Array.from({ length: Math.max(base.strokes.length, stored.strokes.length) }, (_, i) => {
      const stroke = base.strokes[i];
      const s = stored.strokes[i];
      if (!s) return stroke;
      let points = s.points?.length >= 2 ? s.points.map((p) => [p[0], p[1]]) : (stroke?.points ?? []);
      // Recover a saved two-node import only when both nodes exactly match the
      // original roof body and its hook is missing. Preserve hand-edited paths.
      const roofHook = stroke ? horizontalHookIndex(stroke.points) : null;
      const originalNodes = points.map(p => stroke?.points.findIndex(q => q[0] === p[0] && q[1] === p[1]) ?? -1);
      const restoreRoof = roofHook != null && points.length === 2 && !s.curves?.some(Boolean)
        && originalNodes[0] >= 0 && originalNodes[1] > originalNodes[0] && originalNodes[1] <= roofHook;
      if (restoreRoof && stroke) points = stroke.points.map(p => [...p]);
      const pins = Array.isArray(s.pins)
        ? s.pins.map((p) => normalizePin(p)).filter((p): p is PathPin => p !== null)
        : [];
      if (restoreRoof && stroke && roofHook != null) {
        const pts = stroke.points.map(([x, y]) => ({ x, y }));
        const start = vertexPathT(pts, originalNodes[0]);
        const end = vertexPathT(pts, originalNodes[1]);
        for (const pin of pins) pin.t = start + (end - start) * pin.t;
        if (!pins.some(p => p.kind === "hane")) pins.push({ id: newPinId(), t: vertexPathT(pts, roofHook), kind: "hane" });
      }
      const withType = stored.version === 3 || pins.some((p) => isTypePin(p.kind)) ? pins : [...suggestPins(points, base.char, i), ...pins];
      const migrated = stored.version === 3 ? withType : migrateLegacyPins(points, withType);
      return { points, curves: s.curves?.map((c) => c ? [c[0], c[1]] : null),
        entryAngle: s.entryAngle == null ? undefined : normalizeEntryAngle(s.entryAngle),
        entryPressure: s.entryPressure == null ? undefined : normalizeEntryPressure(s.entryPressure), pins: migrated };
    }),
  };
}

/** Move the entire stroke, including its geometry and modifiers, as one unit. */
export function reorderStroke(edit: GlyphEdit, from: number, to: number): GlyphEdit {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
      from >= edit.strokes.length || to >= edit.strokes.length || from === to) return edit;
  const strokes = [...edit.strokes];
  const [stroke] = strokes.splice(from, 1);
  strokes.splice(to, 0, stroke);
  return { ...edit, version: 3, strokeOrderVersion: 1, custom: true, strokes };
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
  book[edit.char] = { ...edit, version: 3, strokeOrderVersion: 1 };
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
      return BODY_PRESSURE;
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
      p: last.kind === "lift" ? 0.2 : last.kind === "stop" ? BODY_PRESSURE : pinPressure(last),
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
  _bodyLevel: number,
  _globalT: number,
  _kind: StrokeKind,
  complete = true,
): number {
  const u = clamp(local, 0, 1);
  const p0 = clamp(startP, 0, 2);
  switch (mode) {
    case "horizontal":
    case "pressure":
    case "auto":
      return p0;
    case "vertical": {
      const hi = p0;
      const lo = p0 * 0.9;
      if (u < 1 / 3) return lerp(hi, lo, u / (1 / 3));
      if (u < 2 / 3) return lo;
      return lerp(lo, hi, (u - 2 / 3) / (1 / 3));
    }
    case "soku": {
      const peak = _bodyLevel * 1.35;
      return u <= 0.75
        ? lerp(p0, peak, u / 0.75)
        : lerp(peak, _bodyLevel, (u - 0.75) / 0.25);
    }
    case "ryaku":
      return Math.max(0, p0 * Math.pow(1 - u, 0.88));
    case "peck":
      return Math.max(0, p0 * Math.pow(1 - u, 1.35));
    case "saku": {
      // Preserve the horizontal-like entry before tapering the remaining span.
      const taper = clamp((u - 0.2) / 0.8, 0, 1);
      return lerp(p0, p0 * 0.25, taper);
    }
    case "sweep": {
      if (!complete) return lerp(p0, 1, u * u);
      if (u <= 0.75) {
        const s = u / 0.75;
        return lerp(p0, 1, s * s);
      }
      const s = (u - 0.75) / 0.25;
      return Math.max(0, Math.pow(1 - s, 1.65));
    }
    case "hane":
      return u < 0.4 ? p0 : Math.max(0, p0 * Math.pow(1 - (u - 0.4) / 0.6, 1.25));
    case "lift": {
      const floor = 0.1;
      if (u < 0.93) return p0 * lerp(1, floor, u / 0.93);
      return Math.max(0, p0 * floor * Math.pow(1 - (u - 0.93) / 0.07, 1.6));
    }
    case "stop":
      return p0;
    default:
      return p0;
  }
}

function startPressure(mode: StrokeMode): number {
  if (mode === "sweep") return 0.1;
  if (mode === "peck") return 1;
  if (mode === "soku") return BODY_PRESSURE * 0.75;
  if (mode === "saku") return BODY_PRESSURE;
  if (mode === "ryaku") return clamp(BODY_PRESSURE * RYAKU_START_BOOST, 0, 1);
  if (mode === "stop") return BODY_PRESSURE;
  return BODY_PRESSURE;
}

/** Build pressure quadratically over the 10% of path preceding each Hook. */
export function hookPressureBoost(t: number, pins: PathPin[]): number {
  let boost = 1;
  for (const pin of pins) {
    if (pin.kind !== "hane" || t >= pin.t || t < pin.t - 0.1) continue;
    const u = clamp((t - (pin.t - 0.1)) / 0.1, 0, 1);
    boost = Math.max(boost, 1 + 0.5 * u * u);
  }
  return boost;
}

/** The horizontal closing pressure envelope also applies before a type transition. */
export function horizontalFinishGain(u: number): number {
  const s = clamp(u, 0, 1);
  return (1 + 0.9 * Math.pow(s, 4)) * (1 + 0.15 * s);
}

function closesHorizontal(mode: StrokeMode, next: PinKind): boolean {
  return mode === "horizontal" && isTypePin(next) && next !== "horizontal" && next !== "hane";
}

/** Spans which close a horizontal, then continue on the same path in a new type. */
export function horizontalTransitions(pins: PathPin[]): { start: number; end: number; nextEnd: number }[] {
  const types = [...pins].filter(p => isSwitchPin(p.kind)).sort((a, b) => a.t - b.t);
  const spans: { start: number; end: number; nextEnd: number }[] = [];
  let mode: StrokeMode = "auto";
  let start = 0;
  let named = false;
  types.forEach((pin, i) => {
    if (!named && isTypePin(pin.kind) && pin.kind !== "hane") {
      mode = pin.kind as StrokeMode;
      named = true;
      return;
    }
    if (closesHorizontal(mode, pin.kind) && pin.t > start) {
      spans.push({ start, end: pin.t, nextEnd: types[i + 1]?.t ?? 1 });
    }
    mode = pin.kind as StrokeMode;
    start = pin.t;
  });
  return spans;
}

/**
 * First type pin names the whole stroke from t=0 and uses that type's default start.
 * Later type / finish pins take over at their t: the previous span's ending pressure
 * is the next span's start (handoff). Pressure pins only multiply afterwards.
 */
export function pressureAlongStroke(t: number, pins: PathPin[], _hint: StartHint): number {
  const types = [...pins].filter((p) => isSwitchPin(p.kind)).sort((a, b) => a.t - b.t);
  let mode: StrokeMode = "auto";
  const bodyLevel = BODY_PRESSURE;
  let startP = BODY_PRESSURE;
  let t0 = 0;
  let named = false;
  let closingCarry = 0;
  const evaluate = (local: number, complete: boolean) =>
    evalMode(mode, local, startP, bodyLevel, t, _hint.kind, complete)
    + closingCarry * Math.pow(Math.max(0, 1 - local / 0.2), 4);

  for (const pin of types) {
    if (!named && isTypePin(pin.kind) && pin.kind !== "hane") {
      mode = pin.kind as StrokeMode;
      startP = startPressure(mode);
      named = true;
      continue;
    }
    if (t < pin.t) {
      const local = (t - t0) / Math.max(1e-4, pin.t - t0);
      const closing = closesHorizontal(mode, pin.kind) ? horizontalFinishGain((local - 0.8) / 0.2) : 1;
      return evaluate(local, false) * closing * hookPressureBoost(t, pins);
    }
    const closing = closesHorizontal(mode, pin.kind) && pin.t > t0 ? horizontalFinishGain(1) : 1;
    const handoff = clamp(evaluate(1, false) * closing * (pin.kind === "hane" && pin.t > 0 ? 1.5 : 1), 0, 2);
    // The closing pressure belongs to the fold. Release it quickly rather than
    // using it as the body pressure for the whole outgoing stroke.
    const freshType = mode === "saku" && isTypePin(pin.kind);
    startP = closing > 1 || freshType ? startPressure(pin.kind as StrokeMode) : handoff;
    closingCarry = closing > 1 ? handoff - startP : 0;
    t0 = pin.t;
    mode = pin.kind as StrokeMode;
  }
  const local = (t - t0) / Math.max(1e-4, 1 - t0);
  return evaluate(local, true) * hookPressureBoost(t, pins);
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
    if (!named && isTypePin(pin.kind) && pin.kind !== "hane") {
      mode = pin.kind as StrokeMode;
      named = true;
      continue;
    }
    if (t < pin.t) return mode;
    mode = pin.kind as StrokeMode;
  }
  return mode;
}

/** Page-relative defaults follow the initial type; explicit angles take priority. */
export function entryAngleForStroke(stroke: Pick<StrokeEdit, "pins" | "entryAngle" | "points">): number {
  if (typeof stroke.entryAngle === "number" && Number.isFinite(stroke.entryAngle)) {
    return normalizeEntryAngle(stroke.entryAngle);
  }
  let mode: StrokeMode | null = modeAlongStroke(0, stroke.pins, "auto");
  if (mode === "auto" || mode === "pressure") mode = inferBone(stroke.points);
  if (mode === "vertical") return 135;
  if (mode === "horizontal" || mode === "saku") return 110;
  return DEFAULT_ENTRY_ANGLE;
}

/** Left sweeps start at regular pressure unless explicitly overridden. */
export function entryPressureForStroke(stroke: Pick<StrokeEdit, "pins" | "entryPressure">): number {
  if (typeof stroke.entryPressure === "number" && Number.isFinite(stroke.entryPressure)) {
    return normalizeEntryPressure(stroke.entryPressure);
  }
  const mode = modeAlongStroke(0, stroke.pins, "auto");
  return mode === "ryaku" || mode === "peck" ? 1 : DEFAULT_ENTRY_PRESSURE;
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
  if (last.kind === "soku") return "tome";
  if (last.kind === "sweep") return "harai";
  if (last.kind === "ryaku" || last.kind === "peck" || last.kind === "saku")
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
  const roofHook = horizontalHookIndex(points);
  if (roofHook != null) {
    const pts = points.map(([x, y]) => ({ x, y }));
    return [pin(0.28, "horizontal"), pin(vertexPathT(pts, roofHook), "hane")];
  }
  const hook = verticalHookIndex(points);
  if (hook != null) {
    const pts = points.map(([x, y]) => ({ x, y }));
    return [pin(0.28, "vertical"), pin(vertexPathT(pts, hook), "hane")];
  }
  const straight = simplifyStraightStroke(points);
  if (straight) return straight.mode === "horizontal"
    ? [pin(0.3, "horizontal")]
    : [pin(0.3, "vertical"), pin(0.9, "stop")];
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
        : [pin(0.28, "vertical"), pin(0.9, "stop")];
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
  if (bone === "horizontal") return [pin(0.3, "horizontal")];
  return [pin(0.9, "stop")];
}

/** Suggest restores the definitive template's per-stroke pin layout. */
function suggestYongPins(_points: number[][], si: number): PathPin[] {
  return (YONG_TEMPLATE.strokes[si]?.pins ?? []).map(pin => ({ ...pin, id: newPinId() }));
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
