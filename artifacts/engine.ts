import type { BrushSettings, StrokeKind, StrokeSample, Vec } from "@/lib/kanji/types";
import { BristleSim } from "./bristles";
import {
  BODY_PRESSURE,
  oreStrength,
  pressureFromPins,
  settleFromPins,
  sweepPinT,
  takuPressure,
  type GlyphEdit,
  type SettleStyle,
} from "./edits";
import {
  classifyStroke,
  cornerIndices,
  dist,
  isRightwardSweep,
  lerp,
  nearestVertexIndex,
  pathLength,
  pressureAt,
  resamplePreservingCorners,
  resampleSmooth,
  vertexPathT,
} from "./geometry";
import type { WetPaper } from "./wet";

export type PreparedStroke = {
  samples: StrokeSample[];
  kind: StrokeKind;
  length: number;
  duration: number;
  outline: string;
};

export type Cell = { x: number; y: number; w: number; h: number };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type PreparedGlyph = {
  char: string;
  cell: Cell;
  bounds: Bounds;
  strokes: PreparedStroke[];
  outlines: string[];
};

export function glyphBounds(medians: number[][][]): Bounds {
  let minX = 1024;
  let minY = 1024;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (const stroke of medians) {
    for (const p of stroke) {
      const x = p[0];
      const y = p[1];
      if (x == null || y == null) continue;
      any = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!any) return { minX: 0, minY: 0, maxX: 1024, maxY: 1024 };
  const span = Math.max(maxX - minX, maxY - minY, 80);
  const pad = span * 0.14;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function projectToCell(pt: [number, number], cell: Cell, b: Bounds): Vec {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const scale = Math.min(cell.w / bw, cell.h / bh);
  const w = bw * scale;
  const h = bh * scale;
  const ox = cell.x + (cell.w - w) / 2;
  const oy = cell.y + (cell.h - h) / 2;
  return {
    x: ox + (pt[0] - b.minX) * scale,
    y: oy + (b.maxY - pt[1]) * scale,
  };
}

export function unprojectFromCell(x: number, y: number, cell: Cell, b: Bounds): [number, number] {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const scale = Math.min(cell.w / bw, cell.h / bh);
  const w = bw * scale;
  const h = bh * scale;
  const ox = cell.x + (cell.w - w) / 2;
  const oy = cell.y + (cell.h - h) / 2;
  return [b.minX + (x - ox) / scale, b.maxY - (y - oy) / scale];
}

export function tuftRadius(cell: Cell, size: number): number {
  return Math.min(cell.w, cell.h) * 0.036 * size;
}

export function prepareGlyph(
  char: string,
  medians: number[][][],
  outlines: string[],
  cell: Cell,
  edit?: GlyphEdit,
): PreparedGlyph {
  const bounds = glyphBounds(medians);
  const strokes: PreparedStroke[] = medians.map((rawMedian, si) => {
    const median =
      edit?.strokes[si]?.points && edit.strokes[si].points.length >= 2
        ? edit.strokes[si].points
        : rawMedian;
    const pins = edit?.strokes[si]?.pins ?? [];
    const kind = classifyStroke(median);
    const settle = settleFromPins(pins, kind);
    const mapped = median.map((p) => projectToCell(p as [number, number], cell, bounds));
    const autoCorners = cornerIndices(mapped);
    const pinCorners = pins
      .filter((p) => p.kind === "ore")
      .map((p) => nearestVertexIndex(mapped, p.t));
    const corners = [...new Set([...autoCorners, ...pinCorners])];
    const oreTs = [
      ...corners.map((i) => vertexPathT(mapped, i)),
      ...pins.filter((p) => p.kind === "ore").map((p) => p.t),
    ];
    const sweepT = sweepPinT(pins);
    const takuT =
      sweepT ?? (kind === "sweep" && isRightwardSweep(median) && pins.length === 0 ? 0.94 : null);
    const finish: SettleStyle = takuT != null && settle === "auto" ? "taku" : settle;
    const spacing =
      kind === "dot"
        ? Math.max(0.35, Math.min(cell.w, cell.h) / 360)
        : Math.max(0.45, Math.min(cell.w, cell.h) / 280);
    const smooth =
      corners.length > 0
        ? resamplePreservingCorners(mapped, spacing, corners)
        : resampleSmooth(mapped, spacing);
    const len = pathLength(smooth);
    const samples: StrokeSample[] = [];
    let acc = 0;
    for (let i = 0; i < smooth.length; i++) {
      const prev = smooth[Math.max(0, i - 1)];
      const next = smooth[Math.min(smooth.length - 1, i + 1)];
      if (i > 0) acc += dist(smooth[i - 1], smooth[i]);
      const t = len > 0 ? acc / len : 0;
      const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      const belly = 0.84 + 0.28 * Math.abs(Math.sin(angle));
      const pinned = pressureFromPins(t, pins);
      let pressure: number;
      if (takuT != null) {
        pressure = takuPressure(t, takuT);
      } else {
        const body = (pinned == null ? pressureAt(t, kind) * belly : pinned) * BODY_PRESSURE;
        pressure = lerp(clamp01(body), 1, oreStrength(t, oreTs));
      }
      samples.push({
        x: smooth[i].x,
        y: smooth[i].y,
        angle,
        t,
        pressure,
        kind,
        hold: false,
        blot: false,
      });
    }
    insertOreMiters(samples, oreTs, tuftRadius(cell, 1), kind);
    appendSettle(samples, kind, finish, tuftRadius(cell, 1));
    const unitLen = pathLength(median.map(([x, y]) => ({ x, y })));
    const duration =
      (kind === "dot"
        ? 520
        : finish === "taku"
          ? 480
          : finish === "tome" || (finish === "auto" && kind === "stop")
            ? 420
            : 300) + unitLen * 0.9;
    return {
      samples,
      kind,
      length: len,
      duration,
      outline: outlines[si] ?? "",
    };
  });

  return { char, cell, bounds, strokes, outlines };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * 折れ: stop, push a miter into the outer corner, then leave on the new heading.
 * That's the fold — not a Catmull-Rom round-off.
 */
function insertOreMiters(
  samples: StrokeSample[],
  oreTs: number[],
  radius: number,
  kind: StrokeKind,
) {
  if (samples.length < 4 || oreTs.length === 0) return;
  const merged: number[] = [];
  for (const t of [...oreTs].sort((a, b) => a - b)) {
    if (!merged.length || Math.abs(t - merged[merged.length - 1]) > 0.06) merged.push(t);
  }

  for (let k = merged.length - 1; k >= 0; k--) {
    const ot = merged[k];
    if (ot < 0.08 || ot > 0.9) continue;
    let idx = 1;
    let best = Infinity;
    for (let i = 1; i < samples.length - 1; i++) {
      const d = Math.abs(samples[i].t - ot);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    const C = samples[idx];
    const prev = samples[Math.max(0, idx - 2)];
    const next = samples[Math.min(samples.length - 1, idx + 2)];
    const inA = Math.atan2(C.y - prev.y, C.x - prev.x);
    const outA = Math.atan2(next.y - C.y, next.x - C.x);
    const ix = Math.cos(inA);
    const iy = Math.sin(inA);
    const ox = Math.cos(outA);
    const oy = Math.sin(outA);
    let bx = ix - ox;
    let by = iy - oy;
    const bl = Math.hypot(bx, by);
    if (bl < 0.25) continue;
    bx /= bl;
    by /= bl;
    const reach = radius * 0.5;
    const mx = C.x + bx * reach;
    const my = C.y + by * reach;
    const outAng = Math.atan2(by, bx);
    const backAng = Math.atan2(-by, -bx);

    const mk = (x: number, y: number, angle: number, hold: boolean): StrokeSample => ({
      x,
      y,
      angle,
      t: C.t,
      pressure: 1,
      kind,
      hold,
      blot: false,
    });

    samples.splice(
      idx + 1,
      0,
      mk(C.x, C.y, inA, true),
      mk(C.x, C.y, inA, true),
      mk(lerp(C.x, mx, 0.5), lerp(C.y, my, 0.5), outAng, false),
      mk(mx, my, outAng, false),
      mk(lerp(mx, C.x, 0.55), lerp(my, C.y, 0.55), backAng, false),
      mk(C.x, C.y, outA, true),
      mk(C.x, C.y, outA, false),
    );
  }
}

/** 磔 ends in a press — bristles catch up at full weight, no reverse, no fade. */
function appendTakuPress(samples: StrokeSample[], kind: StrokeKind) {
  const last = samples[samples.length - 1];
  const pathFrac = 0.82;
  for (const s of samples) s.t *= pathFrac;
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    samples.push({
      x: last.x,
      y: last.y,
      angle: last.angle,
      t: pathFrac + u * (1 - pathFrac),
      pressure: 1,
      kind,
      hold: true,
      blot: u > 0.45,
    });
  }
}

/**
 * Finish the stroke. 止め overshoots a hair, then retraces the path
 * so the turn sits inside the ink instead of flicking off to the side.
 */
function appendSettle(
  samples: StrokeSample[],
  kind: StrokeKind,
  settle: SettleStyle,
  radius: number,
) {
  if (samples.length === 0) return;
  const style =
    settle === "auto"
      ? kind === "sweep"
        ? "harai"
        : kind === "hook"
          ? "hane"
          : kind === "dot"
            ? "dot"
            : "tome"
      : settle;

  if (style === "tome") {
    appendTomeHook(samples, kind, radius);
    return;
  }

  if (style === "taku") {
    appendTakuPress(samples, kind);
    return;
  }

  const last = samples[samples.length - 1];
  const pathFrac = style === "dot" ? 0.3 : style === "harai" ? 0.76 : 0.8;
  const nSettle = style === "dot" ? 28 : style === "harai" ? 18 : 16;
  for (const s of samples) s.t *= pathFrac;

  for (let i = 1; i <= nSettle; i++) {
    const u = i / nSettle;
    let pressure: number;
    if (style === "dot") {
      pressure = u < 0.4 ? lerp(Math.max(last.pressure, 0.7), 1, u / 0.4) : lerp(1, 0.1, (u - 0.4) / 0.6);
    } else if (style === "harai") {
      pressure = Math.max(0.2, last.pressure * Math.pow(1 - u, 0.7));
    } else {
      const tail = u < 0.35 ? last.pressure : last.pressure * Math.pow(1 - (u - 0.35) / 0.65, 1.15);
      pressure = Math.max(0.18, tail);
    }
    samples.push({
      x: last.x,
      y: last.y,
      angle: last.angle,
      t: pathFrac + u * (1 - pathFrac),
      pressure: Math.min(1, Math.max(0, pressure)),
      kind,
      hold: true,
      blot: style === "dot",
    });
  }
}

/** Reverse back over the stroke so the turn is buried in the ink. */
function appendTomeHook(samples: StrokeSample[], kind: StrokeKind, radius: number) {
  const last = samples[samples.length - 1];
  const pathFrac = 0.72;
  const a = last.angle;
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const nose = Math.max(2.2, radius * 0.4);
  const backDist = Math.max(10, radius * 1.7);

  const reverse: Vec[] = [];
  let walked = 0;
  for (let i = samples.length - 1; i > 0 && walked < backDist; i--) {
    walked += dist(samples[i], samples[i - 1]);
    reverse.push({ x: samples[i - 1].x, y: samples[i - 1].y });
  }

  const poly: Vec[] = [
    { x: last.x + tx * nose, y: last.y + ty * nose },
    { x: last.x, y: last.y },
    ...reverse,
  ];
  const nNose = 7;
  const nBack = 20;
  const total = nNose + nBack;
  for (const s of samples) s.t *= pathFrac;

  for (let i = 1; i <= nNose; i++) {
    const u = i / nNose;
    samples.push({
      x: last.x + tx * nose * u,
      y: last.y + ty * nose * u,
      angle: a,
      t: pathFrac + (i / total) * (1 - pathFrac),
      pressure: 1,
      kind,
      hold: false,
      blot: false,
    });
  }

  for (let i = 1; i <= nBack; i++) {
    const u = i / nBack;
    const p = pointAlong(poly, u);
    const nxt = pointAlong(poly, Math.min(1, u + 1 / nBack));
    samples.push({
      x: p.x,
      y: p.y,
      angle: Math.atan2(nxt.y - p.y, nxt.x - p.x),
      t: pathFrac + ((nNose + i) / total) * (1 - pathFrac),
      pressure: u < 0.22 ? 1 : lerp(1, 0.2, Math.pow((u - 0.22) / 0.78, 0.85)),
      kind,
      hold: false,
      blot: false,
    });
  }
}

function pointAlong(poly: Vec[], t: number): Vec {
  if (poly.length === 0) return { x: 0, y: 0 };
  if (poly.length === 1 || t <= 0) return { ...poly[0] };
  let total = 0;
  const segs: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    total += dist(poly[i - 1], poly[i]);
    segs.push(total);
  }
  if (total <= 1e-4) return { ...poly[poly.length - 1] };
  const target = t * total;
  for (let i = 1; i < segs.length; i++) {
    if (target <= segs[i]) {
      const u = (target - segs[i - 1]) / Math.max(1e-4, segs[i] - segs[i - 1]);
      return {
        x: lerp(poly[i - 1].x, poly[i].x, u),
        y: lerp(poly[i - 1].y, poly[i].y, u),
      };
    }
  }
  return { ...poly[poly.length - 1] };
}

export function layoutCells(count: number, width: number, height: number): Cell[] {
  const pad = Math.min(width, height) * 0.07;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const cols =
    count <= 1 ? 1 : count === 2 ? 2 : count <= 4 ? 2 : count <= 6 ? 3 : Math.min(4, count);
  const rows = Math.ceil(count / cols);
  const cell = Math.min(innerW / cols, innerH / rows);
  const gridW = cell * cols;
  const gridH = cell * rows;
  const ox = (width - gridW) / 2;
  const oy = (height - gridH) / 2;
  const inset = cell * 0.06;
  return Array.from({ length: count }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      x: ox + c * cell + inset,
      y: oy + r * cell + inset,
      w: cell - inset * 2,
      h: cell - inset * 2,
    };
  });
}

export function simulateStrokeRange(
  sim: BristleSim,
  wet: WetPaper,
  stroke: PreparedStroke,
  fromIdx: number,
  toIdx: number,
  settings: BrushSettings,
  cell: Cell,
) {
  const stamp = wet.stampCtx;
  if (!stamp) return;
  sim.setRadius(tuftRadius(cell, settings.size));
  if (toIdx < fromIdx || stroke.samples.length === 0) return;
  const start = Math.max(0, fromIdx);
  const end = Math.min(stroke.samples.length - 1, toIdx);
  for (let i = start; i <= end; i++) {
    const sample = stroke.samples[i];
    if (i === 0) {
      sim.press(stamp, sample);
    } else {
      const prev = stroke.samples[i - 1];
      const gap = dist(prev, sample);
      const dt = sample.hold || gap < 0.2 ? 0.014 : Math.min(0.028, 0.008 + gap / 420);
      sim.step(stamp, sample, dt);
    }
  }
  if (end === stroke.samples.length - 1) {
    wet.commit(settings.wetness);
  }
}

export function paintGrid(ctx: CanvasRenderingContext2D, cell: Cell, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.42;
  ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
  ctx.beginPath();
  ctx.moveTo(cell.x + cell.w / 2, cell.y);
  ctx.lineTo(cell.x + cell.w / 2, cell.y + cell.h);
  ctx.moveTo(cell.x, cell.y + cell.h / 2);
  ctx.lineTo(cell.x + cell.w, cell.y + cell.h / 2);
  ctx.stroke();
  ctx.globalAlpha = 0.18;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(cell.x, cell.y);
  ctx.lineTo(cell.x + cell.w, cell.y + cell.h);
  ctx.moveTo(cell.x + cell.w, cell.y);
  ctx.lineTo(cell.x, cell.y + cell.h);
  ctx.stroke();
  ctx.restore();
}

export function paintGhost(
  ctx: CanvasRenderingContext2D,
  outlines: string[],
  cell: Cell,
  color: string,
  bounds: Bounds,
) {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(cell.w / bw, cell.h / bh);
  const w = bw * scale;
  const h = bh * scale;
  const ox = cell.x + (cell.w - w) / 2;
  const oy = cell.y + (cell.h - h) / 2;
  ctx.save();
  ctx.translate(ox - bounds.minX * scale, oy + bounds.maxY * scale);
  ctx.scale(scale, -scale);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16;
  for (const d of outlines) {
    if (!d) continue;
    try {
      ctx.fill(new Path2D(d));
    } catch {
      /* ignore malformed path */
    }
  }
  ctx.restore();
}

export function paintSeal(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  fill: string,
  paper: string,
  alpha: number,
) {
  const size = Math.min(cell.w, cell.h) * 0.18;
  const x = cell.x + cell.w - size * 0.15;
  const y = cell.y + cell.h - size * 1.05;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  const r = Math.max(2, size * 0.06);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(size * 0.08, size * 0.08, size * 0.84, size * 0.84, r * 0.5);
  ctx.clip();
  ctx.fillStyle = paper;
  ctx.font = `800 ${size * 0.5}px "Shippori Mincho", "Noto Serif JP", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("墨", size / 2, size / 2 + size * 0.03);
  ctx.restore();
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.beginPath();
  ctx.roundRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86, r * 0.5);
  ctx.stroke();
  ctx.restore();
}
