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
  onProgress?: (p: number) => void;
};

function yieldUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export async function renderCalligraphyGif(opts: GifExportOptions): Promise<Blob> {
  const size = opts.size ?? 480;
  const fps = opts.fps ?? 12;
  const frameMs = 1000 / fps;
  const delay = Math.max(2, Math.round(100 / fps));

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

  const frames: ImageData[] = [];
  const cap = 360;
  let n = 0;
  let going = true;
  while (going && n < cap) {
    going = player.tickMs(frameMs * Math.max(0.25, opts.speed));
    frames.push(player.readPixels());
    n += 1;
    if (n % 6 === 0) {
      opts.onProgress?.(Math.min(0.85, n / 90));
      await yieldUi();
    }
  }
  const last = frames[frames.length - 1] ?? player.readPixels();
  const { w, h } = player.pixelSize();
  player.destroy();
  wrap.remove();

  opts.onProgress?.(0.88);
  await yieldUi();

  const palette = quantize(last.data, 48, { format: "rgb565" });
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const index = applyPalette(frames[i].data, palette);
    gif.writeFrame(index, w, h, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: i === 0 ? 0 : undefined,
    });
    if (i % 8 === 0) {
      opts.onProgress?.(0.88 + 0.1 * (i / Math.max(1, frames.length)));
      await yieldUi();
    }
  }
  gif.writeFrame(applyPalette(last.data, palette), w, h, { palette, delay: 120 });
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
