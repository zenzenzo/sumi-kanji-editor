import { i as createServerFn } from "./ssr.mjs";
import { t as createServerRpc } from "./createServerRpc-CcvdN_gc.mjs";
import { t as extractKanji } from "./cjk-B9saegSJ.mjs";
import { r as getSql } from "./db-B6PbJvVh.mjs";
import { t as authMiddleware } from "./middleware-BmSL4xPT.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/scroll-C9mtUGBV.js
var listScroll_createServerFn_handler = createServerRpc({
	id: "ae901654e7c4e926544debbe11c722ec02648f87bbedf82363e73786699355fa",
	name: "listScroll",
	filename: "src/lib/scroll.ts"
}, (opts) => listScroll.__executeServer(opts));
var listScroll = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(listScroll_createServerFn_handler, async ({ context }) => {
	return (await getSql())`
      select kanji from practice_scroll
      where user_id = ${context.userId}
      order by created_at desc
      limit 24
    `;
});
var pinKanji_createServerFn_handler = createServerRpc({
	id: "15ec3051d9cdc7e86d5a21c9561ee3bcacd87e05a452ebaaf582950d35ba7acf",
	name: "pinKanji",
	filename: "src/lib/scroll.ts"
}, (opts) => pinKanji.__executeServer(opts));
var pinKanji = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 8).join("")).middleware([authMiddleware]).handler(pinKanji_createServerFn_handler, async ({ context, data: text }) => {
	if (!text) return;
	const sql = await getSql();
	for (const kanji of text) await sql`
        insert into practice_scroll (user_id, kanji)
        values (${context.userId}, ${kanji})
        on conflict (user_id, kanji) do nothing
      `;
});
var unpinKanji_createServerFn_handler = createServerRpc({
	id: "7ee68225e74c832dfe4d26c13be3008b19049bdd2112270e1d30232e1cdc86bb",
	name: "unpinKanji",
	filename: "src/lib/scroll.ts"
}, (opts) => unpinKanji.__executeServer(opts));
var unpinKanji = createServerFn({ method: "POST" }).validator((input) => extractKanji(String(input ?? ""), 1).join("")).middleware([authMiddleware]).handler(unpinKanji_createServerFn_handler, async ({ context, data: kanji }) => {
	if (!kanji) return;
	await (await getSql())`
      delete from practice_scroll
      where user_id = ${context.userId} and kanji = ${kanji}
    `;
});
//#endregion
export { listScroll_createServerFn_handler, pinKanji_createServerFn_handler, unpinKanji_createServerFn_handler };
