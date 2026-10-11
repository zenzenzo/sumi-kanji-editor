import { normalizeEntryAngle } from "@/lib/brush/edits";

type Props = {
  value: number;
  onChange: (value: number) => void;
  onCommit: () => void;
};

export function OrientationDial({ value, onChange, onCommit }: Props) {
  function turn(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    if (Math.hypot(x, y) < 6) return;
    onChange(Math.round(normalizeEntryAngle((Math.atan2(y, x) * 180) / Math.PI)) % 360);
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Starting brush angle"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={value}
      aria-valuetext={`${value} degrees clockwise from right`}
      className="relative mx-auto my-3 size-24 touch-none rounded-full border border-ink/30 bg-ink/5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        turn(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) turn(e);
      }}
      onPointerUp={(e) => {
        turn(e);
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit();
      }}
      onPointerCancel={onCommit}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1;
        const next =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? value + step
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? value - step
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 359
                  : null;
        if (next == null) return;
        e.preventDefault();
        onChange(normalizeEntryAngle(next));
      }}
      onKeyUp={(e) => {
        if (["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(e.key))
          onCommit();
      }}
    >
      <span
        className="absolute left-1/2 top-1/2 h-px w-10 origin-left bg-ink"
        style={{ transform: `rotate(${value}deg)` }}
      >
        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-ink" />
      </span>
      <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
      <span className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full text-xs text-ink-soft">
        0°
      </span>
    </div>
  );
}
