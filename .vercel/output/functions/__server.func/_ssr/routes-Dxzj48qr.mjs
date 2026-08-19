import { o as __toESM } from "../_runtime.mjs";
import { o as require_jsx_runtime, s as require_react } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { _ as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as createServerFn } from "./ssr.mjs";
import { i as signOut, t as authClient } from "./client-sGid3STf.mjs";
import { t as extractKanji } from "./cjk-B9saegSJ.mjs";
import { n as cn, t as Button } from "./button-BwpbvxLI.mjs";
import { a as LoaderCircle, c as BookmarkCheck, i as Pause, n as RotateCcw, o as ChevronRight, r as Play, s as Bookmark } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { n as createSsrRpc } from "./router-qqLylRmd.mjs";
import { t as authMiddleware } from "./middleware-BmSL4xPT.mjs";
import { i as SliderTrack, n as SliderRange, r as SliderThumb, t as Slider$1 } from "../_libs/@radix-ui/react-slider+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Dxzj48qr.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Current user + loading state. Same behavior in live preview and when deployed:
*   - Auth enabled (default) -> the real signed-in user; `user` is `null` while
*                            the session resolves (`isPending: true`) and when
*                            signed out (`isPending: false`). Session comes from
*                            Better Auth `useSession()` → `/api/auth/get-session`
*                            (cookie when deployed; bearer in live preview).
*   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
*
* Protect a route by waiting out `isPending` before acting on `user` —
* redirecting on `user: null` alone bounces signed-in visitors to sign-in on
* every hard reload:
*
*   import { RedirectToSignIn } from "@/lib/auth/gates";
*   const { user, isPending } = useCurrentUserState();
*   if (isPending) return null;              // still resolving — don't redirect yet
*   if (!user) return <RedirectToSignIn />;  // definitely signed out
*
* `authEnabled` is a module-level constant fixed at load, so the guarded hook
* call keeps a stable hook order across every render of a given component.
*/
function useCurrentUserState() {
	const { data, isPending } = authClient.useSession();
	const user = data?.user;
	return {
		user: user ? {
			id: user.id,
			displayName: user.name ?? null,
			primaryEmail: user.email ?? null,
			profileImageUrl: user.image ?? null,
			isDevFallback: false
		} : null,
		isPending
	};
}
function AuthSlot() {
	const { user, isPending } = useCurrentUserState();
	if (isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-9 w-24 animate-pulse rounded-[var(--radius-xs)] bg-paper/15" });
	if (!user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
		asChild: true,
		variant: "ghost",
		size: "sm",
		className: "text-paper hover:bg-paper/10",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/login",
			children: "Sign in"
		})
	});
	const label = user.displayName ?? user.primaryEmail ?? "Account";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2",
		children: [
			user.profileImageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: user.profileImageUrl,
				alt: "",
				className: "size-8 rounded-full object-cover ring-1 ring-paper/20"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid size-8 place-items-center rounded-full bg-paper/15 font-display text-sm text-paper",
				children: label.charAt(0)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "hidden max-w-[8rem] truncate text-sm text-paper/80 sm:inline",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "ghost",
				size: "sm",
				className: "text-paper/70 hover:bg-paper/10 hover:text-paper",
				onClick: () => void signOut(),
				children: "Sign out"
			})
		]
	});
}
function dist(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}
function smoothstep(edge0, edge1, x) {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}
function angleDiff(a, b) {
	let d = b - a;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return d;
}
function catmullRom(p0, p1, p2, p3, t) {
	const t2 = t * t;
	const t3 = t2 * t;
	return {
		x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
		y: .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
	};
}
/** Smooth a polyline through Catmull-Rom, then resample to even spacing. */
function resampleSmooth(raw, spacing) {
	if (raw.length === 0) return [];
	if (raw.length === 1) return [{ ...raw[0] }];
	const padded = [
		raw[0],
		...raw,
		raw[raw.length - 1]
	];
	const dense = [];
	const segs = raw.length - 1;
	for (let i = 0; i < segs; i++) {
		const p0 = padded[i];
		const p1 = padded[i + 1];
		const p2 = padded[i + 2];
		const p3 = padded[i + 3];
		const steps = 10;
		for (let s = 0; s < steps; s++) dense.push(catmullRom(p0, p1, p2, p3, s / steps));
	}
	dense.push(raw[raw.length - 1]);
	const out = [{ ...dense[0] }];
	let carry = 0;
	for (let i = 1; i < dense.length; i++) {
		const d = dist(dense[i - 1], dense[i]);
		carry += d;
		while (carry >= spacing) {
			const t = 1 - (carry - spacing) / (d || 1);
			out.push({
				x: lerp(dense[i - 1].x, dense[i].x, t),
				y: lerp(dense[i - 1].y, dense[i].y, t)
			});
			carry -= spacing;
		}
	}
	const last = dense[dense.length - 1];
	const tail = out[out.length - 1];
	if (dist(tail, last) > spacing * .25) out.push({ ...last });
	return out;
}
function pathLength(pts) {
	let n = 0;
	for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
	return n;
}
function classifyStroke(median) {
	const pts = median.map(([x, y]) => ({
		x,
		y
	}));
	if (pts.length < 3) return "dot";
	const len = pathLength(pts);
	if (len < 90) return "dot";
	const cutoff = len * .62;
	let acc = 0;
	let turn = 0;
	for (let i = 1; i < pts.length; i++) {
		const d = dist(pts[i - 1], pts[i]);
		acc += d;
		if (acc < cutoff || i < 2) continue;
		const a0 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
		const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
		turn += Math.abs(angleDiff(a0, a1));
	}
	if (turn > .7) return "hook";
	const last = dist(pts[pts.length - 2], pts[pts.length - 1]);
	const avg = len / Math.max(1, pts.length - 1);
	if (len > 260 && last > avg * .75) return "sweep";
	return "stop";
}
function pressureAt(t, kind) {
	const u = clamp(t, 0, 1);
	const attack = smoothstep(0, .1, u);
	switch (kind) {
		case "dot": return .5 + .5 * Math.sin(Math.PI * u);
		case "sweep": return (.26 + .74 * attack) * Math.pow(1 - u * .94, .7);
		case "hook":
			if (u < .6) return .32 + .62 * attack;
			return lerp(.94, .07, Math.pow((u - .6) / .4, .82));
		default: return (.4 + .6 * attack) * (u > .88 ? lerp(1, .7, (u - .88) / .12) : 1);
	}
}
function hash(i, seed) {
	const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
	return x - Math.floor(x);
}
/** Median coords are Make-Me-a-Hanzi: 1024 box, y-up. */
function toCell(pt, cell) {
	return {
		x: cell.x + pt[0] / 1024 * cell.w,
		y: cell.y + (1 - pt[1] / 1024) * cell.h
	};
}
function prepareGlyph(char, medians, outlines, cell, brushScale) {
	const base = Math.min(cell.w, cell.h) * .052 * brushScale;
	return {
		char,
		cell,
		strokes: medians.map((median, si) => {
			const kind = classifyStroke(median);
			const smooth = resampleSmooth(median.map((p) => toCell(p, cell)), Math.max(.6, Math.min(cell.w, cell.h) / 220));
			const len = pathLength(smooth);
			const samples = [];
			let acc = 0;
			for (let i = 0; i < smooth.length; i++) {
				const prev = smooth[Math.max(0, i - 1)];
				const next = smooth[Math.min(smooth.length - 1, i + 1)];
				if (i > 0) acc += dist(smooth[i - 1], smooth[i]);
				const t = len > 0 ? acc / len : 0;
				const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
				const belly = .76 + .4 * Math.abs(Math.sin(angle));
				const noise = .9 + .2 * hash(si * 97 + i, char.codePointAt(0) ?? 1);
				let radius = base * belly * pressureAt(t, kind) * noise;
				if (i > 0 && i < smooth.length - 1) {
					const a0 = Math.atan2(smooth[i].y - prev.y, smooth[i].x - prev.x);
					const a1 = Math.atan2(next.y - smooth[i].y, next.x - smooth[i].x);
					const kink = Math.min(.4, Math.abs(angleDiff(a0, a1)) * 1.6);
					radius *= 1 + kink;
				}
				samples.push({
					x: smooth[i].x,
					y: smooth[i].y,
					angle,
					t,
					radius,
					kind
				});
			}
			return {
				samples,
				kind,
				length: len,
				duration: 200 + pathLength(median.map(([x, y]) => ({
					x,
					y
				}))) * .7,
				outline: outlines[si] ?? ""
			};
		}),
		outlines
	};
}
function layoutCells(count, width, height) {
	const pad = Math.min(width, height) * .07;
	const innerW = width - pad * 2;
	const innerH = height - pad * 2;
	const cols = count <= 1 ? 1 : count === 2 ? 2 : count <= 4 ? 2 : count <= 6 ? 3 : Math.min(4, count);
	const rows = Math.ceil(count / cols);
	const cell = Math.min(innerW / cols, innerH / rows);
	const gridW = cell * cols;
	const gridH = cell * rows;
	const ox = (width - gridW) / 2;
	const oy = (height - gridH) / 2;
	const inset = cell * .06;
	return Array.from({ length: count }, (_, i) => {
		const c = i % cols;
		const r = Math.floor(i / cols);
		return {
			x: ox + c * cell + inset,
			y: oy + r * cell + inset,
			w: cell - inset * 2,
			h: cell - inset * 2
		};
	});
}
function ribbonSides(samples) {
	const left = [];
	const right = [];
	for (const s of samples) {
		const nx = Math.cos(s.angle + Math.PI / 2);
		const ny = Math.sin(s.angle + Math.PI / 2);
		left.push({
			x: s.x + nx * s.radius,
			y: s.y + ny * s.radius
		});
		right.push({
			x: s.x - nx * s.radius,
			y: s.y - ny * s.radius
		});
	}
	return {
		left,
		right
	};
}
function fillRibbon(ctx, left, right) {
	if (left.length < 2) return;
	ctx.beginPath();
	ctx.moveTo(left[0].x, left[0].y);
	for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
	for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
	ctx.closePath();
	ctx.fill();
}
function roundCap(ctx, s, scale = 1) {
	ctx.beginPath();
	ctx.save();
	ctx.translate(s.x, s.y);
	ctx.rotate(s.angle);
	ctx.ellipse(0, 0, s.radius * .72 * scale, s.radius * 1.05 * scale, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}
function paintStroke(ctx, stroke, untilT, ink) {
	const pts = stroke.samples.filter((s) => s.t <= untilT + .001);
	if (pts.length === 0) return;
	ctx.save();
	ctx.fillStyle = ink;
	ctx.globalAlpha = 1;
	if (pts.length === 1) {
		roundCap(ctx, pts[0], 1.05);
		ctx.restore();
		return;
	}
	const { left, right } = ribbonSides(pts);
	fillRibbon(ctx, left, right);
	roundCap(ctx, pts[0], stroke.kind === "dot" ? 1.15 : 1.05);
	const last = pts[pts.length - 1];
	if (stroke.kind === "sweep" || stroke.kind === "hook") roundCap(ctx, last, .7);
	else roundCap(ctx, last, 1);
	ctx.globalAlpha = .18;
	const bristleCount = 3;
	for (let b = 0; b < bristleCount; b++) {
		const sign = b % 2 === 0 ? 1 : -1;
		const mag = (.28 + b * .12) * sign;
		ctx.beginPath();
		let started = false;
		for (let i = 0; i < pts.length; i++) {
			const s = pts[i];
			const nx = Math.cos(s.angle + Math.PI / 2);
			const ny = Math.sin(s.angle + Math.PI / 2);
			const ox = s.x + nx * s.radius * mag;
			const oy = s.y + ny * s.radius * mag;
			if (!started) {
				ctx.moveTo(ox, oy);
				started = true;
			} else ctx.lineTo(ox, oy);
		}
		ctx.lineWidth = Math.max(.6, pts[Math.floor(pts.length / 2)]?.radius * .18);
		ctx.strokeStyle = ink;
		ctx.lineCap = "round";
		ctx.stroke();
	}
	ctx.restore();
}
function paintGrid(ctx, cell, color) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	ctx.globalAlpha = .42;
	ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
	ctx.beginPath();
	ctx.moveTo(cell.x + cell.w / 2, cell.y);
	ctx.lineTo(cell.x + cell.w / 2, cell.y + cell.h);
	ctx.moveTo(cell.x, cell.y + cell.h / 2);
	ctx.lineTo(cell.x + cell.w, cell.y + cell.h);
	ctx.stroke();
	ctx.globalAlpha = .18;
	ctx.setLineDash([4, 6]);
	ctx.beginPath();
	ctx.moveTo(cell.x, cell.y);
	ctx.lineTo(cell.x + cell.w, cell.y + cell.h);
	ctx.moveTo(cell.x + cell.w, cell.y);
	ctx.lineTo(cell.x, cell.y + cell.h);
	ctx.stroke();
	ctx.restore();
}
function paintGhost(ctx, outlines, cell, color) {
	ctx.save();
	ctx.translate(cell.x, cell.y + cell.h);
	ctx.scale(cell.w / 1024, -cell.h / 1024);
	ctx.fillStyle = color;
	ctx.globalAlpha = .16;
	for (const d of outlines) {
		if (!d) continue;
		try {
			ctx.fill(new Path2D(d));
		} catch {}
	}
	ctx.restore();
}
function paintSeal(ctx, cell, fill, paper, alpha) {
	const size = Math.min(cell.w, cell.h) * .18;
	const x = cell.x + cell.w - size * .15;
	const y = cell.y + cell.h - size * 1.05;
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.translate(x, y);
	ctx.rotate(-.08);
	const r = Math.max(2, size * .06);
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.roundRect(0, 0, size, size, r);
	ctx.fill();
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(size * .08, size * .08, size * .84, size * .84, r * .5);
	ctx.clip();
	ctx.fillStyle = paper;
	ctx.font = `800 ${size * .5}px "Shippori Mincho", "Noto Serif JP", serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("墨", size / 2, size / 2 + size * .03);
	ctx.restore();
	ctx.strokeStyle = fill;
	ctx.lineWidth = Math.max(2, size * .07);
	ctx.beginPath();
	ctx.roundRect(size * .07, size * .07, size * .86, size * .86, r * .5);
	ctx.stroke();
	ctx.restore();
}
var BrushPlayer = class {
	canvas;
	glyphs = [];
	raw = [];
	colors;
	paper;
	showGrid;
	showGhost;
	brushScale;
	speed;
	onUpdate;
	steps = [];
	stepIndex = 0;
	stepT = 0;
	playing = false;
	done = false;
	sealAlpha = 0;
	raf = 0;
	lastTs = 0;
	width = 0;
	height = 0;
	constructor(opts) {
		this.canvas = opts.canvas;
		this.raw = opts.glyphs;
		this.colors = opts.colors;
		this.paper = opts.paper;
		this.showGrid = opts.showGrid;
		this.showGhost = opts.showGhost;
		this.brushScale = opts.brushScale;
		this.speed = opts.speed;
		this.onUpdate = opts.onUpdate;
		this.resize();
		this.rebuild();
		if (opts.reducedMotion) this.finish();
		else {
			this.emit();
			this.draw();
		}
	}
	setSpeed(speed) {
		this.speed = Math.max(.25, speed);
	}
	setShowGrid(v) {
		this.showGrid = v;
		this.draw();
	}
	setShowGhost(v) {
		this.showGhost = v;
		this.draw();
	}
	setBrushScale(v) {
		this.brushScale = v;
		const playing = this.playing;
		const idx = this.stepIndex;
		const t = this.stepT;
		this.rebuild();
		this.stepIndex = Math.min(idx, this.steps.length);
		this.stepT = t;
		if (playing) this.play();
		else this.draw();
	}
	resize() {
		const parent = this.canvas.parentElement;
		const cssW = Math.max(1, parent?.clientWidth ?? 640);
		const cssH = Math.max(1, parent?.clientHeight ?? 640);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const nextW = Math.max(1, Math.round(cssW * dpr));
		const nextH = Math.max(1, Math.round(cssH * dpr));
		if (cssW === this.width && cssH === this.height && this.canvas.width === nextW && this.canvas.height === nextH) return false;
		this.canvas.style.width = `${cssW}px`;
		this.canvas.style.height = `${cssH}px`;
		this.canvas.width = nextW;
		this.canvas.height = nextH;
		const ctx = this.canvas.getContext("2d");
		if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.width = cssW;
		this.height = cssH;
		return true;
	}
	relayout() {
		if (!this.resize()) {
			this.draw();
			return;
		}
		const idx = this.stepIndex;
		const t = this.stepT;
		const done = this.done;
		const seal = this.sealAlpha;
		this.rebuild();
		this.stepIndex = Math.min(idx, this.steps.length);
		this.stepT = t;
		this.done = done;
		this.sealAlpha = seal;
		this.draw();
	}
	rebuild() {
		const cells = layoutCells(this.raw.length, this.width, this.height);
		this.glyphs = this.raw.map((g, i) => prepareGlyph(g.char, g.medians, g.strokes, cells[i], this.brushScale));
		this.steps = [];
		this.glyphs.forEach((g, gi) => {
			g.strokes.forEach((s, si) => {
				this.steps.push({
					type: "stroke",
					gi,
					si,
					duration: s.duration
				});
				this.steps.push({
					type: "pause",
					gi,
					si,
					duration: si === g.strokes.length - 1 ? 220 : 140
				});
			});
		});
		if (this.glyphs.length) this.steps.push({
			type: "seal",
			duration: 520
		});
		this.stepIndex = 0;
		this.stepT = 0;
		this.done = false;
		this.sealAlpha = 0;
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
		while (this.stepIndex < this.steps.length) {
			const step = this.steps[this.stepIndex];
			this.stepIndex += 1;
			this.stepT = 1;
			if (step.type === "stroke") break;
			if (step.type === "seal") {
				this.sealAlpha = 1;
				this.done = true;
				break;
			}
		}
		if (this.stepIndex >= this.steps.length) {
			this.done = true;
			this.sealAlpha = 1;
		}
		this.draw();
		this.emit();
	}
	finish() {
		this.playing = false;
		this.done = true;
		this.stepIndex = this.steps.length;
		this.stepT = 1;
		this.sealAlpha = 1;
		cancelAnimationFrame(this.raf);
		this.draw();
		this.emit();
	}
	destroy() {
		this.playing = false;
		cancelAnimationFrame(this.raf);
	}
	tick = (ts) => {
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
		this.draw();
		this.emit();
		if (this.playing) this.raf = requestAnimationFrame(this.tick);
	};
	snapshot() {
		let strokeIndex = 0;
		let strokeTotal = 0;
		let glyphIndex = 0;
		for (const g of this.glyphs) strokeTotal += g.strokes.length;
		const step = this.steps[Math.min(this.stepIndex, Math.max(0, this.steps.length - 1))];
		if (step && (step.type === "stroke" || step.type === "pause")) {
			glyphIndex = step.gi;
			strokeIndex = this.glyphs.slice(0, step.gi).reduce((n, g) => n + g.strokes.length, 0) + step.si;
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
			glyphTotal: this.glyphs.length
		};
	}
	emit() {
		this.onUpdate?.(this.snapshot());
	}
	draw() {
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		const w = this.width;
		const h = this.height;
		ctx.clearRect(0, 0, w, h);
		this.paintPaper(ctx, w, h);
		const completed = this.completedStrokes();
		for (const g of this.glyphs) {
			if (this.showGrid) paintGrid(ctx, g.cell, this.colors.grid);
			if (this.showGhost) paintGhost(ctx, g.outlines, g.cell, this.colors.ghost);
		}
		ctx.save();
		ctx.globalCompositeOperation = "source-over";
		for (const { gi, si } of completed) {
			const stroke = this.glyphs[gi]?.strokes[si];
			if (stroke) paintStroke(ctx, stroke, 1, this.colors.ink);
		}
		const current = this.currentStroke();
		if (current) paintStroke(ctx, current.stroke, current.t, this.colors.ink);
		ctx.restore();
		if (this.sealAlpha > 0) {
			const last = this.glyphs[this.glyphs.length - 1];
			if (last) paintSeal(ctx, last.cell, this.colors.seal, this.colors.paper, this.sealAlpha);
		}
	}
	completedStrokes() {
		const out = [];
		for (let i = 0; i < this.stepIndex; i++) {
			const s = this.steps[i];
			if (s.type === "stroke") out.push({
				gi: s.gi,
				si: s.si
			});
		}
		return out;
	}
	currentStroke() {
		const step = this.steps[this.stepIndex];
		if (!step || step.type !== "stroke") return null;
		const stroke = this.glyphs[step.gi]?.strokes[step.si];
		if (!stroke) return null;
		return {
			stroke,
			t: this.stepT
		};
	}
	paintPaper(ctx, w, h) {
		ctx.fillStyle = this.colors.paper;
		ctx.fillRect(0, 0, w, h);
		const img = this.paper;
		if (img && img.complete && img.naturalWidth > 0) {
			ctx.save();
			ctx.globalAlpha = .55;
			const tile = 420;
			for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) ctx.drawImage(img, x, y, tile, tile);
			ctx.restore();
		}
		const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .72);
		vignette.addColorStop(0, "rgba(28, 24, 20, 0)");
		vignette.addColorStop(1, "rgba(28, 24, 20, 0.08)");
		ctx.fillStyle = vignette;
		ctx.fillRect(0, 0, w, h);
	}
};
function cssColor(name, fallback) {
	if (typeof window === "undefined") return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function PaperCanvas({ glyphs, speed, showGrid, showGhost, brushScale, command, onSnapshot }) {
	const wrapRef = (0, import_react.useRef)(null);
	const canvasRef = (0, import_react.useRef)(null);
	const playerRef = (0, import_react.useRef)(null);
	const paperRef = (0, import_react.useRef)(null);
	const onSnapshotRef = (0, import_react.useRef)(onSnapshot);
	onSnapshotRef.current = onSnapshot;
	(0, import_react.useEffect)(() => {
		const img = new Image();
		img.src = "/washi.jpg";
		paperRef.current = img;
	}, []);
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas || glyphs.length === 0) return;
		const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const player = new BrushPlayer({
			canvas,
			glyphs,
			paper: paperRef.current,
			colors: {
				paper: cssColor("--color-paper", "#efe6d4"),
				ink: cssColor("--color-ink", "#1c1814"),
				grid: cssColor("--color-ink", "#1c1814"),
				ghost: cssColor("--color-ink", "#1c1814"),
				seal: cssColor("--color-seal", "#a33b2b")
			},
			showGrid,
			showGhost,
			brushScale,
			speed,
			reducedMotion: reduced,
			onUpdate: (s) => onSnapshotRef.current(s)
		});
		playerRef.current = player;
		if (!reduced) player.play();
		document.fonts?.ready?.then(() => player.relayout());
		const wrap = wrapRef.current;
		const ro = new ResizeObserver(() => player.relayout());
		if (wrap) ro.observe(wrap);
		return () => {
			ro.disconnect();
			player.destroy();
			playerRef.current = null;
		};
	}, [glyphs]);
	(0, import_react.useEffect)(() => {
		playerRef.current?.setSpeed(speed);
	}, [speed]);
	(0, import_react.useEffect)(() => {
		playerRef.current?.setShowGrid(showGrid);
	}, [showGrid]);
	(0, import_react.useEffect)(() => {
		playerRef.current?.setShowGhost(showGhost);
	}, [showGhost]);
	(0, import_react.useEffect)(() => {
		playerRef.current?.setBrushScale(brushScale);
	}, [brushScale]);
	(0, import_react.useEffect)(() => {
		const p = playerRef.current;
		if (!p || !command) return;
		if (command === "play") p.play();
		if (command === "pause") p.pause();
		if (command === "replay") p.replay();
		if (command === "step") p.stepStroke();
		if (command === "finish") p.finish();
	}, [command]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: wrapRef,
		className: "relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-paper shadow-[0_20px_50px_rgba(0,0,0,0.28)] ring-1 ring-ink/10",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
			ref: canvasRef,
			className: "block size-full"
		})
	});
}
function Input({ className, type, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		type,
		"data-slot": "input",
		className: cn("h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-paper px-3 text-base text-ink", "placeholder:text-ink-soft/70", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50", "disabled:cursor-not-allowed disabled:opacity-50", className),
		...props
	});
}
function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }) {
	const _values = import_react.useMemo(() => Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min], [
		value,
		defaultValue,
		min
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider$1, {
		"data-slot": "slider",
		defaultValue,
		value,
		min,
		max,
		className: cn("relative flex w-full touch-none items-center select-none", className),
		...props,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
			className: "relative h-1.5 w-full grow overflow-hidden rounded-full bg-ink/15",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: "absolute h-full bg-ink" })
		}), Array.from({ length: _values.length }, (_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, { className: "block size-4 rounded-full border border-ink bg-paper shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50" }, i))]
	});
}
var loadGlyphs = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 8).join("")).handler(createSsrRpc("9010fbbd12f869d6fdc88fde2b64bea7bc494b0777bb28406213144e44017634"));
/** Characters verified against hanzi-writer-data (kaisho stroke geometry). */
var PRESETS = [
	{
		char: "永",
		reading: "ei",
		gloss: "eternity"
	},
	{
		char: "墨",
		reading: "sumi",
		gloss: "ink"
	},
	{
		char: "筆",
		reading: "fude",
		gloss: "brush"
	},
	{
		char: "書",
		reading: "sho",
		gloss: "write"
	},
	{
		char: "道",
		reading: "dō",
		gloss: "way"
	},
	{
		char: "夢",
		reading: "yume",
		gloss: "dream"
	},
	{
		char: "愛",
		reading: "ai",
		gloss: "love"
	},
	{
		char: "心",
		reading: "kokoro",
		gloss: "heart"
	},
	{
		char: "空",
		reading: "sora",
		gloss: "sky"
	},
	{
		char: "龍",
		reading: "ryū",
		gloss: "dragon"
	},
	{
		char: "武",
		reading: "bu",
		gloss: "martial"
	},
	{
		char: "禪",
		reading: "zen",
		gloss: "zen"
	},
	{
		char: "無",
		reading: "mu",
		gloss: "void"
	},
	{
		char: "花",
		reading: "hana",
		gloss: "flower"
	},
	{
		char: "月",
		reading: "tsuki",
		gloss: "moon"
	},
	{
		char: "風",
		reading: "kaze",
		gloss: "wind"
	},
	{
		char: "山",
		reading: "yama",
		gloss: "mountain"
	},
	{
		char: "海",
		reading: "umi",
		gloss: "sea"
	},
	{
		char: "火",
		reading: "hi",
		gloss: "fire"
	},
	{
		char: "水",
		reading: "mizu",
		gloss: "water"
	}
];
var listScroll = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("ae901654e7c4e926544debbe11c722ec02648f87bbedf82363e73786699355fa"));
var pinKanji = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 8).join("")).middleware([authMiddleware]).handler(createSsrRpc("15ec3051d9cdc7e86d5a21c9561ee3bcacd87e05a452ebaaf582950d35ba7acf"));
var unpinKanji = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 1).join("")).middleware([authMiddleware]).handler(createSsrRpc("7ee68225e74c832dfe4d26c13be3008b19049bdd2112270e1d30232e1cdc86bb"));
var DEFAULT = "永";
function Studio() {
	const { user, isPending } = useCurrentUserState();
	const [query, setQuery] = (0, import_react.useState)(DEFAULT);
	const [glyphs, setGlyphs] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [speed, setSpeed] = (0, import_react.useState)(1);
	const [brushScale, setBrushScale] = (0, import_react.useState)(1);
	const [showGrid, setShowGrid] = (0, import_react.useState)(true);
	const [showGhost, setShowGhost] = (0, import_react.useState)(true);
	const [command, setCommand] = (0, import_react.useState)(null);
	const [snap, setSnap] = (0, import_react.useState)(null);
	const [scroll, setScroll] = (0, import_react.useState)([]);
	const composing = (0, import_react.useRef)(false);
	const cmdTimer = (0, import_react.useRef)(null);
	const written = glyphs.map((g) => g.char).join("");
	const pinned = written.length > 0 && written.split("").every((c) => scroll.includes(c));
	function fire(next) {
		setCommand(next);
		if (cmdTimer.current) window.clearTimeout(cmdTimer.current);
		cmdTimer.current = window.setTimeout(() => setCommand(null), 40);
	}
	async function write(raw) {
		const chars = extractKanji(raw, 8);
		if (!chars.length) {
			toast("Enter a kanji character — kana and Latin are ignored.");
			return;
		}
		setLoading(true);
		try {
			const results = await loadGlyphs({ data: chars.join("") });
			const ok = results.filter((r) => r.ok);
			const missing = results.filter((r) => !r.ok).map((r) => r.char);
			if (missing.length) toast(`No stroke order for ${missing.join(" ")}`);
			if (!ok.length) {
				setLoading(false);
				return;
			}
			setGlyphs(ok);
			setQuery(ok.map((g) => g.char).join(""));
		} catch (err) {
			toast(err instanceof Error ? err.message : "Could not load stroke order.");
		} finally {
			setLoading(false);
		}
	}
	(0, import_react.useEffect)(() => {
		write(DEFAULT);
	}, []);
	(0, import_react.useEffect)(() => {
		if (isPending || !user) {
			setScroll([]);
			return;
		}
		listScroll().then((rows) => setScroll(rows.map((r) => r.kanji))).catch(() => setScroll([]));
	}, [user, isPending]);
	async function togglePin() {
		if (!user) {
			toast("Sign in to keep a practice scroll.");
			return;
		}
		if (!written) return;
		try {
			if (pinned) {
				await Promise.all(written.split("").map((k) => unpinKanji({ data: k })));
				setScroll((s) => s.filter((k) => ![...written].includes(k)));
			} else {
				await pinKanji({ data: written });
				setScroll((s) => [...written, ...s.filter((k) => ![...written].includes(k))]);
			}
		} catch {
			toast("Could not update your scroll. Try signing in again.");
		}
	}
	const strokeLabel = snap && snap.strokeTotal > 0 ? `Stroke ${Math.min(snap.strokeIndex + 1, snap.strokeTotal)} of ${snap.strokeTotal}` : "—";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col text-paper",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center gap-3 px-4 py-3 sm:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-2xl leading-none tracking-tight",
							children: "墨"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-[0.7rem] tracking-[0.18em] text-paper/55 uppercase",
							children: "Sumi"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-md",
						onSubmit: (e) => {
							e.preventDefault();
							if (!composing.current) write(query);
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: query,
							onChange: (e) => setQuery(e.target.value),
							onCompositionStart: () => {
								composing.current = true;
							},
							onCompositionEnd: (e) => {
								composing.current = false;
								setQuery(e.currentTarget.value);
							},
							placeholder: "Type a kanji",
							"aria-label": "Kanji to write",
							className: "h-10 max-w-[12rem] bg-paper/95 font-display text-lg sm:max-w-none",
							autoCapitalize: "off",
							autoCorrect: "off",
							spellCheck: false
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							size: "sm",
							className: "shrink-0 bg-paper text-ink hover:bg-paper/90",
							children: "Write"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthSlot, {})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6",
				children: PRESETS.map((p) => {
					const active = written === p.char;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void write(p.char),
						className: `flex shrink-0 flex-col items-center rounded-[var(--radius-sm)] px-2.5 py-1.5 transition-colors duration-[var(--motion-quick)] ${active ? "bg-paper text-ink" : "bg-paper/8 text-paper hover:bg-paper/14"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-display text-xl leading-none",
							children: p.char
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-1 text-[0.65rem] tracking-wide opacity-70",
							children: p.reading
						})]
					}, p.char);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16.5rem] lg:items-start",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "relative",
					children: [loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] bg-desk/20",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-7 animate-spin text-paper" })
					}), glyphs.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaperCanvas, {
						glyphs,
						speed,
						showGrid,
						showGhost,
						brushScale,
						command,
						onSnapshot: setSnap
					}, written) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid aspect-square place-items-center rounded-[var(--radius-lg)] bg-paper text-ink-soft",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-lg",
							children: "Enter a kanji to begin."
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "rounded-[var(--radius-xl)] bg-paper p-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.18)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tracking-[0.16em] text-ink-soft uppercase",
							children: "Writing"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 font-display text-4xl leading-none",
							children: written || "—"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-mono text-sm tabular-nums text-ink-soft",
							children: strokeLabel
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5 flex flex-wrap gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "icon-sm",
									"aria-label": snap?.playing ? "Pause" : "Play",
									onClick: () => fire(snap?.playing ? "pause" : "play"),
									children: snap?.playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, {})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "icon-sm",
									variant: "outline",
									"aria-label": "Replay",
									onClick: () => fire("replay"),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, {})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "icon-sm",
									variant: "outline",
									"aria-label": "Next stroke",
									onClick: () => fire("step"),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									size: "sm",
									variant: "outline",
									className: "ml-auto",
									onClick: togglePin,
									children: [pinned ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookmarkCheck, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bookmark, {}), pinned ? "Saved" : "Save"]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "mt-6 block text-xs tracking-wide text-ink-soft uppercase",
							children: ["Speed", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 font-mono tabular-nums text-ink",
								children: [speed.toFixed(1), "×"]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
							className: "mt-3",
							min: .4,
							max: 2.4,
							step: .1,
							value: [speed],
							onValueChange: (v) => setSpeed(v[0] ?? 1)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "mt-5 block text-xs tracking-wide text-ink-soft uppercase",
							children: ["Brush", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "ml-2 font-mono tabular-nums text-ink",
								children: brushScale.toFixed(1)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
							className: "mt-3",
							min: .6,
							max: 1.6,
							step: .05,
							value: [brushScale],
							onValueChange: (v) => setBrushScale(v[0] ?? 1)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-5 flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								label: "Copybook grid",
								checked: showGrid,
								onChange: setShowGrid
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								label: "Ghost outline",
								checked: showGhost,
								onChange: setShowGhost
							})]
						}),
						user && scroll.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-6 border-t border-border pt-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs tracking-[0.16em] text-ink-soft uppercase",
								children: "Your scroll"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 flex flex-wrap gap-1.5",
								children: scroll.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void write(k),
									className: "grid size-10 place-items-center rounded-[var(--radius-xs)] bg-ink/6 font-display text-lg hover:bg-ink/10",
									children: k
								}, k))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-6 text-[0.7rem] leading-relaxed text-ink-soft",
							children: "Stroke geometry from Make Me a Hanzi / Hanzi Writer (Arphic). The brush follows each stroke’s centerline in order, with pressure of a kaisho fude."
						})
					]
				})]
			})
		]
	});
}
function ToggleRow({ label, checked, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			role: "switch",
			"aria-checked": checked,
			onClick: () => onChange(!checked),
			className: `relative h-6 w-10 rounded-full transition-colors duration-[var(--motion-quick)] ${checked ? "bg-ink" : "bg-ink/20"}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `absolute top-0.5 left-0.5 size-5 rounded-full bg-paper transition-transform duration-[var(--motion-quick)] ${checked ? "translate-x-4" : "translate-x-0"}` })
		})]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Studio, {});
}
//#endregion
export { Home as component };
