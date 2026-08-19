export type Preset = {
  char: string;
  reading: string;
  gloss: string;
};

/** Characters verified against hanzi-writer-data (kaisho stroke geometry). */
export const PRESETS: Preset[] = [
  { char: "永", reading: "ei", gloss: "eternity" },
  { char: "墨", reading: "sumi", gloss: "ink" },
  { char: "筆", reading: "fude", gloss: "brush" },
  { char: "書", reading: "sho", gloss: "write" },
  { char: "道", reading: "dō", gloss: "way" },
  { char: "夢", reading: "yume", gloss: "dream" },
  { char: "愛", reading: "ai", gloss: "love" },
  { char: "心", reading: "kokoro", gloss: "heart" },
  { char: "空", reading: "sora", gloss: "sky" },
  { char: "龍", reading: "ryū", gloss: "dragon" },
  { char: "武", reading: "bu", gloss: "martial" },
  { char: "禪", reading: "zen", gloss: "zen" },
  { char: "無", reading: "mu", gloss: "void" },
  { char: "花", reading: "hana", gloss: "flower" },
  { char: "月", reading: "tsuki", gloss: "moon" },
  { char: "風", reading: "kaze", gloss: "wind" },
  { char: "山", reading: "yama", gloss: "mountain" },
  { char: "海", reading: "umi", gloss: "sea" },
  { char: "火", reading: "hi", gloss: "fire" },
  { char: "水", reading: "mizu", gloss: "water" },
];
