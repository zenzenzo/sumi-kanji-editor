import type { StrokeEdit } from "./edits";

export function curvePoint(stroke: StrokeEdit, segment: number, u: number): number[] {
  const a = stroke.points[segment];
  const b = stroke.points[segment + 1];
  const c = stroke.curves?.[segment];
  const v = 1 - u;
  return c
    ? [
        v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
        v * v * a[1] + 2 * v * u * c[1] + u * u * b[1],
      ]
    : [v * a[0] + u * b[0], v * a[1] + u * b[1]];
}

/** Samples are drawing geometry, never additional editable nodes. */
export function sampleStrokePath(stroke: StrokeEdit) {
  if (!stroke.points.length) return [];
  const out = [{ point: stroke.points[0], segment: 0, u: 0 }];
  for (let segment = 0; segment < stroke.points.length - 1; segment++) {
    const steps = stroke.curves?.[segment] ? 48 : 1;
    for (let i = 1; i <= steps; i++) {
      out.push({ point: curvePoint(stroke, segment, i / steps), segment, u: i / steps });
    }
  }
  return out;
}

/** Split a quadratic without changing its shape when a node is inserted. */
export function insertStrokePoint(stroke: StrokeEdit, segment: number, u: number) {
  const a = stroke.points[segment];
  const b = stroke.points[segment + 1];
  const c = stroke.curves?.[segment];
  const point = curvePoint(stroke, segment, u);
  if (stroke.curves) {
    const left = c ? [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u] : null;
    const right = c ? [c[0] + (b[0] - c[0]) * u, c[1] + (b[1] - c[1]) * u] : null;
    stroke.curves.splice(segment, 1, left, right);
  }
  stroke.points.splice(segment + 1, 0, point);
}

export function removeStrokePoint(stroke: StrokeEdit, index: number) {
  if (stroke.curves) {
    if (index === 0) stroke.curves.splice(0, 1);
    else if (index === stroke.points.length - 1) stroke.curves.splice(index - 1, 1);
    else stroke.curves.splice(index - 1, 2, null);
  }
  stroke.points.splice(index, 1);
}
