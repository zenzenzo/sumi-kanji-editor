import { useEffect, useRef } from "react";
import { PathEditor } from "@/components/path-editor";
import type { EditBook, GlyphEdit, PathTool } from "@/lib/brush/edits";
import { BrushPlayer, type PlayerSnapshot } from "@/lib/brush/player";
import type { BrushSettings, GlyphData } from "@/lib/kanji/types";

function cssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export type PaperCommand = "play" | "pause" | "replay" | "step" | "finish" | null;

type Props = {
  glyphs: GlyphData[];
  speed: number;
  showGrid: boolean;
  showGhost: boolean;
  showPath: boolean;
  pathTool: PathTool;
  edits: EditBook;
  settings: BrushSettings;
  command: PaperCommand;
  onSnapshot: (s: PlayerSnapshot) => void;
  onEditCommit: (edit: GlyphEdit) => void;
};

export function PaperCanvas({
  glyphs,
  speed,
  showGrid,
  showGhost,
  showPath,
  pathTool,
  edits,
  settings,
  command,
  onSnapshot,
  onEditCommit,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<BrushPlayer | null>(null);
  const paperRef = useRef<HTMLImageElement | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const skipEdits = useRef(true);

  useEffect(() => {
    const img = new Image();
    img.src = "/washi.jpg";
    paperRef.current = img;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || glyphs.length === 0) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const player = new BrushPlayer({
      canvas,
      glyphs,
      paper: paperRef.current,
      colors: {
        paper: cssColor("--color-paper", "#efe6d4"),
        ink: cssColor("--color-ink", "#1c1814"),
        grid: cssColor("--color-ink", "#1c1814"),
        ghost: cssColor("--color-ink", "#1c1814"),
        seal: cssColor("--color-seal", "#a33b2b"),
      },
      showGrid,
      showGhost,
      settings,
      edits: editsRef.current,
      speed,
      reducedMotion: reduced,
      onUpdate: (s) => onSnapshotRef.current(s),
    });
    playerRef.current = player;
    skipEdits.current = true;
    if (!reduced) player.play();
    void document.fonts?.ready?.then(() => {
      if (playerRef.current === player) player.relayout();
    });

    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => player.relayout());
    if (wrap) ro.observe(wrap);

    return () => {
      ro.disconnect();
      player.destroy();
      playerRef.current = null;
    };
    // Recreate only when the written characters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyphs]);

  useEffect(() => {
    playerRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    playerRef.current?.setShowGrid(showGrid);
  }, [showGrid]);

  useEffect(() => {
    playerRef.current?.setShowGhost(showGhost);
  }, [showGhost]);

  useEffect(() => {
    playerRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (skipEdits.current) {
      skipEdits.current = false;
      return;
    }
    playerRef.current?.setEdits(edits);
  }, [edits]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !command) return;
    if (command === "play") p.play();
    if (command === "pause") p.pause();
    if (command === "replay") p.replay();
    if (command === "step") p.stepStroke();
    if (command === "finish") p.finish();
  }, [command]);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-paper shadow-[0_20px_50px_rgba(0,0,0,0.28)] ring-1 ring-ink/10"
    >
      <canvas ref={canvasRef} className="block size-full" />
      {showPath && (
        <PathEditor glyphs={glyphs} book={edits} tool={pathTool} onCommit={onEditCommit} />
      )}
    </div>
  );
}
