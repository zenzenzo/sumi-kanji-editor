import { applyPalette, GIFEncoder, quantize } from "gifenc/dist/gifenc.esm.js";
import type { EditBook } from "./edits";
import { BrushPlayer } from "./player";
import type { BrushSettings, GlyphData } from "@/lib/kanji/types";

export type GifExportOptions = {
  glyphs: GlyphData[];
  settings: BrushSettings;
  edits: EditBook;
  showGrid: boolean;
  showGhost: boolean;
  speed: number;
  paper: HTMLImageElement | null;
  colors: {
    paper: string;
    ink: string;
    grid: string;
    ghost: string;
    seal: string;
  };
  size?: number;
  fps?: number;
  /** Max colors in the quantized palette. Lower = smaller file, more banding. */
  maxColors?: number;
  onProgress?: (p: number) => void;
};

type CapturedFrame = { data: Uint8ClampedArray; delayMs: number };

function yieldUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

/** Fast whole-frame equality check, 4 bytes (one RGBA pixel) at a time. */
function framesEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  const ai = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
  const bi = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
  for (let i = 0; i < ai.length; i++) {
    if (ai[i] !== bi[i]) return false;
  }
  return true;
}

export async function renderCalligraphyGif(opts: GifExportOptions): Promise<Blob> {
  const size = opts.size ?? 360;
  const fps = opts.fps ?? 10;
  const maxColors = opts.maxColors ?? 32;
  const frameMs = 1000 / fps;
  // gifenc's `delay` option is milliseconds (it converts to the GIF's native
  // centisecond unit internally) — passing a pre-converted centisecond value
  // here, as the previous version did, made every frame play back ~10x too
  // fast before any player-side clamping.
  const holdMs = 1200;

  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);

  const player = new BrushPlayer({
    canvas,
    glyphs: opts.glyphs,
    paper: opts.paper,
    colors: opts.colors,
    showGrid: opts.showGrid,
    showGhost: opts.showGhost,
    settings: opts.settings,
    edits: opts.edits,
    speed: 1,
    reducedMotion: false,
    fixedSize: { w: size, h: size, dpr: 1 },
  });
  player.rewind();

  // Capture at a fixed simulated frame rate, but collapse runs of pixel-
  // identical frames (paper-texture-only pauses between strokes, the tail
  // of a settle once ink stops moving) into one frame with a longer delay.
  // This both shrinks the file and keeps on-screen timing accurate to the
  // in-app playback, since no visual time is dropped — only redundant
  // encoded frames are.
  const advanceMs = frameMs * Math.max(0.25, opts.speed);
  const frames: CapturedFrame[] = [];
  const cap = 360;
  let n = 0;
  let going = true;
  while (going && n < cap) {
    going = player.tickMs(advanceMs);
    const pixels = player.readPixels();
    const prev = frames[frames.length - 1];
    if (prev && framesEqual(prev.data, pixels.data)) {
      prev.delayMs += advanceMs;
    } else {
      frames.push({ data: pixels.data, delayMs: advanceMs });
    }
    n += 1;
    if (n % 6 === 0) {
      opts.onProgress?.(Math.min(0.85, n / 90));
      await yieldUi();
    }
  }
  const lastData = frames[frames.length - 1]?.data ?? player.readPixels().data;
  const { w, h } = player.pixelSize();
  player.destroy();
  wrap.remove();

  opts.onProgress?.(0.88);
  await yieldUi();

  const palette = quantize(lastData, maxColors, { format: "rgb565" });
  // Match the LZW minimum code size (and so the bit-width of every encoded
  // symbol) to the palette actually in use instead of gifenc's default of a
  // full 8 bits (256 colors) — a real, lossless reduction in output size.
  const colorDepth = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, w, h, {
      palette: i === 0 ? palette : undefined,
      delay: frame.delayMs,
      colorDepth,
      repeat: i === 0 ? 0 : undefined,
    });
    if (i % 8 === 0) {
      opts.onProgress?.(0.88 + 0.1 * (i / Math.max(1, frames.length)));
      await yieldUi();
    }
  }
  gif.writeFrame(applyPalette(lastData, palette), w, h, { palette, delay: holdMs, colorDepth });
  gif.finish();
  opts.onProgress?.(1);
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
