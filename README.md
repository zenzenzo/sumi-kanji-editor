# 墨 Sumi

> **README translations - 日本語訳 - 中文翻译:** [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

A kanji calligraphy editor. Enter a character, edit its stroke paths, specify how each stroke should be written using pins, and export a looping GIF of a simulated brush writing the character.

Use it freely, fork it, or extract whatever parts are useful to you. The project is intended to be modified and reused in other projects.

**Live version:** https://sumi-kanji-editor.grok.me/

## Why I made this

The primary purpose of Sumi is to create fully customizable animated kanji calligraphy. Instead of being limited to a pre-rendered stroke-order animation, you can define your own paths, brush behavior, pressure, and stroke characteristics.

Sumi can also be useful for:

- Japanese and Chinese language-learning materials
- Children's educational materials for learning kanji and hanzi
- Interactive stroke-order demonstrations
- Digital calligraphy tools
- Animated kanji illustrations
- Websites and applications that need customizable brush-written characters
- Creating reference material for different calligraphic styles

The goal is not simply to show *which* stroke comes next, but to give each stroke the physical character of brush writing: pressure changes, 起筆, 折れ, 止め, 払い, and the way the brush's bristles respond as the stroke changes direction.

1. Pick a character (or a short compound).
2. Choose a brush — Kaisho, Wet, Dry, or Goat — and adjust the sliders.
3. Edit or draw the centerlines and place type pins to define the stroke behavior.
4. Hit the GIF button in the writing panel.

The result exports as `sumi-永.gif` (or whatever character you entered). The grid, ghost outline, speed, and your path edits are all captured in the animation.

**永** is the template character. Its recommended pin placement is based on the centerlines of the actual stroke order and the 永字八法. Load 永 and press Suggest if you want a clean set of pins to use as a reference when editing other characters.

## Path Editor

Turn on **Edit path** to see the stroke centerlines (sourced from `hanzi-writer-data`) and edit them. The simulated brush follows these paths.

| Tool | Behavior |
| --- | --- |
| Move | Drag vertices. Click a segment to insert a point. |
| Draw | Click to place nodes; double-click to place the final node. New strokes are inked in the order they are drawn. |
| Delete | Click a vertex or pin to remove it. |
| Suggest | Infers type pins from the geometry (永 has a dedicated template). Reset restores the original centerlines and pins. Clear removes all paths so you can start from a blank page; the ghost outline and paper retain the original character's frame rather than zooming to fit a short new stroke. |

The brush is re-simulated only when you finish dragging or finish a drawn path.

## Type Pins — 永字八法

Strokes do not have a type by default. Their behavior is defined by pins.

The first type pin on a stroke defines its type from the beginning. If another type pin is placed later, that type takes over from that position until the next pin or the end of the stroke. Pressure acts as a multiplier on this envelope; it does not change the stroke type.

The default body is **50% of the brush's maximum tuft size**. At 2× pressure, it reaches the reserved maximum.

| Pin | English | Envelope |
| --- | --- | --- |
| 側 | Dot | ~30% → 80%. A point, not a line. |
| 勒 | Horizontal | Flat 50% throughout. |
| 努 | Vertical | 50% → 45%, holds at 45%, then 45% → 50%. Includes a beginning settling action (着筆). |
| 趯 | Hook | Hold 50% for the first 40%, then taper to 0. The hook/flick. |
| 策 | Rise | 11% at the start → 50% at 45% of the path, then taper. No beginning settling action. |
| 掠 | Sweep left | ~67% → 0 over the entire path, `(1−t)^0.88`. The beginning pressure is about 1/3 heavier than normal. |
| 啄 | Short left | 100% → 0, `(1−t)^1.35`. Includes a beginning settling action and lands at maximum pressure. |
| 磔 | Splay right | 10% → 100% over the first 75%, then tapers to 0 along the path. |

**Suggest** places type pins based on the character's geometry. Currently, only **永** has a built-in set of correct stroke-type pins. For other characters, select the character and place type pins on each path to produce the behavior you want.

If type pins alone do not produce the desired result, use pressure pins for finer control. One pressure pin can apply to the entire stroke, or multiple pressure pins can be placed in sequence with smooth interpolation between them.

### Recommended 永 Layout

| Stroke | Pins |
| --- | --- |
| 1 | 側 |
| 2 | 勒 (near start), 努 (just after node 4), 趯 (just after node 8) |
| 3 | 策 (near start), 掠 (after node 6) |
| 4 | 啄 |
| 5 | 磔 |

When 策 transitions into 掠, the 策 rise continues only until the 掠 pin. 掠 then takes over the remainder of the path rather than disappearing abruptly at the pin.

**着筆 (pre-path)** is a short "tilt and settle the brush" motion performed before 努, 勒, and 啄 begin moving along the vector path. This motion is generated by the brush engine and is not part of the editable path.

## Finish & Accent Pins

| Pin | Behavior |
| --- | --- |
| 圧 Pressure | Multiplier on the stroke type. One pin applies to the entire stroke; two or more pins interpolate between their values. |
| 折 Fold | Applies a brief maximum-pressure spike and miters the outside of the corner so a change of direction reads as a fold rather than a rounded curve. |
| 止 Stop | Holds ≥92% pressure, noses slightly past the endpoint, then doubles back to form a teardrop-shaped pool of ink. |
| 払 Lift | From the pin onward, thickness lerps down toward a point near the end of the remaining path. The bristles close together as pressure drops rather than simply lifting away like a comb. |

Paths after a type pin are tinted with a soft color corresponding to that type, making it easier to see where behavior changes when multiple types are used on the same stroke.

## Brush

The **Size** slider represents the contact area of the brush when fully pressed down. Pressure scales that area, so during a lift the bristles close together and the set of bristles contacting the paper changes from the center outward.

This is conceptually similar to brush Scale in Krita or splay in Photoshop's bristle brushes.

Presets:

- **Kaisho** — wolf hair
- **Wet**
- **Dry** — 飛白
- **Goat** — soft and slower to follow changes in direction

Size, bristle count, splay, ink load, stiffness, and softness can all be adjusted in real time.

Wet gap filling is performed per stroke. It does not fill across separate strokes, so areas of paper that should remain open between strokes stay open.

## Running

```text
npm install
npm run dev
```

Then open the URL provided by Vite (default `http://localhost:8080`).

```text
npm run build      # production build
npm run typecheck
```

Node 22. Built with TanStack Start, Vite, and Tailwind v4.

Authentication and the optional favorites table use Postgres (Neon in production, PGLite locally). Sign in with Google or X to save a list of favorite characters. Path edits are stored in the browser.

## Reuse

MIT licensed. Copy the repository, extract `src/lib/brush/` into another project, replace the paper effect, remove the UI, or otherwise modify it however you like. No permission is required.

If you publish a fork, mentioning this project in your README is appreciated but not required. If you use the stroke centerlines from `hanzi-writer-data`, retain its attribution.

## Project Structure

```text
src/lib/brush/     Bristle simulation, wet-paper processing, path pins,
                   stroke preparation, GIF export

src/lib/kanji/     Character data loading and presets

src/components/    Studio, paper, path editor, and toolbar

src/routes/        Pages and authentication
```

Files of particular interest if you want to extract the brush system into another project:

- `src/lib/brush/bristles.ts` — bristle physics, pressure-dependent splay, stamping
- `src/lib/brush/wet.ts` — per-stroke gap filling (never across strokes)
- `src/lib/brush/engine.ts` — 着筆, stop hooks, fold miters, 磔 envelope
- `src/lib/brush/edits.ts` — pins, sequences, and the 永 template
- `src/lib/brush/gif-export.ts` — exports looping GIFs using the same player

## License

MIT © contributors
