//#region node_modules/.nitro/vite/services/ssr/assets/cjk-B9saegSJ.js
/** CJK unified ideographs (kanji / hanzi), including extensions we may have data for. */
function isKanjiChar(ch) {
	const cp = ch.codePointAt(0);
	if (cp === void 0) return false;
	return cp >= 13312 && cp <= 19903 || cp >= 19968 && cp <= 40959 || cp >= 63744 && cp <= 64255 || cp >= 131072 && cp <= 192095;
}
function extractKanji(input, max = 8) {
	const out = [];
	for (const ch of input) if (isKanjiChar(ch)) {
		out.push(ch);
		if (out.length >= max) break;
	}
	return out;
}
//#endregion
export { extractKanji as t };
