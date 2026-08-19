/**
 * Dry-paper ink. Finished strokes live on `dry` and are never touched again.
 * Gap-fill runs only on the live stroke: close holes between nearby hairs,
 * never between one stroke and the next.
 */
export class WetPaper {
  dry: HTMLCanvasElement;
  live: HTMLCanvasElement;
  private scratch: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  dryCtx: CanvasRenderingContext2D | null = null;
  liveCtx: CanvasRenderingContext2D | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  width = 0;
  height = 0;
  dpr = 1;

  constructor() {
    this.dry = document.createElement("canvas");
    this.live = document.createElement("canvas");
    this.scratch = document.createElement("canvas");
    this.mask = document.createElement("canvas");
  }

  get stampCtx() {
    return this.liveCtx;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    for (const c of [this.dry, this.live, this.scratch, this.mask]) {
      c.width = bw;
      c.height = bh;
    }
    this.dryCtx = this.dry.getContext("2d");
    this.liveCtx = this.live.getContext("2d");
    this.scratchCtx = this.scratch.getContext("2d");
    this.maskCtx = this.mask.getContext("2d");
    this.dryCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.liveCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scratchCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.maskCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clear();
  }

  clear() {
    const w = this.width;
    const h = this.height;
    this.dryCtx?.clearRect(0, 0, w, h);
    this.liveCtx?.clearRect(0, 0, w, h);
    this.scratchCtx?.clearRect(0, 0, w, h);
    this.maskCtx?.clearRect(0, 0, w, h);
  }

  composite(dest: CanvasRenderingContext2D, wetness: number) {
    const w = this.width;
    const h = this.height;
    dest.drawImage(this.dry, 0, 0, w, h);
    this.blitFused(dest, wetness, false);
  }

  commit(wetness: number) {
    const dry = this.dryCtx;
    if (!dry) return;
    this.blitFused(dry, wetness, true);
    this.liveCtx?.clearRect(0, 0, this.width, this.height);
    this.scratchCtx?.clearRect(0, 0, this.width, this.height);
    this.maskCtx?.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Close gaps between nearby dark pixels on *this* stroke only.
   * Dilate the silhouette a few pixels, blur the ink, keep only what
   * still sits inside that silhouette — holes between hairs fill,
   * space between strokes is never considered.
   */
  private blitFused(dest: CanvasRenderingContext2D, wetness: number, set: boolean) {
    const s = this.scratchCtx;
    const m = this.maskCtx;
    const w = this.width;
    const h = this.height;
    if (!s || !m) {
      dest.drawImage(this.live, 0, 0, w, h);
      return;
    }

    if (wetness < 0.28) {
      dest.drawImage(this.live, 0, 0, w, h);
      return;
    }

    const reach = 1.3 + 2.4 * wetness;
    const blur = 1.1 + 2.6 * wetness;
    const dirs: [number, number][] = [
      [0, 0],
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
      [reach * 0.72, reach * 0.72],
      [-reach * 0.72, reach * 0.72],
      [reach * 0.72, -reach * 0.72],
      [-reach * 0.72, -reach * 0.72],
    ];

    m.save();
    m.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    m.clearRect(0, 0, w, h);
    for (const [dx, dy] of dirs) {
      m.drawImage(this.live, dx, dy, w, h);
    }
    m.restore();

    s.save();
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    s.clearRect(0, 0, w, h);
    s.filter = `blur(${blur}px)`;
    s.drawImage(this.live, 0, 0, w, h);
    s.filter = "none";
    s.globalCompositeOperation = "destination-in";
    s.drawImage(this.mask, 0, 0, w, h);
    s.globalCompositeOperation = "source-over";
    s.restore();

    dest.save();
    dest.globalAlpha = 0.78 + 0.18 * wetness;
    dest.drawImage(this.scratch, 0, 0, w, h);
    dest.globalAlpha = 1;
    dest.drawImage(this.live, 0, 0, w, h);
    dest.restore();

    if (!set) return;

    dest.save();
    dest.globalAlpha = 0.18;
    dest.drawImage(this.live, 0, 0, w, h);
    dest.restore();
  }
}
