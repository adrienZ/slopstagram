import { eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";
import type { UserSummaryEntry } from "../lib/types.ts";

export const userSummaries = sqliteTable("user_summaries", {
  promptHash: text().notNull(),
  result: text().notNull(),
  sourceHash: text().primaryKey(),
  userKey: text().notNull(),
});

export const NewUserSummarySchema = createInsertSchema(userSummaries);

export class UserSummaryRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findBySourceHash(sourceHash: string): Promise<UserSummaryEntry | null> {
    const row = this.database
      .select()
      .from(userSummaries)
      .where(eq(userSummaries.sourceHash, sourceHash))
      .get();

    if (row === undefined) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      prompt_hash: row.promptHash,
      result: row.result,
      source_hash: row.sourceHash,
      user_key: row.userKey,
    });
  }

  async save(value: UserSummaryEntry): Promise<void> {
    const entry = NewUserSummarySchema.parse({
      promptHash: value.prompt_hash,
      result: value.result,
      sourceHash: value.source_hash,
      userKey: value.user_key,
    });
    await this.database
      .insert(userSummaries)
      .values(entry)
      .onConflictDoUpdate({
        set: {
          promptHash: entry.promptHash,
          result: entry.result,
          userKey: entry.userKey,
        },
        target: userSummaries.sourceHash,
      });
  }
}
