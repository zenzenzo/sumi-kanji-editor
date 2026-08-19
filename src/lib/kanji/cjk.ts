/** CJK unified ideographs (kanji / hanzi), including extensions we may have data for. */
export function isKanjiChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2ee5f)
  );
}

export function extractKanji(input: string, max = 8): string[] {
  const out: string[] = [];
  for (const ch of input) {
    if (isKanjiChar(ch)) {
      out.push(ch);
      if (out.length >= max) break;
    }
  }
  return out;
}
