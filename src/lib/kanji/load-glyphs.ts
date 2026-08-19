import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractKanji } from "./cjk";
import type { GlyphResult } from "./types";

type RawGlyph = {
  strokes: string[];
  medians: number[][][];
};

async function readLocal(char: string): Promise<RawGlyph | null> {
  const file = join(process.cwd(), "node_modules/hanzi-writer-data", `${char}.json`);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as RawGlyph;
  } catch {
    return null;
  }
}

async function readCdn(char: string): Promise<RawGlyph | null> {
  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as RawGlyph;
  } catch {
    return null;
  }
}

export const loadGlyphs = createServerFn({ method: "POST" })
  .validator((input: string) => extractKanji(String(input ?? ""), 8).join(""))
  .handler(async ({ data: text }): Promise<GlyphResult[]> => {
    if (!text) return [];
    const chars = [...text];
    return Promise.all(
      chars.map(async (char) => {
        const raw = (await readLocal(char)) ?? (await readCdn(char));
        if (!raw?.medians?.length) return { char, ok: false as const };
        return {
          char,
          ok: true as const,
          strokes: raw.strokes ?? [],
          medians: raw.medians,
        };
      }),
    );
  });
