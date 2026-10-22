import { eq } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";
import type { UserSummaryEntry } from "../lib/types.ts";
import { instagramUsers } from "./instagram-user.ts";

export const userSummaries = sqliteTable(
  "user_summaries",
  {
    instagramUserPk: text().references(() => instagramUsers.pk),
    // Only unmatched historical summaries retain a username until their user is ingested.
    legacyUsername: text(),
    promptHash: text().notNull(),
    result: text().notNull(),
    sourceHash: text().primaryKey(),
  },
  (table) => [index("user_summaries_instagram_user_idx").on(table.instagramUserPk)],
);

export const NewUserSummarySchema = createInsertSchema(userSummaries);

export class UserSummaryRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  findBySourceHash(sourceHash: string): UserSummaryEntry | null {
    const row = this.database
      .select({ summary: userSummaries, username: instagramUsers.username })
      .from(userSummaries)
      .leftJoin(instagramUsers, eq(userSummaries.instagramUserPk, instagramUsers.pk))
      .where(eq(userSummaries.sourceHash, sourceHash))
      .get();

    if (row === undefined) {
      return null;
    }

    return {
      prompt_hash: row.summary.promptHash,
      result: row.summary.result,
      source_hash: row.summary.sourceHash,
      user_key: row.username ?? row.summary.legacyUsername ?? "",
    };
  }

  async save(value: UserSummaryEntry): Promise<void> {
    const users = this.database
      .select({ pk: instagramUsers.pk })
      .from(instagramUsers)
      .where(eq(instagramUsers.username, value.user_key.trim()))
      .all();
    if (users.length !== 1) {
      throw new Error(`Cannot link summary to Instagram user ${value.user_key}`);
    }
    const entry = NewUserSummarySchema.parse({
      instagramUserPk: users[0].pk,
      legacyUsername: null,
      promptHash: value.prompt_hash,
      result: value.result,
      sourceHash: value.source_hash,
    });
    await this.database
      .insert(userSummaries)
      .values(entry)
      .onConflictDoUpdate({
        set: {
          promptHash: entry.promptHash,
          result: entry.result,
          instagramUserPk: entry.instagramUserPk,
          legacyUsername: null,
        },
        target: userSummaries.sourceHash,
      });
  }
}
