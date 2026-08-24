import { Eraser, MousePointer2 } from "lucide-react";
import { PIN_META, type PathTool, type PinKind } from "@/lib/brush/edits";

type Props = {
  showPath: boolean;
  tool: PathTool;
  onShowPath: (v: boolean) => void;
  onTool: (t: PathTool) => void;
};

const TOOLS: { id: PathTool; ja: string; label: string }[] = [
  { id: "move", ja: "線", label: "Move" },
  { id: "delete", ja: "削", label: "Delete" },
  { id: "pressure", ja: PIN_META.pressure.ja, label: PIN_META.pressure.label },
  { id: "ore", ja: PIN_META.ore.ja, label: PIN_META.ore.label },
  { id: "sweep", ja: PIN_META.sweep.ja, label: PIN_META.sweep.label },
  { id: "stop", ja: PIN_META.stop.ja, label: PIN_META.stop.label },
  { id: "lift", ja: PIN_META.lift.ja, label: PIN_META.lift.label },
];

export function PathToolbar({ showPath, tool, onShowPath, onTool }: Props) {
  function pick(next: PathTool) {
    if (!showPath) onShowPath(true);
    onTool(next);
  }

  return (
    <div className="flex shrink-0 flex-row gap-1 lg:flex-col">
      <button
        type="button"
        title="Show or hide the path editor"
        aria-pressed={showPath}
        onClick={() => onShowPath(!showPath)}
        className={`flex size-11 flex-col items-center justify-center rounded-[var(--radius-sm)] text-[0.6rem] tracking-wide transition-colors duration-[var(--motion-quick)] ${
          showPath ? "bg-paper text-ink" : "bg-paper/10 text-paper hover:bg-paper/16"
        }`}
      >
        <MousePointer2 className="size-4" />
        <span className="mt-0.5">Edit</span>
      </button>
      {TOOLS.map((t) => {
        const active = showPath && tool === t.id;
        const title =
          t.id === "move"
            ? "Drag points · click a line to add"
            : t.id === "delete"
              ? "Click a point or pin to remove it"
              : (PIN_META[t.id as PinKind]?.hint ?? t.label);
        return (
          <button
            key={t.id}
            type="button"
            title={title}
            aria-pressed={active}
            onClick={() => pick(t.id)}
            className={`flex size-11 flex-col items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-quick)] ${
              active ? "bg-paper text-ink" : "bg-paper/10 text-paper hover:bg-paper/16"
            }`}
          >
            {t.id === "delete" ? (
              <Eraser className="size-4" />
            ) : (
              <span className="font-display text-base leading-none">{t.ja}</span>
            )}
            <span className="mt-0.5 text-[0.58rem] tracking-wide opacity-75">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}