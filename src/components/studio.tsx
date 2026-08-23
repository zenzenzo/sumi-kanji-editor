import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  ImageDown,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AuthSlot } from "@/components/auth-slot";
import { PaperCanvas, type PaperCommand } from "@/components/paper-canvas";
import { PathToolbar } from "@/components/path-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bookForGlyphs,
  clearGlyphEdit,
  editsFromMedians,
  saveGlyphEdit,
  suggestPins,
  YONG_EIGHT,
  type EditBook,
  type GlyphEdit,
  type PathTool,
} from "@/lib/brush/edits";
import type { PlayerSnapshot } from "@/lib/brush/player";
import { downloadBlob, renderCalligraphyGif } from "@/lib/brush/gif-export";
import { BRUSH_PRESETS, type BrushPresetId } from "@/lib/brush/settings";
import { extractKanji } from "@/lib/kanji/cjk";
import { loadGlyphs } from "@/lib/kanji/load-glyphs";
import { PRESETS } from "@/lib/kanji/presets";
import type { BrushSettings, GlyphData } from "@/lib/kanji/types";
import { listScroll, pinKanji, unpinKanji } from "@/lib/scroll";

const DEFAULT = "永";

export function Studio() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState(DEFAULT);
  const [glyphs, setGlyphs] = useState<GlyphData[]>([]);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [preset, setPreset] = useState<BrushPresetId | "custom">("kaisho");
  const [settings, setSettings] = useState<BrushSettings>(BRUSH_PRESETS.kaisho.settings);
  const [showGrid, setShowGrid] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [showPath, setShowPath] = useState(false);
  const [pathTool, setPathTool] = useState<PathTool>("move");
  const [book, setBook] = useState<EditBook>({});
  const [command, setCommand] = useState<PaperCommand>(null);
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  const [scroll, setScroll] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const composing = useRef(false);
  const cmdTimer = useRef<number | null>(null);

  const written = glyphs.map((g) => g.char).join("");
  const pinned = written.length > 0 && [...written].every((c) => scroll.includes(c));

  function fire(next: PaperCommand) {
    setCommand(next);
    if (cmdTimer.current) window.clearTimeout(cmdTimer.current);
    cmdTimer.current = window.setTimeout(() => setCommand(null), 40);
  }

  function applyPreset(id: BrushPresetId) {
    setPreset(id);
    setSettings(BRUSH_PRESETS[id].settings);
    fire("replay");
  }

  function patchSettings(partial: Partial<BrushSettings>) {
    setPreset("custom");
    setSettings((s) => ({ ...s, ...partial }));
  }

  async function write(raw: string) {
    const chars = extractKanji(raw, 8);
    if (!chars.length) {
      toast("Enter a kanji character — kana and Latin are ignored.");
      return;
    }
    setLoading(true);
    try {
      const results = await loadGlyphs({ data: chars.join("") });
      const ok = results.filter((r): r is GlyphData => r.ok);
      const missing = results.filter((r) => !r.ok).map((r) => r.char);
      if (missing.length) {
        toast(`No stroke order for ${missing.join(" ")}`);
      }
      if (!ok.length) {
        setLoading(false);
        return;
      }
      setGlyphs(ok);
      setBook(bookForGlyphs(ok));
      setQuery(ok.map((g) => g.char).join(""));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load stroke order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void write(DEFAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isPending || !user) {
      setScroll([]);
      return;
    }
    listScroll()
      .then((rows) => setScroll(rows.map((r) => r.kanji)))
      .catch(() => setScroll([]));
  }, [user, isPending]);

  function commitEdit(edit: GlyphEdit) {
    saveGlyphEdit(edit);
    setBook((b) => ({ ...b, [edit.char]: edit }));
  }

  function resetPaths() {
    for (const g of glyphs) clearGlyphEdit(g.char);
    setBook(Object.fromEntries(glyphs.map((g) => [g.char, editsFromMedians(g.char, g.medians)])));
  }

  function clearPaths() {
    setBook((prev) => {
      const next = { ...prev };
      for (const g of glyphs) {
        const edit: GlyphEdit = { char: g.char, custom: true, strokes: [] };
        saveGlyphEdit(edit);
        next[g.char] = edit;
      }
      return next;
    });
  }

  function applySuggestions() {
    setBook((prev) => {
      const next = { ...prev };
      for (const g of glyphs) {
        const base = next[g.char] ?? editsFromMedians(g.char, g.medians);
        const edit: GlyphEdit = {
          char: g.char,
          custom: base.custom,
          strokes: base.strokes.map((s, i) => ({
            points: s.points,
            pins: suggestPins(s.points.length >= 2 ? s.points : (g.medians[i] ?? s.points), g.char, i),
          })),
        };
        saveGlyphEdit(edit);
        next[g.char] = edit;
      }
      return next;
    });
  }

  async function togglePin() {
    if (!user) {
      toast("Sign in to keep a practice scroll.");
      return;
    }
    if (!written) return;
    try {
      if (pinned) {
        await Promise.all([...written].map((k) => unpinKanji({ data: k })));
        setScroll((s) => s.filter((k) => ![...written].includes(k)));
      } else {
        await pinKanji({ data: written });
        setScroll((s) => [...written, ...s.filter((k) => ![...written].includes(k))]);
      }
    } catch {
      toast("Could not update your scroll. Try signing in again.");
    }
  }

  async function exportGif() {
    if (!glyphs.length || exporting) return;
    setExporting(true);
    toast("Rendering GIF…");
    try {
      const paper = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "/washi.jpg";
      });
      const blob = await renderCalligraphyGif({
        glyphs,
        settings,
        edits: book,
        showGrid,
        showGhost,
        speed,
        paper,
        colors: {
          paper: "#efe6d4",
          ink: "#1c1814",
          grid: "#1c1814",
          ghost: "#1c1814",
          seal: "#a33b2b",
        },
      });
      const name = `sumi-${written || "kanji"}.gif`;
      downloadBlob(blob, name);
      toast(`Saved ${name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not encode the GIF.");
    } finally {
      setExporting(false);
    }
  }

  const strokeLabel =
    snap && snap.strokeTotal > 0
      ? `Stroke ${Math.min(snap.strokeIndex + 1, snap.strokeTotal)} of ${snap.strokeTotal}`
      : "—";

  return (
    <div className="flex min-h-dvh flex-col text-paper">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none tracking-tight">墨</p>
          <p className="mt-0.5 text-[0.7rem] tracking-[0.18em] text-paper/55 uppercase">Sumi</p>
        </div>
        <form
          className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (!composing.current) void write(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              setQuery(e.currentTarget.value);
            }}
            placeholder="Type a kanji"
            aria-label="Kanji to write"
            className="h-10 max-w-[12rem] bg-paper/95 font-display text-lg sm:max-w-none"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button type="submit" size="sm" className="shrink-0 bg-paper text-ink hover:bg-paper/90">
            Write
          </Button>
        </form>
        <AuthSlot />
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
        {PRESETS.map((p) => {
          const active = written === p.char;
          return (
            <button
              key={p.char}
              type="button"
              onClick={() => void write(p.char)}
              className={`flex shrink-0 flex-col items-center rounded-[var(--radius-sm)] px-2.5 py-1.5 transition-colors duration-[var(--motion-quick)] ${
                active ? "bg-paper text-ink" : "bg-paper/8 text-paper hover:bg-paper/14"
              }`}
            >
              <span className="font-display text-xl leading-none">{p.char}</span>
              <span className="mt-1 text-[0.65rem] tracking-wide opacity-70">{p.reading}</span>
            </button>
          );
        })}
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[3.25rem_minmax(0,1fr)_18rem] lg:items-start">
        <div className="order-2 lg:order-none">
          <PathToolbar
            showPath={showPath}
            tool={pathTool}
            onShowPath={setShowPath}
            onTool={setPathTool}
          />
        </div>
        <section className="relative order-1 lg:order-none">
          {loading && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] bg-desk/20">
              <LoaderCircle className="size-7 animate-spin text-paper" />
            </div>
          )}
          {glyphs.length > 0 ? (
            <PaperCanvas
              key={written}
              glyphs={glyphs}
              speed={speed}
              showGrid={showGrid}
              showGhost={showGhost}
              showPath={showPath}
              pathTool={pathTool}
              edits={book}
              settings={settings}
              command={command}
              onSnapshot={setSnap}
              onEditCommit={commitEdit}
            />
          ) : (
            <div className="grid aspect-square place-items-center rounded-[var(--radius-lg)] bg-paper text-ink-soft">
              <p className="font-display text-lg">Enter a kanji to begin.</p>
            </div>
          )}
        </section>

        <aside className="order-3 rounded-[var(--radius-xl)] bg-paper p-5 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.18)] lg:order-none">
          <p className="text-xs tracking-[0.16em] text-ink-soft uppercase">Writing</p>
          <p className="mt-1 font-display text-4xl leading-none">{written || "—"}</p>
          <p className="mt-2 font-mono text-sm tabular-nums text-ink-soft">{strokeLabel}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="icon-sm"
              aria-label={snap?.playing ? "Pause" : "Play"}
              onClick={() => fire(snap?.playing ? "pause" : "play")}
            >
              {snap?.playing ? <Pause /> : <Play />}
            </Button>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Reset" onClick={() => fire("rewind")}>
              <RotateCcw />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Next stroke"
              onClick={() => fire("step")}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exporting || glyphs.length === 0}
              onClick={() => void exportGif()}
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <ImageDown />}
              GIF
            </Button>
            <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={togglePin}>
              {pinned ? <BookmarkCheck /> : <Bookmark />}
              {pinned ? "Saved" : "Save"}
            </Button>
          </div>

          <SliderRow
            label="Speed"
            value={speed}
            min={0.4}
            max={2.4}
            step={0.1}
            display={`${speed.toFixed(1)}×`}
            onChange={setSpeed}
          />

          <p className="mt-6 text-xs tracking-[0.16em] text-ink-soft uppercase">Fude</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(Object.keys(BRUSH_PRESETS) as BrushPresetId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors duration-[var(--motion-quick)] ${
                  preset === id ? "bg-ink text-paper" : "bg-ink/6 hover:bg-ink/10"
                }`}
              >
                <span className="block text-sm font-medium">{BRUSH_PRESETS[id].label}</span>
                <span className={`block text-[0.65rem] ${preset === id ? "text-paper/70" : "text-ink-soft"}`}>
                  {BRUSH_PRESETS[id].hint}
                </span>
              </button>
            ))}
          </div>

          <SliderRow
            label="Size"
            value={settings.size}
            min={0.55}
            max={1.7}
            step={0.05}
            display={settings.size.toFixed(2)}
            onChange={(size) => patchSettings({ size })}
          />
          <SliderRow
            label="Bristles"
            value={settings.bristles}
            min={16}
            max={96}
            step={4}
            display={String(Math.round(settings.bristles))}
            onChange={(bristles) => patchSettings({ bristles })}
          />
          <SliderRow
            label="Stiffness"
            value={settings.stiffness}
            min={0.12}
            max={0.95}
            step={0.01}
            display={settings.stiffness.toFixed(2)}
            onChange={(stiffness) => patchSettings({ stiffness })}
          />
          <SliderRow
            label="Splay"
            value={settings.splay}
            min={0.1}
            max={1.6}
            step={0.05}
            display={settings.splay.toFixed(2)}
            onChange={(splay) => patchSettings({ splay })}
          />
          <SliderRow
            label="Ink"
            value={settings.wetness}
            min={0.18}
            max={1}
            step={0.02}
            display={settings.wetness.toFixed(2)}
            onChange={(wetness) => patchSettings({ wetness })}
          />
          <SliderRow
            label="Softness"
            value={settings.softness}
            min={0.05}
            max={1}
            step={0.02}
            display={settings.softness.toFixed(2)}
            onChange={(softness) => patchSettings({ softness })}
          />

          <div className="mt-5 flex flex-col gap-2">
            <ToggleRow label="Copybook grid" checked={showGrid} onChange={setShowGrid} />
            <ToggleRow label="Ghost outline" checked={showGhost} onChange={setShowGhost} />
            <ToggleRow label="Edit path" checked={showPath} onChange={setShowPath} />
          </div>

          {showPath && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={applySuggestions}>
                  Suggest
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={resetPaths}>
                  Reset
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={clearPaths}>
                  Clear
                </Button>
              </div>
              <p className="mt-3 text-[0.7rem] leading-relaxed text-ink-soft">
                Drag the median. Type comes only from pins (側勒努趯策掠啄磔).
                Pressure is a multiplier on that type — two pins blend. Path color
                follows the active type after each pin.
              </p>
              {written.includes("永") && (
                <div className="mt-3">
                  <p className="text-xs tracking-[0.16em] text-ink-soft uppercase">永字八法</p>
                  <ul className="mt-1.5 space-y-0.5 text-[0.68rem] text-ink-soft">
                    {YONG_EIGHT.map((row) => (
                      <li key={row.ja}>
                        <span className="font-display text-ink">{row.ja}</span>
                        <span className="ml-1">({row.reading})</span>
                        <span className="ml-1">{row.name}</span>
                        <span className="ml-1 opacity-70">— {row.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {user && scroll.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs tracking-[0.16em] text-ink-soft uppercase">Your scroll</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scroll.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => void write(k)}
                    className="grid size-10 place-items-center rounded-[var(--radius-xs)] bg-ink/6 font-display text-lg hover:bg-ink/10"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-[0.7rem] leading-relaxed text-ink-soft">
            Each hair is a spring on the ferrule — they lag, splay under pressure, and leave their
            own trail. Stroke order from Make Me a Hanzi / Hanzi Writer (Arphic). Edit the path
            when the printed median is not how the stroke is meant to be written.
          </p>
        </aside>
      </main>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (n: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const text =
    live == null
      ? display
      : step >= 1
        ? String(Math.round(shown))
        : shown.toFixed(2);
  return (
    <label className="mt-4 block text-xs tracking-wide text-ink-soft uppercase">
      {label}
      <span className="ml-2 font-mono tabular-nums text-ink">{text}</span>
      <Slider
        className="mt-2"
        min={min}
        max={max}
        step={step}
        value={[shown]}
        onValueChange={(v) => setLive(v[0] ?? shown)}
        onValueCommit={(v) => {
          const n = v[0] ?? shown;
          setLive(null);
          onChange(n);
        }}
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full transition-colors duration-[var(--motion-quick)] ${
          checked ? "bg-ink" : "bg-ink/20"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-paper transition-transform duration-[var(--motion-quick)] ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
