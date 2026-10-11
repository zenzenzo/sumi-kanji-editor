import type { StrokeKind, Vec } from "@/lib/kanji/types";

export function dist(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A brush footprint is an axis: a half-turn is the same orientation. */
export function axisAngleDiff(a: number, b: number): number {
  let d = angleDiff(a, b);
  if (d > Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
}

function centripetalCatmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const d01 = dist(p0, p1);
  const d12 = dist(p1, p2);
  const d23 = dist(p2, p3);
  if (d12 < 1e-8) return { ...p1 };
  const t0 = 0;
  const t1 = t0 + Math.sqrt(Math.max(d01, 1e-8));
  const t2 = t1 + Math.sqrt(d12);
  const t3 = t2 + Math.sqrt(Math.max(d23, 1e-8));
  const T = t1 + t * (t2 - t1);

  const mix = (a: Vec, b: Vec, ta: number, tb: number, tt: number): Vec => {
    if (Math.abs(tb - ta) < 1e-8) return { ...a };
    const u = (tt - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };

  const a1 = mix(p0, p1, t0, t1, T);
  const a2 = mix(p1, p2, t1, t2, T);
  const a3 = mix(p2, p3, t2, t3, T);
  const b1 = mix(a1, a2, t0, t2, T);
  const b2 = mix(a2, a3, t1, t3, T);
  return mix(b1, b2, t1, t2, T);
}

/** Smooth a polyline through Catmull-Rom, then resample to even spacing. */
export function resampleSmooth(raw: Vec[], spacing: number): Vec[] {
  if (raw.length === 0) return [];
  if (raw.length === 1) return [{ ...raw[0] }];

  const padded = [raw[0], ...raw, raw[raw.length - 1]];
  const dense: Vec[] = [];
  const segs = raw.length - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = padded[i];
    const p1 = padded[i + 1];
    const p2 = padded[i + 2];
    const p3 = padded[i + 3];
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      dense.push(centripetalCatmullRom(p0, p1, p2, p3, s / steps));
    }
  }
  dense.push(raw[raw.length - 1]);

  const out: Vec[] = [{ ...dense[0] }];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const d = dist(dense[i - 1], dense[i]);
    carry += d;
    while (carry >= spacing) {
      const overshoot = carry - spacing;
      const t = 1 - overshoot / (d || 1);
      out.push({
        x: lerp(dense[i - 1].x, dense[i].x, t),
        y: lerp(dense[i - 1].y, dense[i].y, t),
      });
      carry -= spacing;
    }
  }
  const last = dense[dense.length - 1];
  const tail = out[out.length - 1];
  if (dist(tail, last) > spacing * 0.25) out.push({ ...last });
  return out;
}

export function pathLength(pts: Vec[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  return n;
}

export function classifyStroke(median: number[][]): StrokeKind {
  const pts: Vec[] = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  if (len < 90) return "dot";
  if (simplifyStraightStroke(median)) return "stop";

  const cutoff = len * 0.62;
  let acc = 0;
  let turn = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    acc += d;
    if (acc < cutoff || i < 2) continue;
    const a0 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    turn += Math.abs(angleDiff(a0, a1));
  }
  if (turn > 0.7) return "hook";

  const last = dist(pts[pts.length - 2], pts[pts.length - 1]);
  const avg = len / Math.max(1, pts.length - 1);
  if (len > 260 && last > avg * 0.75) return "sweep";
  return "stop";
}

/**
 * Keep the two original nodes bounding the main axial body. Length, rather
 * than node count, determines the 60% majority; endpoint flourishes are trimmed.
 * Preserve the body's slant and sharp terminal hooks.
 */
export function simplifyStraightStroke(
  median: number[][],
): { mode: "horizontal" | "vertical"; points: number[][] } | null {
  if (median.length < 2 || verticalHookIndex(median) != null || horizontalHookIndex(median) != null) return null;
  const pts = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  if (len < 90) return null;
  const tolerance = Math.sin(12 * Math.PI / 180);
  const lengths = pts.slice(1).map((p, i) => dist(pts[i], p));
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative[cumulative.length - 1] + length);
  let best: { mode: "horizontal" | "vertical"; start: number; end: number; length: number } | null = null;
  for (const mode of ["vertical", "horizontal"] as const) {
    const axial = lengths.map((length, i) => length > 1e-6 &&
      Math.abs(mode === "vertical" ? pts[i + 1].x - pts[i].x : pts[i + 1].y - pts[i].y) / length <= tolerance + 1e-12);
    const majority = lengths.reduce((sum, length, i) => sum + (axial[i] ? length : 0), 0);
    if (majority <= len * 0.6) continue;
    const main = lengths.reduce((best, length, i) => axial[i] && length > lengths[best] ? i : best, axial.findIndex(Boolean));
    const bodyAngle = Math.atan2(pts[main + 1].y - pts[main].y, pts[main + 1].x - pts[main].x);
    // Near-axis endpoint gestures can still be tilted relative to the actual
    // body. Exclude those short deviations instead of extending the body to them.
    const aligned = axial.map((value, i) => value && Math.abs(angleDiff(bodyAngle,
      Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x))) <= 4 * Math.PI / 180);
    for (let start = 0; start < pts.length - 1; start++) {
      for (let end = start + 1; end < pts.length; end++) {
        if (!aligned[end - 1]) break;
        const bodyLen = cumulative[end] - cumulative[start];
        if (bodyLen <= len * 0.6 || (best && bodyLen <= best.length)) continue;
        // A large remaining leg is a compound stroke, not a brush flourish.
        if (cumulative[start] > len * 0.4 || len - cumulative[end] > len * 0.4) continue;
        const dx = pts[end].x - pts[start].x;
        const dy = pts[end].y - pts[start].y;
        const chord = Math.hypot(dx, dy);
        if (chord < bodyLen * 0.98) continue;
        const tx = dx / chord, ty = dy / chord;
        if (end < pts.length - 1) {
          // Inspect the whole tail: a rounded lead-in can precede the sharp
          // hook, so testing only its first segment loses roof-radical hooks.
          let hooked = false;
          for (let i = end; i < pts.length - 1; i++) {
            const tailX = pts[i + 1].x - pts[i].x;
            const tailY = pts[i + 1].y - pts[i].y;
            const turn = Math.abs(angleDiff(Math.atan2(dy, dx), Math.atan2(tailY, tailX)));
            // A tiny sideways, still-downward flick on a vertical is a brush
            // release. Upward hooks are protected separately, and reversals
            // remain protected even when their tail is short.
            const tailMinimum = mode === "vertical" && turn < Math.PI / 2
              ? Math.max(12, len * 0.08)
              : Math.max(12, len * 0.025);
            if (turn >= Math.PI / 4 && len - cumulative[i] >= tailMinimum) hooked = true;
          }
          if (hooked) continue;
        }
        const residual = Math.max(6, bodyLen * 0.018);
        let straight = true;
        for (let i = start + 1; i <= end; i++) {
          const x = pts[i].x - pts[start].x, y = pts[i].y - pts[start].y;
          if (Math.abs(x * ty - y * tx) > residual ||
              (pts[i].x - pts[i - 1].x) * tx + (pts[i].y - pts[i - 1].y) * ty <= 0) {
            straight = false;
            break;
          }
        }
        if (straight) best = { mode, start, end, length: bodyLen };
      }
    }
  }
  if (!best) return null;
  return { mode: best.mode, points: [median[best.start].slice(0, 2), median[best.end].slice(0, 2)] };
}

/** 磔 goes right (and usually down). */
export function isRightwardSweep(median: number[][]): boolean {
  if (median.length < 2) return false;
  const a = median[0];
  const b = median[median.length - 1];
  return b[0] - a[0] > 48 && b[0] - a[0] > Math.abs(b[1] - a[1]) * 0.25;
}

/** 掠 / 左払い goes left (and usually down). */
export function isLeftwardSweep(median: number[][]): boolean {
  if (median.length < 2) return false;
  const a = median[0];
  const b = median[median.length - 1];
  const left = a[0] - b[0];
  return left > 48 && left > Math.abs(b[1] - a[1]) * 0.35;
}

/** Remove a short imported brush-setting bend from a Short left path. */
export function trimShortLeftEntry(median: number[][]): number[][] {
  const copy = () => median.map(p => p.slice(0, 2));
  if (median.length < 3 || verticalHookIndex(median) != null || horizontalHookIndex(median) != null) return copy();
  const pts = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  let prefix = 0;
  let cut = 0;
  for (let i = 1; i <= 2 && i < pts.length - 1; i++) {
    prefix += dist(pts[i - 1], pts[i]);
    if (prefix > len * 0.25) break;
    const incoming = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const outgoing = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    const left = pts[i + 1].x < pts[i].x;
    const turn = Math.abs(angleDiff(incoming, outgoing));
    // Trim only the tiny entry bend, never a substantial first leg. An already
    // smooth leftward start stays intact; the remainder retains all its nodes.
    if (left && turn >= Math.PI / 4 && turn < Math.PI * 0.95) cut = i;
  }
  return median.slice(cut).map(p => p.slice(0, 2));
}

/** 策 — rising diagonal (right and up in y-up glyph space). */
export function isRisingDiagonal(median: number[][]): boolean {
  if (median.length < 2) return false;
  const a = median[0];
  const b = median[median.length - 1];
  return b[0] - a[0] > 36 && b[1] - a[1] > 36;
}

/** 啄 — short left flick, as opposed to a long 掠. */
export function isShortLeftFlick(median: number[][]): boolean {
  if (!isLeftwardSweep(median)) return false;
  const pts = median.map(([x, y]) => ({ x, y }));
  return pathLength(pts) < 280;
}

export function pressureAt(t: number, kind: StrokeKind): number {
  const u = clamp(t, 0, 1);
  const attack = smoothstep(0, 0.1, u);
  switch (kind) {
    case "dot":
      return 0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    case "sweep":
      return (0.26 + 0.74 * attack) * Math.pow(1 - u * 0.94, 0.7);
    case "hook": {
      if (u < 0.6) return 0.32 + 0.62 * attack;
      return lerp(0.94, 0.07, Math.pow((u - 0.6) / 0.4, 0.82));
    }
    default: {
      const body = 0.4 + 0.6 * attack;
      const tail = u > 0.88 ? lerp(1, 0.7, (u - 0.88) / 0.12) : 1;
      return body * tail;
    }
  }
}

export function cornerIndices(pts: Vec[], minTurn = 0.92): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a0 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const a1 = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    if (Math.abs(angleDiff(a0, a1)) >= minTurn) out.push(i);
  }
  return out;
}

export function vertexPathT(pts: Vec[], index: number): number {
  const len = pathLength(pts);
  if (len <= 0) return 0;
  let acc = 0;
  for (let i = 1; i <= index && i < pts.length; i++) acc += dist(pts[i - 1], pts[i]);
  return acc / len;
}

export function nearestVertexIndex(pts: Vec[], t: number): number {
  if (pts.length <= 2) return Math.min(pts.length - 1, 1);
  const len = pathLength(pts);
  const target = clamp(t, 0, 1) * len;
  let acc = 0;
  let best = 1;
  let bestD = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += dist(pts[i - 1], pts[i]);
    const d = Math.abs(acc - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Resample, but keep listed vertices exact so 折れ stay a fold, not a curve. */
export function resamplePreservingCorners(raw: Vec[], spacing: number, corners: number[]): Vec[] {
  if (raw.length < 2) return raw.map((p) => ({ ...p }));
  const marks = [...new Set([0, ...corners.filter((i) => i > 0 && i < raw.length - 1), raw.length - 1])].sort(
    (a, b) => a - b,
  );
  if (marks.length <= 2) return resampleSmooth(raw, spacing);
  const out: Vec[] = [];
  for (let s = 0; s < marks.length - 1; s++) {
    const piece = raw.slice(marks[s], marks[s + 1] + 1);
    const resampled = resampleSmooth(piece, spacing);
    if (s > 0 && out.length && resampled.length) resampled.shift();
    out.push(...resampled);
  }
  return out;
}

export function pointAtFrac(pts: Vec[], t: number): Vec {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };
  const target = clamp(t, 0, 1) * pathLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= target) {
      const u = d <= 1e-6 ? 0 : (target - acc) / d;
      return { x: lerp(pts[i - 1].x, pts[i].x, u), y: lerp(pts[i - 1].y, pts[i].y, u) };
    }
    acc += d;
  }
  return { ...pts[pts.length - 1] };
}

/** Long 横 / 縦: axis of the first 90% of the path. */
export function inferBone(median: number[][]): "vertical" | "horizontal" | null {
  const pts = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  if (len < 80) return null;
  const a = pts[0];
  const b = pointAtFrac(pts, 0.9);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) > Math.abs(dx) * 1.65) return "vertical";
  if (Math.abs(dx) > Math.abs(dy) * 1.65) return "horizontal";
  return null;
}

/** A horizontal roof may round its corner before hooking back to the left. */
export function horizontalHookIndex(median: number[][]): number | null {
  if (median.length < 3) return null;
  const pts = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  let turn = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].x > pts[turn].x) turn = i;
  if (turn === 0 || turn === pts.length - 1) return null;
  const first = pts[0], corner = pts[turn], last = pts[pts.length - 1];
  const run = corner.x - first.x;
  const t = vertexPathT(pts, turn);
  if (run < 120 || Math.abs(corner.y - first.y) > run * 0.35 || t < 0.55) return null;
  if (corner.x - last.x < 24 || (1 - t) * len < 24 || 1 - t > 0.35) return null;
  const incoming = Math.atan2(corner.y - first.y, run);
  const outgoing = Math.atan2(last.y - corner.y, last.x - corner.x);
  return Math.abs(angleDiff(incoming, outgoing)) >= Math.PI / 4 ? turn : null;
}

/** Locate a late downward-to-upward bend on a predominantly vertical stroke. */
export function verticalHookIndex(median: number[][]): number | null {
  if (median.length < 3) return null;
  const pts = median.map(([x, y]) => ({ x, y }));
  const len = pathLength(pts);
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = pts.length - 2; i > 0; i--) {
    const p = pts[i], before = pts[i - 1], after = pts[i + 1];
    const t = vertexPathT(pts, i);
    const drop = first.y - p.y;
    if (t < 0.55 || drop < 120 || drop < Math.abs(p.x - first.x) * 1.65) continue;
    if ((1 - t) * len > len * 0.35 || last.y - p.y < 12) continue;
    const inY = p.y - before.y;
    const outY = after.y - p.y;
    if (inY >= -8 || outY < 0) continue;
    const turn = Math.abs(angleDiff(Math.atan2(inY, p.x - before.x), Math.atan2(outY, after.x - p.x)));
    if (turn >= 0.65) return i;
  }
  return null;
}

/** Last third of the path travels left — 掠 / 鉤. */
export function endsLeftward(median: number[][]): boolean {
  const pts = median.map(([x, y]) => ({ x, y }));
  if (pts.length < 2 || pathLength(pts) < 40) return false;
  const a = pointAtFrac(pts, 0.62);
  const b = pts[pts.length - 1];
  return a.x - b.x > 28;
}
