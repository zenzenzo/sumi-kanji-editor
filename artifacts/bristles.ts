import type { BrushSettings, StrokeSample, Vec } from "@/lib/kanji/types";
/**
 * Xu et al. (Eurographics 2002) — "A Solid Model Based Virtual Hairy Brush"
 *
 * Do not simulate every hair. Simulate coherent *writing primitives*
 * (hair bundles) with:
 *   - a deformable middle control axis (spine)
 *   - a middle cross-section ellipse (splay / orientation)
 *   - a tip width
 *   - stress history that can split a bundle under load
 *
 * The ink mark is the union of each primitive's paper footprint, not a
 * stamp of independent tips. 2D adaptation of their 3D solid model for
 * Sumi's path-driven canvas (x, y, angle, pressure).
 */

type SpinePoint = {
  x: number;
  y: number;
  /** Velocity for inertia / recovery. */
  vx: number;
  vy: number;
};

type Primitive = {
  spine: SpinePoint[];
  /** Half-width across travel (elongates under pressure). */
  rx: number;
  /** Half-width along travel (compresses as rx grows — fixed "hair count"). */
  ry: number;
  /** Cross-section rotation relative to travel direction. */
  rot: number;
  tipWidth: number;
  /** Accumulated internal stress; split when above threshold. */
  stress: number;
  /** Inherited share of the total tuft mass (sums to ~1 across primitives). */
  mass: number;
  wetness: number;
  planted: boolean;
};

const SPINE_LEN = 5;
const MAX_PRIMITIVES = 12;
const SPLIT_STRESS = 1.15;

export class BristleSim {
  private primitives: Primitive[] = [];
  private settings: BrushSettings;
  private radius = 12;
  private ink: string;
  private prevPos: Vec | null = null;
  private prevAngle = 0;
  private inkLoad = 1;

  constructor(settings: BrushSettings, ink: string) {
    this.settings = settings;
    this.ink = ink;
    this.rebuild();
  }

  setInk(ink: string) {
    this.ink = ink;
  }

  setSettings(settings: BrushSettings, radius: number) {
    const softChanged = settings.softness !== this.settings.softness;
    const splayChanged = settings.splay !== this.settings.splay;
    this.settings = settings;
    this.radius = radius;
    if (softChanged || splayChanged) this.rebuild();
  }

  setRadius(radius: number) {
    this.radius = radius;
  }

  reset() {
    this.rebuild();
    this.prevPos = null;
    this.inkLoad = 1;
  }

  plant(sample: StrokeSample) {
    this.prevPos = { x: sample.x, y: sample.y };
    this.prevAngle = sample.angle;
    for (const p of this.primitives) {
      this.placeSpine(p, sample.x, sample.y, sample.angle, sample.pressure);
      p.planted = true;
      p.stress = 0;
    }
  }

  press(ctx: CanvasRenderingContext2D, sample: StrokeSample) {
    if (sample.pressure < 0.02) return;
    this.plant(sample);
    this.deposit(ctx, sample, true);
  }

  step(ctx: CanvasRenderingContext2D, sample: StrokeSample, dt: number) {
    if (sample.pressure < 0.02) {
      this.recover(dt);
      return;
    }

    if (!this.prevPos) {
      this.plant(sample);
      this.deposit(ctx, sample, true);
      return;
    }

    const s = this.settings;
    const move = {
      x: sample.x - this.prevPos.x,
      y: sample.y - this.prevPos.y,
    };
    const travel = Math.hypot(move.x, move.y);
    const turn = absAngle(sample.angle - this.prevAngle);

    // --- deform each primitive ---
    for (const p of this.primitives) {
      if (!p.planted) {
        this.placeSpine(p, sample.x, sample.y, sample.angle, sample.pressure);
        p.planted = true;
        continue;
      }
      this.deformPrimitive(p, sample, move, travel, turn, dt);
    }

    // --- split stressed bundles ---
    this.splitStressed(sample);

    // --- deposit from paper intersection of each primitive ---
    this.deposit(ctx, sample, false);

    this.prevPos = { x: sample.x, y: sample.y };
    this.prevAngle = sample.angle;
    this.inkLoad = Math.max(0.25, this.inkLoad - travel * 0.00035 * (0.4 + sample.pressure));
  }

  // ---------------------------------------------------------------------------

  private rebuild() {
    // Start as one coherent primitive (Xu: single primitive for regular script).
    // Soft / high-splay brushes begin with a few so expressive marks appear sooner.
    const s = this.settings;
    const n0 = Math.max(1, Math.min(4, Math.round(1 + s.splay * 2 + s.softness)));
    this.primitives = [];
    for (let i = 0; i < n0; i++) {
      const mass = 1 / n0;
      const offset = n0 === 1 ? 0 : (i / (n0 - 1) - 0.5) * 0.35;
      this.primitives.push(this.makePrimitive(mass, offset));
    }
  }

  private makePrimitive(mass: number, lateralBias = 0): Primitive {
    const spine: SpinePoint[] = [];
    for (let i = 0; i < SPINE_LEN; i++) {
      spine.push({ x: 0, y: 0, vx: 0, vy: 0 });
    }
    return {
      spine,
      rx: 1,
      ry: 1,
      rot: lateralBias * 0.4,
      tipWidth: 1,
      stress: 0,
      mass,
      wetness: this.settings.wetness,
      planted: false,
    };
  }

  private placeSpine(p: Primitive, x: number, y: number, angle: number, pressure: number) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // Spine hangs opposite travel; tip is farthest from the handle root.
    const len = this.radius * (0.9 + 0.5 * this.settings.softness) * (0.55 + 0.45 * pressure);
    for (let i = 0; i < SPINE_LEN; i++) {
      const t = i / (SPINE_LEN - 1);
      // Root (i=0) at handle; tip (i=last) trails opposite the travel direction.
      p.spine[i].x = x - ca * len * t;
      p.spine[i].y = y - sa * len * t;
      p.spine[i].vx = 0;
      p.spine[i].vy = 0;
    }
    const splay = 0.55 + this.settings.splay * 0.7;
    p.rx = splay * (0.35 + 0.65 * pressure);
    p.ry = splay * (0.55 - 0.25 * pressure);
    p.tipWidth = 0.35 + 0.55 * (1 - pressure * 0.5);
    p.rot = 0;
  }

  /**
   * Active point = tip contacting paper. Root follows the handle.
   * Intermediate spine points spring toward a bent rest pose and carry
   * velocity (inertia). Stress grows with pressure, turn, and lateral drag.
   */
  private deformPrimitive(
    p: Primitive,
    sample: StrokeSample,
    move: Vec,
    travel: number,
    turn: number,
    dt: number,
  ) {
    const s = this.settings;
    const pressure = sample.pressure;
    const ca = Math.cos(sample.angle);
    const sa = Math.sin(sample.angle);
    const nx = -sa;
    const ny = ca;

    // Elasticity: stiff → recovers fast; soft → lags and holds deformation.
    const elasticity = 0.25 + 0.7 * s.stiffness;
    const lag = 0.15 + 0.7 * s.softness;

    // Root tracks the handle (bottom control circle).
    const root = p.spine[0];
    root.x = sample.x;
    root.y = sample.y;
    root.vx = 0;
    root.vy = 0;

    // Tip is the active paper point — pulled by motion, lags by softness.
    const tip = p.spine[SPINE_LEN - 1];
    const tipLen =
      this.radius * (0.7 + 0.55 * s.softness) * (0.4 + 0.6 * pressure) * (0.85 + 0.3 * p.mass);
    // Desired tip trails opposite travel; under pressure it flattens toward the handle.
    const flatten = pressure * (0.35 + 0.4 * s.splay);
    const desiredTip = {
      x: sample.x - ca * tipLen * (1 - flatten * 0.55) + nx * p.rot * tipLen * 0.25,
      y: sample.y - sa * tipLen * (1 - flatten * 0.55) + ny * p.rot * tipLen * 0.25,
    };
    // Inertia: tip does not jump; recent velocity carries it.
    const tipFollow = 1 - Math.exp(-dt * (8 + 22 * elasticity));
    tip.vx += (desiredTip.x - tip.x) * tipFollow * 18 * dt;
    tip.vy += (desiredTip.y - tip.y) * tipFollow * 18 * dt;
    tip.vx *= 1 - (0.35 + 0.45 * elasticity) * Math.min(1, dt * 20);
    tip.vy *= 1 - (0.35 + 0.45 * elasticity) * Math.min(1, dt * 20);
    tip.x += tip.vx * dt;
    tip.y += tip.vy * dt;

    // Middle spine points: Catmull-like rest pose between root and tip, with lag.
    for (let i = 1; i < SPINE_LEN - 1; i++) {
      const t = i / (SPINE_LEN - 1);
      // Bent rest: quadratic bias away from the chord under high pressure / turn.
      const bend = (pressure * 0.5 + turn * 1.2) * (4 * t * (1 - t));
      const restX = root.x + (tip.x - root.x) * t + nx * bend * this.radius * 0.35 * (p.rot || 1);
      const restY = root.y + (tip.y - root.y) * t + ny * bend * this.radius * 0.35 * (p.rot || 1);
      const follow = 1 - Math.exp(-dt * (6 + 20 * elasticity) * (1 - lag * t));
      const pt = p.spine[i];
      pt.vx += (restX - pt.x) * follow * 16 * dt;
      pt.vy += (restY - pt.y) * follow * 16 * dt;
      pt.vx *= 1 - 0.4 * Math.min(1, dt * 18);
      pt.vy *= 1 - 0.4 * Math.min(1, dt * 18);
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }

    // Middle control ellipse — elongates across travel under pressure (fixed area).
    const splayBase = 0.45 + s.splay * 0.85;
    const targetRx = splayBase * (0.28 + 0.95 * pressure) * Math.sqrt(p.mass) * (1 + turn * 0.4);
    const targetRy = splayBase * (0.55 - 0.3 * pressure) * Math.sqrt(p.mass);
    const area = Math.max(0.08, targetRx * targetRy);
    p.rx += (targetRx - p.rx) * Math.min(1, dt * 10);
    p.ry = area / Math.max(0.12, p.rx);

    // Reorient ellipse toward travel; lag with softness.
    const rotTarget = Math.sin(turn * 2) * 0.35 * pressure;
    p.rot += (rotTarget - p.rot) * Math.min(1, dt * (4 + 10 * elasticity));

    p.tipWidth = 0.25 + 0.6 * (1 - pressure * 0.55) * Math.sqrt(p.mass);

    // Stress from pressure, turning, and lateral component of motion relative to spine.
    const spineDx = tip.x - root.x;
    const spineDy = tip.y - root.y;
    const spineLen = Math.hypot(spineDx, spineDy) || 1;
    const lateral =
      travel > 1e-4
        ? Math.abs((-spineDy / spineLen) * move.x + (spineDx / spineLen) * move.y) / travel
        : 0;
    const dStress =
      pressure * 0.55 * (travel / Math.max(1, this.radius)) +
      turn * 1.1 * pressure +
      lateral * pressure * 0.8 +
      (p.rx / Math.max(0.2, splayBase) - 1) * 0.25;
    // History: stress decays slowly so the bundle remembers the corner.
    p.stress = p.stress * (1 - Math.min(0.5, dt * (0.8 + 1.4 * elasticity))) + dStress;
    p.wetness = s.wetness * (0.7 + 0.3 * this.inkLoad);
  }

  private splitStressed(sample: StrokeSample) {
    if (this.primitives.length >= MAX_PRIMITIVES) return;
    const next: Primitive[] = [];
    for (const p of this.primitives) {
      const threshold = SPLIT_STRESS * (0.75 + 0.5 * this.settings.stiffness);
      if (p.stress < threshold || p.mass < 0.08 || this.primitives.length + next.length >= MAX_PRIMITIVES) {
        next.push(p);
        continue;
      }
      // Split into k = 2 (or 3 under extreme stress) smaller primitives.
      const k = p.stress > threshold * 1.45 ? 3 : 2;
      const ca = Math.cos(sample.angle);
      const sa = Math.sin(sample.angle);
      const nx = -sa;
      const ny = ca;
      const sep = this.radius * (0.22 + 0.35 * Math.min(1, p.stress - threshold)) * Math.sqrt(p.mass);
      for (let i = 0; i < k; i++) {
        const child = this.makePrimitive(p.mass / k);
        child.planted = true;
        child.stress = p.stress * 0.35;
        child.wetness = p.wetness;
        child.rx = p.rx * (0.55 + 0.15 * k);
        child.ry = p.ry * (0.55 + 0.15 * k);
        child.tipWidth = p.tipWidth;
        const bias = (i / (k - 1) - 0.5) * 2; // -1 .. 1
        child.rot = p.rot + bias * 0.5;
        for (let s = 0; s < SPINE_LEN; s++) {
          const t = s / (SPINE_LEN - 1);
          child.spine[s].x = p.spine[s].x + nx * sep * bias * (0.3 + 0.7 * t);
          child.spine[s].y = p.spine[s].y + ny * sep * bias * (0.3 + 0.7 * t);
          child.spine[s].vx = p.spine[s].vx;
          child.spine[s].vy = p.spine[s].vy;
        }
        next.push(child);
      }
      if (next.length >= MAX_PRIMITIVES) break;
    }
    this.primitives = next.slice(0, MAX_PRIMITIVES);
  }

  private recover(dt: number) {
    const elasticity = 0.25 + 0.7 * this.settings.stiffness;
    for (const p of this.primitives) {
      p.stress *= 1 - Math.min(0.6, dt * (1.2 + 2 * elasticity));
      // Spine contracts toward the root.
      const root = p.spine[0];
      for (let i = 1; i < SPINE_LEN; i++) {
        const t = i / (SPINE_LEN - 1);
        const pt = p.spine[i];
        pt.x += (root.x - pt.x) * Math.min(1, dt * 4 * elasticity * t);
        pt.y += (root.y - pt.y) * Math.min(1, dt * 4 * elasticity * t);
        pt.vx *= 0.85;
        pt.vy *= 0.85;
      }
      p.rx += (0.4 - p.rx) * Math.min(1, dt * 3);
      p.ry += (0.5 - p.ry) * Math.min(1, dt * 3);
    }
  }

  /**
   * Footprint = intersection of each primitive's swept solid with the paper.
   * Approximated as a stadium / ellipse along the contact spine segment,
   * with width from the middle control ellipse.
   */
  private deposit(ctx: CanvasRenderingContext2D, sample: StrokeSample, press: boolean) {
    if (sample.pressure < 0.02) return;
    const s = this.settings;
    ctx.save();
    ctx.fillStyle = this.ink;
    ctx.strokeStyle = this.ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const p of this.primitives) {
      if (!p.planted) continue;
      const alpha =
        (0.5 + 0.35 * p.wetness) *
        (0.55 + 0.45 * sample.pressure) *
        (0.7 + 0.3 * this.inkLoad) *
        (press ? 1 : 0.92);
      if (alpha < 0.05) continue;

      // Contact segment: lower half of the spine (toward the tip).
      const a = p.spine[Math.floor(SPINE_LEN * 0.35)];
      const b = p.spine[SPINE_LEN - 1];
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      const ang = segLen > 1e-4 ? Math.atan2(dy, dx) : sample.angle;

      const halfW = this.radius * p.rx * (0.55 + 0.6 * sample.pressure);
      const halfL = Math.max(
        this.radius * p.ry * 0.35,
        segLen * 0.5 + this.radius * p.tipWidth * 0.25,
      );

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(ang + p.rot * 0.5);
      ctx.globalAlpha = Math.min(0.9, alpha);

      // Soft body of the footprint.
      if (p.wetness >= 0.35) {
        ctx.globalAlpha = Math.min(0.55, alpha * 0.45 * p.wetness);
        this.ellipsePath(ctx, halfL * 1.15, halfW * 1.2);
        ctx.fill();
      }

      ctx.globalAlpha = Math.min(0.88, alpha);
      this.ellipsePath(ctx, halfL, halfW);
      ctx.fill();

      // Tip accent — narrower, darker.
      const tip = p.spine[SPINE_LEN - 1];
      ctx.globalAlpha = Math.min(0.8, alpha * 0.85);
      ctx.beginPath();
      ctx.ellipse(
        (tip.x - midX) * Math.cos(-ang - p.rot * 0.5) - (tip.y - midY) * Math.sin(-ang - p.rot * 0.5),
        (tip.x - midX) * Math.sin(-ang - p.rot * 0.5) + (tip.y - midY) * Math.cos(-ang - p.rot * 0.5),
        this.radius * p.tipWidth * (0.2 + 0.35 * sample.pressure),
        this.radius * p.tipWidth * (0.12 + 0.2 * sample.pressure),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private ellipsePath(ctx: CanvasRenderingContext2D, halfL: number, halfW: number) {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(0.4, halfL), Math.max(0.35, halfW), 0, 0, Math.PI * 2);
  }
}

function absAngle(d: number): number {
  let a = d;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.abs(a);
}
