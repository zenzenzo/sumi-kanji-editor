import { i as createServerFn } from "./ssr.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as extractKanji } from "./cjk-B9saegSJ.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
//#region node_modules/.nitro/vite/services/ssr/assets/load-glyphs-eCX-JxNM.js
async function readLocal(char) {
	const file = join(process.cwd(), "node_modules/hanzi-writer-data", `${char}.json`);
	try {
		const raw = await readFile(file, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
async function readCdn(char) {
	const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`;
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}
var loadGlyphs_createServerFn_handler = createServerRpc({
	id: "9010fbbd12f869d6fdc88fde2b64bea7bc494b0777bb28406213144e44017634",
	name: "loadGlyphs",
	filename: "src/lib/kanji/load-glyphs.ts"
}, (opts) => loadGlyphs.__executeServer(opts));
var loadGlyphs = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 8).join("")).handler(loadGlyphs_createServerFn_handler, async ({ data: text }) => {
	if (!text) return [];
	const chars = [...text];
	return Promise.all(chars.map(async (char) => {
		const raw = await readLocal(char) ?? await readCdn(char);
		if (!raw?.medians?.length) return {
			char,
			ok: false
		};
		return {
			char,
			ok: true,
			strokes: raw.strokes ?? [],
			medians: raw.medians
		};
	}));
});
//#endregion
export { loadGlyphs_createServerFn_handler };
