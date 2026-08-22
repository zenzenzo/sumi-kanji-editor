import type { BrushSettings, StrokeSample, Vec } from "@/lib/kanji/types";
import { clamp, dist } from "./geometry";

// PLACEHOLDER - being restored
export class BristleSim {
  constructor(_settings: BrushSettings, _ink: string) {}
  setInk(_ink: string) {}
  setSettings(_settings: BrushSettings, _radius: number) {}
  setRadius(_radius: number) {}
  reset() {}
  plant(_sample: StrokeSample) {}
  step(_ctx: CanvasRenderingContext2D, _sample: StrokeSample, _dt: number) {}
  press(_ctx: CanvasRenderingContext2D, _sample: StrokeSample) {}
}
