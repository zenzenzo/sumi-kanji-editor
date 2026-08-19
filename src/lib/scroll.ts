import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { extractKanji } from "@/lib/kanji/cjk";

export const listScroll = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ kanji: string }>`
      select kanji from practice_scroll
      where user_id = ${context.userId}
      order by created_at desc
      limit 24
    `;
  });

export const pinKanji = createServerFn({ method: "POST" })
  .validator((input: string) => extractKanji(String(input ?? ""), 8).join(""))
  .middleware([authMiddleware])
  .handler(async ({ context, data: text }) => {
    if (!text) return;
    const sql = await getSql();
    for (const kanji of text) {
      await sql`
        insert into practice_scroll (user_id, kanji)
        values (${context.userId}, ${kanji})
        on conflict (user_id, kanji) do nothing
      `;
    }
  });

export const unpinKanji = createServerFn({ method: "POST" })
  .validator((input: string) => extractKanji(String(input ?? ""), 1).join(""))
  .middleware([authMiddleware])
  .handler(async ({ context, data: kanji }) => {
    if (!kanji) return;
    const sql = await getSql();
    await sql`
      delete from practice_scroll
      where user_id = ${context.userId} and kanji = ${kanji}
    `;
  });
