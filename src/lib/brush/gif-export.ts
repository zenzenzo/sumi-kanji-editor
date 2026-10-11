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
  // 24 fps ≈ twice the old 12 fps capture, so the brush motion reads as a
  // stroke instead of a slideshow. gifenc's `delay` is milliseconds (it
  // divides by 10 into GIF centiseconds). The first exporter passed already-
  // converted centiseconds, so loops ran ~10× fast. The Claude pass fixed
  // units but dropped to 10 fps. Wall-clock delay is `delayMs`; animation
  // time advanced per frame is that times the editor speed slider, matching
  // in-app playback duration.
  const size = opts.size ?? 480;
  const fps = opts.fps ?? 24;
  const maxColors = opts.maxColors ?? 64;
  const delayMs = Math.max(20, Math.round(1000 / fps / 10) * 10);
  const holdMs = 1200;

  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);

  let player: BrushPlayer | null = null;
  try {
    player = new BrushPlayer({
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

    // Build the palette from the finished artwork, then capture from the start.
    // Encode as we go so long pieces need only one pending RGBA frame in memory.
    player.finish();
    const palette = quantize(player.readPixels().data, maxColors, { format: "rgb565" });
    const colorDepth = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const { w, h } = player.pixelSize();
    const gif = GIFEncoder();
    let firstFrame = true;
    const encode = (frame: CapturedFrame) => {
      gif.writeFrame(applyPalette(frame.data, palette), w, h, {
        palette: firstFrame ? palette : undefined,
        delay: frame.delayMs,
        colorDepth,
        repeat: firstFrame ? 0 : undefined,
      });
      firstFrame = false;
    };
    player.rewind();
    const advanceMs = delayMs * Math.max(0.25, opts.speed);
    let pending: CapturedFrame | null = null;
    let going = true;
    let n = 0;
    // Capture through completion; a fixed frame cap silently truncated slow or
    // complex characters. Collapse identical frames without dropping their time.
    while (going) {
      going = player.tickMs(advanceMs);
      const pixels = player.readPixels();
      if (pending && framesEqual(pending.data, pixels.data)) {
        pending.delayMs += delayMs;
      } else {
        if (pending) encode(pending);
        pending = { data: pixels.data, delayMs };
      }
      n += 1;
      if (n % 6 === 0) {
        opts.onProgress?.(Math.min(0.95, n / (n + 90)));
        await yieldUi();
      }
    }
    if (pending) {
      pending.delayMs += holdMs;
      encode(pending);
    }
    gif.finish();
    opts.onProgress?.(1);
    return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
  } finally {
    player?.destroy();
    wrap.remove();
  }
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
