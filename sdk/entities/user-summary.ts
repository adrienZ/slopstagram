import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import { instagramUsers } from "./instagram-user.ts";

export const userSummaries = sqliteTable(
  "user_summaries",
  {
    instagramUserPk: text().references(() => instagramUsers.pk),
    // Only unresolved historical rows retain their original username.
    legacyUsername: text(),
    promptHash: text().notNull(),
    result: text().notNull(),
    sourceHash: text().primaryKey(),
  },
  (table) => [
    index("user_summaries_instagram_user_pk_index").on(table.instagramUserPk),
    check(
      "user_summaries_owner_check",
      sql`(${table.instagramUserPk} IS NOT NULL AND ${table.legacyUsername} IS NULL) OR (${table.instagramUserPk} IS NULL AND ${table.legacyUsername} IS NOT NULL)`,
    ),
  ],
);

export const NewUserSummarySchema = createInsertSchema(userSummaries);
