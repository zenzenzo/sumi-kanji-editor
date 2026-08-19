import type { BrushSettings } from "@/lib/kanji/types";

export type BrushPresetId = "kaisho" | "wet" | "dry" | "soft";

export const BRUSH_PRESETS: Record<
  BrushPresetId,
  { label: string; hint: string; settings: BrushSettings }
> = {
  kaisho: {
    label: "Kaisho",
    hint: "Wolf-hair, firm point",
    settings: {
      size: 1,
      bristles: 56,
      stiffness: 0.62,
      splay: 0.68,
      wetness: 0.74,
      softness: 0.32,
    },
  },
  wet: {
    label: "Wet",
    hint: "Heavy ink, wide belly",
    settings: {
      size: 1.1,
      bristles: 64,
      stiffness: 0.36,
      splay: 0.92,
      wetness: 0.92,
      softness: 0.64,
    },
  },
  dry: {
    label: "Dry",
    hint: "Flying white, broken hairs",
    settings: {
      size: 0.96,
      bristles: 36,
      stiffness: 0.84,
      splay: 0.42,
      wetness: 0.34,
      softness: 0.18,
    },
  },
  soft: {
    label: "Goat",
    hint: "Soft, lags on turns",
    settings: {
      size: 1.08,
      bristles: 80,
      stiffness: 0.24,
      splay: 1.05,
      wetness: 0.82,
      softness: 0.88,
    },
  },
};

export const DEFAULT_BRUSH: BrushSettings = BRUSH_PRESETS.kaisho.settings;
