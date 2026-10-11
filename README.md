# 墨 Sumi

[日本語](README.ja.md) · [简体中文](README.zh-CN.md)

A kanji calligraphy editor for creating customizable animations of a simulated brush writing a character. Edit the paths, curve the segments, specify stroke types and pressure, reorder strokes, and export a looping GIF.

**Live version:** [sumi-kanji-editor.grok.me](https://sumi-kanji-editor.grok.me/)

## Why I made this

The purpose of Sumi is to create fully customizable animated kanji calligraphy. Instead of relying on fixed stroke-order animations, you can define your own paths, brush behavior, pressure, and stroke characteristics.

It can be used for language-learning materials, stroke-order demonstrations, digital calligraphy tools, animated illustrations, logos, signage, and other projects that need brush-written characters. Use it freely, fork it, or extract the parts you need.

## Run locally

Use **Node.js 22** and npm:

```sh
npm ci
npm run dev
```

Open **http://localhost:8080/**. The server uses port 8080 and fails if that port is already occupied.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The stack is React, TypeScript, TanStack Start, Vite, Tailwind CSS v4, and Nitro. The production build targets Vercel and writes `.vercel/output`. The current `npm run preview` command does not provide a working standalone production preview for this build target; use the development server for local editing.

No database configuration is required for local editing: PGLite provides the local database fallback. Set `DATABASE_URL` for Postgres; `npm run build` runs the SQL migrations when it is configured. The hosted Google/X sign-in uses the Grok auth integration. Running the editor locally does not require signing in; hosting sign-in elsewhere requires configuring the authentication integration separately.

## Using the editor

1. Enter a kanji or short compound.
2. Choose Kaisho, Wet, Dry, or Goat and adjust the brush sliders.
3. Turn on **Edit** to edit paths and place stroke-type pins.
4. Choose **GIF** to export a looping animation.

The GIF uses your current paths, curves, stroke order, pins, brush settings, speed, grid, and ghost-outline settings. **Export paths** downloads the editable configuration as JSON; it is not an import or backup-restore interface.

Path edits are saved in this browser's local storage and reload when you return to the character. The **Save** button in the writing panel saves a favorite character when signed in; it does not export the edited paths. Local edits are not synchronized between browsers.

## The definitive 永

永 is the project's reference character. Its built-in definition is in [`src/lib/brush/yong-template.ts`](src/lib/brush/yong-template.ts), captured from the project owner's edited paths. It preserves the exact nodes, quadratic curve controls, stroke order, and pins, including the latest dot pressure of 1.35× and the third stroke’s 1×–1.3× pressure controls.

Fresh loads use this template when there are no saved personal edits. **Reset** restores it. **Suggest** restores its pin layout while retaining your paths. Saved personal edits take precedence.

| Stroke | Types |
| --- | --- |
| 1 | 側 Dot |
| 2 | 勒 Horizontal → 努 Vertical → 趯 Hook |
| 3 | 策 Rise → 掠 Sweep left |
| 4 | 啄 Short left |
| 5 | 磔 Splay right |

The curved strokes use control points rather than chains of extra nodes. Other characters start with inferred paths and pins, which users can adjust to their preferred forms.

## Path editing and stroke order

| Control | Behavior |
| --- | --- |
| Move | Drag a node to move it. Drag between nodes to curve the segment without adding nodes. Click a segment to insert a node; splitting a curve preserves its shape. |
| Starting node | Click the first node in Move mode to edit the starting angle and pressure. Angles are relative to the page. |
| Earlier / Later | Select a node in Move mode, then move its entire stroke earlier or later. Curves and modifiers move with it. The new order is saved and used for playback and GIFs. |
| Draw | Click to place nodes; double-click to finish. New strokes initially go at the end of the sequence. |
| Delete | Remove a node or pin. |
| Suggest | Replace the type pins with inferred suggestions; preserve paths, curves, and starting settings. |
| Reset | Discard this browser's edits for the displayed characters and restore their built-in defaults. |
| Clear | Remove the paths so you can draw from a blank page. |
| Export paths | Download the displayed characters' complete editable path configurations. |

Curves are quadratic Bézier segments. They are shared by the path overlay, brush simulation, and GIF exporter. The simulation updates when an edit is committed.

## Imported path cleanup

The stroke database often draws brush gestures into its centerlines. Sumi supplies those gestures through stroke modifiers instead.

- Straight horizontal and vertical imports of at least 90 database units can become two original body nodes. More than 60% of path length must be within 12° of the axis, with a coherent body direction. A horizontal's natural rise, typically around 5°, is retained.
- Beginning and ending flourishes are trimmed. Small downward sideways releases on verticals are distinguished from real hooks.
- Sharp turns, upward hooks, and substantial curves are preserved. The whole tail is inspected, including rounded corners leading into 宀 roof hooks. Roof strokes receive Horizontal and Hook pins at their actual junction.
- Whole-stroke Short left imports can lose one or two starting nodes when a sharp entry bend occupies no more than 25% of the path. Smooth starts and substantial first legs remain intact.
- 永 uses its definitive template rather than database cleanup. Saved edits are preserved, except for narrowly identified repairs to previously shortened roof imports and the known accidental 永 stroke-order swap.

These are heuristics, not a complete calligraphy classifier. Type suggestions on other characters remain editable. The original database outlines continue to supply the ghost reference and paper framing.

## Stroke types and pressure

The first type pin names the stroke from its beginning. Later type pins take over at their positions. Pressure pins multiply the resulting envelope; one applies to the whole stroke, while several interpolate between their values.

The normal body pressure is **0.5** in the simulation's pressure scale. In the table, body-relative multipliers describe the stroke envelope; starting-gesture multipliers separately scale the underlying initial pressure. Final simulated pressure is bounded at **2**.

| Type | Pressure behavior |
| --- | --- |
| 側 Dot | 0.75× body pressure at the start, 1.35× at 75% of the path, then 1× at the endpoint. Finishes with a stationary rounded cap. |
| 勒 Horizontal | Even body pressure with an automatic closing gesture. No separate Stop pin is needed. |
| 努 Vertical | Body pressure dips to 0.9×, holds, then returns to 1×. A Stop pin gives a rounded cap; a Hook belongs at the terminal bend. |
| 趯 Hook | The preceding 10% builds nonlinearly to 1.5× incoming pressure. The hook holds its starting pressure for its first 40%, then tapers to zero. |
| 策 Rise | Horizontal-style start and thickness. After the first 20%, tapers to 0.25×. No horizontal closing gesture. The following type starts at its own normal pressure. |
| 掠 Sweep left | Starts at roughly 1.33× body pressure and tapers to zero. Default starting-gesture multiplier: 1×. |
| 啄 Short left | Starts at simulation pressure 1 and tapers steeply to zero. Default starting-gesture multiplier: 1×. |
| 磔 Splay right | Builds from simulation pressure 0.1 to 1 over the first 75%, then tapers to zero along the path. |

### Starting gestures and transitions

Starting gestures stay on the edited path: pressure and brush orientation settle over the first 20%. Horizontal, Vertical, and Rise default to a **1.9× starting-pressure multiplier**. The angle menu allows **0.25×–3×** per stroke.

Default page-relative angles are **135° for Vertical**, **110° for Horizontal and Rise**, and **160° for other types**. Explicit settings override these defaults. Reset defaults in the menu removes the per-stroke overrides.

A horizontal closing gesture reverses the natural entry envelope and reaches about 15% more pressure. It uses the stroke's starting angle, while starting-pressure adjustments affect only the entry. At a horizontal-to-type junction, that closing gesture happens before the new type; the outgoing stroke releases the extra pressure over its first 20% instead of carrying it through its whole body. Rise hands off at the next type's own starting pressure.

| Modifier | Behavior |
| --- | --- |
| 圧 Pressure | Multiplies the complete envelope, including its start and finish; values above 1× also affect horizontal endings. |
| 折 Fold | Brief pressure accent with an outer-corner miter. |
| 止 Stop | Rounded vertical cap; horizontal or diagonal endings use the direction-dependent closing envelope. |
| 払 Lift | Pressure tapers from the pin toward a fine ending. |

## Brush simulation

Each simulated bristle follows a spring-damped brush contact point. Pressure changes contact, spread, and footprint. Size, bristle count, stiffness, splay, ink, and softness are adjustable.

The brush footprint and low-pressure bristle correction change continuously as pressure rises, avoiding a snap during dot strokes. Rounded endings blend into the moving footprint and join the settling bristle marks. Initial ink joining blends the coarse hair marks over the first 8% of the path; later portions retain their texture. Wet gap filling is applied separately to each stroke, preserving spaces between strokes. Brush-footprint orientation is handled independently of travel direction to avoid twisting or redirecting the path.

GIF export uses the same brush player and streams frames rather than retaining the entire animation in memory.

## Repository and hosting notes

Grok's PWA middleware, preview-host bridge, OAuth helpers, and `startup.sh` support the existing hosted version. The brush engine and local path editing are independent of those features. A standalone hosting port needs corresponding build and authentication configuration; deleting the platform files alone is not a complete port.

Generated `.vercel/output` and local QA captures are ignored. Two curated screenshots remain in `screenshots/`. Historical source archives, unused multiplayer scaffolding, and generic Grok authoring guides have been removed; `AGENTS.md` contains project-specific contributor notes.

## Project structure

- `src/lib/brush/` — geometry, curves, stroke types, bristle simulation, wet paper, playback, GIF export, and the 永 template.
- `src/lib/kanji/` — database loading and character metadata.
- `src/components/` — studio, canvas, path editor, angle dial, and controls.
- `src/routes/`, `src/lib/auth/`, `src/lib/db.ts`, `migrations/` — pages, sign-in, and optional favorites storage.
- `scripts/editor.test.mjs` — regression tests for editing, cleanup, pressure envelopes, curves, persistence, ordering, and export.

## Reuse and attribution

The application code is [MIT licensed](LICENSE). Copy the repository, extract the brush engine, or adapt it to another project. Attribution to this project is appreciated but not required by its MIT license beyond the license's notice requirements.

Stroke paths and outlines come from `hanzi-writer-data`, derived from Make Me a Hanzi and Arphic fonts. **That data is separately licensed under the Arphic Public License**, including the derived coordinates in the 永 template. See [`licenses/ARPHICPL.txt`](licenses/ARPHICPL.txt) and the installed package's README for its attribution. The application's MIT license does not replace that data license.
