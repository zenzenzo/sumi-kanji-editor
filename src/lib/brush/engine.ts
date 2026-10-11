import type { BrushSettings, StrokeKind, StrokeSample, Vec } from "@/lib/kanji/types";
import { BristleSim } from "./bristles";
import { sampleStrokePath } from "./curves";
import {
  inferMode,
  horizontalFinishGain,
  horizontalTransitions,
  entryAngleForStroke,
  entryPressureForStroke,
  modeAlongStroke,
  oreStrength,
  pressureAlongStroke,
  pressureMultiplier,
  settleFromPins,
  type GlyphEdit,
  type PathPin,
  type SettleStyle,
  type StrokeMode,
} from "./edits";
import {
  angleDiff,
  axisAngleDiff,
  classifyStroke,
  cornerIndices,
  dist,
  inferBone,
  lerp,
  nearestVertexIndex,
  pathLength,
  resamplePreservingCorners,
  resampleSmooth,
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
  const sources: { points: number[][]; pins: PathPin[]; entryAngle?: number; entryPressure?: number }[] = [];
  if (edit?.custom) {
    for (const s of edit.strokes) {
      if (s.points.length >= 2) sources.push({ points: sampleStrokePath(s).map((p) => p.point), pins: s.pins ?? [], entryAngle: s.entryAngle, entryPressure: s.entryPressure });
    }
  } else {
    const n = Math.max(medians.length, edit?.strokes.length ?? 0);
    for (let si = 0; si < n; si++) {
      const edited = edit?.strokes[si];
      const points =
        edited?.points && edited.points.length >= 2 ? edited.points : (medians[si] ?? null);
      if (!points || points.length < 2) continue;
      sources.push({ points: edited?.curves ? sampleStrokePath({ ...edited, points }).map((p) => p.point) : points, pins: edited?.pins ?? [], entryAngle: edited?.entryAngle, entryPressure: edited?.entryPressure });
    }
  }
  const bounds = glyphBounds(medians.length ? medians : sources.map((s) => s.points));
  const strokes: PreparedStroke[] = sources.map((src, si) => {
    const median = src.points;
    const pins = src.pins;
    const kind = classifyStroke(median);
    const inferred = inferMode(median, kind);
    const settle = settleFromPins(pins, kind);
    const mapped = median.map((p) => projectToCell(p as [number, number], cell, bounds));
    const autoCorners = cornerIndices(mapped);
    const pinCorners = pins
      .filter((p) => p.kind === "ore")
      .map((p) => nearestVertexIndex(mapped, p.t));
    const corners = [...new Set([...autoCorners, ...pinCorners])];
    const oreTs = pins.filter((p) => p.kind === "ore").map((p) => p.t);
    const finish: SettleStyle = settle;
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
      const along = pressureAlongStroke(t, pins, { kind, inferred });
      const pressure = lerp(
        Math.max(0, Math.min(2, along)),
        1,
        oreStrength(t, oreTs),
      );
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
    stabilizeAngles(samples);
    for (const sample of samples) sample.pathAngle = sample.angle;
    insertOreMiters(samples, oreTs, tuftRadius(cell, 1), kind);
    const startMode = modeAlongStroke(0, pins, inferred);
    const bone = inferBone(median);
    let entryMode: StrokeMode | null = null;
    if (startMode === "vertical" || startMode === "horizontal" || startMode === "saku" || startMode === "peck") {
      entryMode = startMode;
    } else if (startMode === "auto" || startMode === "pressure") {
      entryMode = bone;
    }
    applyEntryEnvelope(samples, !!entryMode || src.entryPressure != null, entryAngleForStroke(src), entryPressureForStroke(src));
    applyTransitionAngles(samples, pins, entryAngleForStroke(src));
    const dotEnding = modeAlongStroke(1, pins, inferred) === "soku";
    if (finish === "tome" && !dotEnding) applyStopEnvelope(samples, entryAngleForStroke(src));
    // Cap the natural envelope before applying the user's multiplier. Otherwise
    // an already full-pressure ending cannot respond to pressure pins above 1×.
    for (const sample of samples) {
      sample.pressure = Math.max(0, Math.min(2, sample.pressure * pressureMultiplier(sample.t, pins)));
    }
    appendSettle(samples, kind, finish, tuftRadius(cell, 1), dotEnding);
    const unitLen = pathLength(median.map(([x, y]) => ({ x, y })));
    const duration =
      (kind === "dot"
        ? 520
        : finish === "taku"
          ? 480
          : finish === "tome" || (finish === "auto" && kind === "stop")
            ? 420
            : 300) +
      unitLen * 0.9;
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

/** Keep the tuft from flipping on a Catmull-Rom cusp. */
function stabilizeAngles(samples: StrokeSample[]) {
  if (samples.length < 3) return;
  let prev = samples[0].angle;
  for (let i = 1; i < samples.length; i++) {
    const d = angleDiff(prev, samples[i].angle);
    if (Math.abs(d) > 0.65) {
      samples[i].angle = prev + Math.max(-0.4, Math.min(0.4, d));
    }
    prev = samples[i].angle;
  }
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

/** Entry stays on the path: pressure and brush heading settle over its first 20%. */
function applyEntryEnvelope(samples: StrokeSample[], press: boolean, degrees: number, peak: number) {
  const entryAngle = degrees * Math.PI / 180;
  for (const sample of samples) {
    sample.entryBleed = Math.pow(Math.max(0, 1 - sample.t / 0.08), 2);
    if (sample.t >= 0.2) continue;
    const u = Math.max(0, sample.t / 0.2);
    const release = Math.pow(1 - u, 4);
    if (press) sample.pressure = Math.max(0, Math.min(2, sample.pressure * (1 + (peak - 1) * release)));
    const ease = 1 - Math.pow(1 - u, 3);
    sample.angle = entryAngle + axisAngleDiff(entryAngle, sample.angle) * ease;
  }
}

/** Close the horizontal before the junction, then settle onto the outgoing path. */
function applyTransitionAngles(samples: StrokeSample[], pins: PathPin[], degrees: number) {
  const gesture = degrees * Math.PI / 180;
  for (const span of horizontalTransitions(pins)) {
    const closingStart = span.start + (span.end - span.start) * 0.8;
    const outgoingEnd = span.end + (span.nextEnd - span.end) * 0.2;
    for (const sample of samples) {
      if (sample.t < closingStart || sample.t > outgoingEnd) continue;
      if (sample.t < span.end) {
        const u = clamp01((sample.t - closingStart) / (span.end - closingStart));
        sample.angle += axisAngleDiff(sample.angle, gesture) * Math.pow(u, 3);
      } else if (outgoingEnd > span.end) {
        const u = clamp01((sample.t - span.end) / (outgoingEnd - span.end));
        const ease = 1 - Math.pow(1 - u, 3);
        sample.angle = gesture + axisAngleDiff(gesture, sample.angle) * ease;
      }
    }
  }
}

/** Horizontal 止め reverses the entry envelope over the final 20% of the path. */
function applyStopEnvelope(samples: StrokeSample[], degrees: number) {
  const last = samples[samples.length - 1];
  if (!last) return;
  const weight = Math.max(0, Math.min(1, (Math.abs(Math.cos(last.angle)) - 0.5) / 0.35));
  const endAngle = degrees * Math.PI / 180;
  for (const sample of samples) {
    if (sample.t < 0.8) continue;
    const u = clamp01((sample.t - 0.8) / 0.2);
    // Reverse the fast-release entry into a slow-then-fast buildup, with a
    // gain that reaches +15% at the endpoint and joins the body continuously.
    const reverse = horizontalFinishGain(u);
    sample.pressure = Math.max(0, Math.min(2, sample.pressure * (1 + weight * (reverse - 1))));
    sample.angle += axisAngleDiff(sample.angle, endAngle) * Math.pow(u, 3) * weight;
  }
}

/** 磔: keep moving off the tip while pressure collapses — no parked blot. */
function appendTakuPress(samples: StrokeSample[], kind: StrokeKind, radius: number) {
  const last = samples[samples.length - 1];
  const pathFrac = 0.9;
  for (const s of samples) s.t *= pathFrac;
  const a = last.angle;
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const travel = Math.max(5, radius * 0.7);
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    samples.push({
      x: last.x + tx * travel * u,
      y: last.y + ty * travel * u,
      angle: a,
      t: pathFrac + u * (1 - pathFrac),
      pressure: Math.max(0, last.pressure * Math.pow(1 - u, 1.8)),
      kind,
      hold: false,
      blot: false,
    });
  }
}

/**
 * Finish the stroke. 止め chooses an angled close or rounded cap
 * from the terminal heading while retaining the incoming pressure.
 */
function appendSettle(
  samples: StrokeSample[],
  kind: StrokeKind,
  settle: SettleStyle,
  radius: number,
  roundEnding = false,
) {
  if (samples.length === 0) return;
  const style = settle === "auto" ? "none" : settle;
  if (style === "none") return;

  if (style === "tome") {
    appendTome(samples, kind, radius, roundEnding);
    return;
  }

  if (style === "taku") {
    appendTakuPress(samples, kind, radius);
    return;
  }

  if (style === "harai" || style === "hane") {
    return;
  }

  const last = samples[samples.length - 1];
  const pathFrac = 0.3;
  const nSettle = 28;
  for (const s of samples) s.t *= pathFrac;

  for (let i = 1; i <= nSettle; i++) {
    const u = i / nSettle;
    const pressure =
      u < 0.4 ? lerp(Math.max(last.pressure, 0.7), 1, u / 0.4) : lerp(1, 0.1, (u - 0.4) / 0.6);
    samples.push({
      x: last.x,
      y: last.y,
      angle: last.angle,
      pathAngle: last.pathAngle ?? last.angle,
      t: pathFrac + u * (1 - pathFrac),
      pressure: Math.min(1, Math.max(0, pressure)),
      kind,
      hold: true,
      blot: true,
    });
  }
}

/** 止め follows the terminal direction: angled 横 finish or rounded 縦 cap. */
function appendTome(samples: StrokeSample[], kind: StrokeKind, _radius: number, forceRound = false) {
  const last = samples[samples.length - 1];
  // Heading has already turned into the closing orientation. Use the approach
  // direction to distinguish a vertical rounded cap from a horizontal finish.
  const prev = samples[Math.max(0, samples.length - 2)];
  const approach = Math.atan2(last.y - prev.y, last.x - prev.x);
  const roundCap = forceRound || Math.abs(Math.cos(approach)) < 0.55;
  const n = 18;
  const pathFrac = 0.86;
  for (const s of samples) s.t *= pathFrac;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const capU = Math.min(1, u / 0.7);
    const roundness = capU * capU * (3 - 2 * capU);
    const lift = u < 0.7 ? 1 : Math.pow(Math.max(0, 1 - (u - 0.7) / 0.3), 1.4);
    samples.push({
      x: last.x,
      y: last.y,
      angle: last.angle,
      pathAngle: approach,
      t: pathFrac + u * (1 - pathFrac),
      pressure: last.pressure * lift,
      kind,
      hold: true,
      blot: roundCap,
      spread: roundCap ? lerp(1, 0.9, roundness) : 1,
      roundness: roundCap ? roundness : undefined,
    });
  }
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
  wet.markLiveDirty();
  for (let i = start; i <= end; i++) {
    const sample = stroke.samples[i];
    if (sample.pressure < 0.02) break;
    if (i === 0) {
      sim.press(stamp, sample);
    } else {
      const prev = stroke.samples[i - 1];
      const gap = dist(prev, sample);
      const stepR = tuftRadius(cell, settings.size);
      if (gap > stepR * 0.85 && !sample.hold && !prev.hold) {
        const n = Math.min(8, Math.ceil(gap / (stepR * 0.45)));
        for (let k = 1; k <= n; k++) {
          const u = k / n;
          const mid: StrokeSample = {
            ...sample,
            x: lerp(prev.x, sample.x, u),
            y: lerp(prev.y, sample.y, u),
            pressure: lerp(prev.pressure, sample.pressure, u),
            t: lerp(prev.t, sample.t, u),
          };
          if (mid.pressure < 0.02) break;
          sim.step(stamp, mid, Math.min(0.024, 0.008 + (gap / n) / 420));
        }
      } else {
        const dt = sample.hold || gap < 0.2 ? 0.014 : Math.min(0.028, 0.008 + gap / 420);
        sim.step(stamp, sample, dt);
      }
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
