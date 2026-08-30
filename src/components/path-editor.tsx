import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  glyphBounds,
  layoutCells,
  projectToCell,
  unprojectFromCell,
  type Cell,
} from "@/lib/brush/engine";
import { classifyStroke } from "@/lib/brush/geometry";
import {
  DEFAULT_PRESSURE_MULT,
  inferMode,
  modeAlongStroke,
  MODE_COLOR,
  newPinId,
  PIN_COLOR,
  PIN_META,
  PRESSURE_MULT_MAX,
  PRESSURE_MULT_MIN,
  type EditBook,
  type GlyphEdit,
  type PathPin,
  type PathTool,
  type PinKind,
  type StrokeMode,
} from "@/lib/brush/edits";
import type { GlyphData } from "@/lib/kanji/types";

type Props = {
  glyphs: GlyphData[];
  book: EditBook;
  tool: PathTool;
  onCommit: (edit: GlyphEdit) => void;
};

type Drag =
  | { type: "point"; char: string; si: number; pi: number }
  | { type: "pin"; char: string; si: number; id: string; x: number; y: number; moved: boolean };

type DrawState = { char: string; si: number; lastTime: number; lastX: number; lastY: number };

type SliderState = {
  char: string;
  si: number;
  id: string;
  x: number;
  y: number;
};

function clampPt(p: [number, number]): [number, number] {
  return [Math.max(-80, Math.min(1104, p[0])), Math.max(-80, Math.min(1104, p[1]))];
}

function pointAtT(
  views: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (!views.length) return { x: 0, y: 0 };
  if (views.length === 1) return views[0];
  const segs: number[] = [0];
  for (let i = 1; i < views.length; i++) {
    segs.push(segs[i - 1] + Math.hypot(views[i].x - views[i - 1].x, views[i].y - views[i - 1].y));
  }
  const total = segs[segs.length - 1] || 1;
  const target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < segs.length; i++) {
    if (target <= segs[i]) {
      const u = (target - segs[i - 1]) / Math.max(1e-4, segs[i] - segs[i - 1]);
      return {
        x: views[i - 1].x + (views[i].x - views[i - 1].x) * u,
        y: views[i - 1].y + (views[i].y - views[i - 1].y) * u,
      };
    }
  }
  return views[views.length - 1];
}

function vertexTs(views: { x: number; y: number }[]): number[] {
  const segs: number[] = [0];
  for (let i = 1; i < views.length; i++) {
    segs.push(segs[i - 1] + Math.hypot(views[i].x - views[i - 1].x, views[i].y - views[i - 1].y));
  }
  const total = segs[segs.length - 1] || 1;
  return segs.map((s) => s / total);
}

function coloredSegments(
  views: { x: number; y: number }[],
  pins: PathPin[],
  inferred: StrokeMode,
): { d: string; color: string }[] {
  const ts = vertexTs(views);
  const cuts = [0, ...pins.filter((p) => p.kind !== "pressure" && p.kind !== "ore").map((p) => p.t), 1].sort(
    (a, b) => a - b,
  );
  const unique: number[] = [];
  for (const t of cuts) {
    if (!unique.length || t - unique[unique.length - 1] > 1e-4) unique.push(t);
  }
  const out: { d: string; color: string }[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const a = unique[i];
    const b = unique[i + 1];
    const pts = [pointAtT(views, a)];
    for (let j = 1; j < views.length - 1; j++) {
      if (ts[j] > a + 1e-4 && ts[j] < b - 1e-4) pts.push(views[j]);
    }
    pts.push(pointAtT(views, b));
    const d = pts
      .map((v, k) => `${k === 0 ? "M" : "L"} ${v.x.toFixed(1)} ${v.y.toFixed(1)}`)
      .join(" ");
    const mode = modeAlongStroke(a + 1e-4, pins, inferred);
    out.push({ d, color: MODE_COLOR[mode] ?? MODE_COLOR.auto });
  }
  return out;
}

function nearestOnStroke(
  points: number[][],
  cell: Cell,
  bounds: ReturnType<typeof glyphBounds>,
  x: number,
  y: number,
): { t: number; point: [number, number]; seg: number; d: number } | null {
  if (points.length < 2) return null;
  const views = points.map((p) => projectToCell(p as [number, number], cell, bounds));
  let best = { t: 0, point: [points[0][0], points[0][1]] as [number, number], seg: 0, d: Infinity };
  const lens: number[] = [0];
  for (let i = 1; i < views.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(views[i].x - views[i - 1].x, views[i].y - views[i - 1].y));
  }
  const total = lens[lens.length - 1] || 1;
  for (let i = 0; i < views.length - 1; i++) {
    const a = views[i];
    const b = views[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
    const px = a.x + abx * u;
    const py = a.y + aby * u;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) {
      const t = (lens[i] + u * (lens[i + 1] - lens[i])) / total;
      best = { t, point: unprojectFromCell(px, py, cell, bounds), seg: i, d };
    }
  }
  return best;
}

function cloneEdit(edit: GlyphEdit): GlyphEdit {
  return {
    char: edit.char,
    custom: edit.custom,
    strokes: edit.strokes.map((s) => ({
      points: s.points.map((p) => [p[0], p[1]]),
      pins: s.pins.map((p) => ({ ...p })),
    })),
  };
}

export function PathEditor({ glyphs, book, tool, onCommit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<EditBook>(book);
  const [selected, setSelected] = useState<{ char: string; si: number } | null>(null);
  const [slider, setSlider] = useState<SliderState | null>(null);
  const drag = useRef<Drag | null>(null);
  const dirty = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const drawing = useRef<DrawState | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Raw pointermove can fire far faster than the display refresh rate (some
  // pens/trackpads report well past 60Hz). Coalesce to at most one draft
  // update — and one re-render of the whole path SVG — per animation frame.
  const pendingPoint = useRef<{ x: number; y: number } | null>(null);
  const moveRaf = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (moveRaf.current != null) cancelAnimationFrame(moveRaf.current);
    };
  }, []);

  useEffect(() => {
    if (drag.current) return;
    setDraft(book);
  }, [book]);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cells = useMemo(
    () => (size.w > 0 ? layoutCells(glyphs.length, size.w, size.h) : []),
    [glyphs.length, size.w, size.h],
  );

  const boundsByChar = useMemo(() => {
    const map: Record<string, ReturnType<typeof glyphBounds>> = {};
    for (const g of glyphs) map[g.char] = glyphBounds(g.medians);
    return map;
  }, [glyphs]);

  function svgPoint(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function commitChar(char: string) {
    const edit = draftRef.current[char];
    if (edit) onCommit(edit);
    dirty.current = false;
  }

  function capture(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  /**
   * Applies `fn` to a single stroke. This runs on every pointermove while
   * dragging, so it only clones the touched stroke (points + pins) rather
   * than every stroke of the character — the other strokes' objects keep
   * their identity, they're just carried over by reference.
   */
  function updateStroke(char: string, si: number, fn: (s: GlyphEdit["strokes"][number]) => void) {
    setDraft((prev) => {
      const base = prev[char];
      const baseStroke = base?.strokes[si];
      if (!base || !baseStroke) return prev;
      const nextStroke: GlyphEdit["strokes"][number] = {
        points: baseStroke.points.map((p) => [p[0], p[1]]),
        pins: baseStroke.pins.map((p) => ({ ...p })),
      };
      fn(nextStroke);
      const strokes = base.strokes.slice();
      strokes[si] = nextStroke;
      const next: GlyphEdit = { char: base.char, custom: base.custom, strokes };
      dirty.current = true;
      const book = { ...prev, [char]: next };
      draftRef.current = book;
      return book;
    });
  }

  function glyphAt(x: number, y: number): { char: string; gi: number } | null {
    for (let gi = 0; gi < glyphs.length; gi++) {
      const cell = cells[gi];
      if (!cell) continue;
      if (x >= cell.x && y >= cell.y && x <= cell.x + cell.w && y <= cell.y + cell.h) {
        return { char: glyphs[gi].char, gi };
      }
    }
    if (selected) {
      const gi = glyphs.findIndex((g) => g.char === selected.char);
      if (gi >= 0) return { char: selected.char, gi };
    }
    return glyphs[0] ? { char: glyphs[0].char, gi: 0 } : null;
  }

  function finishDraw(commit: boolean) {
    const d = drawing.current;
    drawing.current = null;
    setCursor(null);
    if (!d) return;
    const stroke = draftRef.current[d.char]?.strokes[d.si];
    if (!stroke || stroke.points.length < 2) {
      setDraft((prev) => {
        const base = prev[d.char];
        if (!base) return prev;
        const next = cloneEdit(base);
        next.strokes.splice(d.si, 1);
        const book = { ...prev, [d.char]: next };
        draftRef.current = book;
        return book;
      });
      return;
    }
    if (commit) commitChar(d.char);
  }

  function handleDrawClick(p: { x: number; y: number }) {
    const now = performance.now();
    const d = drawing.current;
    const isDouble =
      !!d && now - d.lastTime < 360 && Math.hypot(p.x - d.lastX, p.y - d.lastY) < 12;
    if (d && isDouble) {
      const gi = glyphs.findIndex((g) => g.char === d.char);
      const cell = cells[gi];
      const bounds = boundsByChar[d.char];
      if (cell && bounds) {
        const pt = clampPt(unprojectFromCell(p.x, p.y, cell, bounds));
        updateStroke(d.char, d.si, (s) => {
          const last = s.points[s.points.length - 1];
          if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 8) s.points.push(pt);
        });
      }
      queueMicrotask(() => finishDraw(true));
      return;
    }
    if (!d) {
      const hit = glyphAt(p.x, p.y);
      if (!hit) return;
      const cell = cells[hit.gi];
      const bounds = boundsByChar[hit.char];
      if (!cell || !bounds) return;
      const pt = clampPt(unprojectFromCell(p.x, p.y, cell, bounds));
      setDraft((prev) => {
        const base = prev[hit.char];
        if (!base) return prev;
        const next = cloneEdit(base);
        next.strokes.push({ points: [pt], pins: [] });
        drawing.current = {
          char: hit.char,
          si: next.strokes.length - 1,
          lastTime: now,
          lastX: p.x,
          lastY: p.y,
        };
        setSelected({ char: hit.char, si: next.strokes.length - 1 });
        const book = { ...prev, [hit.char]: next };
        draftRef.current = book;
        return book;
      });
      return;
    }
    const gi = glyphs.findIndex((g) => g.char === d.char);
    const cell = cells[gi];
    const bounds = boundsByChar[d.char];
    if (!cell || !bounds) return;
    const pt = clampPt(unprojectFromCell(p.x, p.y, cell, bounds));
    updateStroke(d.char, d.si, (s) => {
      s.points.push(pt);
    });
    d.lastTime = now;
    d.lastX = p.x;
    d.lastY = p.y;
  }

  useEffect(() => {
    if (tool !== "draw" && drawing.current) finishDraw(false);
  }, [tool]);

  /** Applies one resolved pointer position to whatever is currently dragging/drawing. */
  function applyPointerMove(p: { x: number; y: number }) {
    if (tool === "draw" && drawing.current && !drag.current) {
      setCursor(p);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const gi = glyphs.findIndex((g) => g.char === d.char);
    const cell = cells[gi];
    const bounds = boundsByChar[d.char];
    const edit = draftRef.current[d.char];
    if (!cell || !edit || !bounds) return;
    if (d.type === "point") {
      updateStroke(d.char, d.si, (s) => {
        s.points[d.pi] = clampPt(unprojectFromCell(p.x, p.y, cell, bounds));
      });
    } else {
      if (Math.hypot(p.x - d.x, p.y - d.y) > 4) d.moved = true;
      const stroke = edit.strokes[d.si];
      const hit = stroke ? nearestOnStroke(stroke.points, cell, bounds, p.x, p.y) : null;
      if (!hit) return;
      updateStroke(d.char, d.si, (s) => {
        const pin = s.pins.find((x) => x.id === d.id);
        if (pin) pin.t = hit.t;
      });
    }
  }

  function flushPendingMove() {
    moveRaf.current = null;
    const p = pendingPoint.current;
    pendingPoint.current = null;
    if (p) applyPointerMove(p);
  }

  function onPointerMove(e: React.PointerEvent) {
    // Nothing to do unless we're actively dragging or mid-draw — skip the
    // SVG point math entirely for idle hover moves.
    if (!drag.current && !(tool === "draw" && drawing.current)) return;
    const p = svgPoint(e);
    if (!p) return;
    pendingPoint.current = p;
    if (moveRaf.current == null) {
      moveRaf.current = requestAnimationFrame(flushPendingMove);
    }
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    svgRef.current?.releasePointerCapture(e.pointerId);
    // Make sure the last queued move (up to one frame's worth) isn't lost.
    if (moveRaf.current != null) {
      cancelAnimationFrame(moveRaf.current);
      moveRaf.current = null;
    }
    if (pendingPoint.current) {
      const p = pendingPoint.current;
      pendingPoint.current = null;
      applyPointerMove(p);
    }
    drag.current = null;
    if (d.type === "pin" && !d.moved) {
      const edit = draftRef.current[d.char];
      const pin = edit?.strokes[d.si]?.pins.find((p) => p.id === d.id);
      if (pin?.kind === "pressure") {
        setSlider({ char: d.char, si: d.si, id: d.id, x: d.x, y: d.y });
        return;
      }
    }
    commitChar(d.char);
  }

  function startPointDrag(e: React.PointerEvent, char: string, si: number, pi: number) {
    e.stopPropagation();
    setSlider(null);
    if (tool === "draw") {
      const p = svgPoint(e);
      if (p) handleDrawClick(p);
      return;
    }
    if (tool === "delete") {
      removePoint(char, si, pi);
      setSelected({ char, si });
      return;
    }
    e.preventDefault();
    capture(e);
    drag.current = { type: "point", char, si, pi };
    setSelected({ char, si });
  }

  function startPinDrag(e: React.PointerEvent, char: string, si: number, id: string) {
    e.stopPropagation();
    setSlider(null);
    if (tool === "draw") {
      const pt = svgPoint(e);
      if (pt) handleDrawClick(pt);
      return;
    }
    if (tool === "delete") {
      removePin(char, si, id);
      setSelected({ char, si });
      return;
    }
    e.preventDefault();
    const p = svgPoint(e);
    capture(e);
    drag.current = { type: "pin", char, si, id, x: p?.x ?? 0, y: p?.y ?? 0, moved: false };
    setSelected({ char, si });
  }

  function onBgPointerDown(e: React.PointerEvent) {
    const p = svgPoint(e);
    if (!p) return;
    setSlider(null);
    if (tool === "draw") {
      e.preventDefault();
      handleDrawClick(p);
      return;
    }
    type Hit = { char: string; si: number; hit: NonNullable<ReturnType<typeof nearestOnStroke>> };
    let best: Hit | null = null;
    for (let gi = 0; gi < glyphs.length; gi++) {
      const g = glyphs[gi];
      const cell = cells[gi];
      const bounds = boundsByChar[g.char];
      const edit = draft[g.char];
      if (!cell || !edit || !bounds) continue;
      for (let si = 0; si < edit.strokes.length; si++) {
        const stroke = edit.strokes[si];
        const hit = nearestOnStroke(stroke.points, cell, bounds, p.x, p.y);
        if (!hit || hit.d > 16) continue;
        if (!best || hit.d < best.hit.d) best = { char: g.char, si, hit };
      }
    }
    if (!best) {
      setSelected(null);
      return;
    }
    const pick = best;
    setSelected({ char: pick.char, si: pick.si });
    if (tool === "delete") {
      type NodeHit = { char: string; si: number; pi: number; d: number };
      let node: NodeHit | null = null;
      for (let gi = 0; gi < glyphs.length; gi++) {
        const g = glyphs[gi];
        const cell = cells[gi];
        const bounds = boundsByChar[g.char];
        const edit = draft[g.char];
        if (!cell || !edit || !bounds) continue;
        for (let si = 0; si < edit.strokes.length; si++) {
          edit.strokes[si].points.forEach((pt, pi) => {
            const v = projectToCell(pt as [number, number], cell, bounds);
            const d = Math.hypot(p.x - v.x, p.y - v.y);
            if (d > 16) return;
            if (!node || d < node.d) node = { char: g.char, si, pi, d };
          });
        }
      }
      if (node) {
        const hit = node as NodeHit;
        setSelected({ char: hit.char, si: hit.si });
        removePoint(hit.char, hit.si, hit.pi);
      }
      return;
    }
    if (tool === "move") {
      if (pick.hit.d < 10) {
        updateStroke(pick.char, pick.si, (s) => {
          s.points.splice(pick.hit.seg + 1, 0, pick.hit.point);
        });
        queueMicrotask(() => commitChar(pick.char));
      }
      return;
    }
    let opened: SliderState | null = null;
    updateStroke(pick.char, pick.si, (s) => {
      const near = s.pins.find((pin) => Math.abs(pin.t - pick.hit.t) < 0.04);
      if (near) {
        if (near.kind === tool) s.pins = s.pins.filter((pin) => pin.id !== near.id);
        else {
          near.kind = tool;
          if (tool === "pressure") near.pressure = near.pressure ?? DEFAULT_PRESSURE_MULT;
        }
        return;
      }
      const pin: PathPin = {
        id: newPinId(),
        t: pick.hit.t,
        kind: tool as PinKind,
        pressure: tool === "pressure" ? DEFAULT_PRESSURE_MULT : undefined,
      };
      s.pins.push(pin);
      if (tool === "pressure") {
        opened = { char: pick.char, si: pick.si, id: pin.id, x: p.x, y: p.y };
      }
    });
    queueMicrotask(() => {
      commitChar(pick.char);
      if (opened) setSlider(opened);
    });
  }

  function setPinPressure(value: number) {
    if (!slider) return;
    updateStroke(slider.char, slider.si, (s) => {
      const pin = s.pins.find((p) => p.id === slider.id);
      if (pin) pin.pressure = value;
    });
  }

  function commitSlider() {
    if (!slider) return;
    commitChar(slider.char);
  }

  function removePin(char: string, si: number, id: string) {
    if (slider?.id === id) setSlider(null);
    updateStroke(char, si, (s) => {
      s.pins = s.pins.filter((p) => p.id !== id);
    });
    queueMicrotask(() => commitChar(char));
  }

  function removePoint(char: string, si: number, pi: number) {
    const stroke = draftRef.current[char]?.strokes[si];
    const dropStroke = !stroke || stroke.points.length <= 2;
    setDraft((prev) => {
      const base = prev[char];
      if (!base) return prev;
      const next = cloneEdit(base);
      const s = next.strokes[si];
      if (!s) return prev;
      if (s.points.length <= 2) {
        next.strokes.splice(si, 1);
        next.custom = true;
      } else {
        s.points.splice(pi, 1);
      }
      dirty.current = true;
      const book = { ...prev, [char]: next };
      draftRef.current = book;
      return book;
    });
    if (dropStroke) {
      if (slider?.char === char && slider.si === si) setSlider(null);
      else if (slider?.char === char && slider.si > si) {
        setSlider({ ...slider, si: slider.si - 1 });
      }
      setSelected((sel) => {
        if (!sel || sel.char !== char) return sel;
        if (sel.si === si) return null;
        if (sel.si > si) return { char, si: sel.si - 1 };
        return sel;
      });
    }
    queueMicrotask(() => commitChar(char));
  }

  const sliderPin = slider
    ? draft[slider.char]?.strokes[slider.si]?.pins.find((p) => p.id === slider.id)
    : null;

  if (size.w <= 0) {
    return <svg ref={svgRef} className="absolute inset-0 size-full" />;
  }

  return (
    <>
      {tool === "draw" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-1.5 text-center text-[0.72rem] tracking-wide text-paper shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
          Click to place nodes · Double-click to place the final node
        </div>
      )}
      <svg
        ref={svgRef}
        className="absolute inset-0 size-full touch-none"
        style={{ touchAction: "none" }}
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {glyphs.map((g, gi) => {
          const cell = cells[gi];
          const bounds = boundsByChar[g.char];
          const edit = draft[g.char];
          if (!cell || !edit || !bounds) return null;
          return edit.strokes.map((stroke, si) => {
            const views = stroke.points.map((pt) => projectToCell(pt as [number, number], cell, bounds));
            const inferred = inferMode(stroke.points, classifyStroke(stroke.points));
            const segs = coloredSegments(views, stroke.pins, inferred);
            const hitD = views
              .map((v, i) => `${i === 0 ? "M" : "L"} ${v.x.toFixed(1)} ${v.y.toFixed(1)}`)
              .join(" ");
            const active = selected?.char === g.char && selected.si === si;
            const startColor = MODE_COLOR[modeAlongStroke(0, stroke.pins, inferred)];
            const pinAt = (pin: PathPin) => {
              const segs: number[] = [0];
              for (let i = 1; i < views.length; i++) {
                segs.push(
                  segs[i - 1] + Math.hypot(views[i].x - views[i - 1].x, views[i].y - views[i - 1].y),
                );
              }
              const total = segs[segs.length - 1] || 1;
              const target = pin.t * total;
              for (let i = 1; i < segs.length; i++) {
                if (target <= segs[i]) {
                  const u = (target - segs[i - 1]) / Math.max(1e-4, segs[i] - segs[i - 1]);
                  return {
                    x: views[i - 1].x + (views[i].x - views[i - 1].x) * u,
                    y: views[i - 1].y + (views[i].y - views[i - 1].y) * u,
                  };
                }
              }
              return views[views.length - 1];
            };
            return (
              <g key={`${g.char}-${si}`}>
                {segs.map((seg, i) => (
                  <path
                    key={i}
                    d={seg.d}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={active ? 2.6 : 1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={active ? 0.95 : 0.72}
                  />
                ))}
                <path d={hitD} fill="none" stroke="transparent" strokeWidth={18} />
                {views[0] && (
                  <g transform={`translate(${views[0].x} ${views[0].y})`}>
                    <circle r={9} fill={startColor} />
                    <text
                      textAnchor="middle"
                      y={4}
                      fill="#efe6d4"
                      fontSize={10}
                      fontFamily="var(--font-sans)"
                      style={{ pointerEvents: "none" }}
                    >
                      {si + 1}
                    </text>
                  </g>
                )}
                {views.map((v, pi) => (
                  <g key={pi}>
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={14}
                      fill="transparent"
                      onPointerDown={(e) => startPointDrag(e, g.char, si, pi)}
                    />
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={active ? 5 : 3.5}
                      fill="#efe6d4"
                      stroke={active ? startColor : "#1c1814"}
                      strokeWidth={1.4}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                ))}
                {stroke.pins.map((pin) => {
                  const at = pinAt(pin);
                  const open = slider?.id === pin.id;
                  return (
                    <g
                      key={pin.id}
                      transform={`translate(${at.x} ${at.y})`}
                      onPointerDown={(e) => startPinDrag(e, g.char, si, pin.id)}
                      style={{ cursor: tool === "delete" ? "pointer" : "grab" }}
                    >
                      <circle r={16} fill="transparent" />
                      <PinMark kind={pin.kind} pressure={pin.pressure} active={open} />
                      <title>
                        {PIN_META[pin.kind].ja} {PIN_META[pin.kind].label}
                        {pin.kind === "pressure"
                          ? ` ×${(pin.pressure ?? DEFAULT_PRESSURE_MULT).toFixed(2)}`
                          : ""}
                      </title>
                    </g>
                  );
                })}
              </g>
            );
          });
        })}
        {(() => {
          const d = drawing.current;
          if (!d || !cursor) return null;
          const gi = glyphs.findIndex((g) => g.char === d.char);
          const cell = cells[gi];
          const bounds = boundsByChar[d.char];
          const stroke = draft[d.char]?.strokes[d.si];
          const last = stroke?.points[stroke.points.length - 1];
          if (!cell || !bounds || !last) return null;
          const a = projectToCell(last as [number, number], cell, bounds);
          return (
            <line
              x1={a.x}
              y1={a.y}
              x2={cursor.x}
              y2={cursor.y}
              stroke="#6f6860"
              strokeWidth={1.4}
              strokeDasharray="5 4"
              opacity={0.7}
            />
          );
        })()}
      </svg>
      {slider && sliderPin && (
        <div
          className="absolute z-20 w-44 rounded-[var(--radius-md)] bg-paper p-3 text-ink shadow-[0_12px_28px_rgba(0,0,0,0.22)] ring-1 ring-ink/10"
          style={{
            left: Math.max(8, Math.min(size.w - 184, slider.x + 14)),
            top: Math.max(8, Math.min(size.h - 88, slider.y - 16)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs tracking-[0.14em] text-ink-soft uppercase">
            Multiplier
            <span className="ml-2 font-mono tabular-nums text-ink">
              {(sliderPin.pressure ?? DEFAULT_PRESSURE_MULT).toFixed(2)}×
            </span>
          </p>
          <Slider
            className="mt-3"
            min={PRESSURE_MULT_MIN}
            max={PRESSURE_MULT_MAX}
            step={0.05}
            value={[sliderPin.pressure ?? DEFAULT_PRESSURE_MULT]}
            onValueChange={(v) => setPinPressure(v[0] ?? DEFAULT_PRESSURE_MULT)}
            onValueCommit={commitSlider}
          />
        </div>
      )}
    </>
  );
}

function PinMark({
  kind,
  pressure,
  active,
}: {
  kind: PinKind;
  pressure?: number;
  active?: boolean;
}) {
  const ink = PIN_COLOR[kind];
  if (kind === "soku") {
    return <circle r={5.5} fill={ink} stroke="#efe6d4" strokeWidth={1.1} />;
  }
  if (kind === "hane") {
    return <path d="M -5 6 L -5 -4 L 6 -4" fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="square" />;
  }
  if (kind === "saku") {
    return <line x1={-6} y1={6} x2={6} y2={-6} stroke={ink} strokeWidth={2.4} strokeLinecap="round" />;
  }
  if (kind === "peck") {
    return <polygon points="6,-5 6,5 -5,0" fill={ink} stroke="#efe6d4" strokeWidth={1.1} />;
  }
  if (kind === "horizontal") {
    return (
      <g>
        <line x1={-8} y1={0} x2={8} y2={0} stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    );
  }
  if (kind === "vertical") {
    return (
      <g>
        <line x1={0} y1={-8} x2={0} y2={8} stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    );
  }
  if (kind === "ore") {
    return (
      <g>
        <path
          d="M -6 -6 H 6 V 6"
          fill="none"
          stroke={ink}
          strokeWidth={2.2}
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
      </g>
    );
  }
  if (kind === "ryaku") {
    return <polygon points="8,-6 8,6 -7,0" fill={ink} stroke="#efe6d4" strokeWidth={1.1} />;
  }
  if (kind === "sweep") {
    return <polygon points="-7,-6 -7,6 8,0" fill={ink} stroke="#efe6d4" strokeWidth={1.1} />;
  }
  if (kind === "stop") {
    return (
      <circle r={6.5} fill={ink} stroke="#efe6d4" strokeWidth={active ? 2 : 1.2} />
    );
  }
  if (kind === "lift") {
    return <polygon points="0,-8 7,6 -7,6" fill={ink} stroke="#efe6d4" strokeWidth={1.2} />;
  }
  const p = pressure ?? DEFAULT_PRESSURE_MULT;
  const r = 2.2 + 2.2 * Math.min(2, p);
  return (
    <g>
      <circle r={7} fill="#efe6d4" stroke={active ? ink : "#1c1814"} strokeWidth={1.4} />
      <circle r={r} fill={ink} />
    </g>
  );
}
