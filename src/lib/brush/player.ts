import type { BrushSettings, GlyphData } from "@/lib/kanji/types";
import { BristleSim } from "./bristles";
import {
  layoutCells,
  paintGhost,
  paintGrid,
  paintSeal,
  prepareGlyph,
  simulateStrokeRange,
  tuftRadius,
  type PreparedGlyph,
} from "./engine";
import type { EditBook } from "./edits";
import { DEFAULT_BRUSH } from "./settings";
import { WetPaper } from "./wet";

export type PlayerSnapshot = {
  playing: boolean;
  done: boolean;
  strokeIndex: number;
  strokeTotal: number;
  glyphIndex: number;
  glyphTotal: number;
};

export type PlayerOptions = {
  canvas: HTMLCanvasElement;
  glyphs: GlyphData[];
  paper: HTMLImageElement | null;
  colors: {
    paper: string;
    ink: string;
    grid: string;
    ghost: string;
    seal: string;
  };
  showGrid: boolean;
  showGhost: boolean;
  settings: BrushSettings;
  edits?: EditBook;
  speed: number;
  reducedMotion: boolean;
  onUpdate?: (s: PlayerSnapshot) => void;
  /** Pin the drawing surface (used for GIF export). */
  fixedSize?: { w: number; h: number; dpr?: number };
};

type Step =
  | { type: "stroke"; gi: number; si: number; duration: number }
  | { type: "pause"; gi: number; si: number; duration: number }
  | { type: "seal"; duration: number };

export class BrushPlayer {
  private canvas: HTMLCanvasElement;
  private glyphs: PreparedGlyph[] = [];
  private raw: GlyphData[] = [];
  private colors: PlayerOptions["colors"];
  private paper: HTMLImageElement | null;
  private showGrid: boolean;
  private showGhost: boolean;
  private settings: BrushSettings;
  private edits: EditBook = {};
  private speed: number;
  private onUpdate?: (s: PlayerSnapshot) => void;

  private steps: Step[] = [];
  private stepIndex = 0;
  private stepT = 0;
  private playing = false;
  private done = false;
  private sealAlpha = 0;
  private raf = 0;
  private lastTs = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private fixedSize: { w: number; h: number; dpr?: number } | null = null;

  // Cached paper texture + vignette so paintPaper() doesn't rebuild a
  // radial gradient and redraw dozens of tiled drawImage calls every frame.
  private paperLayer: HTMLCanvasElement | null = null;
  private paperLayerW = 0;
  private paperLayerH = 0;
  private paperLayerDpr = 0;
  private vignette: CanvasGradient | null = null;
  private vignetteW = 0;
  private vignetteH = 0;

  private wet = new WetPaper();
  private sim: BristleSim;
  private simStepIndex = 0;
  private lastSample = -1;

  constructor(opts: PlayerOptions) {
    this.canvas = opts.canvas;
    this.raw = opts.glyphs;
    this.colors = opts.colors;
    this.paper = opts.paper;
    this.showGrid = opts.showGrid;
    this.showGhost = opts.showGhost;
    this.settings = opts.settings ?? DEFAULT_BRUSH;
    this.edits = opts.edits ?? {};
    this.speed = opts.speed;
    this.onUpdate = opts.onUpdate;
    this.fixedSize = opts.fixedSize ?? null;
    this.sim = new BristleSim(this.settings, this.colors.ink);
    this.resize();
    this.rebuild();
    if (opts.reducedMotion) {
      this.finish();
    } else {
      this.emit();
      this.draw();
    }
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.25, speed);
  }

  setShowGrid(v: boolean) {
    this.showGrid = v;
    this.draw();
  }

  setShowGhost(v: boolean) {
    this.showGhost = v;
    this.draw();
  }

  setEdits(edits: EditBook) {
    this.edits = edits;
    this.rebuild();
    this.play();
  }

  setSettings(settings: BrushSettings) {
    const structural =
      Math.round(settings.bristles) !== Math.round(this.settings.bristles) ||
      settings.size !== this.settings.size ||
      settings.wetness !== this.settings.wetness ||
      settings.stiffness !== this.settings.stiffness ||
      settings.splay !== this.settings.splay ||
      settings.softness !== this.settings.softness;
    this.settings = settings;
    const cell = this.glyphs[0]?.cell;
    const radius = cell ? tuftRadius(cell, settings.size) : 12;
    this.sim.setSettings(settings, radius);
    this.sim.setInk(this.colors.ink);
    if (structural) this.resimulateToCursor();
    this.draw();
  }

  resize(): boolean {
    const parent = this.canvas.parentElement;
    const cssW = this.fixedSize?.w ?? Math.max(1, parent?.clientWidth ?? 640);
    const cssH = this.fixedSize?.h ?? Math.max(1, parent?.clientHeight ?? 640);
    const dpr = this.fixedSize
      ? (this.fixedSize.dpr ?? 1)
      : Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.max(1, Math.round(cssW * dpr));
    const nextH = Math.max(1, Math.round(cssH * dpr));
    if (
      cssW === this.width &&
      cssH === this.height &&
      this.canvas.width === nextW &&
      this.canvas.height === nextH
    ) {
      return false;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = nextW;
    this.canvas.height = nextH;
    const ctx = this.canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.wet.resize(cssW, cssH, dpr);
    return true;
  }

  relayout() {
    const sizeChanged = this.resize();
    if (sizeChanged) {
      const idx = this.stepIndex;
      const t = this.stepT;
      const done = this.done;
      const seal = this.sealAlpha;
      this.rebuild();
      this.stepIndex = Math.min(idx, this.steps.length);
      this.stepT = t;
      this.done = done;
      this.sealAlpha = seal;
      this.resimulateToCursor();
    }
    this.draw();
  }

  private rebuild() {
    const cells = layoutCells(this.raw.length, this.width, this.height);
    this.glyphs = this.raw.map((g, i) =>
      prepareGlyph(g.char, g.medians, g.strokes, cells[i]!, this.edits[g.char]),
    );
    this.steps = [];
    this.glyphs.forEach((g, gi) => {
      g.strokes.forEach((s, si) => {
        this.steps.push({ type: "stroke", gi, si, duration: s.duration });
        this.steps.push({
          type: "pause",
          gi,
          si,
          duration: si === g.strokes.length - 1 ? 240 : 160,
        });
      });
    });
    if (this.glyphs.length) this.steps.push({ type: "seal", duration: 520 });
    this.stepIndex = 0;
    this.stepT = 0;
    this.done = false;
    this.sealAlpha = 0;
    this.simStepIndex = 0;
    this.lastSample = -1;
    this.sim.reset();
    this.clearInk();
    const cell = this.glyphs[0]?.cell;
    if (cell) this.sim.setSettings(this.settings, tuftRadius(cell, this.settings.size));
  }

  play() {
    if (this.done) {
      this.replay();
      return;
    }
    if (this.playing) return;
    this.playing = true;
    this.lastTs = 0;
    this.emit();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  replay() {
    this.stepIndex = 0;
    this.stepT = 0;
    this.done = false;
    this.sealAlpha = 0;
    this.simStepIndex = 0;
    this.lastSample = -1;
    this.sim.reset();
    this.clearInk();
    this.playing = true;
    this.lastTs = 0;
    this.emit();
    this.draw();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  stepStroke() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    const cur = this.steps[this.stepIndex];
    if (cur?.type === "stroke" && this.stepT < 1) {
      this.stepT = 1;
      this.catchUp();
    } else {
      this.stepIndex += 1;
      while (this.stepIndex < this.steps.length && this.steps[this.stepIndex].type !== "stroke") {
        if (this.steps[this.stepIndex].type === "seal") {
          this.sealAlpha = 1;
          this.done = true;
          this.stepIndex = this.steps.length;
          break;
        }
        this.stepIndex += 1;
      }
      if (this.stepIndex >= this.steps.length) {
        this.done = true;
        this.sealAlpha = 1;
      } else {
        this.stepT = 1;
        this.catchUp();
      }
    }
    this.draw();
    this.emit();
  }

  finish() {
    this.playing = false;
    this.stepIndex = this.steps.length;
    this.stepT = 1;
    this.done = true;
    this.sealAlpha = 1;
    cancelAnimationFrame(this.raf);
    this.resimulateToCursor();
    this.draw();
    this.emit();
  }

  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  /** Rewind without starting playback. */
  rewind() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stepIndex = 0;
    this.stepT = 0;
    this.done = false;
    this.sealAlpha = 0;
    this.simStepIndex = 0;
    this.lastSample = -1;
    this.sim.reset();
    this.clearInk();
    this.draw();
    this.emit();
  }

  /**
   * Advance the clock by `ms` of animation time (speed is the caller's job).
   * Returns false when the piece is finished.
   */
  tickMs(ms: number): boolean {
    const step = this.steps[this.stepIndex];
    if (!step) {
      this.playing = false;
      this.done = true;
      this.sealAlpha = 1;
      this.draw();
      return false;
    }
    this.stepT += ms / Math.max(16, step.duration);
    if (step.type === "seal") this.sealAlpha = Math.min(1, this.stepT);
    if (this.stepT >= 1) {
      this.stepT = 0;
      this.stepIndex += 1;
      if (this.stepIndex >= this.steps.length) {
        this.playing = false;
        this.done = true;
        this.sealAlpha = 1;
      }
    }
    this.catchUp();
    this.draw();
    return !this.done;
  }

  readPixels(): ImageData {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return new ImageData(1, 1);
    return ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  pixelSize(): { w: number; h: number } {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  private tick = (ts: number) => {
    if (!this.playing) return;
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(50, ts - this.lastTs) * this.speed;
    this.lastTs = ts;

    const step = this.steps[this.stepIndex];
    if (!step) {
      this.playing = false;
      this.done = true;
      this.sealAlpha = 1;
      this.draw();
      this.emit();
      return;
    }

    this.stepT += dt / Math.max(16, step.duration);
    if (step.type === "seal") {
      this.sealAlpha = Math.min(1, this.stepT);
    }
    if (this.stepT >= 1) {
      this.stepT = 0;
      this.stepIndex += 1;
      if (this.stepIndex >= this.steps.length) {
        this.playing = false;
        this.done = true;
        this.sealAlpha = 1;
      }
    }
    this.catchUp();
    this.draw();
    this.emit();
    if (this.playing) this.raf = requestAnimationFrame(this.tick);
  };

  private catchUp() {
    const target = Math.min(this.stepIndex, this.steps.length);
    while (this.simStepIndex < target) {
      this.runStepTo(this.simStepIndex, 1);
      this.simStepIndex += 1;
      this.lastSample = -1;
      this.sim.reset();
    }

    const live = this.steps[this.stepIndex];
    if (live?.type === "stroke") {
      this.runStepTo(this.stepIndex, this.stepT);
    }
  }

  private runStepTo(stepIndex: number, t: number) {
    const step = this.steps[stepIndex];
    if (!step || step.type !== "stroke") return;
    const stroke = this.glyphs[step.gi]?.strokes[step.si];
    const cell = this.glyphs[step.gi]?.cell;
    if (!stroke || !cell) return;
    const toIdx = this.sampleIndexAt(stroke, t);
    const fromIdx = this.lastSample + 1;
    if (toIdx < fromIdx) return;
    simulateStrokeRange(this.sim, this.wet, stroke, fromIdx, toIdx, this.settings, cell);
    this.lastSample = toIdx;
  }

  private sampleIndexAt(stroke: PreparedGlyph["strokes"][number], t: number): number {
    const samples = stroke.samples;
    if (!samples.length) return -1;
    if (t >= 1) return samples.length - 1;
    let idx = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].t <= t) idx = i;
      else break;
    }
    return idx;
  }

  private resimulateToCursor() {
    this.sim.reset();
    this.clearInk();
    this.simStepIndex = 0;
    this.lastSample = -1;
    this.catchUp();
  }

  private clearInk() {
    this.wet.clear();
  }

  private snapshot(): PlayerSnapshot {
    let strokeIndex = 0;
    let strokeTotal = 0;
    let glyphIndex = 0;
    for (const g of this.glyphs) strokeTotal += g.strokes.length;
    const step = this.steps[Math.min(this.stepIndex, Math.max(0, this.steps.length - 1))];
    if (step && (step.type === "stroke" || step.type === "pause")) {
      glyphIndex = step.gi;
      strokeIndex =
        this.glyphs.slice(0, step.gi).reduce((n, g) => n + g.strokes.length, 0) + step.si;
    } else if (this.done) {
      strokeIndex = Math.max(0, strokeTotal - 1);
      glyphIndex = Math.max(0, this.glyphs.length - 1);
    }
    return {
      playing: this.playing,
      done: this.done,
      strokeIndex,
      strokeTotal,
      glyphIndex,
      glyphTotal: this.glyphs.length,
    };
  }

  private emit() {
    this.onUpdate?.(this.snapshot());
  }

  private draw() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);
    this.paintPaper(ctx, w, h);

    for (const g of this.glyphs) {
      if (this.showGrid) paintGrid(ctx, g.cell, this.colors.grid);
      if (this.showGhost) paintGhost(ctx, g.outlines, g.cell, this.colors.ghost, g.bounds);
    }

    this.wet.composite(ctx, this.settings.wetness);

    if (this.sealAlpha > 0) {
      const last = this.glyphs[this.glyphs.length - 1];
      if (last) paintSeal(ctx, last.cell, this.colors.seal, this.colors.paper, this.sealAlpha);
    }
  }

  private paintPaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = this.colors.paper;
    ctx.fillRect(0, 0, w, h);
    const img = this.paper;
    if (img && img.complete && img.naturalWidth > 0) {
      if (
        !this.paperLayer ||
        this.paperLayerW !== w ||
        this.paperLayerH !== h ||
        this.paperLayerDpr !== this.dpr
      ) {
        this.buildPaperLayer(img, w, h);
      }
      if (this.paperLayer) ctx.drawImage(this.paperLayer, 0, 0, w, h);
    }
    if (!this.vignette || this.vignetteW !== w || this.vignetteH !== h) {
      const vignette = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72,
      );
      vignette.addColorStop(0, "rgba(28, 24, 20, 0)");
      vignette.addColorStop(1, "rgba(28, 24, 20, 0.08)");
      this.vignette = vignette;
      this.vignetteW = w;
      this.vignetteH = h;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  }

  /** Pre-render the tiled washi texture once per size/dpr instead of per frame. */
  private buildPaperLayer(img: HTMLImageElement, w: number, h: number) {
    const layer = this.paperLayer ?? document.createElement("canvas");
    const dpr = this.dpr;
    layer.width = Math.max(1, Math.round(w * dpr));
    layer.height = Math.max(1, Math.round(h * dpr));
    const lctx = layer.getContext("2d");
    if (!lctx) return;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.globalAlpha = 0.55;
    const tile = 420;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        lctx.drawImage(img, x, y, tile, tile);
      }
    }
    this.paperLayer = layer;
    this.paperLayerW = w;
    this.paperLayerH = h;
    this.paperLayerDpr = dpr;
  }
}
