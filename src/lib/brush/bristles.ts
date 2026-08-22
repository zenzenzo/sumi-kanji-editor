import type { BrushSettings, StrokeSample, Vec } from "@/lib/kanji/types";
import { clamp, dist } from "./geometry";

type Hair = {
  u: number;
  v: number;
  radial: number;
  length: number;
  thickness: number;
  tip: Vec;
  prev: Vec;
  vel: Vec;
  planted: boolean;
};

/**
 * Photoshop / Krita-style bristle tip.
 * Size is the fully-pressed footprint. Pressure both (1) scales that
 * footprint so hairs pack together on a lift, and (2) decides which
 * hairs reach the paper, centre first. Softness fans a little extra;
 * stiffness resists splay.
 */
export class BristleSim {
  private hairs: Hair[] = [];
  private settings: BrushSettings;
  private radius = 12;
  private ink: string;

  constructor(settings: BrushSettings, ink: string) {
    this.settings = settings;
    this.ink = ink;
    this.rebuildTuft();
  }

  setInk(ink: string) {
    this.ink = ink;
  }

  setSettings(settings: BrushSettings, radius: number) {
    const countChanged = Math.round(settings.bristles) !== this.hairs.length;
    const softnessChanged = settings.softness !== this.settings.softness;
    this.settings = settings;
    this.radius = radius;
    if (countChanged || softnessChanged) this.rebuildTuft();
  }

  setRadius(radius: number) {
    this.radius = radius;
  }

  reset() {
    for (const h of this.hairs) {
      h.planted = false;
      h.vel.x = 0;
      h.vel.y = 0;
    }
  }

  plant(sample: StrokeSample) {
    for (const h of this.hairs) {
      const t = this.target(h, sample);
      h.tip = { ...t };
      h.prev = { ...t };
      h.vel.x = 0;
      h.vel.y = 0;
      h.planted = true;
    }
  }

  step(ctx: CanvasRenderingContext2D, sample: StrokeSample, dt: number) {
    if (sample.pressure < 0.02) return;
    const s = this.settings;
    const k = (14 + 48 * s.stiffness) * (1.2 - 0.4 * s.softness);
    const damp = 2 * Math.sqrt(Math.max(k, 1)) * (0.62 + 0.4 * s.softness);
    const steps = sample.hold || dt > 0.012 ? 3 : 2;
    const hdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      for (const hair of this.hairs) {
        if (!hair.planted) {
          const t = this.target(hair, sample);
          hair.tip = { ...t };
          hair.prev = { ...t };
          hair.planted = true;
          continue;
        }
        const target = this.target(hair, sample);
        const lift = sample.hold ? 0 : 1 - sample.pressure;
        if (!sample.hold && sample.pressure < 0.55) {
          hair.tip.x = target.x;
          hair.tip.y = target.y;
          hair.vel.x = 0;
          hair.vel.y = 0;
          continue;
        }
        const kNow = k * (1 + (sample.hold ? 0.9 : 1.4 * lift));
        const dNow = damp * (1 + (sample.hold ? 0.5 : 1.8 * lift));
        const ax = kNow * (target.x - hair.tip.x) - dNow * hair.vel.x;
        const ay = kNow * (target.y - hair.tip.y) - dNow * hair.vel.y;
        hair.vel.x += ax * hdt;
        hair.vel.y += ay * hdt;
        hair.tip.x += hair.vel.x * hdt;
        hair.tip.y += hair.vel.y * hdt;
        if (sample.hold) {
          const snap = 0.18 + 0.22 * (1 - s.softness);
          hair.tip.x += (target.x - hair.tip.x) * snap;
          hair.tip.y += (target.y - hair.tip.y) * snap;
          hair.vel.x *= 0.78;
          hair.vel.y *= 0.78;
        } else if (lift > 0.45) {
          const snap = 0.28 * lift;
          hair.tip.x += (target.x - hair.tip.x) * snap;
          hair.tip.y += (target.y - hair.tip.y) * snap;
          hair.vel.x *= 0.72;
          hair.vel.y *= 0.72;
        }
        if (sample.pressure < 0.04) {
          hair.vel.x = 0;
          hair.vel.y = 0;
        }
      }
    }

    this.stamp(ctx, sample);
    for (const hair of this.hairs) {
      hair.prev.x = hair.tip.x;
      hair.prev.y = hair.tip.y;
    }
  }

  press(ctx: CanvasRenderingContext2D, sample: StrokeSample) {
    if (sample.pressure < 0.02) return;
    this.plant(sample);
    this.stamp(ctx, sample, true);
  }

  /** Size slider is the pressed footprint. Pressure closes the tuft toward a point. */
  private tuftScale(pressure: number): number {
    const s = this.settings;
    const u = clamp(pressure, 0, 1);
    const floor = 0.06 + 0.04 * s.stiffness;
    const fan = 1 + s.splay * 0.22 * u + s.softness * 0.1 * u;
    return (floor + (1 - floor) * u) * fan;
  }

  private target(hair: Hair, sample: StrokeSample): Vec {
    const s = this.settings;
    const ca = Math.cos(sample.angle);
    const sa = Math.sin(sample.angle);
    const scale = this.tuftScale(sample.pressure) * (sample.spread ?? 1);
    if (sample.blot) {
      const spread = this.radius * scale * (1.05 + s.splay * 0.2);
      const u = hair.u * spread;
      const v = hair.v * spread;
      return {
        x: sample.x + ca * u - sa * v,
        y: sample.y + sa * u + ca * v,
      };
    }
    const spread = this.radius * scale * (1 + s.splay * sample.pressure * 0.35 * hair.radial);
    const belly = 1 + 0.16 * Math.abs(Math.sin(sample.angle)) * scale;
    const u = hair.u * spread * 0.42;
    const v = hair.v * spread * belly;
    // Lead disabled — targets stay under the handle (no forward bias).
    const lead = 0;
    return {
      x: sample.x + ca * (u + lead) - sa * v,
      y: sample.y + sa * (u + lead) + ca * v,
    };
  }

  private contact(hair: Hair, pressure: number): number {
    if (pressure < 0.02) return 0;
    const fringe = Math.max(0, hair.radial - 0.78);
    const drop = fringe * 3.2 * (1 - pressure);
    return clamp(1 - drop, 0.15, 1);
  }

  private stamp(pigment: CanvasRenderingContext2D, sample: StrokeSample, press = false) {
    if (sample.pressure < 0.02) return;
    const s = this.settings;
    const wet = s.wetness;
    pigment.save();
    pigment.strokeStyle = this.ink;
    pigment.fillStyle = this.ink;
    pigment.lineCap = "round";
    pigment.lineJoin = "round";

    let cx = 0;
    let cy = 0;
    let touchN = 0;

    const marks: { hair: Hair; touch: number; width: number; alpha: number; travel: number; blot: boolean }[] = [];

    const scale = this.tuftScale(sample.pressure);
    for (let i = 0; i < this.hairs.length; i++) {
      const hair = this.hairs[i];
      const touch = this.contact(hair, sample.pressure);
      if (touch <= 0) continue;

      if (sample.pressure < 0.5) {
        const ca = Math.cos(sample.angle);
        const sa = Math.sin(sample.angle);
        const ahead = (hair.tip.x - sample.x) * ca + (hair.tip.y - sample.y) * sa;
        if (ahead > 0.6) continue;
      }

      if (wet < 0.5 && scale > 0.4) {
        const skip = (Math.sin(i * 19.17 + sample.t * 40.3) + 1) * 0.5;
        if (skip > wet * 1.35 + touch * 0.35) continue;
      }

      const travel = dist(hair.prev, hair.tip);
      const blot = sample.blot || press;
      if (!blot && travel < 0.45 && sample.pressure > 0.5) continue;
      const width = Math.max(
        0.4,
        this.radius *
          scale *
          (blot ? 0.18 : 0.16) *
          hair.thickness *
          (0.7 + 0.3 * scale) *
          (0.85 + 0.35 * wet),
      );

      const alpha = (0.55 + 0.2 * wet) * (blot || press ? 1 : 0.9);

      if (alpha < 0.06) continue;

      marks.push({ hair, touch, width, alpha: Math.min(0.88, alpha), travel, blot });
      cx += hair.tip.x;
      cy += hair.tip.y;
      touchN += 1;
    }

    const haloScale = wet < 0.42 ? 1.05 : 1.18 + 0.55 * wet;
    if (wet >= 0.4) {
      for (const m of marks) {
        pigment.globalAlpha = m.alpha * 0.16 * wet;
        pigment.lineWidth = Math.max(0.5, m.width * haloScale);
        this.strokeHair(pigment, m.hair, m.travel, m.width * haloScale, m.blot);
      }
    }

    for (const m of marks) {
      pigment.globalAlpha = m.alpha;
      pigment.lineWidth = Math.max(0.35, m.width);
      this.strokeHair(pigment, m.hair, m.travel, m.width, m.blot);
    }

    if (touchN > 1) {
      cx /= touchN;
      cy /= touchN;
      if (wet >= 0.22 || scale < 0.5) {
        const hull = convexHull(marks.map((mk) => mk.hair.tip));
        if (hull.length >= 3) {
          pigment.globalAlpha = 0.34 + 0.32 * wet;
          pigment.beginPath();
          pigment.moveTo(hull[0].x, hull[0].y);
          for (let i = 1; i < hull.length; i++) pigment.lineTo(hull[i].x, hull[i].y);
          pigment.closePath();
          pigment.fill();
        }
        for (const mk of marks) {
          pigment.globalAlpha = 0.2 + 0.22 * wet;
          pigment.lineWidth = Math.max(0.6, mk.width * 1.15);
          pigment.beginPath();
          pigment.moveTo(cx, cy);
          pigment.lineTo(mk.hair.tip.x, mk.hair.tip.y);
          pigment.stroke();
        }
      }
      if (wet > 0.45 || sample.blot) {
        let rad = 0;
        for (const mk of marks) {
          rad = Math.max(rad, dist(mk.hair.tip, { x: cx, y: cy }));
        }
        rad = rad * (sample.blot ? 0.85 : 0.62) + this.radius * (sample.blot ? 0.28 : 0.16) * sample.pressure;
        this.pool(pigment, cx, cy, rad, sample.pressure, press || sample.blot);
      }
    }

    pigment.restore();
  }

  private strokeHair(
    ctx: CanvasRenderingContext2D,
    hair: Hair,
    travel: number,
    width: number,
    blot = false,
  ) {
    if (blot) {
      ctx.beginPath();
      ctx.arc(hair.tip.x, hair.tip.y, width * 0.62, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(hair.prev.x, hair.prev.y);
      ctx.lineTo(hair.tip.x, hair.tip.y);
      ctx.stroke();
    }
  }

  private pool(
    pigment: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rad: number,
    pressure: number,
    press: boolean,
  ) {
    const wet = this.settings.wetness;
    const g = pigment.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, this.ink);
    g.addColorStop(1, "rgba(0,0,0,0)");
    pigment.save();
    pigment.fillStyle = g;
    pigment.globalAlpha = (press ? 0.14 : 0.04) * (0.55 + 0.45 * wet) * (0.4 + 0.6 * pressure);
    pigment.beginPath();
    pigment.arc(cx, cy, rad, 0, Math.PI * 2);
    pigment.fill();
    pigment.restore();
  }

  private rebuildTuft() {
    const n = Math.max(8, Math.round(this.settings.bristles));
    const golden = Math.PI * (3 - Math.sqrt(5));
    const hairs: Hair[] = [];
    for (let i = 0; i < n; i++) {
      const radial = Math.sqrt((i + 0.5) / n);
      const theta = i * golden;
      const u = radial * Math.cos(theta);
      const v = radial * Math.sin(theta);
      const length = 1 - 0.48 * radial * (0.4 + 0.6 * this.settings.softness);
      const thickness = 0.65 + 0.55 * (1 - radial);
      hairs.push({
        u,
        v,
        radial,
        length,
        thickness,
        tip: { x: 0, y: 0 },
        prev: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        planted: false,
      });
    }
    this.hairs = hairs;
  }
}

function convexHull(pts: Vec[]): Vec[] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) {
      lower.pop();
    }
    lower.push(pt);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) {
      upper.pop();
    }
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
