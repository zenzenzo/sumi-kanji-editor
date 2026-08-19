import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  glyphBounds,
  layoutCells,
  projectToCell,
  unprojectFromCell,
  type Cell,
} from "@/lib/brush/engine";
import {
  newPinId,
  PIN_META,
  type EditBook,
  type GlyphEdit,
  type PathPin,
  type PathTool,
  type PinKind,
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

  useEffect(() => {
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
    setDraft((prev) => {
      const edit = prev[char];
      if (edit) onCommit(edit);
      dirty.current = false;
      return prev;
    });
  }

  function updateStroke(char: string, si: number, fn: (s: GlyphEdit["strokes"][number]) => void) {
    setDraft((prev) => {
      const base = prev[char];
      if (!base) return prev;
      const next = cloneEdit(base);
      const stroke = next.strokes[si];
      if (!stroke) return prev;
      fn(stroke);
      dirty.current = true;
      return { ...prev, [char]: next };
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const p = svgPoint(e);
    if (!d || !p) return;
    const gi = glyphs.findIndex((g) => g.char === d.char);
    const cell = cells[gi];
    const bounds = boundsByChar[d.char];
    const edit = draft[d.char];
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

  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    if (d.type === "pin" && !d.moved) {
      const edit = draft[d.char];
      const pin = edit?.strokes[d.si]?.pins.find((p) => p.id === d.id);
      if (pin?.kind === "pressure") {
        setSlider({ char: d.char, si: d.si, id: d.id, x: d.x, y: d.y });
        return;
      }
    }
    queueMicrotask(() => commitChar(d.char));
  }

  function startPointDrag(e: React.PointerEvent, char: string, si: number, pi: number) {
    e.stopPropagation();
    setSlider(null);
    if (tool === "delete") {
      removePoint(char, si, pi);
      setSelected({ char, si });
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { type: "point", char, si, pi };
    setSelected({ char, si });
  }

  function startPinDrag(e: React.PointerEvent, char: string, si: number, id: string) {
    e.stopPropagation();
    setSlider(null);
    if (tool === "delete") {
      removePin(char, si, id);
      setSelected({ char, si });
      return;
    }
    const p = svgPoint(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { type: "pin", char, si, id, x: p?.x ?? 0, y: p?.y ?? 0, moved: false };
    setSelected({ char, si });
  }

  function onBgPointerDown(e: React.PointerEvent) {
    const p = svgPoint(e);
    if (!p) return;
    setSlider(null);
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
          if (tool === "pressure") near.pressure = near.pressure ?? 0.75;
        }
        return;
      }
      const pin: PathPin = {
        id: newPinId(),
        t: pick.hit.t,
        kind: tool as PinKind,
        pressure: tool === "pressure" ? 0.75 : undefined,
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
    updateStroke(char, si, (s) => {
      if (s.points.length > 2) s.points.splice(pi, 1);
    });
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
      <svg
        ref={svgRef}
        className="absolute inset-0 size-full touch-none"
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
            const d = views
              .map((v, i) => `${i === 0 ? "M" : "L"} ${v.x.toFixed(1)} ${v.y.toFixed(1)}`)
              .join(" ");
            const active = selected?.char === g.char && selected.si === si;
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
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "#a33b2b" : "#1c1814"}
                  strokeWidth={active ? 2.4 : 1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={active ? 0.95 : 0.45}
                />
                <path d={d} fill="none" stroke="transparent" strokeWidth={18} />
                {views[0] && (
                  <g transform={`translate(${views[0].x} ${views[0].y})`}>
                    <circle r={9} fill={active ? "#a33b2b" : "#1c1814"} />
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
                      stroke={active ? "#a33b2b" : "#1c1814"}
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
                          ? ` ${Math.round((pin.pressure ?? 0.75) * 100)}%`
                          : ""}
                      </title>
                    </g>
                  );
                })}
              </g>
            );
          });
        })}
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
            Pressure
            <span className="ml-2 font-mono tabular-nums text-ink">
              {Math.round((sliderPin.pressure ?? 0.75) * 100)}%
            </span>
          </p>
          <Slider
            className="mt-3"
            min={0.08}
            max={1}
            step={0.02}
            value={[sliderPin.pressure ?? 0.75]}
            onValueChange={(v) => setPinPressure(v[0] ?? 0.75)}
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
  if (kind === "ore") {
    return (
      <g>
        <path
          d="M -6 -6 H 6 V 6"
          fill="none"
          stroke="#a33b2b"
          strokeWidth={2.2}
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
      </g>
    );
  }
  if (kind === "sweep") {
    return <polygon points="-7,-6 -7,6 8,0" fill="#a33b2b" stroke="#efe6d4" strokeWidth={1.1} />;
  }
  if (kind === "stop") {
    return (
      <circle r={6.5} fill="#a33b2b" stroke="#efe6d4" strokeWidth={active ? 2 : 1.2} />
    );
  }
  if (kind === "lift") {
    return <polygon points="0,-8 7,6 -7,6" fill="#a33b2b" stroke="#efe6d4" strokeWidth={1.2} />;
  }
  const p = pressure ?? 0.75;
  return (
    <g>
      <circle r={7} fill="#efe6d4" stroke={active ? "#a33b2b" : "#1c1814"} strokeWidth={1.4} />
      <circle r={2.2 + 3.6 * p} fill="#1c1814" />
    </g>
  );
}
