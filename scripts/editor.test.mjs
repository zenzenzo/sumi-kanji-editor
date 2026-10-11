import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Compile the actual brush modules for Node without adding a test framework.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "sumi-editor-test-"));
const require = createRequire(import.meta.url);
for (const name of [
  "yong-template",
  "geometry",
  "curves",
  "edits",
  "bristles",
  "engine",
  "settings",
  "wet",
  "player",
  "gif-export",
]) {
  const source = readFileSync(join(root, `src/lib/brush/${name}.ts`), "utf8");
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    })
    .outputText.replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"')
    .replace(
      '"gifenc/dist/gifenc.esm.js"',
      JSON.stringify(pathToFileURL(require.resolve("gifenc/dist/gifenc.esm.js")).href),
    );
  writeFileSync(join(temp, `${name}.mjs`), compiled);
}
after(() => rmSync(temp, { recursive: true, force: true }));
const load = (name) => import(pathToFileURL(join(temp, `${name}.mjs`)).href);
const { editsFromMedians, mergeEdit, saveGlyphEdit, bookForGlyphs, suggestPins, clearGlyphEdit, reorderStroke } = await load("edits");
const { classifyStroke, simplifyStraightStroke, verticalHookIndex, horizontalHookIndex, trimShortLeftEntry, vertexPathT } =
  await load("geometry");
const { BrushPlayer } = await load("player");
const { BristleSim } = await load("bristles");
const { DEFAULT_BRUSH } = await load("settings");
const { prepareGlyph, projectToCell, glyphBounds } = await load("engine");
const { YONG_TEMPLATE } = await load("yong-template");
const { pressureAlongStroke, hookPressureBoost, entryPressureForStroke, entryAngleForStroke } = await load("edits");
const { curvePoint, sampleStrokePath, insertStrokePoint, removeStrokePoint } = await load("curves");
const { renderCalligraphyGif } = await load("gif-export");
const medians = [
  [
    [100, 100],
    [800, 800],
  ],
];

function withStorage(fn) {
  const original = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    fn();
  } finally {
    globalThis.window = original;
  }
}

test("added strokes survive saving and reloading, including older non-custom edits", () => {
  withStorage(() => {
    for (const custom of [false, true]) {
      const edit = editsFromMedians("永", medians);
      edit.custom = custom;
      edit.strokes.push({
        points: [
          [50, 50],
          [300, 300],
        ],
        pins: [],
      });
      saveGlyphEdit(edit);
      const reloaded = bookForGlyphs([{ char: "永", medians }])["永"];
      assert.deepEqual(JSON.parse(JSON.stringify(reloaded.strokes)), edit.strokes);
    }
  });
});

test("intentional type-pin removal survives saving and reloading", () => {
  withStorage(() => {
    const edit = editsFromMedians("永", medians);
    edit.strokes[0].pins = [{ id: "pressure", t: 0.5, kind: "pressure", pressure: 1.5 }];
    saveGlyphEdit(edit);
    assert.deepEqual(
      bookForGlyphs([{ char: "永", medians }])["永"].strokes[0].pins,
      edit.strokes[0].pins,
    );
    edit.strokes[0].pins = [];
    saveGlyphEdit(edit);
    assert.deepEqual(bookForGlyphs([{ char: "永", medians }])["永"].strokes[0].pins, []);
  });
});

test("older edits still receive their legacy pin migration", () => {
  const base = editsFromMedians("永", medians);
  const legacy = { char: "永", strokes: [{ points: medians[0], pins: [] }] };
  assert.equal(mergeEdit(base, legacy).strokes[0].pins[0].kind, "soku");
});

test("changing splay resimulates existing ink", () => {
  const player = Object.create(BrushPlayer.prototype);
  let resimulated = 0;
  Object.assign(player, {
    settings: DEFAULT_BRUSH,
    glyphs: [],
    colors: { ink: "#000" },
    sim: { setSettings() {}, setInk() {} },
    draw() {},
    resimulateToCursor() {
      resimulated += 1;
    },
  });
  player.setSettings({ ...DEFAULT_BRUSH, splay: DEFAULT_BRUSH.splay + 0.5 });
  assert.equal(resimulated, 1);
});

async function withExportPlayer(fn) {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const methods = {};
  for (const name of ["finish", "rewind", "tickMs", "readPixels", "pixelSize", "destroy"])
    methods[name] = BrushPlayer.prototype[name];
  let removed = false;
  let destroyed = false;
  globalThis.document = {
    createElement: (tag) =>
      tag === "canvas"
        ? { style: {}, getContext: () => null }
        : {
            style: {},
            setAttribute() {},
            appendChild() {},
            remove() {
              removed = true;
            },
          },
    body: { appendChild() {} },
  };
  globalThis.window = { setTimeout };
  globalThis.cancelAnimationFrame = () => {};
  BrushPlayer.prototype.finish = () => {};
  BrushPlayer.prototype.rewind = () => {};
  BrushPlayer.prototype.readPixels = () => ({ data: new Uint8ClampedArray([20, 20, 20, 255]) });
  BrushPlayer.prototype.pixelSize = () => ({ w: 1, h: 1 });
  BrushPlayer.prototype.destroy = () => {
    destroyed = true;
  };
  const opts = {
    glyphs: [],
    edits: {},
    settings: DEFAULT_BRUSH,
    speed: 0.4,
    showGrid: false,
    showGhost: false,
    paper: null,
    size: 1,
    colors: { paper: "#fff", ink: "#000", ghost: "#000", grid: "#000", seal: "#f00" },
  };
  try {
    await fn(opts);
    assert.equal(removed, true);
    assert.equal(destroyed, true);
  } finally {
    Object.assign(globalThis, saved);
    Object.assign(BrushPlayer.prototype, methods);
  }
}

test("GIF export captures beyond 720 frames until the player finishes", async () => {
  await withExportPlayer(async (opts) => {
    let ticks = 0;
    BrushPlayer.prototype.tickMs = () => ++ticks < 725;
    const blob = await renderCalligraphyGif(opts);
    assert.equal(ticks, 725);
    assert.equal(blob.type, "image/gif");
    assert.ok(blob.size > 0);
  });
});

test("GIF export removes its temporary canvas when capture fails", async () => {
  await withExportPlayer(async (opts) => {
    BrushPlayer.prototype.tickMs = () => {
      throw new Error("capture failed");
    };
    await assert.rejects(renderCalligraphyGif(opts), /capture failed/);
  });
});

const glyphData = (char) =>
  JSON.parse(readFileSync(join(root, `node_modules/hanzi-writer-data/${char}.json`), "utf8"));

test("dot classification depends on path length, not node count", () => {
  assert.equal(
    classifyStroke([
      [0, 0],
      [0, 800],
    ]),
    "stop",
  );
  assert.equal(
    classifyStroke([
      [0, 0],
      [800, 70],
    ]),
    "stop",
  );
  assert.equal(
    classifyStroke([
      [0, 0],
      [0, 30],
    ]),
    "dot",
  );
  assert.equal(classifyStroke(Array.from({ length: 10 }, (_, i) => [i * 2, i])), "dot");
  assert.equal(classifyStroke([]), "dot");
});

test("十 imports a horizontal alone and a vertical with a stop", () => {
  const { medians } = glyphData("十");
  const original = structuredClone(medians);
  const edit = editsFromMedians("十", medians);
  assert.deepEqual(
    edit.strokes.map((s) => s.points.length),
    [2, 2],
  );
  assert.deepEqual(
    edit.strokes.map((s) => s.pins.map((p) => p.kind)),
    [["horizontal"], ["vertical", "stop"]],
  );
  const [a, b] = edit.strokes[0].points;
  assert.ok(b[1] > a[1], "horizontal retains its gentle rise");
  assert.ok((b[1] - a[1]) / (b[0] - a[0]) < 0.2);
  assert.deepEqual(medians, original, "source geometry stays intact");
});

test("long horizontals in 一二三 use horizontal pins", () => {
  for (const char of ["一", "二", "三"]) {
    const edit = editsFromMedians(char, glyphData(char).medians);
    assert.ok(
      edit.strokes.every((s) => s.points.length === 2 && s.pins[0].kind === "horizontal"),
      char,
    );
  }
});

test("cleanup preserves folded strokes, hooks, curves, and diagonal sweeps", () => {
  assert.equal(
    simplifyStraightStroke([
      [0, 800],
      [0, 0],
      [-130, 100],
    ]),
    null,
  );
  assert.equal(
    simplifyStraightStroke([
      [0, 700],
      [500, 700],
      [500, 100],
    ]),
    null,
  );
  assert.equal(
    simplifyStraightStroke([
      [0, 700],
      [90, 500],
      [90, 300],
      [0, 100],
    ]),
    null,
  );
  const yong = glyphData("永");
  assert.deepEqual(editsFromMedians("永", yong.medians), YONG_TEMPLATE);
  for (const median of glyphData("口").medians.slice(1, 2)) {
    assert.equal(simplifyStraightStroke(median), null);
  }
  assert.equal(
    simplifyStraightStroke([
      [800, 800],
      [500, 450],
      [100, 100],
    ]),
    null,
  );
});

test("saved user geometry and explicit pins override cleaned import defaults", () => {
  const { medians } = glyphData("十");
  const saved = {
    char: "十",
    version: 3,
    custom: false,
    strokes: medians.map((points) => ({
      points,
      pins: [{ id: "user", t: 0.5, kind: "pressure", pressure: 1.2 }],
    })),
  };
  const merged = mergeEdit(editsFromMedians("十", medians), saved);
  assert.deepEqual(
    merged.strokes.map((s) => s.points),
    medians,
  );
  assert.deepEqual(
    merged.strokes.map((s) => s.pins),
    saved.strokes.map((s) => s.pins),
  );
});

function gestureStroke(points, mode, multiplier = 1, entryAngle, entryPressure) {
  const pins = [
    { id: "type", t: 0.1, kind: mode },
    { id: "stop", t: 0.9, kind: "stop" },
    { id: "pressure", t: 0.5, kind: "pressure", pressure: multiplier },
  ];
  return prepareGlyph(
    "test",
    [points],
    [],
    { x: 0, y: 0, w: 400, h: 400 },
    { char: "test", custom: true, strokes: [{ points, pins, entryAngle, entryPressure }] },
  ).strokes[0];
}

test("entry starts at the first path point with a type-specific brush angle", () => {
  for (const [points, mode] of [
    [
      [
        [0, 0],
        [800, 0],
      ],
      "horizontal",
    ],
    [
      [
        [0, 800],
        [0, 0],
      ],
      "vertical",
    ],
  ]) {
    const { samples } = gestureStroke(points, mode);
    const expected = projectToCell(
      points[0],
      { x: 0, y: 0, w: 400, h: 400 },
      glyphBounds([points]),
    );
    assert.ok(Math.abs(samples[0].angle - ((mode === "vertical" ? 135 : 110) * Math.PI) / 180) < 1e-9);
    assert.ok(Math.hypot(samples[0].x - expected.x, samples[0].y - expected.y) < 1e-9);
    assert.equal(samples[0].t, 0);
  }
});

test("stop inherits the stroke pressure rather than forcing maximum pressure", () => {
  for (const mode of ["horizontal", "vertical"]) {
    const pins = [
      { id: "type", t: 0.1, kind: mode },
      { id: "stop", t: 0.9, kind: "stop" },
    ];
    assert.ok(pressureAlongStroke(1, pins, { kind: "stop", inferred: "auto" }) <= 0.5);
  }
});

test("vertical stop rounds in place without overshoot or pressure inflation", () => {
  for (const multiplier of [0.6, 1, 1.5]) {
    const { samples } = gestureStroke(
      [
        [0, 800],
        [0, 0],
      ],
      "vertical",
      multiplier,
    );
    const end = samples.at(-19);
    const finish = samples.slice(-18);
    assert.ok(finish.length > 0);
    assert.ok(finish.every((s) => Math.abs(s.x - end.x) < 1e-9 && Math.abs(s.y - end.y) < 1e-9));
    assert.ok(finish.every((s) => s.pressure <= end.pressure && s.hold && s.blot));
    assert.equal(finish.at(-1).pressure, 0);
  }
});

test("horizontal stop reverses the entry envelope with a 15 percent stronger peak", () => {
  const { samples } = gestureStroke(
    [
      [0, 0],
      [800, 0],
    ],
    "horizontal",
    0.4,
    135,
  );
  const path = samples.slice(0, -18);
  const body = 0.2;
  const peak = path.at(-1);
  assert.ok(Math.abs(peak.pressure - path[0].pressure * 1.15) < 1e-9);
  assert.ok(Math.abs(Math.sin(peak.angle - (135 * Math.PI) / 180)) < 1e-9);
  const tail = path.filter((s) => s.t / 0.86 >= 0.8);
  assert.ok(tail.every((s) => s.pressure >= body && s.pressure <= 1));
  assert.ok(tail.slice(1).every((s, i) => s.pressure >= tail[i].pressure));
  for (const t of [0.8, 0.85, 0.9, 0.95, 1]) {
    const s = path.reduce((a, b) => (Math.abs(a.t / 0.86 - t) < Math.abs(b.t / 0.86 - t) ? a : b));
    const u = (t - 0.8) / 0.2;
    assert.ok(Math.abs(s.pressure - body * (1 + 0.9 * u ** 4) * (1 + 0.15 * u)) < 0.004);
  }
  assert.ok(path.every((s) => Math.abs(s.y - path[0].y) < 1e-9));
  assert.ok(samples.slice(-18).every((s) => s.x === peak.x && s.y === peak.y));
  assert.equal(samples.at(-1).pressure, 0);
});

test("a curved segment bends between two fixed endpoint nodes", () => {
  const stroke = {
    points: [
      [0, 0],
      [800, 0],
    ],
    curves: [[400, 200]],
    pins: [],
  };
  assert.deepEqual(curvePoint(stroke, 0, 0.5), [400, 100]);
  const samples = sampleStrokePath(stroke);
  assert.deepEqual(samples[0].point, stroke.points[0]);
  assert.deepEqual(samples.at(-1).point, stroke.points[1]);
  assert.ok(samples.some((s) => s.point[1] > 90));
  assert.equal(stroke.points.length, 2);
});

test("splitting a curved segment inserts a node without changing its shape", () => {
  const stroke = {
    points: [
      [0, 0],
      [800, 0],
    ],
    curves: [[250, 300]],
    pins: [],
  };
  const original = structuredClone(stroke);
  const split = 0.35;
  insertStrokePoint(stroke, 0, split);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const actual =
      t <= split
        ? curvePoint(stroke, 0, t / split)
        : curvePoint(stroke, 1, (t - split) / (1 - split));
    const expected = curvePoint(original, 0, t);
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-8);
  }
});

test("deleting a node preserves curves on unaffected segments", () => {
  const stroke = {
    points: [
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
    ],
    curves: [
      [50, 20],
      [150, 30],
      [250, 40],
    ],
    pins: [],
  };
  removeStrokePoint(stroke, 1);
  assert.deepEqual(stroke.curves, [null, [250, 40]]);
  assert.equal(stroke.points.length, 3);
});

test("curvature survives save/reload and reaches the brush simulation", () => {
  withStorage(() => {
    const points = [
      [0, 0],
      [800, 0],
    ];
    const edit = {
      char: "一",
      version: 3,
      custom: false,
      strokes: [
        { points, curves: [[400, 240]], pins: [{ id: "type", t: 0.2, kind: "horizontal" }] },
      ],
    };
    saveGlyphEdit(edit);
    const restored = bookForGlyphs([{ char: "一", medians: [points] }])["一"];
    assert.deepEqual(restored.strokes[0].curves, edit.strokes[0].curves);
    const cell = { x: 0, y: 0, w: 400, h: 400 };
    const curved = prepareGlyph("一", [points], [], cell, restored);
    const straight = prepareGlyph("一", [points], [], cell, {
      ...restored,
      strokes: [{ ...restored.strokes[0], curves: undefined }],
    });
    assert.ok(curved.strokes[0].length > straight.strokes[0].length * 1.03);
    assert.ok(
      curved.strokes[0].samples.every(
        (s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.pressure),
      ),
    );
    assert.equal(restored.strokes[0].points.length, 2);
  });
});

test("entry pressure releases over the first 20 percent of the existing line", () => {
  const points = [
    [0, 0],
    [800, 0],
  ];
  for (const multiplier of [0.4, 1, 1.5, 2]) {
    const { samples } = gestureStroke(points, "horizontal", multiplier);
    const path = samples.slice(0, -18);
    const body = Math.min(1, 0.5 * multiplier);
    assert.ok(Math.abs(path[0].pressure - Math.min(1, 0.5 * 1.9) * multiplier) < 1e-9);
    const middle = path.reduce((a, b) =>
      Math.abs(a.t / 0.86 - 0.1) < Math.abs(b.t / 0.86 - 0.1) ? a : b,
    );
    assert.ok(Math.abs(middle.pressure - Math.min(1, 0.5 * 1.05625) * multiplier) < 0.004);
    const settled = path.filter((s) => s.t / 0.86 >= 0.2 && s.t / 0.86 < 0.8);
    assert.ok(settled.length > 0 && settled.every((s) => Math.abs(s.pressure - body) < 1e-9));
    assert.ok(
      path.every(
        (s) => Number.isFinite(s.pressure) && s.pressure >= body - 1e-9 && s.pressure <= 2,
      ),
    );
    assert.ok(
      path.every((s) => Math.abs(s.y - path[0].y) < 1e-9),
      "pressure does not move the path",
    );
  }
});

test("per-stroke orientation changes the brush heading without moving its path", () => {
  const points = [
    [0, 800],
    [0, 0],
  ];
  const a = gestureStroke(points, "vertical", 1, 45);
  const b = gestureStroke(points, "vertical", 1, 270);
  assert.ok(Math.abs(a.samples[0].angle - Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(b.samples[0].angle - Math.PI * 1.5) < 1e-9);
  assert.deepEqual(
    a.samples.map((s) => [s.x, s.y, s.pressure, s.t]),
    b.samples.map((s) => [s.x, s.y, s.pressure, s.t]),
  );
  const settled = a.samples.filter((s) => s.t / 0.86 >= 0.2 && s.t <= 0.86);
  assert.ok(settled.every((s) => Math.abs(Math.sin(s.angle) - 1) < 1e-9));
});

test("starting orientation survives saving and loading for each stroke independently", () => {
  withStorage(() => {
    const { medians } = glyphData("十");
    const edit = editsFromMedians("十", medians);
    edit.strokes[0].entryAngle = 45;
    edit.strokes[0].entryPressure = 2.5;
    edit.strokes[1].entryPressure = 0.75;
    edit.strokes[1].entryAngle = 210;
    for (const custom of [false, true]) {
      saveGlyphEdit({ ...edit, custom });
      const restored = bookForGlyphs([{ char: "十", medians }])["十"];
      assert.deepEqual(
        restored.strokes.map((s) => s.entryAngle),
        [45, 210],
      );
      assert.deepEqual(restored.strokes.map((s) => s.entryPressure), [2.5, 0.75]);
    }
  });
});

test("initial ink joining fades completely before the rest of the stroke", () => {
  const { samples } = gestureStroke(
    [
      [0, 0],
      [800, 0],
    ],
    "horizontal",
  );
  const path = samples.slice(0, -18);
  assert.equal(path[0].entryBleed, 1);
  assert.ok(path.filter((s) => s.t / 0.86 >= 0.08).every((s) => s.entryBleed === 0));
  assert.ok(path.every((s) => s.entryBleed >= 0 && s.entryBleed <= 1));
  assert.ok(path.slice(1).every((s, i) => s.entryBleed <= path[i].entryBleed));
});

test("initial bleed joins coarse hair marks while later dry texture retains its normal fill", () => {
  function footprint(entryBleed) {
    const fills = [];
    let closed = false;
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      beginPath() {
        closed = false;
      },
      moveTo() {},
      lineTo() {},
      arc() {},
      closePath() {
        closed = true;
      },
      fill() {
        if (closed) fills.push(this.globalAlpha);
      },
      stroke() {},
      createRadialGradient() {
        return { addColorStop() {} };
      },
    };
    const sim = new BristleSim(DEFAULT_BRUSH, "#000");
    sim.setRadius(12);
    sim.press(ctx, {
      x: 100,
      y: 100,
      angle: (160 * Math.PI) / 180,
      t: 0,
      pressure: 0.9,
      kind: "stop",
      hold: false,
      blot: false,
      entryBleed,
    });
    return Math.max(...fills);
  }
  assert.equal(footprint(1), 1);
  assert.ok(footprint(0) < 0.7);
});

test("changing brush orientation preserves the tuft centre and forward velocity", () => {
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  const mean = (hairs, key) =>
    hairs.reduce(
      (v, h) => ({ x: v.x + h[key].x / hairs.length, y: v.y + h[key].y / hairs.length }),
      { x: 0, y: 0 },
    );
  for (const heading of [0, 20, 90, 160, 180, 210, 270, 359]) {
    const sim = new BristleSim(DEFAULT_BRUSH, "#000");
    const sample = {
      x: 100,
      y: 100,
      angle: 0,
      pathAngle: 0,
      t: 0.8,
      pressure: 0.6,
      kind: "stop",
      hold: false,
      blot: false,
    };
    sim.press(ctx, sample);
    for (const hair of sim.hairs) {
      hair.tip.x -= 40; // realistic lag behind the moving brush
      hair.vel.x = 20;
      hair.vel.y = 0;
    }
    const before = mean(sim.hairs, "tip");
    const variance = sim.hairs.reduce(
      (n, h) => n + (h.tip.x - before.x) ** 2 + (h.tip.y - before.y) ** 2,
      0,
    );
    sim.step(ctx, { ...sample, angle: (heading * Math.PI) / 180 }, 0);
    const after = mean(sim.hairs, "tip");
    const velocity = mean(sim.hairs, "vel");
    const afterVariance = sim.hairs.reduce(
      (n, h) => n + (h.tip.x - after.x) ** 2 + (h.tip.y - after.y) ** 2,
      0,
    );
    assert.ok(
      Math.hypot(after.x - before.x, after.y - before.y) < 1e-8,
      `angle ${heading} must not redirect lag`,
    );
    assert.ok(Math.hypot(velocity.x - 20, velocity.y) < 1e-8);
    assert.ok(Math.abs(afterVariance - variance) < 1e-7, "rotation must not collapse the tuft");
  }
});

test("envelope orientations use equivalent brush axes and preserve travel directions", () => {
  for (const [points, mode, pathAngle] of [
    [
      [
        [0, 0],
        [800, 0],
      ],
      "horizontal",
      0,
    ],
    [
      [
        [0, 800],
        [0, 0],
      ],
      "vertical",
      Math.PI / 2,
    ],
  ]) {
    for (const degrees of [0, 20, 90, 160, 180, 210, 270, 359]) {
      const { samples } = gestureStroke(points, mode, 1, degrees);
      const body = samples.slice(0, -18);
      assert.ok(body.every((s) => Math.abs(Math.sin(s.pathAngle - pathAngle)) < 1e-8));
      assert.ok(body.every((s) => Number.isFinite(s.angle) && Number.isFinite(s.pressure)));
      for (let i = 1; i < body.length; i++) {
        const a = body[i - 1].angle,
          b = body[i].angle;
        let d = b - a;
        while (d > Math.PI / 2) d -= Math.PI;
        while (d < -Math.PI / 2) d += Math.PI;
        assert.ok(
          Math.abs(d) < 0.2,
          `mode ${mode} angle ${degrees} sample ${i}: ${a} -> ${b}, delta ${d}, t=${body[i].t}`,
        );
      }
    }
  }
});

test("vertical hooks are suggested at the actual terminal bend rather than a fixed fraction", () => {
  for (const [char, index] of [
    ["丁", 1],
    ["于", 2],
    ["手", 3],
    ["水", 0],
    ["小", 0],
    ["寸", 1],
  ]) {
    const median = glyphData(char).medians[index];
    const edit = editsFromMedians(char, glyphData(char).medians);
    const stroke = edit.strokes[index];
    const hookIndex = verticalHookIndex(median);
    assert.ok(hookIndex != null, char);
    assert.deepEqual(
      stroke.pins.map((p) => p.kind),
      ["vertical", "hane"],
      char,
    );
    assert.ok(
      Math.abs(
        stroke.pins[1].t -
          vertexPathT(
            median.map(([x, y]) => ({ x, y })),
            hookIndex,
          ),
      ) < 1e-9,
      char,
    );
    assert.deepEqual(stroke.points, median, "hook geometry must survive import cleanup");
  }
});

test("straight verticals stop and a downward left sweep is not mistaken for an upward hook", () => {
  assert.equal(
    verticalHookIndex([
      [0, 800],
      [0, 0],
    ]),
    null,
  );
  assert.equal(
    verticalHookIndex([
      [0, 800],
      [0, 200],
      [-100, 0],
    ]),
    null,
  );
  assert.deepEqual(
    editsFromMedians("十", glyphData("十").medians).strokes[1].pins.map((p) => p.kind),
    ["vertical", "stop"],
  );
});

test("pressure modifiers scale the whole horizontal ending above 1x", () => {
  const points = [
    [0, 0],
    [800, 0],
  ];
  const peak = (multiplier) =>
    gestureStroke(points, "horizontal", multiplier).samples.at(-19).pressure;
  const p = [0.5, 1, 1.5, 2].map(peak);
  assert.ok(p[1] > p[0] && p[2] > p[1] && p[3] > p[2]);
  assert.ok(Math.abs(p[2] - p[1] * 1.5) < 1e-9);
  assert.ok(p[3] <= 2);
  const sim = new BristleSim(DEFAULT_BRUSH, "#000");
  assert.ok(
    sim.tuftScale(p[2]) > sim.tuftScale(p[1]),
    "higher ending pressure increases the actual contact footprint",
  );
});

test("Hook builds to 1.5x pressure over its preceding 10 percent at an increasing rate", () => {
  const pins = [
    { id: "vertical", t: 0.1, kind: "vertical" },
    { id: "hook", t: 0.8, kind: "hane" },
  ];
  const hints = { kind: "hook", inferred: "auto" };
  const boosts = [0.7, 0.725, 0.75, 0.775, 0.8 - 1e-10].map((t) => hookPressureBoost(t, pins));
  assert.ok(Math.abs(boosts[0] - 1) < 1e-9);
  assert.ok(Math.abs(boosts.at(-1) - 1.5) < 1e-8);
  const rises = boosts.slice(1).map((b, i) => b - boosts[i]);
  assert.ok(rises.every((r, i) => i === 0 || r > rises[i - 1]));
  assert.equal(hookPressureBoost(0.65, pins), 1);
  const before = pressureAlongStroke(0.8 - 1e-9, pins, hints);
  const at = pressureAlongStroke(0.8, pins, hints);
  const after = pressureAlongStroke(0.8 + 1e-9, pins, hints);
  assert.ok(Math.abs(at - 0.75) < 1e-9);
  assert.ok(
    Math.abs(before - at) < 1e-7 && Math.abs(after - at) < 1e-7,
    "pressure hands off continuously at the Hook",
  );
});

test("a Hook alone affects its junction rather than tapering the entire preceding path", () => {
  const pins = [{ id: "hook", t: 0.8, kind: "hane" }];
  const hints = { kind: "hook", inferred: "auto" };
  assert.equal(pressureAlongStroke(0.5, pins, hints), 0.5);
  assert.equal(pressureAlongStroke(0.8, pins, hints), 0.75);
});

test("overpressure keeps brush physics finite across an entire stroke", () => {
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  const sim = new BristleSim(DEFAULT_BRUSH, "#000");
  sim.setRadius(12);
  for (let i = 0; i < 120; i++) {
    const sample = {
      x: i,
      y: 100,
      angle: 0,
      pathAngle: 0,
      t: i / 120,
      pressure: 2,
      kind: "stop",
      hold: false,
      blot: false,
    };
    if (i === 0) sim.press(ctx, sample);
    else sim.step(ctx, sample, 0.014);
  }
  assert.ok(
    sim.hairs.every(
      (h) =>
        Number.isFinite(h.tip.x) &&
        Number.isFinite(h.tip.y) &&
        Number.isFinite(h.vel.x) &&
        Number.isFinite(h.vel.y),
    ),
  );
});


test("starting pressure changes only the first 20 percent and combines with pressure pins", () => {
  for (const mode of ["horizontal", "vertical"]) {
    const points = mode === "horizontal" ? [[0, 0], [800, 0]] : [[0, 800], [0, 0]];
    const normal = gestureStroke(points, mode, 1, 160, 1.9);
    for (const peak of [0.25, 1, 2.5, 3]) {
      const changed = gestureStroke(points, mode, 1, 160, peak);
      assert.ok(Math.abs(changed.samples[0].pressure / normal.samples[0].pressure - peak / 1.9) < 1e-9);
      assert.deepEqual(changed.samples.filter(s => s.t / 0.86 >= 0.2), normal.samples.filter(s => s.t / 0.86 >= 0.2));
    }
    const scaled = gestureStroke(points, mode, 1.2, 160, 2.5);
    const unscaled = gestureStroke(points, mode, 1, 160, 2.5);
    assert.ok(Math.abs(scaled.samples[0].pressure - unscaled.samples[0].pressure * 1.2) < 1e-9);
  }
});

test("dots build to 1.35 times body pressure at 75 percent then release to body pressure", () => {
  const pins = [{ id: "dot", t: 0.25, kind: "soku" }];
  const hint = { kind: "dot", inferred: "auto" };
  for (const [t, expected] of [[0, 0.375], [0.375, 0.525], [0.75, 0.675], [0.875, 0.5875], [1, 0.5]]) {
    assert.ok(Math.abs(pressureAlongStroke(t, pins, hint) - expected) < 1e-9);
  }
});

test("dots follow the entire line and finish with a stationary rounded cap in any direction", () => {
  for (const points of [[[0, 0], [800, 0]], [[0, 800], [0, 0]], [[0, 800], [500, 0]]]) {
    for (const multiplier of [0.5, 1, 1.5]) {
      const pins = [{ id: "dot", t: 0.25, kind: "soku" }, { id: "pressure", t: 0.5, kind: "pressure", pressure: multiplier }];
      const stroke = prepareGlyph("test", [points], [], { x: 0, y: 0, w: 400, h: 400 }, { char: "test", custom: true, strokes: [{ points, pins }] }).strokes[0];
      const path = stroke.samples.slice(0, -18);
      const finish = stroke.samples.slice(-18);
      const first = path[0], last = path.at(-1);
      assert.ok(Math.abs(first.pressure - 0.375 * multiplier) < 1e-9);
      assert.ok(Math.abs(last.pressure - 0.5 * multiplier) < 1e-9);
      assert.ok(finish.every(s => s.x === last.x && s.y === last.y && s.hold && s.blot));
      assert.ok(finish.every(s => s.pressure <= last.pressure));
      assert.equal(finish.at(-1).pressure, 0);
      const dx = last.x - first.x, dy = last.y - first.y;
      assert.ok(path.every((s, i) => i === 0 || (s.x - path[i-1].x) * dx + (s.y - path[i-1].y) * dy >= -1e-9));
    }
  }
});

test("horizontal-to-left-sweep closes with horizontal pressure and hands it off continuously", () => {
  const pins = [{ id: "h", kind: "horizontal", t: 0.1 }, { id: "s", kind: "ryaku", t: 0.6 }];
  const hint = { kind: "hook", inferred: "auto" };
  assert.equal(pressureAlongStroke(0.48, pins, hint), 0.5);
  const peak = 0.5 * 1.9 * 1.15;
  assert.ok(Math.abs(pressureAlongStroke(0.6, pins, hint) - peak) < 1e-9);
  assert.ok(Math.abs(pressureAlongStroke(0.6 - 1e-9, pins, hint) - peak) < 1e-7);
  assert.ok(Math.abs(pressureAlongStroke(0.6 + 1e-9, pins, hint) - peak) < 1e-7);
  assert.ok(pressureAlongStroke(0.8, pins, hint) < peak);
  const normalSweep = [{ id: "s", kind: "ryaku", t: 0.1 }];
  for (const local of [0.2, 0.5, 0.9]) {
    assert.ok(Math.abs(pressureAlongStroke(0.6 + 0.4 * local, pins, hint) - pressureAlongStroke(local, normalSweep, hint)) < 1e-9);
  }
  assert.equal(pressureAlongStroke(1, pins, hint), 0);
});

test("horizontal closing gestures at a junction stay on the path and scale with pressure pins", () => {
  const points = [[0, 800], [800, 800], [0, 0]];
  const cell = { x: 0, y: 0, w: 400, h: 400 };
  const pins = [{ id: "h", kind: "horizontal", t: 0.1 }, { id: "s", kind: "ryaku", t: 0.6 }];
  const make = (multiplier, typePins = pins) => prepareGlyph("test", [points], [], cell, {
    char: "test", custom: true, strokes: [{ points, entryAngle: 160, pins: [...typePins, { id: "p", kind: "pressure", t: 0.5, pressure: multiplier }] }],
  }).strokes[0].samples;
  const samples = make(1);
  const scaled = make(1.5);
  const bare = make(1, []);
  assert.deepEqual(samples.map(s => [s.x, s.y, s.pathAngle, s.t]), bare.map(s => [s.x, s.y, s.pathAngle, s.t]));
  for (let i = 0; i < samples.length; i++) assert.ok(Math.abs(scaled[i].pressure - Math.min(2, samples[i].pressure * 1.5)) < 1e-9);
  const before = samples.filter(s => s.t < 0.6).at(-1);
  const after = samples.find(s => s.t >= 0.6);
  assert.ok(before.pressure > 1);
  assert.ok(Math.abs(after.pressure - before.pressure) < 25 * (after.t - before.t));
  assert.ok(Math.abs(Math.sin(after.angle - before.angle)) < 0.1);
  assert.ok(Math.abs(Math.sin(before.angle - 160 * Math.PI / 180)) < 0.1);
  assert.equal(samples.at(-1).pressure, 0);
});

test("Rise starts at horizontal body pressure and tapers to a quarter even before a handoff", () => {
  const rise = [{ id: "rise", kind: "saku", t: 0.1 }];
  const hint = { kind: "sweep", inferred: "auto" };
  for (const [t, expected] of [[0, 0.5], [0.2, 0.5], [0.6, 0.3125], [1, 0.125]]) {
    assert.ok(Math.abs(pressureAlongStroke(t, rise, hint) - expected) < 1e-9);
  }
  for (const [kind, expected] of [["horizontal", 0.5], ["vertical", 0.5], ["ryaku", 2/3], ["sweep", 0.1], ["soku", 0.375]]) {
    const pins = [...rise, { id: "next", kind, t: 0.6 }];
    assert.ok(Math.abs(pressureAlongStroke(0.6 - 1e-9, pins, hint) - 0.125) < 1e-8);
    assert.ok(Math.abs(pressureAlongStroke(0.6, pins, hint) - expected) < 1e-9);
  }
});

test("Rise shares the horizontal entry but has no horizontal closing gesture", () => {
  const points = [[0, 0], [800, 0]];
  const make = kind => prepareGlyph("test", [points], [], { x: 0, y: 0, w: 400, h: 400 }, {
    char: "test", custom: true, strokes: [{ points, pins: [{ id: "type", kind, t: 0.1 }] }],
  }).strokes[0].samples;
  const rise = make("saku"), horizontal = make("horizontal");
  assert.deepEqual(rise.filter(s => s.t < 0.2).map(s => [s.x, s.y, s.angle, s.pressure]), horizontal.slice(0, -18).filter(s => s.t / 0.86 < 0.2).map(s => [s.x, s.y, s.angle, s.pressure]));
  assert.equal(rise.at(-1).pressure, 0.125);
  assert.ok(rise.every(s => !s.hold));
  assert.ok(Math.abs(Math.sin(rise.at(-1).angle)) < 1e-9);
});


test("Sweep left defaults to a 1x starting gesture while explicit overrides remain editable", () => {
  const pins = [{ id: "sweep", kind: "ryaku", t: 0.1 }];
  assert.equal(entryPressureForStroke({ pins }), 1);
  assert.equal(entryPressureForStroke({ pins, entryPressure: 1.5 }), 1.5);
  assert.equal(entryPressureForStroke({ pins: [{ id: "h", kind: "horizontal", t: 0.1 }] }), 1.9);
  const points = [[800, 800], [0, 0]];
  const make = entryPressure => prepareGlyph("test", [points], [], { x: 0, y: 0, w: 400, h: 400 }, {
    char: "test", custom: true, strokes: [{ points, pins, entryPressure }],
  }).strokes[0].samples;
  assert.deepEqual(make(undefined), make(1));
  assert.ok(Math.abs(make(1.5)[0].pressure / make(undefined)[0].pressure - 1.5) < 1e-9);
});


test("Short left defaults to 1x entry pressure and preserves custom entry pressure", () => {
  const pins = [{ id: "short", kind: "peck", t: 0.1 }];
  assert.equal(entryPressureForStroke({ pins }), 1);
  assert.equal(entryPressureForStroke({ pins, entryPressure: 1.5 }), 1.5);
  const points = [[800, 800], [0, 0]];
  const make = entryPressure => prepareGlyph("test", [points], [], { x: 0, y: 0, w: 400, h: 400 }, {
    char: "test", custom: true, strokes: [{ points, pins, entryPressure }],
  }).strokes[0].samples;
  assert.deepEqual(make(undefined), make(1));
  assert.equal(make(undefined)[0].pressure, 1);
  assert.equal(make(1.5)[0].pressure, 1.5);
});

test("import cleanup trims endpoint gestures and keeps original body nodes and five-degree slant", () => {
  const rise = Math.tan(5 * Math.PI / 180) * 600;
  const horizontal = [[-30, 20], [0, 0], [300, rise/2], [600, rise], [640, rise - 15]];
  assert.deepEqual(simplifyStraightStroke(horizontal), { mode: "horizontal", points: [[0, 0], [600, rise]] });
  const vertical = [[-20, 820], [0, 800], [0, 450], [0, 100], [8, 60]];
  assert.deepEqual(simplifyStraightStroke(vertical), { mode: "vertical", points: [[0, 800], [0, 100]] });
  const imported = editsFromMedians("test", [horizontal, vertical]);
  assert.deepEqual(imported.strokes.map(s => s.points.length), [2, 2]);
});

test("straight-body majority uses path length and must exceed sixty percent", () => {
  const make = body => [[-Math.cos(Math.PI/6)*100, -50], [0, 0], [body, 0], [body + Math.cos(Math.PI/9)*100, Math.sin(Math.PI/9)*100]];
  assert.equal(simplifyStraightStroke(make(299)), null);
  assert.equal(simplifyStraightStroke(make(300)), null);
  assert.deepEqual(simplifyStraightStroke(make(301))?.points, [[0, 0], [301, 0]]);
});

test("vertical body accepts twelve-degree slant but rejects thirteen degrees", () => {
  const make = degrees => [[0, 800], [Math.sin(degrees*Math.PI/180)*500, 800-Math.cos(degrees*Math.PI/180)*500]];
  assert.equal(simplifyStraightStroke(make(12))?.mode, "vertical");
  assert.equal(simplifyStraightStroke(make(13)), null);
});

test("a sharp terminal turn remains a hook even with a very long axial body", () => {
  const hooked = [[0, 800], [0, 400], [0, 100], [-20, 125]];
  assert.equal(simplifyStraightStroke(hooked), null);
  const edit = editsFromMedians("test", [hooked]);
  assert.deepEqual(edit.strokes[0].points, hooked);
  assert.ok(edit.strokes[0].pins.some(p => p.kind === "hane"));
  const folded = [[0, 800], [800, 800], [800, 700]];
  assert.equal(simplifyStraightStroke(folded), null);
});


test("starting angle defaults follow the type while saved overrides take priority", () => {
  const points = [[0, 0], [800, 0]];
  for (const [kind, angle] of [["horizontal", 110], ["vertical", 135], ["saku", 110], ["ryaku", 160], ["peck", 160]]) {
    const stroke = { points, pins: [{ id: "type", kind, t: 0.1 }] };
    assert.equal(entryAngleForStroke(stroke), angle);
    assert.equal(entryAngleForStroke({ ...stroke, entryAngle: 45 }), 45);
    assert.equal(entryAngleForStroke({ ...stroke, entryAngle: 0 }), 0);
  }
  assert.equal(entryAngleForStroke({ points, pins: [] }), 110);
  assert.equal(entryAngleForStroke({ points: [[0, 800], [0, 0]], pins: [] }), 135);
});


test("rounded horizontal roof corners preserve 宀 hooks in database imports", () => {
  for (const char of ["空", "字", "安", "家", "室", "宮", "宇", "守", "定", "宝", "宿", "寧"]) {
    const { medians } = glyphData(char);
    const roof = medians[2];
    const turn = horizontalHookIndex(roof);
    assert.ok(turn != null, char);
    assert.equal(simplifyStraightStroke(roof), null, char);
    const stroke = editsFromMedians(char, medians).strokes[2];
    assert.deepEqual(stroke.points, roof, char);
    assert.deepEqual(stroke.pins.map(p => p.kind), ["horizontal", "hane"], char);
    assert.equal(stroke.pins[1].t, vertexPathT(roof.map(([x, y]) => ({ x, y })), turn));
  }
});

test("saved automatically shortened roof bodies recover their hook without discarding pressure or angle edits", () => {
  const { medians } = glyphData("空");
  const base = editsFromMedians("空", medians);
  const roof = medians[2];
  const saved = structuredClone(base);
  saved.strokes[2] = { points: [roof[2], roof[5]], entryAngle: 123, entryPressure: 1.2,
    pins: [{ id: "h", kind: "horizontal", t: 0.3 }, { id: "p", kind: "pressure", t: 0.6, pressure: 0.8 }] };
  const recovered = mergeEdit(base, saved).strokes[2];
  assert.deepEqual(recovered.points, roof);
  assert.ok(recovered.pins.some(p => p.kind === "hane"));
  assert.equal(recovered.pins.find(p => p.kind === "pressure").pressure, 0.8);
  assert.equal(recovered.entryAngle, 123);
  assert.equal(recovered.entryPressure, 1.2);
  const custom = mergeEdit(base, { ...saved, custom: true });
  assert.deepEqual(custom.strokes[2].points, saved.strokes[2].points);
  saved.strokes[2].points[0] = [roof[2][0] + 5, roof[2][1]];
  assert.deepEqual(mergeEdit(base, saved).strokes[2].points, saved.strokes[2].points);
});


test("all four vertical bodies in 無 discard tiny downward endpoint flourishes", () => {
  const { medians } = glyphData("無");
  const edit = editsFromMedians("無", medians);
  for (const i of [3, 4, 5, 6]) {
    const simple = simplifyStraightStroke(medians[i]);
    assert.equal(simple?.mode, "vertical", `stroke ${i + 1}`);
    assert.equal(edit.strokes[i].points.length, 2, `stroke ${i + 1}`);
    assert.deepEqual(edit.strokes[i].pins.map(p => p.kind), ["vertical", "stop"]);
  }
  assert.deepEqual(edit.strokes[3].points, [[310,465], [339,299]]);
  assert.deepEqual(edit.strokes[4].points, [[440,488], [454,296]]);
});


test("Short left import cleanup removes only the tiny one- or two-node entry bend", () => {
  for (const [char, index, removed] of [["墨", 3, 1], ["空", 3, 2]]) {
    const { medians } = glyphData(char);
    const original = structuredClone(medians);
    const stroke = editsFromMedians(char, medians).strokes[index];
    assert.deepEqual(stroke.points, medians[index].slice(removed), char);
    assert.deepEqual(stroke.pins.map(p => p.kind), ["peck"], char);
    assert.deepEqual(medians, original);
  }
});

test("Short left cleanup preserves smooth starts, substantial turns, and saved edits", () => {
  const smooth = [[200, 200], [180, 180], [100, 100], [0, 0]];
  assert.deepEqual(trimShortLeftEntry(smooth), smooth);
  const compound = [[0, 400], [200, 400], [0, 0]];
  assert.deepEqual(trimShortLeftEntry(compound), compound);
  const { medians } = glyphData("空");
  const base = editsFromMedians("空", medians);
  const stored = structuredClone(base);
  stored.strokes[3].points = structuredClone(medians[3]);
  stored.strokes[3].entryAngle = 70;
  const restored = mergeEdit(base, stored).strokes[3];
  assert.deepEqual(restored.points, stored.strokes[3].points);
  assert.deepEqual(restored.pins, stored.strokes[3].pins);
  assert.equal(restored.entryAngle, 70);
});


test("definitive 永 loads all edited nodes, curves, ordering, and pins without saved edits", () => {
  const { medians } = glyphData("永");
  withStorage(() => {
    const edit = bookForGlyphs([{ char: "永", medians }])["永"];
    assert.deepEqual(edit, YONG_TEMPLATE);
    assert.deepEqual(edit.strokes.map(s => s.points.length), [2, 5, 3, 2, 2]);
    assert.deepEqual(edit.strokes.map(s => s.pins.map(p => p.kind)), [["soku", "pressure"], ["horizontal", "vertical", "hane"], ["saku", "ryaku", "pressure", "pressure"], ["peck"], ["sweep"]]);
    assert.equal(edit.strokes[0].pins.find(p => p.kind === "pressure").pressure, 1.35);
    assert.deepEqual(edit.strokes[2].pins.filter(p => p.kind === "pressure").map(p => p.pressure), [1.3, 1]);
    const again = editsFromMedians("永", medians);
    edit.strokes[0].points[0][0] = -999;
    edit.strokes[3].curves[0][0] = -999;
    assert.deepEqual(again, YONG_TEMPLATE, "each instance owns its nodes and curve controls");
  });
});

test("Reset and Suggest use the definitive 永 while saved custom edits remain supported", () => {
  const { medians } = glyphData("永");
  withStorage(() => {
    const edit = editsFromMedians("永", medians);
    edit.strokes[0].entryAngle = 20;
    saveGlyphEdit(edit);
    assert.equal(bookForGlyphs([{ char: "永", medians }])["永"].strokes[0].entryAngle, 20);
    clearGlyphEdit("永");
    assert.deepEqual(bookForGlyphs([{ char: "永", medians }])["永"], YONG_TEMPLATE);
    YONG_TEMPLATE.strokes.forEach((stroke, i) => {
      const suggested = suggestPins(stroke.points, "永", i);
      assert.deepEqual(suggested.map(({ id: _id, ...pin }) => pin), stroke.pins.map(({ id: _id, ...pin }) => pin));
    });
  });
});


test("stroke ordering moves all curve and modifier data together and persists", () => {
  withStorage(() => {
    const edit = editsFromMedians("永", glyphData("永").medians);
    const moved = reorderStroke(edit, 4, 1);
    assert.equal(moved.strokes[1], edit.strokes[4]);
    assert.equal(edit.strokes[4].pins[0].kind, "sweep");
    saveGlyphEdit(moved);
    const restored = bookForGlyphs([{ char: "永", medians: glyphData("永").medians }])["永"];
    assert.deepEqual(JSON.parse(JSON.stringify(restored.strokes)), moved.strokes);
    assert.equal(reorderStroke(edit, -1, 0), edit);
    assert.equal(reorderStroke(edit, 0, 99), edit);
  });
});

test("the known accidental 永 swap is repaired once while explicit reordered copies remain intact", () => {
  const base = editsFromMedians("永", glyphData("永").medians);
  const old = structuredClone(base);
  delete old.strokeOrderVersion;
  [old.strokes[3], old.strokes[4]] = [old.strokes[4], old.strokes[3]];
  assert.deepEqual(JSON.parse(JSON.stringify(mergeEdit(base, old).strokes)), base.strokes);
  old.strokeOrderVersion = 1;
  assert.deepEqual(JSON.parse(JSON.stringify(mergeEdit(base, old).strokes)), old.strokes);
});

test("dot pressure thresholds do not jump the brush footprint or bristle correction", () => {
  const base = { x: 100, y: 100, angle: 0, pathAngle: 0, t: 0.25,
    kind: "dot", hold: false, blot: false };
  const sim = new BristleSim(DEFAULT_BRUSH, "#000");
  sim.setRadius(20);
  // The previous binary lead switch moved the whole tuft by several pixels.
  for (const boundary of [0.3, 0.45, 0.5]) {
    const below = { ...base, pressure: boundary - 1e-7 };
    const above = { ...base, pressure: boundary + 1e-7 };
    for (const hair of sim.hairs) {
      const a = sim.target(hair, below), b = sim.target(hair, above);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.001);
    }
  }
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, closePath() {}, fill() {}, stroke() {},
    createRadialGradient() { return { addColorStop() {} }; } };
  const lagged = pressure => {
    const brush = new BristleSim(DEFAULT_BRUSH, "#000");
    brush.setRadius(20);
    brush.plant({ ...base, pressure });
    for (const h of brush.hairs) { h.tip.x -= 30; h.vel.x = 20; }
    // Zero elapsed time isolates the old discontinuous positional correction.
    brush.step(ctx, { ...base, pressure }, 0);
    return brush.hairs.reduce((n, h) => n + h.tip.x / brush.hairs.length, 0);
  };
  assert.ok(Math.abs(lagged(0.55 - 1e-7) - lagged(0.55 + 1e-7)) < 0.001);
});

test("dot rounded caps begin continuously and connect settling bristles", () => {
  const points = [[100, 700], [400, 500]];
  const stroke = prepareGlyph("test", [points], [], { x: 0, y: 0, w: 400, h: 400 },
    { char: "test", custom: true, strokes: [{ points, pins: [{ id: "dot", t: 0.25, kind: "soku" }] }] }).strokes[0];
  const last = stroke.samples.at(-19), cap = stroke.samples.slice(-18);
  assert.ok(cap[0].roundness > 0 && cap[0].roundness < 0.02);
  assert.equal(cap.at(-1).roundness, 1);
  const sim = new BristleSim(DEFAULT_BRUSH, "#000");
  sim.setRadius(20);
  sim.plant(last);
  for (const hair of sim.hairs) {
    const a = sim.target(hair, last), b = sim.target(hair, cap[0]);
    assert.ok(Math.hypot(b.x-a.x, b.y-a.y) < 0.5);
  }
  const lines = [], arcs = [];
  const ctx = { beginPath() {}, moveTo(x,y) { lines.push([x,y]); },
    lineTo(x,y) { lines.push([x,y]); }, stroke() {},
    arc(x,y) { arcs.push([x,y]); }, fill() {} };
  sim.strokeHair(ctx, { prev: { x: 10,y: 20 }, tip: { x: 13,y: 22 } }, 4, 1, true);
  assert.deepEqual(lines, [[10,20],[13,22]]);
  assert.deepEqual(arcs, [[13,22]]);
});
