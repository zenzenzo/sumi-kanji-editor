# 墨 Sumi

A kanji calligraphy editor. Type a character, edit the stroke-order path, pin how each line should be written, and export a looping GIF of a simulated fude writing it.

Use it, fork it, strip it for parts. The whole project is yours to repurpose.

A live version is at [sumi.grok.me](https://sumi.grok.me).

## Why it exists

The main use-case is producing **fully customizable animated GIFs** of kanji calligraphy — your path, your pins, your brush — not a stock stroke-order animation.

1. Pick the character (or a short compound)
2. Choose a brush — Kaisho, Wet, Dry, Goat — and the sliders
3. Edit or draw the median, drop type pins so the motion matches 永字八法
4. Hit **GIF** in the writing panel

The file downloads as `sumi-永.gif` (or whatever you wrote). Grid, ghost outline, speed, and your path edits are all in the recording.

**永 is the template character.** Its suggested pins follow 永字八法 on the real stroke-order medians. Load 永, hit **Suggest** if you need a clean set, and treat that as the reference for every other glyph.

## Path editor

Turn on **Edit path**. The overlay is the stroke-order median (from [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)); the ink is a bristle simulation that follows it.

| Tool | What it does |
| --- | --- |
| **Move** | Drag vertices. Click a segment to insert a point |
| **Draw** | Click to place nodes, double-click to place the final node. New strokes ink in the order you drew them |
| **Delete** | Click a vertex or pin to remove it |

**Suggest** writes type pins from geometry (永 has a dedicated template). **Reset** restores the original medians and pins. **Clear** wipes every path so you can draw on a blank page — the ghost outline and the paper stay in the original character’s frame, they do not zoom to fit a short new line.

The brush only resimulates when you finish a drag or finish a drawn path.

## Type pins — 永字八法

A stroke has **no built-in type**. Type is a pin. The first type pin names the whole stroke from the start; a later type pin takes over from that point and runs to the end (or to the next pin). Pressure is a **multiplier** on top of that envelope, never a type switch.

Default body is **50%** of the fully-pressed tuft (the Size slider). 2× pressure reaches the reserved max.

| Pin | English | Envelope |
| --- | --- | --- |
| **側** | Dot | ~30% → 80%. A 点, not a line |
| **勒** | Horizontal | Flat 50% 横 |
| **努** | Vertical | Thirds: **50% → 45%**, hold **45%**, **45% → 50%**. 着筆 at the start |
| **趯** | Hook | Hold 50% for 40%, then taper to 0 (はね) |
| **策** | Rise | 11% → 50% by 45% of the span, then taper. No 着筆 |
| **掠** | Sweep left | ~67% → 0 over the whole span, `(1−t)^0.88` (⅓ heavier than the pressure at the start of the span) |
| **啄** | Short left | **100% → 0**, `(1−t)^1.35`. 着筆 at the start, landing at full pressure |
| **磔** | Splay right | 10% → 100% over the first 75%, then taper to 0 on the path |


The "suggested" feature will place pins on a character. However, only 永 has the correct stroke type pins by default. Choose a Kanji and try applying stroke type pins to paths to achieve the desired result. If the stroke type nodes fail to achieve the desired result, the pressure nodes can be used for more granular adjustments. A singular pressure node will apply to a whole stroke, but multiple pressure nodes can be chained, and the transitions are smoothed.


**example of a suggested layout for 永**

| Stroke | Pins |
| --- | --- |
| 1 | 側 |
| 2 | 勒 near the start, 努 just after node 4, 趯 just after node 8 |
| 3 | 策 near the start, 掠 after node 6 |
| 4 | 啄 |
| 5 | 磔 |

If 策 meets 掠, rise only runs until the 掠 pin; sweep left then owns the rest of the path. It does not die at the pin.

**着筆** (pre-path) is a short lean-and-settle before 努, 勒, and 啄 follow the vector. The editable path does not include that motion.

## Finish and accent pins

| Pin | What it does |
| --- | --- |
| **圧 Pressure** | Multiplier on the type. One pin sets the whole stroke; two pins blend between them (first value holds from the start, last value holds to the end) |
| **折 Fold** | 折れ — reserved max pressure, miter the outside of a square corner |
| **止 Stop** | 止め — hold ≥92%, nose past the tip and double back into a teardrop |
| **払 Lift** | 払い — from the pin, thickness closes to a point near the end of the remaining path. The tuft packs; hairs do not lift off as a comb |

Path color after a type pin is that type’s muted color, so chaining is visible.

## Brush

The Size slider is the **fully pressed** footprint. Pressure scales that footprint so bristles pack together on a lift, and still decides which hairs reach the paper (centre first). That is the same idea as Krita bristle *Scale* / Photoshop bristle splay.

Presets: **Kaisho** (wolf-hair), **Wet**, **Dry** (flying white), **Goat** (soft, lags on turns). Size, bristle count, splay, ink, stiffness, and softness are live.

Wet gap-fill is per stroke on the live layer only — intended space between strokes stays paper.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:8080`).

```bash
npm run build      # production build
npm run typecheck
```

Node 22. Stack is TanStack Start, Vite, Tailwind v4. Auth and the optional favorites table use Postgres (Neon in production, PGLite locally). Sign in (Google / X) if you want a scroll of favorites. Path edits live in the browser.

## Reuse

**MIT.** Copy the repo, lift `src/lib/brush/` into another project, change the paper, throw away the UI — no permission needed.

If you ship a fork, a nod in your own readme is kind but not required. Please keep the [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) attribution if you still load its stroke medians.

## Layout

```
src/lib/brush/     bristle sim, wet-paper commit, path pins, stroke prep, GIF export
src/lib/kanji/     glyph loading, presets
src/components/    studio, paper, path editor + toolbar
src/routes/        pages and auth
```

The interesting files if you are stealing the brush:

- [`src/lib/brush/bristles.ts`](src/lib/brush/bristles.ts) — tuft physics, pressure-scaled spread, stamps
- [`src/lib/brush/wet.ts`](src/lib/brush/wet.ts) — per-stroke gap fill (never across strokes)
- [`src/lib/brush/engine.ts`](src/lib/brush/engine.ts) — 着筆, 止め hook, 折れ miter, 磔 envelope
- [`src/lib/brush/edits.ts`](src/lib/brush/edits.ts) — pins, chaining, 永 template
- [`src/lib/brush/gif-export.ts`](src/lib/brush/gif-export.ts) — looping GIF from the same player

## License

[MIT](LICENSE) © contributors
