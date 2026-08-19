# 墨 Sumi

A kanji calligraphy editor for making **fully customizable animated GIFs** of a brush writing a character — and for studying how those strokes are actually meant to be written.

Type a kanji, tune the fude, pin 折れ / 磔 / 止め / 払い on the path, then export a looping GIF of the piece. Use it, fork it, strip it for parts. The whole project is yours to repurpose.

## Why it exists

The main use-case is producing a GIF that looks like *your* calligraphy, not a stock stroke-order animation:

1. Pick the character (or a short compound)
2. Choose a brush — Kaisho, Wet, Dry, Goat — and the sliders
3. Edit the median and drop pins so the motion matches 永字八法
4. Hit **GIF** in the writing panel

The file downloads as `sumi-永.gif` (or whatever you wrote). Grid, ghost outline, speed, and your path edits are all in the recording.

## What it does

Stroke-order geometry comes from [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data). Sumi does not replay those polylines as ribbons. A tuft of spring-damped bristles follows the path, deposits ink, and (on wetter settings) closes the gaps between nearby hairs — only inside the stroke that is being written, so intended space between strokes stays paper.

You can then edit the median itself:

- Drag points, click a line to add one
- **Delete** a point or pin with the eraser tool
- Pins for **pressure**, **折れ** (fold), **磔** (sweep), **止め** (stop), and **払い** (lift)

Those pins exist so the raw stroke-order data can be corrected toward how the character is actually meant to be written — the eight methods of 永 (永字八法).

| Pin | What it does |
| --- | --- |
| Pressure | Body weight. 100% on this pin is 75% of the tuft; the rest is reserved |
| 折れ Fold | Sharp corner: press to the reserved maximum, miter the outside, then leave |
| 磔 Sweep | Thin start (~10%), ramps to full reserved pressure, ends in a press |
| 止め Stop | Teardrop halt — the path doubles back over itself |
| 払い Lift | Taper / flick. Floors around 20% so the tip does not vanish |

Brush presets: **Kaisho** (wolf-hair), **Wet**, **Dry** (flying white), **Goat** (soft, lags on turns). Size, bristle count, splay, ink, stiffness, and softness are live.

Sign in (Google / X) if you want to keep a scroll of favorites. Path edits live in the browser.

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

Node 22. Stack is TanStack Start, Vite, Tailwind v4. Auth and the optional favorites table use Postgres (Neon in production, PGLite locally).

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

- [`src/lib/brush/bristles.ts`](src/lib/brush/bristles.ts) — tuft physics and stamps
- [`src/lib/brush/wet.ts`](src/lib/brush/wet.ts) — per-stroke gap fill (never across strokes)
- [`src/lib/brush/engine.ts`](src/lib/brush/engine.ts) — 止め hook, 折れ miter, 磔 envelope
- [`src/lib/brush/edits.ts`](src/lib/brush/edits.ts) — pins and pressure

## License

[MIT](LICENSE) © contributors
